// Announcer: posts a message on a timer.
// Set the message, the channel and the minutes between posts in Server Settings → Bots.
// Run on your computer: VULO_TOKEN=... CHANNEL_ID=any-channel-id node announcer.js
import Vulo from '../sdk/Vulo.js';

const bot = new Vulo(process.env.VULO_TOKEN);
const channelId = process.env.CHANNEL_ID;
if (!channelId) throw new Error('Set CHANNEL_ID to any channel in the server.');

let lastPostedAt = Date.now(); // the first post comes one interval after startup

async function tick() {
  const { settings } = await bot.getConfig(channelId);
  if (settings.enabled === false || !settings.message) return;
  const intervalMs = Math.max(1, Number(settings.interval_minutes) || 60) * 60 * 1000;
  if (Date.now() - lastPostedAt < intervalMs) return;
  await bot.sendMessage(settings.channel_id || channelId, settings.message);
  lastPostedAt = Date.now();
}

setInterval(() => tick().catch(console.error), 30000);
