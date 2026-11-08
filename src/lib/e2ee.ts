/**
 * VuloChat E2EE device-key foundation.
 *
 * This module deliberately does not claim that chats are encrypted yet. It creates
 * a per-browser ECDH identity and provides authenticated encryption envelopes.
 * Message/attachment/call integration and audited protocol review are separate steps.
 */
const DB_NAME = 'vulochat-e2ee';
const STORE = 'device-keys';
const DEVICE_KEY = 'identity-v1';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface DeviceIdentity {
  publicKey: string;
  privateKey: CryptoKey;
}

export interface EncryptedEnvelope {
  version: 1;
  algorithm: 'P-256-HKDF-SHA256-AES-256-GCM';
  ephemeralPublicKey: string;
  iv: string;
  ciphertext: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function openKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local E2EE key storage.'));
  });
}

async function readStoredKeys(): Promise<CryptoKeyPair | null> {
  const db = await openKeyDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(DEVICE_KEY);
    request.onsuccess = () => resolve((request.result as CryptoKeyPair | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Could not read local E2EE keys.'));
    request.addEventListener('loadend', () => db.close());
  });
}

async function storeKeys(keys: CryptoKeyPair): Promise<void> {
  const db = await openKeyDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put(keys, DEVICE_KEY);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error('Could not save local E2EE keys.')); };
    transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error('Saving local E2EE keys was aborted.')); };
  });
}

/** Creates or loads this browser's non-exportable private identity key. */
export async function getDeviceIdentity(): Promise<DeviceIdentity> {
  if (!globalThis.crypto?.subtle || !globalThis.indexedDB) {
    throw new Error('This browser does not support secure local key storage.');
  }
  let pair = await readStoredKeys();
  if (!pair) {
    pair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits'],
    ) as CryptoKeyPair;
    await storeKeys(pair);
  }
  const publicBytes = await crypto.subtle.exportKey('raw', pair.publicKey);
  return { publicKey: bytesToBase64(new Uint8Array(publicBytes)), privateKey: pair.privateKey };
}

async function deriveMessageKey(privateKey: CryptoKey, publicKey: CryptoKey, salt: Uint8Array): Promise<CryptoKey> {
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
  const material = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode('VuloChat E2EE message v1') },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypts one payload to a device public key. Send the returned envelope, never plaintext. */
export async function encryptForDevice(plaintext: string, recipientPublicKey: string): Promise<EncryptedEnvelope> {
  const recipient = await crypto.subtle.importKey(
    'raw', base64ToBytes(recipientPublicKey), { name: 'ECDH', namedCurve: 'P-256' }, false, [],
  );
  const ephemeral = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'],
  ) as CryptoKeyPair;
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveMessageKey(ephemeral.privateKey, recipient, salt);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: salt }, key, encoder.encode(plaintext));
  const ephemeralPublic = await crypto.subtle.exportKey('raw', ephemeral.publicKey);
  const packed = new Uint8Array(salt.length + new Uint8Array(encrypted).length);
  packed.set(salt);
  packed.set(new Uint8Array(encrypted), salt.length);
  return {
    version: 1,
    algorithm: 'P-256-HKDF-SHA256-AES-256-GCM',
    ephemeralPublicKey: bytesToBase64(new Uint8Array(ephemeralPublic)),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(packed),
  };
}

/** Decrypts an envelope addressed to the current browser's device identity. */
export async function decryptForDevice(envelope: EncryptedEnvelope): Promise<string> {
  if (envelope.version !== 1 || envelope.algorithm !== 'P-256-HKDF-SHA256-AES-256-GCM') {
    throw new Error('Unsupported encrypted message format.');
  }
  const identity = await getDeviceIdentity();
  const ephemeral = await crypto.subtle.importKey(
    'raw', base64ToBytes(envelope.ephemeralPublicKey), { name: 'ECDH', namedCurve: 'P-256' }, false, [],
  );
  const packed = base64ToBytes(envelope.ciphertext);
  const salt = packed.slice(0, 32);
  const ciphertext = packed.slice(32);
  const key = await deriveMessageKey(identity.privateKey, ephemeral, salt);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(envelope.iv), additionalData: salt }, key, ciphertext,
  );
  return decoder.decode(plaintext);
}
