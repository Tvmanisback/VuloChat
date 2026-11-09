// The premade bots that server owners can add. The list of bots, their descriptions and default
// settings lives in the bot_templates table. This file adds what the app needs to show the right
// settings fields and link to the script that runs the bot on the owner's computer.

export const PORTAL_URL = 'https://vulochat.com/developers';
export const DOCS_URL = 'https://vulochat.com/dev-docs';
export const SCRIPTS_URL = 'https://vulochat.com/examples/';

export interface PremadeField {
  key: string;
  label: string;
  kind: 'channel' | 'text' | 'textarea' | 'number';
  help?: string;
}

export interface PremadeBotInfo {
  script: string;
  fields: PremadeField[];
}

export const PREMADE_BOTS: Record<string, PremadeBotInfo> = {
  welcomer: {
    script: 'welcomer.js',
    fields: [
      { key: 'channel_id', label: 'Welcome channel ID', kind: 'channel', help: 'Where greetings are posted. Leave blank to use the channel the bot runs with.' },
      { key: 'welcome_message', label: 'Welcome message', kind: 'text', help: '{username} and {server} are filled in automatically.' },
    ],
  },
  'auto-responder': {
    script: 'auto-responder.js',
    fields: [
      { key: 'channel_id', label: 'Channel ID', kind: 'channel', help: 'The channel to watch. Leave blank to use the channel the bot runs with.' },
      { key: 'rules', label: 'Replies', kind: 'textarea', help: 'One per line, like: hello = Hi there, welcome!' },
    ],
  },
  announcer: {
    script: 'announcer.js',
    fields: [
      { key: 'channel_id', label: 'Channel ID', kind: 'channel', help: 'Where the announcement is posted. Leave blank to use the channel the bot runs with.' },
      { key: 'message', label: 'Message', kind: 'textarea' },
      { key: 'interval_minutes', label: 'Minutes between posts', kind: 'number' },
    ],
  },
};

// Supabase reports any non-2xx answer as "Edge Function returned a non-2xx status code". The real reason
// (for example "Turn on Developer mode") is in the response body, so read that instead.
export async function errorMessage(err: unknown): Promise<string> {
  const context = (err as { context?: Response })?.context;
  try {
    const body = await context?.json();
    if (body?.error) return String(body.error);
  } catch {
    // The body was not JSON; fall back to the generic message.
  }
  return err instanceof Error ? err.message : 'Something went wrong. Try again.';
}
