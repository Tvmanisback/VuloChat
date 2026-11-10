// Vulo.js: the VuloChat bot SDK for Node.js 18+.
// Get a bot token from Settings → Developer, then run: VULO_TOKEN=... node your-bot.js
//
// Encryption: messages in end-to-end encrypted servers arrive encrypted for your bot. The first time your bot reads
// messages, this SDK creates a key pair in a local file (vulo-key.json by default, or VULO_KEY_FILE), sends only the
// public key to VuloChat, and decrypts messages with the private key. Keep that file private. If you delete it, your
// bot gets a new key, and messages sent before that stay unreadable.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { webcrypto } from "node:crypto";

const subtle = globalThis.crypto?.subtle ?? webcrypto.subtle;
const ECDH = { name: "ECDH", namedCurve: "P-256" };
const INFO = new TextEncoder().encode("VuloChat E2EE message v1");
const toB64 = (buffer) => Buffer.from(buffer).toString("base64");
const fromB64 = (value) => new Uint8Array(Buffer.from(value, "base64"));

// Decrypts one envelope made by VuloChat's browser app or server. Same format as src/lib/e2ee.ts.
async function decryptEnvelope(envelope, privateKey) {
  const ephemeral = await subtle.importKey("raw", fromB64(envelope.ephemeralPublicKey), ECDH, false, []);
  const packed = fromB64(envelope.ciphertext);
  const salt = packed.slice(0, 32);
  const shared = await subtle.deriveBits({ name: "ECDH", public: ephemeral }, privateKey, 256);
  const material = await subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  const key = await subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: INFO },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const plain = await subtle.decrypt({ name: "AES-GCM", iv: fromB64(envelope.iv), additionalData: salt }, key, packed.slice(32));
  return new TextDecoder().decode(plain);
}

// Returns the message with its content in plain text when this bot can read it.
async function readMessage(message, keys) {
  let parsed = null;
  try {
    parsed = JSON.parse(message.content);
  } catch {
    // Not JSON, so it is plain text.
  }
  if (!parsed || parsed.__vulo_e2ee !== 1) return { ...message, encrypted: false };
  const mine = (parsed.recipients || []).find((entry) => entry.publicKey === keys.publicKey);
  if (!mine) return { ...message, encrypted: true, content: null, decrypt_error: "This message was not encrypted for this bot." };
  try {
    return { ...message, encrypted: true, content: await decryptEnvelope(mine.envelope, keys.privateKey) };
  } catch {
    return { ...message, encrypted: true, content: null, decrypt_error: "Could not decrypt this message." };
  }
}

export class Vulo {
  constructor(token, { baseUrl = "https://yejtrubajgyphbggtjrd.supabase.co/functions/v1/vulo-bots", keyFile = process.env.VULO_KEY_FILE || "vulo-key.json" } = {}) {
    if (!token) throw new Error("A Vulo bot token is required");
    this.token = token;
    this.baseUrl = baseUrl;
    this.keyFile = keyFile;
    this.keys = null;
  }

  async request(action, data = {}) {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-vulo-token": this.token },
      body: JSON.stringify({ action, ...data }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Vulo API error: ${response.status}`);
    return result;
  }

  /**
   * This bot's decryption key. Creates the key file the first time, and registers the public key with VuloChat
   * so that encrypted messages include this bot. Runs once per program.
   */
  async decryptionKeys() {
    if (this.keys) return this.keys;
    let saved = null;
    if (existsSync(this.keyFile)) saved = JSON.parse(readFileSync(this.keyFile, "utf8"));
    if (!saved) {
      const pair = await subtle.generateKey(ECDH, true, ["deriveBits"]);
      saved = {
        publicKey: toB64(await subtle.exportKey("raw", pair.publicKey)),
        privateKey: toB64(await subtle.exportKey("pkcs8", pair.privateKey)),
      };
      writeFileSync(this.keyFile, JSON.stringify(saved, null, 2), { mode: 0o600 });
    }
    await this.request("register_device", { public_key: saved.publicKey });
    const privateKey = await subtle.importKey("pkcs8", fromB64(saved.privateKey), ECDH, false, ["deriveBits"]);
    this.keys = { publicKey: saved.publicKey, privateKey };
    return this.keys;
  }

  /** Posts a message. Resolves to { message }, where message.id identifies the new message. */
  sendMessage(channelId, content) {
    return this.request("send_message", { channel_id: channelId, content });
  }

  /**
   * The 50 most recent messages in a channel, oldest first. Encrypted messages come back with their plain text in
   * content. A message this bot cannot read has content null and a decrypt_error.
   */
  async getMessages(channelId) {
    // Register the key before fetching, so the server includes this bot in encrypted messages it returns.
    const keys = await this.decryptionKeys();
    const result = await this.request("get_messages", { channel_id: channelId });
    return { ...result, messages: await Promise.all(result.messages.map((message) => readMessage(message, keys))) };
  }

  /** Up to 100 server members, newest first. */
  getMembers(channelId) {
    return this.request("get_members", { channel_id: channelId });
  }

  /** The settings and permissions the server owner chose for this bot in this server. */
  getConfig(channelId) {
    return this.request("get_config", { channel_id: channelId });
  }

  /** Changes the bot's own profile. Any of display_name, avatar_url, banner_url, about. */
  updateProfile(fields) {
    return this.request("update_profile", fields);
  }
}

export default Vulo;
