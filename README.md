# VuloChat

Free chat for servers, channels, voice and direct messages. Runs in the browser, on Windows, and on Android.

**Version:** 1.0.0

## Repository layout

```
VuloChat/
├── src/                     website (React + Vite + Tailwind), served from GitHub Pages
│   ├── components/          UI: shell, sidebars, chat, voice stage, settings, modals
│   └── lib/                 Supabase client, auth, server data hook, WebRTC voice, settings
├── public/                  static files (favicon)
├── index.html               website entry (source; the published copy is in docs/)
├── package.json             website dependencies and scripts
├── Pc/                      Windows app (Electron): frameless window, tray, hotkeys, notifications
├── Android/                 Android app (Capacitor): drawer layout, back button, signed APK
├── supabase/schema.sql      complete database: tables, RLS policies, RPCs, realtime, storage
├── docs/                    built website, published by GitHub Pages (npm run publish:web)
└── .github/workflows/build.yml   CI: build the .exe and .apk, attach them to releases
```

## Setting up

### 1. Database

The live project for v1 is `vulochat` (`yejtrubajgyphbggtjrd`). To set up your own, create a Supabase project and run `supabase/schema.sql` in the SQL Editor, then put its URL and publishable key in `.env.local` (see `.env.example`).

### 2. Website (local)

```bash
npm install
cp .env.example .env.local   # optional: the defaults already point at the VuloChat project
npm run dev
```

### 3. GitHub Pages

The site is published from the `docs/` folder on `main`:

1. Settings → Pages → Source: **Deploy from a branch**. Branch: `main`, folder: `/docs`.
2. Build the site into `docs/`: `npm run publish:web`.
3. Commit and push `docs/`. GitHub Pages publishes the new version.

### 4. Desktop and Android builds

See `Pc/README.md` and `Android/README.md`. CI builds both on every push and attaches them to releases when you tag `v1.0.0`:

```bash
git tag v1.0.0 && git push origin v1.0.0
```

## What v1.0.0 includes

- **Accounts:** register and log in with email and password. A profile is created automatically with a unique username.
- **Servers:** create a server (gets a default Admin role, a text channel and a voice channel), join with an invite code, invite others with 7-day codes, leave.
- **Channels:** text and voice channels grouped into categories, created by members with the right permission.
- **Chat:** real-time messages with Markdown (bold, italics, code blocks, lists, tables, quotes), emoji, file attachments up to 25 MB, image and link previews, edit and delete, and message history paging.
- **Voice:** WebRTC voice channels with mute, deafen, and speaking indicators. Push-to-talk in the browser.
- **Direct messages and friends:** send, accept and decline friend requests. Private real-time DMs between friends.
- **Presence:** online, idle (after 5 minutes), do not disturb, and invisible.
- **Roles and permissions:** role-based permission bits enforced in the database (`server_roles`, `member_roles`). Roles can be created, coloured and edited, and members can be assigned roles or kicked.
- **Settings:** My Account (display name, about, avatar), Appearance, Voice & Video (devices, volume, noise suppression, echo cancellation, push-to-talk), Keybinds, and Server Settings (Overview, Roles, Members).
- **Security:** row-level security on every table, private attachment storage with short-lived links, and no anonymous access to security-definer functions.
- **Desktop:** frameless window with custom controls, tray with background running, global hotkeys, native notifications.
- **Android:** responsive drawer layout, hardware back button, status bar styling, signed release APK when keystore secrets are set.

## Known limits in v1.0.0

- **Voice scale:** voice uses a peer-to-peer mesh, which is reliable for small channels (roughly 6 people or fewer). Larger rooms need an SFU, which is planned.
- **Presence:** online and idle status is set by the app. If a browser tab closes without signing out, the status can stay "online" until the next sign-in.
- **Push notifications (Android):** the plugin is installed, but the Firebase project and token registration are not wired up yet.
- **Look and feel:** VuloChat uses its own name, logo and violet accent, with a Discord-style layout. It is not a pixel copy of Discord, which is a trademark owned by another company.
- **Emoji:** the picker offers a curated set. The full catalogue and skin tones are planned.
