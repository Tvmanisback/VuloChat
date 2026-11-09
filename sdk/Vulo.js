// Vulo.js — local VuloChat bot SDK (Node.js 18+)
export class Vulo {
  constructor(token, { baseUrl = "https://yejtrubajgyphbggtjrd.supabase.co/functions/v1/vulo-bots" } = {}) {
    if (!token) throw new Error("A Vulo bot token is required");
    this.token = token; this.baseUrl = baseUrl;
  }
  async request(action, data = {}) {
    const response = await fetch(this.baseUrl, { method:"POST", headers:{"Content-Type":"application/json","x-vulo-token":this.token}, body:JSON.stringify({action,...data}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Vulo API error: ${response.status}`);
    return result;
  }
  sendMessage(channelId, content) { return this.request("send_message", {channel_id:channelId,content}); }
  getMessages(channelId) { return this.request("get_messages", {channel_id:channelId}); }
  getMembers(channelId) { return this.request("get_members", {channel_id:channelId}); }
}
export default Vulo;
