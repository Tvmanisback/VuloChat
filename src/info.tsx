import { useEffect, useState, type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { Logo } from './components/ui';

type PageId = 'terms' | 'privacy' | 'facts' | 'faq';

const PAGES: { id: PageId; label: string }[] = [
  { id: 'terms', label: 'Terms of Service' },
  { id: 'privacy', label: 'Privacy Policy' },
  { id: 'facts', label: 'Facts' },
  { id: 'faq', label: 'FAQ' },
];

const REPO_URL = 'https://github.com/Tvmanisback/VuloChat';
const ISSUES_URL = `${REPO_URL}/issues`;
const UPDATED = 'Last updated 8 November 2026';

function pageFromHash(): PageId {
  const id = window.location.hash.slice(1);
  return PAGES.some((p) => p.id === id) ? (id as PageId) : 'terms';
}

function InfoPage() {
  const [page, setPage] = useState<PageId>(pageFromHash);

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <div className="min-h-screen bg-vulo-rail text-vulo-text">
      <header className="border-b border-vulo-line bg-vulo-side">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <Logo className="h-9 w-9" />
            <span className="text-lg font-bold text-vulo-bright">VuloChat</span>
          </div>
          <a href="./" className="text-sm text-[#00a8fc] hover:underline">
            Back to VuloChat
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <div role="tablist" aria-label="Information pages" className="mb-8 flex flex-wrap gap-1 rounded bg-vulo-side p-1">
          {PAGES.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={page === p.id}
              onClick={() => {
                window.location.hash = p.id;
              }}
              className={`flex-1 rounded px-3 py-2 text-sm font-medium transition ${
                page === p.id ? 'bg-vulo-active text-vulo-bright' : 'text-vulo-muted hover:text-vulo-text'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {page === 'terms' && <Terms />}
        {page === 'privacy' && <Privacy />}
        {page === 'facts' && <Facts />}
        {page === 'faq' && <Faq />}
      </main>
    </div>
  );
}

function Page({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <article className="space-y-6 rounded-lg bg-vulo-chat p-6 sm:p-8">
      <header>
        <h1 className="text-2xl font-bold text-vulo-bright">{title}</h1>
        {updated && <p className="mt-1 text-sm text-vulo-muted">{updated}</p>}
      </header>
      {children}
    </article>
  );
}

function Clause({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-vulo-bright">{title}</h2>
      <div className="space-y-2 leading-relaxed">{children}</div>
    </section>
  );
}

function Bullets({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5">{children}</ul>;
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#00a8fc] hover:underline">
      {children}
    </a>
  );
}

function Terms() {
  return (
    <Page title="Terms of Service" updated={UPDATED}>
      <Clause title="1. About VuloChat">
        <p>
          VuloChat is a chat app with servers, channels, direct messages, voice channels and cosmetic decorations. Its code is open
          source and lives on GitHub. The official site is run by Tvmans, the project owner.
        </p>
      </Clause>

      <Clause title="2. Your account">
        <Bullets>
          <li>Usernames are 2 to 32 characters: lowercase letters, numbers, underscores and dots. They are fixed once you sign up.</li>
          <li>Passwords must be at least 8 characters. Keep yours private. You are responsible for anything done from your account.</li>
          <li>Confirm your email when asked. You must be at least 13 years old to use VuloChat.</li>
        </Bullets>
      </Clause>

      <Clause title="3. What you post">
        <p>
          You own what you post, and you are responsible for it. By posting, you let VuloChat store, process and show it to the people
          you share it with, and run the automated checks in section 6.
        </p>
      </Clause>

      <Clause title="4. Rules">
        <p>Do not use VuloChat to:</p>
        <Bullets>
          <li>
            post anything illegal, or any sexual content involving minors. That content is removed and reported as the law requires;
          </li>
          <li>threaten, harass or target someone, or spread hateful content;</li>
          <li>send spam, scams or malware, or impersonate another person or a team;</li>
          <li>attack, probe or overload the service, scrape it in bulk, or get around a ban.</li>
        </Bullets>
      </Clause>

      <Clause title="5. Reporting and moderation">
        <p>
          If you see content or behaviour that breaks these rules, use Report on the message, direct message or profile. Reports go to
          the project owner, who reviews them. Server owners and people with the Manage Messages permission can also delete messages in
          their servers. The project owner may remove content, and may restrict or end accounts that break these rules.
        </p>
      </Clause>

      <Clause title="6. Automated checks">
        <p>
          Images you upload are checked by an automated service when the project owner has set one up. Messages also pass a check for
          blocked words. These checks make mistakes, so they cannot catch everything, and content can be removed after it is posted.
        </p>
      </Clause>

      <Clause title="7. Servers">
        <p>
          Server owners and people with the right permissions manage a server's channels, roles, members, emojis and stickers, and must
          follow these terms too.
        </p>
      </Clause>

      <Clause title="8. Decorations and badges">
        <p>
          Avatar decorations, nameplates, profile card decorations and badges are cosmetic. This version of VuloChat sells nothing, so
          they have no cash value and cannot be bought, sold or transferred. Badges are granted at the project owner's discretion. Any
          item can be changed or retired, and some end on a set date.
        </p>
      </Clause>

      <Clause title="9. Voice and video">
        <p>
          Voice channels connect participants directly to each other, so people in a call can hear each other. VuloChat does not
          record calls.
        </p>
      </Clause>

      <Clause title="10. Third-party services">
        <p>
          VuloChat relies on Supabase (accounts, database, file storage and realtime), KLIPY (GIF search), Sightengine (image checks)
          and GitHub Pages (website hosting). Their own terms also apply to what they handle.
        </p>
      </Clause>

      <Clause title="11. Deleting your account">
        <p>
          You can delete your account in Settings, under My Account. Deleting removes what the account created, as the Privacy Policy
          describes. Deletion cannot be undone. You must delete any servers you own first.
        </p>
      </Clause>

      <Clause title="12. The service">
        <p>
          VuloChat is provided as is. It may be unavailable at times, features may change or stop, and data can be lost. To the extent
          the law allows, the project owner is not liable for indirect losses.
        </p>
      </Clause>

      <Clause title="13. Ending your use">
        <p>
          You can stop using VuloChat at any time by deleting your account. The project owner can suspend or end access for breaking
          these terms.
        </p>
      </Clause>

      <Clause title="14. Changes">
        <p>
          These terms can change. The date at the top shows the latest version. Carrying on with VuloChat after a change means you accept
          it.
        </p>
      </Clause>

      <Clause title="15. Contact">
        <p>
          Questions about these terms: open an issue at <ExternalLink href={ISSUES_URL}>GitHub issues</ExternalLink>. Issues are
          public, so do not post personal information there.
        </p>
      </Clause>
    </Page>
  );
}

function Privacy() {
  return (
    <Page title="Privacy Policy" updated={UPDATED}>
      <Clause title="What this covers">
        <p>This policy covers VuloChat on the website, the Windows app and the Android app.</p>
      </Clause>

      <Clause title="What we collect">
        <Bullets>
          <li>
            <strong>Account:</strong> your email address, username, display name, password (kept by our login service in protected
            form, never in plain text), about text, custom status, online status, profile colour, avatar and banner images, and the
            decorations and badges you have.
          </li>
          <li>
            <strong>Content:</strong> messages and their edits, direct messages, files and images you upload, custom emojis and stickers
            you add to a server, GIF favourites, friend requests and friendships, server membership, invites you use, and roles you hold.
          </li>
          <li>
            <strong>Voice:</strong> which voice channel you are in, whether you are muted or deafened, and whether you are speaking. This
            is shared in real time with the people in the same call. Audio is not stored.
          </li>
          <li>
            <strong>Reports:</strong> when you report something, we keep who reported it, what was reported, the reason and any details
            you add, and a copy of up to 2,000 characters of the reported text. The copy lets the owner review a report even after the
            message is deleted. The person reported is not told who reported them.
          </li>
          <li>
            <strong>On your device:</strong> your settings, such as theme, keybinds and voice devices, are kept in your browser's local
            storage. They are not sent to us.
          </li>
          <li>
            <strong>Technical:</strong> the hosting and service providers process your IP address and request details to deliver the
            site, as any web service does.
          </li>
        </Bullets>
      </Clause>

      <Clause title="How it is used">
        <p>
          To run VuloChat: show messages, connect calls, keep accounts secure, send login and confirmation emails, handle reports, and
          enforce the rules in the Terms of Service.
        </p>
      </Clause>

      <Clause title="Who else receives it">
        <Bullets>
          <li>
            <strong>Supabase</strong> hosts the database, login, file storage, realtime connections and functions.
          </li>
          <li>
            <strong>Sightengine</strong> receives images you upload to check them, when the project owner has set this up.
          </li>
          <li>
            <strong>KLIPY</strong> receives your GIF search text and a hashed identifier made from your user ID, not the ID itself.
          </li>
          <li>
            <strong>GitHub Pages</strong> serves the website.
          </li>
          <li>
            <strong>Other people:</strong> anything you post in a server, or send in a direct message, is visible to the people who can
            see that channel or conversation.
          </li>
        </Bullets>
        <p>The app's code includes no analytics or advertising services.</p>
      </Clause>

      <Clause title="Security and encryption">
        <p>
          Access rules in the database limit each person to what they are allowed to read. No system is perfectly secure. Messages are
          not end-to-end encrypted, so the project owner and the database can read stored messages.
        </p>
      </Clause>

      <Clause title="How long we keep it">
        <p>
          Your data is kept while your account exists. You can delete your account in Settings, under My Account. Deleting it removes
          your profile, messages, direct messages, friendships, badges, server memberships, GIF favourites, and the files you uploaded to
          messages and your profile. Reports you filed are removed. Reports other people filed about your content stay for review,
          without a link to your account. Emojis and stickers you added to a server stay with that server, without a link to you.
          Copies in the hosting provider's backups follow that provider's schedule.
        </p>
        <p>
          Owners must delete their servers before deleting their account, because deleting a server removes everything in it.
        </p>
      </Clause>

      <Clause title="Your choices">
        <p>
          You can edit your profile, leave servers, report content, delete your account and log out. In Settings you can turn off
          desktop notifications, decorations and link previews.
        </p>
      </Clause>

      <Clause title="Children">
        <p>VuloChat is not for children under 13.</p>
      </Clause>

      <Clause title="Changes and contact">
        <p>
          This policy can change. The date at the top shows the latest version. Contact details are the same as in the Terms of Service.
        </p>
      </Clause>
    </Page>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded bg-vulo-side p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-vulo-muted">{label}</p>
      <div className="mt-1 text-sm leading-relaxed">{children}</div>
    </div>
  );
}

function Facts() {
  return (
    <Page title="Facts about VuloChat" updated={UPDATED}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Fact label="Version">1.0.0</Fact>
        <Fact label="Where it runs">The website, a Windows app and an Android app. The same code runs on all three.</Fact>
        <Fact label="Built with">
          React, TypeScript, Vite and Tailwind CSS on the front end. Supabase for accounts, the database, file storage and realtime.
          Electron for Windows. Capacitor for Android.
        </Fact>
        <Fact label="Messages">Sent through Supabase and delivered in real time.</Fact>
        <Fact label="Voice">Connects participants directly to each other in the browser (WebRTC). Calls are not recorded.</Fact>
        <Fact label="Data">Kept in a Supabase Postgres database. Access rules decide what each person can read.</Fact>
        <Fact label="Cosmetics">
          Avatar decorations, nameplates, profile card decorations and badges. Some are locked to a badge, and some end on a set date.
        </Fact>
        <Fact label="Money">Nothing is sold in this version. There are no purchases and no ads.</Fact>
        <Fact label="Analytics">None in the app's code.</Fact>
        <Fact label="Languages">English for now.</Fact>
      </div>
    </Page>
  );
}

const QUESTIONS: { q: string; a: ReactNode }[] = [
  {
    q: 'How do I sign up?',
    a: (
      <p>
        Choose Register on the login screen. Enter a username, your email and a password of at least 8 characters, then open the
        confirmation link we email you.
      </p>
    ),
  },
  {
    q: 'I did not get the confirmation email.',
    a: <p>Check your spam folder. Then open the confirmation page and use Send a new link.</p>,
  },
  {
    q: 'How do I change my decoration?',
    a: (
      <p>
        Open Settings, then Decorations. Pick an avatar decoration, a nameplate or a profile card decoration. Locked items show the
        badge they need, or say they have ended.
      </p>
    ),
  },
  {
    q: 'How do I get a badge?',
    a: <p>The project owner grants badges to members. There is no way to buy one.</p>,
  },
  {
    q: 'Can I upload my own decoration?',
    a: <p>Not yet. The upload option is marked coming soon.</p>,
  },
  {
    q: 'Why does a decoration look different on the Windows app?',
    a: (
      <p>
        Tinted decorations take your accent colour on the website and the Android app. The Windows app shows their original colours.
      </p>
    ),
  },
  {
    q: 'What is a role decoration?',
    a: (
      <p>
        A server's admins can give a role a decoration. Members with that role show it in that server's member list, in place of their
        own decoration there.
      </p>
    ),
  },
  {
    q: 'Are my messages private?',
    a: (
      <p>
        They are not end-to-end encrypted, so the project owner and the database can read stored messages. Access rules keep people out
        of channels and conversations they are not part of. See the Privacy Policy.
      </p>
    ),
  },
  {
    q: 'How do I report someone?',
    a: (
      <p>
        Open a message's menu and choose Report message, or press Report next to a direct message. On a profile card, choose Report
        user. Pick a reason and add details if you want. The project owner reviews reports, and the person reported is not told who
        reported them.
      </p>
    ),
  },
  {
    q: 'Does VuloChat record calls?',
    a: <p>No.</p>,
  },
  {
    q: 'How do I turn off notifications or animations?',
    a: (
      <p>
        Open Settings. Notifications are under Notifications. Animations and pulsing effects are under Accessibility, in Reduce motion.
        Text size is there too.
      </p>
    ),
  },
  {
    q: 'Why are GIFs not loading?',
    a: (
      <p>
        GIF search needs a KLIPY key that the project owner sets up. Without it, you will see a message that GIF search is not set up
        yet.
      </p>
    ),
  },
  {
    q: 'Are uploaded images checked?',
    a: (
      <p>
        Yes, when the project owner has set up the Sightengine check. If it is not set up, images are allowed through.
      </p>
    ),
  },
  {
    q: 'How do I delete my account?',
    a: (
      <p>
        Open Settings, then My Account, and choose Delete my account. Type your username to confirm. This permanently removes your
        profile, messages, direct messages and uploaded files. Delete any servers you own first. The Privacy Policy lists what stays.
      </p>
    ),
  },
  {
    q: 'Can I undo deleting my account?',
    a: <p>No. Deleting an account cannot be undone.</p>,
  },
  {
    q: 'Which devices does it work on?',
    a: <p>Any modern web browser, the Windows app and the Android app.</p>,
  },
];

function Faq() {
  return (
    <Page title="Frequently asked questions" updated={UPDATED}>
      <div className="space-y-2">
        {QUESTIONS.map((item) => (
          <details key={item.q} className="rounded bg-vulo-side px-4 py-3">
            <summary className="cursor-pointer font-medium text-vulo-bright">{item.q}</summary>
            <div className="mt-2 space-y-2 text-sm leading-relaxed">{item.a}</div>
          </details>
        ))}
      </div>
      <p className="text-sm text-vulo-muted">
        Still stuck? Open an issue on <ExternalLink href={ISSUES_URL}>GitHub</ExternalLink>.
      </p>
    </Page>
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<InfoPage />);
