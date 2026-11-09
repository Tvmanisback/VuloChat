// Vulo.js: the VuloChat bot SDK for Node.js 18+.
// Get a bot token from Settings → Developer, then run: VULO_TOKEN=... node your-bot.js
export class Vulo {
  constructor(token, { baseUrl = "https://yejtrubajgyphbggtjrd.supabase.co/functions/v1/vulo-bots" } = {}) {
    if (!token) throw new Error("A Vulo bot token is required");
    this.token = token;
    this.baseUrl = baseUrl;
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

  /** Posts a message. Resolves to { message }, where message.id identifies the new message. */
  sendMessage(channelId, content) {
    return this.request("send_message", { channel_id: channelId, content });
  }

  /** The 50 most recent messages in a channel, oldest first. */
  getMessages(channelId) {
    return this.request("get_messages", { channel_id: channelId });
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
