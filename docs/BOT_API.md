# Vulo Bot API

Bots execute on their owner's computer. VuloChat does not host or execute bot code.

## Create and install
1. In VuloChat open **Developer → My Bots** and create a bot.
2. Copy its token once and keep it private. Regenerate it if exposed.
3. Install the bot from a server's **Settings → Bots** page.
4. Download `Vulo.js` for Node.js 18+ or `Vulo.py` for Python 3.10+.
5. Run your bot locally. Keep the computer and process online while it should respond.

## API
Base URL: `https://yejtrubajgyphbggtjrd.supabase.co/functions/v1/vulo-bots`

Send POST JSON with your token in the `x-vulo-token` header.

### Send a message
`{"action":"send_message","channel_id":"CHANNEL_UUID","content":"Hello!"}`

### Read recent messages
`{"action":"get_messages","channel_id":"CHANNEL_UUID"}`

The API checks that the bot is installed and that its server-level permissions allow the requested operation. Never put a bot token in browser code, public repositories, or screenshots. The token is not a Supabase service-role key.


### List server members
`{"action":"get_members","channel_id":"CHANNEL_UUID"}`

### Read installed bot configuration
`{"action":"get_config","channel_id":"CHANNEL_UUID"}`

Returns the server-specific settings and permissions configured by the server owner.

The bot must be installed in the channel's server and have Read messages permission. This endpoint returns recent member IDs, usernames, display names, and join timestamps.

### Local Welcomer example (Node.js)
```js
import Vulo from './Vulo.js';
const bot = new Vulo(process.env.VULO_TOKEN);
const channelId = process.env.WELCOME_CHANNEL_ID;
const greeted = new Set();
async function poll() {
  const { members } = await bot.getMembers(channelId);
  for (const member of members) {
    if (greeted.has(member.user_id)) continue;
    greeted.add(member.user_id);
    const name = member.profiles?.display_name || member.profiles?.username || 'new member';
    await bot.sendMessage(channelId, `Welcome ${name}!`);
  }
}
await poll();
setInterval(() => poll().catch(console.error), 10000);
```
This example greets members returned in the initial member list too; seed the `greeted` set from the first poll before enabling it in a live server if you only want new arrivals.
