// Run locally with: VULO_TOKEN=... CHANNEL_ID=... node examples/welcomer.js
import Vulo from '../sdk/Vulo.js';

const bot = new Vulo(process.env.VULO_TOKEN);
const channelId = process.env.CHANNEL_ID;
if (!channelId) throw new Error('Set CHANNEL_ID to the welcome channel.');

const { settings, server_name } = await bot.getConfig(channelId);
const template = settings.welcome_message || 'Welcome {username} to {server}!';
const knownMembers = new Set();
let initialized = false;

async function checkForJoins() {
  const { members } = await bot.getMembers(channelId);
  for (const member of members) {
    if (knownMembers.has(member.user_id)) continue;
    knownMembers.add(member.user_id);
    if (initialized) {
      const username = member.profiles?.display_name || member.profiles?.username || 'new member';
      const message = template.replaceAll('{username}', username).replaceAll('{server}', server_name);
      await bot.sendMessage(settings.channel_id || channelId, message);
    }
  }
  initialized = true;
}

await checkForJoins();
setInterval(() => checkForJoins().catch(console.error), 10000);
