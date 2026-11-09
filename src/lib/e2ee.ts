import { supabase } from './supabase';

/**
 * VuloChat browser-device E2EE for message text.
 *
 * ChatView and DMChat encrypt message bodies for every active conversation device
 * before inserting them, then decrypt locally for the matching browser identity.
 * Attachments and other message metadata are not encrypted by this message-body layer.
 * This implementation has not had an independent security audit.
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

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  // Copy into a guaranteed ArrayBuffer so newer TypeScript DOM typings do not
  // treat Uint8Array<ArrayBufferLike> as a possible SharedArrayBuffer.
  return Uint8Array.from(bytes).buffer as ArrayBuffer;
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
    { name: 'HKDF', hash: 'SHA-256', salt: toArrayBuffer(salt), info: toArrayBuffer(encoder.encode('VuloChat E2EE message v1')) },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypts one payload to a device public key. Send the returned envelope, never plaintext. */
export async function encryptForDevice(plaintext: string, recipientPublicKey: string): Promise<EncryptedEnvelope> {
  const recipient = await crypto.subtle.importKey(
    'raw', toArrayBuffer(base64ToBytes(recipientPublicKey)), { name: 'ECDH', namedCurve: 'P-256' }, false, [],
  );
  const ephemeral = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'],
  ) as CryptoKeyPair;
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveMessageKey(ephemeral.privateKey, recipient, salt);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv), additionalData: toArrayBuffer(salt) }, key, toArrayBuffer(encoder.encode(plaintext)));
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
    'raw', toArrayBuffer(base64ToBytes(envelope.ephemeralPublicKey)), { name: 'ECDH', namedCurve: 'P-256' }, false, [],
  );
  const packed = base64ToBytes(envelope.ciphertext);
  const salt = packed.slice(0, 32);
  const ciphertext = packed.slice(32);
  const key = await deriveMessageKey(identity.privateKey, ephemeral, salt);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(base64ToBytes(envelope.iv)), additionalData: toArrayBuffer(salt) }, key, toArrayBuffer(ciphertext),
  );
  return decoder.decode(plaintext);
}

/** Publishes only this device's public key so peers can encrypt to it. */
export async function registerDeviceIdentity(userId: string): Promise<void> {
  const identity = await getDeviceIdentity();
  const { data, error } = await supabase
    .from('e2ee_devices')
    .select('id')
    .eq('user_id', userId)
    .eq('public_key', identity.publicKey)
    .is('revoked_at', null)
    .maybeSingle();
  if (error) throw error;
  if (data) {
    await supabase.from('e2ee_devices').update({ last_seen_at: new Date().toISOString() }).eq('id', data.id);
    return;
  }
  const { error: insertError } = await supabase.from('e2ee_devices').insert({
    user_id: userId,
    device_name: navigator.userAgent.slice(0, 120) || 'Browser',
    public_key: identity.publicKey,
  });
  if (insertError) throw insertError;
}


export interface EncryptedMessagePayload {
  __vulo_e2ee: 1;
  algorithm: 'P-256-HKDF-SHA256-AES-256-GCM';
  recipients: Array<{ userId: string; publicKey: string; envelope: EncryptedEnvelope }>;
}

/**
 * Encrypts a message separately for every active device belonging to the
 * conversation participants. Fails closed if any participant has no device.
 */
export async function encryptMessageForUsers(plaintext: string, userIds: string[]): Promise<string> {
  const identity = await getDeviceIdentity();
  const uniqueIds = [...new Set(userIds)];
  if (!uniqueIds.length) throw new Error('No E2EE recipients were supplied.');
  const { data, error } = await supabase
    .from('e2ee_devices')
    .select('user_id, public_key')
    .in('user_id', uniqueIds)
    .is('revoked_at', null);
  if (error) throw error;
  const devices = (data ?? []) as Array<{ user_id: string; public_key: string }>;
  const missing = uniqueIds.filter((id) => !devices.some((device) => device.user_id === id));
  if (missing.length) {
    throw new Error('E2EE is required, but a conversation member has not registered a device yet. Ask them to sign in on their device first.');
  }
  if (!devices.some((device) => device.public_key === identity.publicKey)) {
    throw new Error('This device is not registered for E2EE. Sign out and back in, then try again.');
  }
  const recipients = await Promise.all(devices.map(async (device) => ({
    userId: device.user_id,
    publicKey: device.public_key,
    envelope: await encryptForDevice(plaintext, device.public_key),
  })));
  return JSON.stringify({
    __vulo_e2ee: 1,
    algorithm: 'P-256-HKDF-SHA256-AES-256-GCM',
    recipients,
  } satisfies EncryptedMessagePayload);
}

/** Decrypts E2EE message payloads for this browser; legacy plaintext remains marked as legacy. */
export async function decryptMessageForCurrentDevice(value: string): Promise<string> {
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { return value; }
  if (!parsed || typeof parsed !== 'object' || !('__vulo_e2ee' in parsed)) return value;
  const payload = parsed as EncryptedMessagePayload;
  if (payload.__vulo_e2ee !== 1 || !Array.isArray(payload.recipients)) {
    throw new Error('Unsupported E2EE message payload.');
  }
  const identity = await getDeviceIdentity();
  const recipient = payload.recipients.find((entry) => entry.publicKey === identity.publicKey);
  if (!recipient) throw new Error('This message was not encrypted for this device.');
  return decryptForDevice(recipient.envelope);
}
