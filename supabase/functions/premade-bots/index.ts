// premade-bots: runs VuloChat's premade bots (Welcomer, Auto-responder, Announcer) on the server, so they are always online.
// The database calls this when a message arrives in a server with an Auto-responder, when someone joins a server with a
// Welcomer, and once a minute for the Announcer. The "provision" step creates the platform bots and is safe to run again.
// Every call must send the secret the database keeps (x-premade-secret). Browsers cannot call this.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

const enc = new TextEncoder();
const dec = new TextDecoder();
const ECDH = { name: "ECDH", namedCurve: "P-256" } as const;
const INFO = enc.encode("VuloChat E2EE message v1");
const ALGORITHM = "P-256-HKDF-SHA256-AES-256-GCM";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const ab = (bytes: Uint8Array): ArrayBuffer => Uint8Array.from(bytes).buffer as ArrayBuffer;
const toB64 = (bytes: Uint8Array) => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const randomSecret = () => crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");

// ---- E2EE. Same format as the browser (src/lib/e2ee.ts), so every device reads what the server sends. ----

async function deriveMessageKey(priv: CryptoKey, pub: CryptoKey, salt: Uint8Array): Promise<CryptoKey> {
  const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: pub }, priv, 256);
  const material = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: ab(salt), info: ab(INFO) },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptForDevice(plaintext: string, publicKey: string) {
  const recipient = await crypto.subtle.importKey("raw", ab(fromB64(publicKey)), ECDH, false, []);
  const ephemeral = (await crypto.subtle.generateKey(ECDH, true, ["deriveBits"])) as CryptoKeyPair;
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveMessageKey(ephemeral.privateKey, recipient, salt);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: ab(iv), additionalData: ab(salt) }, key, ab(enc.encode(plaintext))),
  );
  const packed = new Uint8Array(salt.length + encrypted.length);
  packed.set(salt);
  packed.set(encrypted, salt.length);
  const ephemeralPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));
  return {
    version: 1,
    algorithm: ALGORITHM,
    ephemeralPublicKey: toB64(ephemeralPublic),
    iv: toB64(iv),
    ciphertext: toB64(packed),
  };
}

async function decryptForBot(envelope: any, privateKey: CryptoKey): Promise<string> {
  const ephemeral = await crypto.subtle.importKey("raw", ab(fromB64(envelope.ephemeralPublicKey)), ECDH, false, []);
  const packed = fromB64(envelope.ciphertext);
  const salt = packed.slice(0, 32);
  const key = await deriveMessageKey(privateKey, ephemeral, salt);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ab(fromB64(envelope.iv)), additionalData: ab(salt) },
    key,
    ab(packed.slice(32)),
  );
  return dec.decode(plain);
}

// The platform bot's key pair. The private key lives only in the database, behind a service-role function.
const keyCache = new Map<string, { publicKey: string; privateKey: CryptoKey } | null>();
async function botKeys(botId: string) {
  if (keyCache.has(botId)) return keyCache.get(botId)!;
  const { data, error } = await admin.rpc("premade_bot_keys", { p_bot: botId });
  if (error) throw error;
  let result: { publicKey: string; privateKey: CryptoKey } | null = null;
  if (data && data.private_key) {
    const privateKey = await crypto.subtle.importKey("pkcs8", ab(fromB64(data.private_key)), ECDH, false, ["deriveBits"]);
    result = { publicKey: String(data.public_key), privateKey };
  }
  keyCache.set(botId, result);
  return result;
}

// Returns the plain text of a message for this bot, or null when the bot cannot read it.
async function readText(content: string, botId: string): Promise<string | null> {
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    return content;
  }
  if (!parsed || parsed.__vulo_e2ee !== 1 || !Array.isArray(parsed.recipients)) return content;
  const keys = await botKeys(botId);
  if (!keys) return null;
  const mine = parsed.recipients.find((r: any) => r.publicKey === keys.publicKey);
  if (!mine) return null;
  return decryptForBot(mine.envelope, keys.privateKey);
}

// ---- Posting as a bot. The text is encrypted for every device in the server, including the bot's own. ----

async function sendAsBot(serverId: string, channelId: string, botProfileId: string, text: string) {
  const { data: channel, error: channelErr } = await admin.from("channels").select("id, server_id").eq("id", channelId).maybeSingle();
  if (channelErr) throw channelErr;
  if (!channel || channel.server_id !== serverId) return;
  const { data: members, error: memberErr } = await admin.from("server_members").select("user_id").eq("server_id", serverId);
  if (memberErr) throw memberErr;
  const ids = (members ?? []).map((m: any) => m.user_id as string);
  const { data: devices, error: deviceErr } = await admin.from("e2ee_devices").select("user_id, public_key").in("user_id", ids).is("revoked_at", null);
  if (deviceErr) throw deviceErr;
  if (!devices?.length) throw new Error("No devices to encrypt the bot message for");
  const recipients = await Promise.all(
    devices.map(async (d: any) => ({ userId: d.user_id, publicKey: d.public_key, envelope: await encryptForDevice(text, d.public_key) })),
  );
  const content = JSON.stringify({ __vulo_e2ee: 1, algorithm: ALGORITHM, recipients });
  const { error } = await admin.from("messages").insert({ channel_id: channelId, author_id: botProfileId, content, attachments: [], embeds: [] });
  if (error) throw error;
}

// ---- Helpers ----

async function isBotProfile(profileId: string): Promise<boolean> {
  const { data, error } = await admin.from("bots").select("id").eq("profile_id", profileId).maybeSingle();
  if (error) throw error;
  return !!data;
}

type Install = { serverId: string; botId: string; profileId: string; settings: Record<string, any> };
async function installs(template: string, serverId?: string): Promise<Install[]> {
  let query: any = admin.from("server_bots").select("server_id, settings, bots!inner(id, profile_id, template_id)").eq("enabled", true);
  if (serverId) query = query.eq("server_id", serverId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? [])
    .filter((r: any) => r.bots?.template_id === template)
    .map((r: any) => ({ serverId: r.server_id, botId: r.bots.id, profileId: r.bots.profile_id, settings: r.settings || {} }));
}

// Same rules as the old script: one "word = reply" per line.
function parseRules(text: unknown): { word: string; reply: string }[] {
  return String(text || "")
    .split("\n")
    .map((line) => {
      const at = line.indexOf("=");
      return at === -1 ? null : { word: line.slice(0, at).trim().toLowerCase(), reply: line.slice(at + 1).trim() };
    })
    .filter((rule): rule is { word: string; reply: string } => !!rule && !!rule.word && !!rule.reply);
}

// ---- The three premade bots ----

async function onMessage(messageId: string) {
  const { data: msg, error } = await admin.from("messages").select("id, channel_id, author_id, content").eq("id", messageId).maybeSingle();
  if (error) throw error;
  if (!msg || (await isBotProfile(msg.author_id))) return;
  const { data: channel, error: channelErr } = await admin.from("channels").select("id, server_id").eq("id", msg.channel_id).maybeSingle();
  if (channelErr) throw channelErr;
  if (!channel) return;
  for (const install of await installs("auto-responder", channel.server_id)) {
    const s = install.settings;
    if (s.enabled === false) continue;
    if (s.channel_id && s.channel_id !== channel.id) continue;
    const text = await readText(msg.content, install.botId);
    if (text === null) continue;
    const lower = text.toLowerCase();
    const rule = parseRules(s.rules).find((r) => lower.includes(r.word));
    if (rule) await sendAsBot(channel.server_id, channel.id, install.profileId, rule.reply);
  }
}

async function onMember(serverId: string, userId: string) {
  if (!serverId || !userId || (await isBotProfile(userId))) return;
  const welcomers = await installs("welcomer", serverId);
  if (!welcomers.length) return;
  const { data: server } = await admin.from("servers").select("name").eq("id", serverId).maybeSingle();
  const { data: profile } = await admin.from("profiles").select("username, display_name").eq("id", userId).maybeSingle();
  const username = profile?.display_name || profile?.username || "new member";
  for (const w of welcomers) {
    const s = w.settings;
    if (s.enabled === false || !s.channel_id) continue;
    const template = String(s.welcome_message || "Welcome {username} to {server}!");
    const text = template.replaceAll("{username}", username).replaceAll("{server}", server?.name || "this server");
    await sendAsBot(serverId, s.channel_id, w.profileId, text);
  }
}

async function tick() {
  for (const a of await installs("announcer")) {
    const s = a.settings;
    if (s.enabled === false || !s.message || !s.channel_id) continue;
    const minutes = Math.max(1, Number(s.interval_minutes) || 60);
    // Atomic in the database: true only when the interval has passed since the last post.
    const { data: due, error } = await admin.rpc("premade_announce_due", { p_server: a.serverId, p_bot: a.botId, p_interval_minutes: minutes });
    if (error) throw error;
    if (due) await sendAsBot(a.serverId, s.channel_id, a.profileId, String(s.message));
  }
}

// ---- Provisioning: creates the platform bots and moves old user-made premade copies over to them. ----

async function makeDeviceKey(botId: string, profileId: string) {
  const pair = (await crypto.subtle.generateKey(ECDH, true, ["deriveBits"])) as CryptoKeyPair;
  const publicKey = toB64(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
  const privateKey = toB64(new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey)));
  const { error: keyErr } = await admin.rpc("premade_store_bot_keys", { p_bot: botId, p_public: publicKey, p_private: privateKey });
  if (keyErr) throw keyErr;
  const { error } = await admin.from("e2ee_devices").insert({ user_id: profileId, device_name: "VuloChat premade bot", public_key: publicKey });
  if (error) throw error;
}

async function provision() {
  const report: string[] = [];
  const { data: templates, error } = await admin.from("bot_templates").select("id, name, description").eq("enabled", true);
  if (error) throw error;
  for (const t of templates ?? []) {
    let { data: platform, error: findErr } = await admin.from("bots").select("id, profile_id").eq("template_id", t.id).is("owner_id", null).maybeSingle();
    if (findErr) throw findErr;
    if (!platform) {
      const username = "vulo_bot_" + crypto.randomUUID().replaceAll("-", "").slice(0, 16);
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: `bot-${crypto.randomUUID()}@bots.vulochat.com`,
        password: randomSecret(),
        email_confirm: true,
        user_metadata: { is_bot: true, username, display_name: t.name },
      });
      if (createErr || !created.user) throw createErr ?? new Error("Could not create the bot account");
      // The database trigger has already created the profile. Only the fields it does not set are updated.
      const { error: profileErr } = await admin.from("profiles").update({ about: t.description, status: "online" }).eq("id", created.user.id);
      if (profileErr) throw profileErr;
      const { data: bot, error: botErr } = await admin
        .from("bots")
        .insert({ owner_id: null, profile_id: created.user.id, name: t.name, description: t.description, is_premade: true, template_id: t.id })
        .select("id, profile_id")
        .single();
      if (botErr) throw botErr;
      await makeDeviceKey(bot.id, bot.profile_id);
      platform = bot;
      report.push(`created platform bot for ${t.id}`);
    }
    const { data: copies, error: copyErr } = await admin.from("bots").select("id, profile_id").eq("template_id", t.id).not("owner_id", "is", null);
    if (copyErr) throw copyErr;
    for (const copy of copies ?? []) {
      const { data: rows, error: rowsErr } = await admin.from("server_bots").select("server_id, enabled, settings, permissions, added_by").eq("bot_id", copy.id);
      if (rowsErr) throw rowsErr;
      for (const row of rows ?? []) {
        const { error: memberErr } = await admin.from("server_members").insert({ server_id: row.server_id, user_id: platform.profile_id });
        if (memberErr && !String(memberErr.message).toLowerCase().includes("duplicate")) throw memberErr;
        const { error: upErr } = await admin
          .from("server_bots")
          .upsert(
            { server_id: row.server_id, bot_id: platform.id, added_by: row.added_by, enabled: row.enabled, settings: row.settings, permissions: row.permissions },
            { onConflict: "server_id,bot_id" },
          );
        if (upErr) throw upErr;
      }
      // Removing the copy's login also removes its bot record, token and old installs (database cascade).
      const { error: delErr } = await admin.auth.admin.deleteUser(copy.profile_id);
      if (delErr) throw delErr;
      report.push(`moved a copy of ${t.id} to the platform bot`);
    }
  }
  return { ok: true, report };
}

// ---- Entry point ----

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON body required" }, 400);
  }
  try {
    const { data: secret, error: secretErr } = await admin.rpc("premade_internal_secret");
    if (secretErr) throw secretErr;
    if (!secret || req.headers.get("x-premade-secret") !== secret) return json({ error: "Not allowed" }, 401);
    keyCache.clear();
    if (body.type === "message") await onMessage(String(body.message_id || ""));
    else if (body.type === "member") await onMember(String(body.server_id || ""), String(body.user_id || ""));
    else if (body.type === "tick") await tick();
    else if (body.type === "provision") return json(await provision());
    else return json({ error: "Unknown type" }, 400);
    return json({ ok: true });
  } catch (e) {
    console.error("premade-bots:", e);
    return json({ error: (e as { message?: string })?.message || "Internal error" }, 500);
  }
});
