// Auto-responder: replies when a message contains one of the words set in Server Settings → Bots.
// Rules are one per line, like: hello = Hi there, welcome!
// Run on your computer: VULO_TOKEN=... CHANNEL_ID=any-channel-id node auto-responder.js
import Vulo from '../sdk/Vulo.js';

const bot = new Vulo(process.env.VULO_TOKEN);
const channelId = process.env.CHANNEL_ID;
if (!channelId) throw new Error('Set CHANNEL_ID to any channel in the server.');

function parseRules(text) {
  return String(text || '')
    .split('\n')
    .map((line) => {
      const at = line.indexOf('=');
      return at === -1 ? null : { word: line.slice(0, at).trim().toLowerCase(), reply: line.slice(at + 1).trim() };
    })
    .filter((rule) => rule && rule.word && rule.reply);
}

const handled = new Set();
let initialized = false;

async function poll() {
  // Read the settings on every poll, so rule changes apply without restarting the bot.
  const { settings } = await bot.getConfig(channelId);
  if (settings.enabled === false) return;
  const rules = parseRules(settings.rules);
  const watchChannel = settings.channel_id || channelId;

  const { messages } = await bot.getMessages(watchChannel);
  for (const message of messages) {
    if (handled.has(message.id)) continue;
    handled.add(message.id);
    // The first poll only records existing messages, so the bot does not answer old chat on startup.
    if (!initialized) continue;
    const text = (message.content || '').toLowerCase();
    const rule = rules.find((r) => text.includes(r.word));
    if (!rule) continue;
    const sent = await bot.sendMessage(watchChannel, rule.reply);
    handled.add(sent.message.id); // so the bot never answers its own reply
  }
  initialized = true;
}

await poll();
setInterval(() => poll().catch(console.error), 3000);
