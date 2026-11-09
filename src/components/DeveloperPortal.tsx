import { useState } from 'react';

const endpoint='https://yejtrubajgyphbggtjrd.supabase.co/functions/v1/vulo-bots';
const jsExample=`import Vulo from './Vulo.js';

const bot = new Vulo(process.env.VULO_TOKEN);
const channelId = process.env.CHANNEL_ID;

await bot.sendMessage(channelId, 'Hello from my local Vulo bot!');
const { messages } = await bot.getMessages(channelId);
console.log(messages);`;
const pyExample=`from Vulo import Vulo
import os

bot = Vulo(os.environ["VULO_TOKEN"])
channel_id = os.environ["CHANNEL_ID"]

bot.send_message(channel_id, "Hello from my local Vulo bot!")
print(bot.get_messages(channel_id))`;

export default function DeveloperPortal() {
 const [tab,setTab]=useState<'overview'|'javascript'|'python'|'api'>('overview');
 const [copied,setCopied]=useState(false);
 const code=tab==='python'?pyExample:jsExample;
 const copy=async()=>{await navigator.clipboard?.writeText(code);setCopied(true);setTimeout(()=>setCopied(false),1500);};
 return <main className="min-h-screen bg-[#111214] text-[#dbdee1]">
  <header className="border-b border-[#292b2f] bg-[#1e1f22]"><div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5"><a href="/" className="text-xl font-bold text-white">VuloChat <span className="text-[#00a8fc]">Developers</span></a><a href="/" className="rounded bg-[#5865f2] px-4 py-2 text-sm font-semibold text-white">Open VuloChat</a></div></header>
  <section className="mx-auto max-w-6xl px-6 py-16"><p className="mb-3 text-sm font-bold uppercase tracking-[.2em] text-[#00a8fc]">Build with Vulo</p><h1 className="max-w-3xl text-4xl font-extrabold text-white md:text-6xl">Create bots that run on your machine.</h1><p className="mt-5 max-w-2xl text-lg text-[#b5bac1]">Use the Vulo API and SDKs to connect your own local programs to VuloChat servers. VuloChat never hosts or executes your bot code.</p>
  <div className="mt-8 flex flex-wrap gap-3"><a className="rounded bg-[#5865f2] px-5 py-3 font-semibold text-white" href="https://github.com/Tvmanisback/VuloChat/blob/main/sdk/Vulo.js">Get Vulo.js</a><a className="rounded bg-[#35373c] px-5 py-3 font-semibold text-white" href="https://github.com/Tvmanisback/VuloChat/blob/main/sdk/Vulo.py">Get Vulo.py</a><a className="rounded bg-[#35373c] px-5 py-3 font-semibold text-white" href="https://github.com/Tvmanisback/VuloChat/blob/main/docs/BOT_API.md">Full API docs</a></div></section>
  <section className="mx-auto grid max-w-6xl gap-6 px-6 pb-16 md:grid-cols-3">{[['01','Create a bot','Open Server Settings → Bots or use the bot tools in your server. Create a bot and copy its token.'],['02','Install it','Browse premade bots or add your own bot to a server. Configure its server permissions.'],['03','Run locally','Download an SDK, add your token as an environment variable, and run your program on your computer.']].map(([n,t,d])=><article key={n} className="rounded-xl border border-[#292b2f] bg-[#1e1f22] p-6"><p className="text-sm font-bold text-[#00a8fc]">{n}</p><h2 className="mt-3 text-xl font-bold text-white">{t}</h2><p className="mt-2 text-sm leading-6 text-[#b5bac1]">{d}</p></article>)}</section>
  <section className="mx-auto max-w-6xl px-6 pb-20"><div className="mb-4 flex flex-wrap gap-2">{(['overview','javascript','python','api'] as const).map(t=><button key={t} onClick={()=>setTab(t)} className={`rounded px-4 py-2 text-sm font-semibold capitalize ${tab===t?'bg-[#5865f2] text-white':'bg-[#292b2f] text-[#b5bac1]'}`}>{t}</button>)}</div>
   <div className="rounded-xl border border-[#292b2f] bg-[#1e1f22] p-6"><h2 className="text-2xl font-bold text-white">{tab==='overview'?'Bot platform overview':tab==='api'?'HTTP API':tab==='javascript'?'JavaScript SDK':'Python SDK'}</h2>
   {tab==='overview'?<div className="mt-4 space-y-3 text-sm leading-6 text-[#b5bac1]"><p>Every bot has a profile and a private token. Tokens are stored as hashes and should never be committed to source control.</p><p>Server owners can install bots and grant Read messages and Send messages permissions. Bots can only access servers where they are installed.</p><p>Premade templates are starter configurations, not hosted services. A Welcomer process must be running locally to respond.</p></div>:tab==='api'?<div className="mt-4 space-y-3 text-sm text-[#b5bac1]"><p><strong className="text-white">Base endpoint:</strong> <code>{endpoint}</code></p><p><strong className="text-white">Authentication:</strong> POST JSON with your token in the <code>x-vulo-token</code> header.</p><p><strong className="text-white">Actions:</strong> <code>send_message</code>, <code>get_messages</code>, <code>get_members</code>.</p><p><strong className="text-white">Example:</strong> <code>{'{"action":"send_message","channel_id":"CHANNEL_UUID","content":"Hello!"}'}</code></p></div>:<><div className="mt-4 flex justify-end"><button onClick={()=>void copy()} className="rounded bg-[#35373c] px-3 py-1.5 text-sm">{copied?'Copied':'Copy example'}</button></div><pre className="mt-2 overflow-x-auto rounded-lg bg-[#111214] p-5 text-sm text-[#e3e5e8]"><code>{code}</code></pre></>}</div>
  </section>
  <footer className="border-t border-[#292b2f] px-6 py-8 text-center text-xs text-[#949ba4]">VuloChat Developer Portal · Keep your bot tokens private.</footer>
 </main>;
}
