// Welcomer: greets new members in the welcome channel.
// Run on your computer: VULO_TOKEN=... CHANNEL_ID=any-channel-id node welcomer.js
// The welcome message and channel come from Server Settings → Bots.
import Vulo from '../sdk/Vulo.js';

const bot = new Vulo(process.env.VULO_TOKEN);
const channelId = process.env.CHANNEL_ID;
if (!channelId) throw new Error('Set CHANNEL_ID to any channel in the server.');

const knownMembers = new Set();
let initialized = false;

async function checkForJoins() {
  const { settings, server_name } = await bot.getConfig(channelId);
  if (settings.enabled === false) return;
  const template = settings.welcome_message || 'Welcome {username} to {server}!';
  const targetChannel = settings.channel_id || channelId;

  const { members } = await bot.getMembers(channelId);
  for (const member of members) {
    if (knownMembers.has(member.user_id)) continue;
    knownMembers.add(member.user_id);
    // The first check only records existing members, so nobody is greeted on startup.
    if (!initialized) continue;
    const username = member.profiles?.display_name || member.profiles?.username || 'new member';
    const message = template.replaceAll('{username}', username).replaceAll('{server}', server_name);
    await bot.sendMessage(targetChannel, message);
  }
  initialized = true;
}

await checkForJoins();
setInterval(() => checkForJoins().catch(console.error), 10000);
