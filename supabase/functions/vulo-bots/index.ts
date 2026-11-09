// vulo-bots: the bot API.
// Signed-in VuloChat users (the app) call: create, create_from_template, install, edit_profile, regenerate_token.
// Local bot programs call (with x-vulo-token): send_message, get_messages, get_members, get_config, update_profile.
// Deploy with verify_jwt off, because this function checks its own sign-in or bot token.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-vulo-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const hash = async (s: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
const newToken = () => "vulo_" + crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    // Echo the headers the browser asks to send, so a new client header can never fail the preflight.
    const requested = req.headers.get("access-control-request-headers") || "";
    return new Response("ok", { headers: { ...cors, "Access-Control-Allow-Headers": requested || cors["Access-Control-Allow-Headers"] } });
  }
  if (req.method !== "POST") return reply({ error: "POST required" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, secret, { auth: { persistSession: false } });

  // Returns the signed-in VuloChat user, or null when the request has no valid sign-in.
  const signedInUser = async (req: Request) => {
    const auth = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
      auth: { persistSession: false },
    });
    const { data: { user }, error } = await auth.auth.getUser();
    return error || !user ? null : user;
  };

  // Every bot needs its own account, because profiles.id must match an auth user. The password is random
  // and never shown, so nobody can sign in as the bot. Only the bot's token works.
  // A database trigger on auth.users creates the profile row from the metadata below, so the profile is
  // not inserted here (that would be a duplicate). Only the fields the trigger does not set are updated.
  const createBotAccount = async (username: string, displayName: string, about: string) => {
    const { data, error } = await admin.auth.admin.createUser({
      email: `bot-${crypto.randomUUID()}@bots.vulochat.com`,
      password: newToken(),
      email_confirm: true,
      user_metadata: { is_bot: true, username, display_name: displayName },
    });
    if (error || !data.user) throw error ?? new Error("Could not create the bot account");
    const { error: profileErr } = await admin.from("profiles").update({ about, status: "offline" }).eq("id", data.user.id);
    if (profileErr) throw profileErr;
    return data.user.id;
  };

  // Creating bots and regenerating tokens need Developer mode (Settings → Developer).
  const isDeveloper = async (userId: string) => {
    const { data } = await admin.from("profiles").select("developer_mode").eq("id", userId).maybeSingle();
    return data?.developer_mode === true;
  };

  try {
    const body = await req.json();
    const action = String(body.action || "");

    if (action === "edit_profile") {
      const user = await signedInUser(req);
      if (!user) return reply({ error: "Sign in required" }, 401);
      const botId = String(body.bot_id || "");
      const { data: owned } = await admin.from("bots").select("id,profile_id").eq("id", botId).eq("owner_id", user.id).maybeSingle();
      if (!owned) return reply({ error: "Bot not found or not owned by you" }, 404);
      const patch: Record<string, unknown> = {};
      for (const key of ["display_name", "avatar_url", "banner_url", "about"]) {
        if (typeof body[key] === "string") patch[key] = body[key].trim().slice(0, key === "about" ? 500 : 2000) || null;
      }
      if (!Object.keys(patch).length) return reply({ error: "No profile changes supplied" }, 400);
      const { error } = await admin.from("profiles").update(patch).eq("id", owned.profile_id);
      if (error) throw error;
      return reply({ ok: true });
    }

    if (action === "regenerate_token") {
      const user = await signedInUser(req);
      if (!user) return reply({ error: "Sign in required" }, 401);
      if (!(await isDeveloper(user.id))) return reply({ error: "Turn on Developer mode in Settings → Developer first" }, 403);
      const botId = String(body.bot_id || "");
      const { data: owned } = await admin.from("bots").select("id").eq("id", botId).eq("owner_id", user.id).maybeSingle();
      if (!owned) return reply({ error: "Bot not found or not owned by you" }, 404);
      // Revoke every active token for this bot, then issue a new one. The old token stops working right away.
      const { error: revokeErr } = await admin.from("bot_tokens").update({ revoked_at: new Date().toISOString() }).eq("bot_id", botId).is("revoked_at", null);
      if (revokeErr) throw revokeErr;
      const token = newToken();
      const { error: tokenErr } = await admin.from("bot_tokens").insert({ bot_id: botId, token_hash: await hash(token), token_prefix: token.slice(0, 13) });
      if (tokenErr) throw tokenErr;
      return reply({ token });
    }

    if (action === "create_from_template") {
      const user = await signedInUser(req);
      if (!user) return reply({ error: "Sign in required" }, 401);
      const templateId = String(body.template_id || "");
      const { data: template } = await admin
        .from("bot_templates")
        .select("id,name,description,default_settings")
        .eq("id", templateId)
        .eq("enabled", true)
        .maybeSingle();
      if (!template) return reply({ error: "Template not found" }, 404);
      const name = String(body.name || template.name).trim().slice(0, 80);
      const username = "vulo_bot_" + crypto.randomUUID().replaceAll("-", "").slice(0, 16);
      const profileId = await createBotAccount(username, name, template.description);
      const { data: bot, error: botErr } = await admin
        .from("bots")
        .insert({ owner_id: user.id, profile_id: profileId, name, description: template.description, is_premade: true, template_id: template.id })
        .select("id,profile_id,name,description")
        .single();
      if (botErr) throw botErr;
      const token = newToken();
      const { error: tokenErr } = await admin.from("bot_tokens").insert({ bot_id: bot.id, token_hash: await hash(token), token_prefix: token.slice(0, 13) });
      if (tokenErr) throw tokenErr;
      return reply({ bot, token, settings: template.default_settings, template_id: template.id });
    }

    if (action === "create") {
      const user = await signedInUser(req);
      if (!user) return reply({ error: "Sign in required" }, 401);
      if (!(await isDeveloper(user.id))) return reply({ error: "Turn on Developer mode in Settings → Developer first" }, 403);
      const name = String(body.name || "").trim().slice(0, 80);
      const description = String(body.description || "").trim().slice(0, 500);
      if (name.length < 2) return reply({ error: "Bot name must be at least 2 characters" }, 400);
      const username = "vulo_bot_" + crypto.randomUUID().replaceAll("-", "").slice(0, 16);
      const profileId = await createBotAccount(username, name, description);
      const { data: bot, error: botErr } = await admin
        .from("bots")
        .insert({ owner_id: user.id, profile_id: profileId, name, description })
        .select("id,profile_id,name,description")
        .single();
      if (botErr) throw botErr;
      const token = newToken();
      const { error: tokenErr } = await admin.from("bot_tokens").insert({ bot_id: bot.id, token_hash: await hash(token), token_prefix: token.slice(0, 13) });
      if (tokenErr) throw tokenErr;
      return reply({ bot, token });
    }

    if (action === "install") {
      const user = await signedInUser(req);
      if (!user) return reply({ error: "Sign in required" }, 401);
      const botId = String(body.bot_id || ""), serverId = String(body.server_id || "");
      const { data: server } = await admin.from("servers").select("owner_id").eq("id", serverId).maybeSingle();
      let allowed = !!server && server.owner_id === user.id;
      if (!allowed && server) {
        const { data: roles } = await admin.from("member_roles").select("role_id").eq("server_id", serverId).eq("user_id", user.id);
        const roleIds = (roles || []).map((r: any) => r.role_id);
        if (roleIds.length) {
          const { data: roleRows } = await admin.from("server_roles").select("permissions").in("id", roleIds);
          allowed = (roleRows || []).some((r: any) => (Number(r.permissions) & 8) === 8);
        }
      }
      if (!allowed) return reply({ error: "You need Manage Server permission to install bots" }, 403);
      const { data: bot } = await admin.from("bots").select("id,profile_id").eq("id", botId).maybeSingle();
      if (!bot) return reply({ error: "Bot not found" }, 404);
      const { error: memberErr } = await admin.from("server_members").insert({ server_id: serverId, user_id: bot.profile_id });
      if (memberErr && !String(memberErr.message).toLowerCase().includes("duplicate")) throw memberErr;
      const { error: installErr } = await admin
        .from("server_bots")
        .upsert({ server_id: serverId, bot_id: botId, added_by: user.id, enabled: true }, { onConflict: "server_id,bot_id" });
      if (installErr) throw installErr;
      return reply({ ok: true, profile_id: bot.profile_id });
    }

    if (action === "delete_bot") {
      const user = await signedInUser(req);
      if (!user) return reply({ error: "Sign in required" }, 401);
      const botId = String(body.bot_id || "");
      const { data: owned } = await admin.from("bots").select("id,profile_id").eq("id", botId).eq("owner_id", user.id).maybeSingle();
      if (!owned) return reply({ error: "Bot not found or not owned by you" }, 404);
      // Remove the bot's uploaded images first.
      const { data: files } = await admin.storage.from("bot-assets").list(`${user.id}/${botId}`, { limit: 100 });
      if (files?.length) await admin.storage.from("bot-assets").remove(files.map((f) => `${user.id}/${botId}/${f.name}`));
      // Deleting the bot's login removes its profile, bot record, tokens, server installs and messages (database cascade).
      const { error } = await admin.auth.admin.deleteUser(owned.profile_id);
      if (error) throw error;
      return reply({ ok: true });
    }

    // Everything below is for local bot programs, which authenticate with their bot token.
    const token = req.headers.get("x-vulo-token") || String(body.token || "");
    if (!token.startsWith("vulo_")) return reply({ error: "Bot token required" }, 401);
    const { data: tokenRow, error: tokenErr } = await admin
      .from("bot_tokens")
      .select("id,bot_id")
      .eq("token_hash", await hash(token))
      .is("revoked_at", null)
      .maybeSingle();
    if (tokenErr || !tokenRow) return reply({ error: "Invalid or revoked bot token" }, 401);
    await admin.from("bot_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tokenRow.id);
    const { data: bot, error: botErr } = await admin.from("bots").select("id,profile_id,name").eq("id", tokenRow.bot_id).single();
    if (botErr || !bot) return reply({ error: "Bot not found" }, 404);

    if (action === "update_profile") {
      const patch: Record<string, unknown> = {};
      if (typeof body.display_name === "string") patch.display_name = body.display_name.trim().slice(0, 80);
      if (typeof body.avatar_url === "string") patch.avatar_url = body.avatar_url.trim().slice(0, 2000) || null;
      if (typeof body.banner_url === "string") patch.banner_url = body.banner_url.trim().slice(0, 2000) || null;
      if (typeof body.about === "string") patch.about = body.about.trim().slice(0, 500);
      if (!Object.keys(patch).length) return reply({ error: "No profile changes supplied" }, 400);
      const { error } = await admin.from("profiles").update(patch).eq("id", bot.profile_id);
      if (error) throw error;
      return reply({ ok: true, profile: patch });
    }

    if (action === "send_message") {
      const channelId = String(body.channel_id || "");
      const content = String(body.content || "").slice(0, 4000);
      if (!channelId || !content.trim()) return reply({ error: "channel_id and content are required" }, 400);
      const { data: channel } = await admin.from("channels").select("id,server_id,type").eq("id", channelId).maybeSingle();
      if (!channel || channel.type === "category") return reply({ error: "Channel not found" }, 404);
      const { data: install } = await admin.from("server_bots").select("enabled,permissions").eq("server_id", channel.server_id).eq("bot_id", bot.id).maybeSingle();
      if (!install?.enabled || install.permissions?.send_messages !== true) return reply({ error: "Bot is not allowed to send messages in this server" }, 403);
      const { data: member } = await admin.from("server_members").select("user_id").eq("server_id", channel.server_id).eq("user_id", bot.profile_id).maybeSingle();
      if (!member) return reply({ error: "Bot is not a server member" }, 403);
      const { data: message, error } = await admin
        .from("messages")
        .insert({ channel_id: channelId, author_id: bot.profile_id, content, attachments: [], embeds: [] })
        .select()
        .single();
      if (error) throw error;
      return reply({ message });
    }

    if (action === "get_config") {
      const channelId = String(body.channel_id || "");
      const { data: channel } = await admin.from("channels").select("id,server_id,servers(name)").eq("id", channelId).maybeSingle();
      if (!channel) return reply({ error: "Channel not found" }, 404);
      const { data: install } = await admin.from("server_bots").select("enabled,settings,permissions").eq("server_id", channel.server_id).eq("bot_id", bot.id).maybeSingle();
      if (!install?.enabled) return reply({ error: "Bot is not enabled in this server" }, 403);
      return reply({
        settings: install.settings || {},
        permissions: install.permissions || {},
        server_name: (channel as any).servers?.name || "this server",
      });
    }

    if (action === "get_members") {
      const channelId = String(body.channel_id || "");
      const { data: channel } = await admin.from("channels").select("id,server_id").eq("id", channelId).maybeSingle();
      if (!channel) return reply({ error: "Channel not found" }, 404);
      const { data: install } = await admin.from("server_bots").select("enabled,permissions").eq("server_id", channel.server_id).eq("bot_id", bot.id).maybeSingle();
      if (!install?.enabled || install.permissions?.read_messages !== true) return reply({ error: "Bot cannot read this server" }, 403);
      const { data: members, error } = await admin
        .from("server_members")
        .select("user_id,joined_at,profiles(username,display_name)")
        .eq("server_id", channel.server_id)
        .order("joined_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return reply({ members: members || [] });
    }

    if (action === "get_messages") {
      const channelId = String(body.channel_id || "");
      const { data: channel } = await admin.from("channels").select("id,server_id").eq("id", channelId).maybeSingle();
      if (!channel) return reply({ error: "Channel not found" }, 404);
      const { data: install } = await admin.from("server_bots").select("enabled,permissions").eq("server_id", channel.server_id).eq("bot_id", bot.id).maybeSingle();
      if (!install?.enabled || install.permissions?.read_messages !== true) return reply({ error: "Bot cannot read this server" }, 403);
      const { data: messages, error } = await admin
        .from("messages")
        .select("id,channel_id,author_id,content,created_at")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return reply({ messages: (messages || []).reverse() });
    }

    return reply({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error(e);
    // Database errors are plain objects, not Error instances, so read .message from either form.
    return reply({ error: (e as { message?: string })?.message || "Internal error" }, 500);
  }
});
