// Run locally with: VULO_TOKEN=... CHANNEL_ID=... node welcomer.js
import Vulo from '../sdk/Vulo.js';

const bot = new Vulo(process.env.VULO_TOKEN);
const channelId = process.env.CHANNEL_ID;
if (!channelId) throw new Error('Set CHANNEL_ID to the channel where welcome messages should be sent.');

const knownMembers = new Set();
let initialized = false;

async function checkForJoins() {
  const { members } = await bot.getMembers(channelId);
  for (const member of members) {
    if (!knownMembers.has(member.user_id)) {
      knownMembers.add(member.user_id);
      if (initialized) {
        const name = member.profiles?.display_name || member.profiles?.username || 'new member';
        await bot.sendMessage(channelId, `Welcome ${name}!`);
      }
    }
  }
  initialized = true;
}

await checkForJoins();
setInterval(() => checkForJoins().catch(console.error), 10000);
