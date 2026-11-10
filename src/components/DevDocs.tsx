import { useState, type ReactNode } from 'react';

const BASE_URL = 'https://yejtrubajgyphbggtjrd.supabase.co/functions/v1/vulo-bots';

const NAV = [
  { id: 'start', label: 'Start' },
  { id: 'sdks', label: 'SDKs' },
  { id: 'premade', label: 'Premade bots' },
  { id: 'api', label: 'API' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'security', label: 'Security' },
];

const JS_QUICK = `import Vulo from './Vulo.js';

const bot = new Vulo(process.env.VULO_TOKEN);
const channelId = process.env.CHANNEL_ID;

await bot.sendMessage(channelId, 'Hello from my bot!');
const { messages } = await bot.getMessages(channelId);
console.log(messages.at(-1));`;

const PY_QUICK = `from Vulo import Vulo
import os

bot = Vulo(os.environ["VULO_TOKEN"])
channel_id = os.environ["CHANNEL_ID"]

bot.send_message(channel_id, "Hello from my bot!")
print(bot.get_messages(channel_id)["messages"][-1])`;

const CURL_EXAMPLE = `curl -X POST ${BASE_URL} \\
  -H "Content-Type: application/json" \\
  -H "x-vulo-token: $VULO_TOKEN" \\
  -d '{"action":"send_message","channel_id":"CHANNEL_ID","content":"Hello!"}'`;

export default function DevDocs() {
  return (
    <main className="min-h-screen bg-vulo-chat text-vulo-text">
      <header className="sticky top-0 z-10 border-b border-vulo-line bg-vulo-rail">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <a href="/" className="text-lg font-bold text-vulo-bright">
            VuloChat <span className="text-vulo-accent">Developers</span>
          </a>
          <div className="flex items-center gap-4 text-sm">
            <a href="/developers" className="font-semibold text-vulo-accent hover:underline">
              Developer portal
            </a>
            <a href="/" className="rounded bg-vulo-accent px-4 py-2 font-semibold text-white hover:opacity-90">
              Open VuloChat
            </a>
          </div>
        </div>
        <nav aria-label="Portal sections" className="scroll-thin mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-2">
          {NAV.map((n) => (
            <a key={n.id} href={`#${n.id}`} className="shrink-0 rounded px-3 py-1.5 text-sm text-vulo-muted hover:bg-vulo-hover hover:text-vulo-bright">
              {n.label}
            </a>
          ))}
        </nav>
      </header>

      <div className="mx-auto max-w-5xl space-y-16 px-4 py-12">
        <section>
          <p className="mb-2 text-sm font-bold uppercase tracking-widest text-vulo-accent">Build with Vulo</p>
          <h1 className="max-w-3xl text-4xl font-extrabold text-vulo-bright md:text-5xl">Bots that run on your computer.</h1>
          <p className="mt-4 max-w-2xl text-lg text-vulo-muted">
            Connect your own program to a VuloChat server with the Vulo API. VuloChat never hosts or runs your bot code. Your
            program runs wherever you run it, and it talks to VuloChat over HTTPS.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="../sdk/Vulo.js" download className="rounded bg-vulo-accent px-5 py-3 font-semibold text-white hover:opacity-90">
              Download Vulo.js
            </a>
            <a href="../sdk/Vulo.py" download className="rounded bg-vulo-side px-5 py-3 font-semibold text-vulo-bright hover:bg-vulo-hover">
              Download Vulo.py
            </a>
          </div>
        </section>

        <section id="start" className="scroll-mt-32">
          <Heading>Start in four steps</Heading>
          <ol className="grid gap-4 md:grid-cols-2">
            <Step n="1" title="Turn on Developer mode">
              In VuloChat, open <strong>Settings → Developer</strong> and turn on <strong>Enable developer mode</strong>.
            </Step>
            <Step n="2" title="Create a bot and copy its token">
              Open the <a className="text-vulo-accent hover:underline" href="/developers">developer portal</a> and create a bot. Its token is shown once, so copy it and keep it private.
            </Step>
            <Step n="3" title="Add the bot to your server">
              As a server owner or someone with Manage Server, open <strong>Server Settings → Bots</strong>, add the bot, and turn on
              Read messages and Send messages.
            </Step>
            <Step n="4" title="Run your program">
              Download an SDK below, set <code>VULO_TOKEN</code> and <code>CHANNEL_ID</code>, and run your program.
            </Step>
          </ol>
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <CodeBlock label="my-bot.js (Node.js 18+)" code={JS_QUICK} />
            <CodeBlock label="my_bot.py (Python 3.10+)" code={PY_QUICK} />
          </div>
          <p className="mt-4 text-sm text-vulo-muted">
            Run it with <code>VULO_TOKEN=vulo_… CHANNEL_ID=… node my-bot.js</code> or{' '}
            <code>VULO_TOKEN=vulo_… CHANNEL_ID=… python my_bot.py</code>. Keep the process running while the bot should respond.
          </p>
        </section>

        <section id="sdks" className="scroll-mt-32">
          <Heading>SDKs</Heading>
          <p className="mb-6 max-w-2xl text-vulo-muted">
            The SDKs wrap the HTTP API so you can call it with plain functions. Vulo.js has no dependencies. Vulo.py uses only the standard
            library, plus the cryptography package when a server is end-to-end encrypted.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Vulo.js" meta="Node.js 18+ · ES modules">
              <p>Methods: <code>sendMessage</code>, <code>getMessages</code>, <code>getMembers</code>, <code>getConfig</code>, <code>updateProfile</code>.</p>
              <a href="../sdk/Vulo.js" download className="mt-4 inline-block rounded bg-vulo-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
                Download Vulo.js
              </a>
            </Card>
            <Card title="Vulo.py" meta="Python 3.10+ · cryptography for encrypted servers">
              <p>Methods: <code>send_message</code>, <code>get_messages</code>, <code>get_members</code>, <code>get_config</code>, <code>update_profile</code>.</p>
              <a href="../sdk/Vulo.py" download className="mt-4 inline-block rounded bg-vulo-side px-4 py-2 text-sm font-semibold text-vulo-bright hover:bg-vulo-hover">
                Download Vulo.py
              </a>
            </Card>
          </div>
        </section>

        <section id="premade" className="scroll-mt-32">
          <Heading>Premade bots</Heading>
          <p className="mb-6 max-w-2xl text-vulo-muted">
            Server owners can add these from <strong>Server Settings → Bots</strong>. VuloChat runs them on its own servers, so they are
            always online. They have no token and no script to download. Their settings are set in Server Settings → Bots.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <Card title="Welcomer" meta="Community">
              <p>Greets new members in a channel. Set the welcome message. <code>{'{username}'}</code> and <code>{'{server}'}</code> are filled in.</p>
            </Card>
            <Card title="Auto-responder" meta="Utility">
              <p>Replies when a message contains a word you chose. One rule per line, like <code>hello = Hi there!</code></p>
            </Card>
            <Card title="Announcer" meta="Community">
              <p>Posts a message on a timer. Set the message, the channel and the minutes between posts.</p>
            </Card>
          </div>
        </section>

        <section id="api" className="scroll-mt-32">
          <Heading>API reference</Heading>
          <div className="space-y-4 text-vulo-text">
            <p>
              <strong className="text-vulo-bright">Base URL:</strong> <code className="break-all">{BASE_URL}</code>
            </p>
            <p>
              <strong className="text-vulo-bright">Authentication:</strong> send a <code>POST</code> with a JSON body and your bot token in the{' '}
              <code>x-vulo-token</code> header. Every request needs that header.
            </p>
            <p>
              <strong className="text-vulo-bright">Responses:</strong> JSON. Errors have an <code>error</code> message and an HTTP status:
              400 for bad input, 401 for a missing or revoked token, 403 when the bot is not allowed to do this in the server, 404 when the
              channel is not found, and 500 for a server problem.
            </p>
          </div>

          <CodeBlock label="Example request" code={CURL_EXAMPLE} className="mt-6" />

          <h3 className="mb-3 mt-10 text-lg font-bold text-vulo-bright">Bot actions</h3>
          <div className="space-y-6">
            <Endpoint
              action="send_message"
              body={`{ "action": "send_message", "channel_id": "CHANNEL_ID", "content": "Hello!" }`}
              response={`{ "message": { "id": "…", "channel_id": "…", "author_id": "…", "content": "Hello!", "created_at": "…" } }`}
              notes="Needs the Send messages permission and the bot must be enabled in the server. content is cut to 4000 characters."
            />
            <Endpoint
              action="get_messages"
              body={`{ "action": "get_messages", "channel_id": "CHANNEL_ID" }`}
              response={`{ "messages": [ { "id": "…", "channel_id": "…", "author_id": "…", "content": "…", "created_at": "…" } ] }`}
              notes="The 50 most recent messages in the channel, oldest first. Needs the Read messages permission."
            />
            <Endpoint
              action="get_members"
              body={`{ "action": "get_members", "channel_id": "CHANNEL_ID" }`}
              response={`{ "members": [ { "user_id": "…", "joined_at": "…", "profiles": { "username": "…", "display_name": "…" } } ] }`}
              notes="Up to 100 server members, newest first. Needs the Read messages permission."
            />
            <Endpoint
              action="get_config"
              body={`{ "action": "get_config", "channel_id": "CHANNEL_ID" }`}
              response={`{ "settings": { … }, "permissions": { "read_messages": true, "send_messages": true }, "server_name": "…" }`}
              notes="The settings the server owner chose for this bot in this server. Use it to read the welcome message, rules or timer. The bot must be enabled."
            />
            <Endpoint
              action="update_profile"
              body={`{ "action": "update_profile", "display_name": "My Bot", "about": "What it does" }`}
              response={`{ "ok": true, "profile": { "display_name": "My Bot", "about": "What it does" } }`}
              notes="Changes the bot's own profile. Accepts display_name, avatar_url, banner_url and about. Works without any server."
            />
            <Endpoint
              action="register_device"
              body={`{ "action": "register_device", "public_key": "BASE64_P256_PUBLIC_KEY" }`}
              response={`{ "ok": true, "registered": true }`}
              notes="The SDKs call this for you. It sends only the public key of the bot's decryption key, so the bot is included in encrypted messages. Calling it again with the same key changes nothing. A new key replaces the old one."
            />
          </div>

          <h3 className="mb-3 mt-10 text-lg font-bold text-vulo-bright">Encrypted servers</h3>
          <div className="max-w-2xl space-y-3 text-sm text-vulo-muted">
            <p>Some servers use end-to-end encryption, so messages are encrypted separately for each device. A bot needs a key to read them. The SDKs handle this for you:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>The first time your bot reads messages, the SDK creates a key pair in <code>vulo-key.json</code> (or the file named in <code>VULO_KEY_FILE</code>). It then calls <code>register_device</code> with the public key. Only the public key is sent.</li>
              <li>Messages come back with their plain text in <code>content</code>. A message your bot cannot read has <code>content: null</code> and a <code>decrypt_error</code>.</li>
              <li>A bot can read only messages sent after its key was registered. Keep the key file. If you delete it, the bot gets a new key, and older messages stay unreadable.</li>
              <li>Vulo.py needs the cryptography package for encrypted servers: <code>pip install cryptography</code>. Without it, plain messages still work.</li>
              <li>If you call the HTTP API yourself, <code>get_messages</code> returns the encrypted message content. You must decrypt it yourself, or use an SDK.</li>
            </ul>
          </div>

          <h3 className="mb-3 mt-10 text-lg font-bold text-vulo-bright">Account actions (used by VuloChat)</h3>
          <p className="mb-4 max-w-2xl text-sm text-vulo-muted">
            VuloChat uses these when you sign in. Bot programs don't call them. Creating a bot and regenerating a token need Developer
            mode turned on.
          </p>
          <ul className="space-y-2 rounded bg-vulo-side p-4 text-sm">
            <li><code>create</code>: make a bot and its first token.</li>
            <li><code>regenerate_token</code>: replace a bot's token. The old token stops working right away.</li>
            <li><code>install</code>: add a bot to a server. Needs Manage Server.</li>
            <li><code>edit_profile</code>: change a bot's profile as its owner.</li>
          </ul>
        </section>

        <section id="permissions" className="scroll-mt-32">
          <Heading>Permissions</Heading>
          <p className="mb-4 max-w-2xl text-vulo-muted">
            Server owners and members with Manage Server choose what each bot may do, in <strong>Server Settings → Bots</strong>. A bot can
            only act in servers where it is added and enabled.
          </p>
          <ul className="space-y-3">
            <li className="rounded bg-vulo-side p-4"><code>read_messages</code>: lets the bot call <code>get_messages</code> and <code>get_members</code>.</li>
            <li className="rounded bg-vulo-side p-4"><code>send_messages</code>: lets the bot call <code>send_message</code>.</li>
            <li className="rounded bg-vulo-side p-4"><code>manage_messages</code>: reserved for future use. No action uses it yet.</li>
          </ul>
        </section>

        <section id="security" className="scroll-mt-32">
          <Heading>Security</Heading>
          <ul className="list-disc space-y-3 pl-5 text-vulo-text">
            <li>Keep your token private. Never put it in browser code, public repositories, or screenshots. Use an environment variable.</li>
            <li>If a token is exposed, open <strong>Settings → Developer</strong> and choose <strong>New token</strong>. The old token stops working immediately.</li>
            <li>Bot programs run on your computer. VuloChat never runs them and never stores their code.</li>
            <li>The key file (vulo-key.json by default) holds your bot's decryption key. Keep it private, like the token. Anyone with that file can read what your bot can read.</li>
            <li>Poll gently. Checking every 3 to 10 seconds is plenty for these scripts.</li>
          </ul>
        </section>
      </div>

      <footer className="border-t border-vulo-line px-4 py-8 text-center text-xs text-vulo-muted">
        VuloChat Developer Portal · Keep your bot tokens private ·{' '}
        <a href="/info.html#terms" className="hover:underline">Terms</a> ·{' '}
        <a href="/info.html#privacy" className="hover:underline">Privacy</a>
      </footer>
    </main>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return <h2 className="mb-6 text-2xl font-bold text-vulo-bright md:text-3xl">{children}</h2>;
}

function Step({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <li className="rounded-lg bg-vulo-side p-5">
      <p className="text-sm font-bold text-vulo-accent">{n}</p>
      <h3 className="mt-2 text-lg font-bold text-vulo-bright">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-vulo-muted">{children}</p>
    </li>
  );
}

function Card({ title, meta, children }: { title: string; meta: string; children: ReactNode }) {
  return (
    <article className="flex flex-col rounded-lg bg-vulo-side p-5 text-sm leading-6 text-vulo-muted">
      <p className="text-xs font-bold uppercase tracking-wide text-vulo-accent">{meta}</p>
      <h3 className="mt-1 text-lg font-bold text-vulo-bright">{title}</h3>
      <div className="mt-2 space-y-2">{children}</div>
    </article>
  );
}

function Endpoint({ action, body, response, notes }: { action: string; body: string; response: string; notes: string }) {
  return (
    <article className="rounded-lg bg-vulo-side p-5">
      <h4 className="font-mono text-base font-bold text-vulo-bright">{action}</h4>
      <p className="mt-2 text-sm text-vulo-muted">{notes}</p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <CodeBlock label="Request body" code={body} />
        <CodeBlock label="Response" code={response} />
      </div>
    </article>
  );
}

function CodeBlock({ label, code, className = '' }: { label: string; code: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className={`overflow-hidden rounded-lg bg-vulo-rail ${className}`}>
      <div className="flex items-center justify-between border-b border-vulo-line px-4 py-2">
        <span className="text-xs font-bold uppercase tracking-wide text-vulo-muted">{label}</span>
        <button type="button" onClick={() => void copy()} className="rounded px-2 py-1 text-xs text-vulo-muted hover:bg-vulo-hover hover:text-vulo-bright">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="scroll-thin overflow-x-auto p-4 text-sm leading-6 text-vulo-text">
        <code>{code}</code>
      </pre>
    </div>
  );
}
