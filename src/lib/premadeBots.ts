// The premade bots that server owners can add. VuloChat runs them on its own servers, so they are always
// online and have no token or script. The list of bots, their descriptions and default settings lives in the
// bot_templates table. This file adds the settings fields the app shows for each one.

export const PORTAL_URL = 'https://vulochat.com/developers';
export const DOCS_URL = 'https://vulochat.com/dev-docs';

export interface PremadeField {
  key: string;
  label: string;
  kind: 'channel' | 'text' | 'textarea' | 'number';
  help?: string;
}

export interface PremadeBotInfo {
  fields: PremadeField[];
}

export const PREMADE_BOTS: Record<string, PremadeBotInfo> = {
  welcomer: {
    fields: [
      { key: 'channel_id', label: 'Welcome channel ID', kind: 'channel', help: 'Where greetings are posted. Greetings are only sent when this is set.' },
      { key: 'welcome_message', label: 'Welcome message', kind: 'text', help: '{username} and {server} are filled in automatically.' },
    ],
  },
  'auto-responder': {
    fields: [
      { key: 'channel_id', label: 'Channel ID', kind: 'channel', help: 'The channel to watch and reply in. Leave blank to reply in any channel of this server.' },
      { key: 'rules', label: 'Replies', kind: 'textarea', help: 'One per line, like: hello = Hi there, welcome!' },
    ],
  },
  announcer: {
    fields: [
      { key: 'channel_id', label: 'Channel ID', kind: 'channel', help: 'Where the announcement is posted. Posts are only sent when this is set.' },
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
