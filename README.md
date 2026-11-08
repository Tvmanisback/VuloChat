# VuloChat

Free chat for servers, channels, voice, and direct messages. Use it in your browser, on Windows, or on Android.

**Version 1.0.0**

## What you can do

- **Create an account** with an email, password, and username. Your profile is set up automatically.
- **Make a server.** You start with an Admin role, a text channel, and a voice channel. Invite friends with a code that lasts 7 days, or join someone else's server with theirs.
- **Chat in real time.** Use Markdown (bold, italics, code blocks, lists, tables, quotes), emoji, files up to 25 MB, image and link previews. Edit or delete your own messages, and scroll back through history.
- **Talk in voice channels.** Mute, deafen, and see who is speaking. Push-to-talk is available in the browser.
- **Message friends privately.** Send, accept, or decline friend requests, then chat in direct messages.
- **Set your status** to online, idle (after 5 minutes), do not disturb, or invisible.
- **Manage roles.** If you have the permission, create colored roles, assign them to members, or remove members.
- **Customize everything in Settings:** your account, avatar decoration, appearance, voice and video devices, and keybinds. Server owners and admins can edit server overview, roles, and members.
- **Pick an avatar decoration.** Choose one of 25 frames in Settings → Avatar Decoration. It shows around your avatar everywhere you appear. Many frames are animated.
- **Customize your profile.** In Settings → Profile, upload a banner (GIF banners play), pick a profile color for when there's no banner, set a custom status, and see your badges. Your About me text supports Markdown.
- **Open profile cards.** Click a member in the member list or a name in chat to see their banner, avatar, status, badges, and About me.
- **Use custom emoji.** Server owners and admins can add up to 50 emojis to a server in Server Settings → Emojis. Type `:name:` in any message on that server, or pick one from the emoji menu.
- **Send GIFs.** Click **GIF** in the message box and search. GIFs come from KLIPY, and the key stays on the server. Setup is in [step 5](#5-set-up-gifs-klipy). Trending, search, and favorites are all in the GIF panel.
- **Reply and forward.** Hover a message and click reply to answer it. Replies show a quote of the original. Forward copies a message to any text channel you can post in, and the copy is marked as forwarded.
- **Custom themes.** Pick Violet, Midnight, Forest, or Light, or build your own in Settings → Appearance. Themes are saved on the device you choose them on.
- **Use the Windows app** for a window with its own controls, a tray icon that keeps VuloChat running, global hotkeys, and desktop notifications.
- **Use the Android app.** Swipe out the menu for servers and channels. The back button closes open panels before it leaves the app.

## Open the website

Go to the address GitHub Pages gives your repository, for example `https://<your-username>.github.io/VuloChat/`.

## Set up your own copy

### 1. Set up the database

The v1 database already exists as the Supabase project `vulochat`. If you're running your own copy, follow these steps:

1. Create a new project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** and run the contents of `supabase/schema.sql`.
3. Copy the project URL and publishable key into `.env.local`. Use `.env.example` as a template.
4. Go to **Authentication → URL Configuration**. Set **Site URL** to your website address, and add `https://<your-username>.github.io/VuloChat/confirm.html` under **Redirect URLs**. Without this, email confirmation links won't open the right page.

Every table has row-level security turned on, so the database itself controls who can read and write what.

### 2. Run the website on your computer

```bash
npm install
npm run dev
```

The default settings already point at the VuloChat database, so you only need `.env.local` if you're using your own.

### 3. Publish the website with GitHub Pages

The workflow in [`.github/workflows/pages.yml`](.github/workflows/pages.yml) builds the site and publishes it every time you push to `main`.

1. Go to **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Push to `main`, or open the **Actions** tab and run **Publish website to GitHub Pages** manually.

Once the run finishes, the site is live at `https://<your-username>.github.io/VuloChat/`.

### 4. Build the Windows and Android apps

- **Windows:** see [`Pc/README.md`](Pc/README.md).
- **Android:** see [`Android/README.md`](Android/README.md).

Every push to `main` builds the Windows `.exe` and the Android `.apk`. You can download them from the workflow run.

To publish them as a release, create a version tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The release attaches the `.exe` and `.apk` automatically. To sign the Android APK, add the keystore secrets listed at the top of [`.github/workflows/build.yml`](.github/workflows/build.yml).

### 5. Set up GIFs (KLIPY)

The GIF button uses [KLIPY](https://partner.klipy.com). The browser never sees the key. It calls a Supabase Edge Function (`supabase/functions/klipy`), and the function calls KLIPY.

1. Sign up at [partner.klipy.com](https://partner.klipy.com), add a platform for VuloChat, and accept the terms. Copy your API key. Test keys have a low hourly limit, so request a production key before you open the app to many people.
2. Add the key as a secret named `KLIPY_API_KEY`. In the Supabase dashboard, open **Edge Functions → Secrets**, or run this with the [Supabase CLI](https://supabase.com/docs/guides/cli):
   ```bash
   supabase secrets set KLIPY_API_KEY=<your-key> --project-ref <your-project-ref>
   ```
3. The `klipy` function is deployed to the VuloChat project already. If you run your own copy, deploy it with:
   ```bash
   supabase functions deploy klipy --project-ref <your-project-ref>
   ```
4. Test it. Open the GIF picker in any channel and you should see trending GIFs. If it says GIFs aren't set up, the secret is missing. If it shows an error, check the `klipy` function logs in the Supabase dashboard.

The response parsing in `index.ts` was written from KLIPY's public documentation. It hasn't been checked against a live response, so the first test with a real key is the real check. KLIPY asks apps to credit it, and the picker shows **Powered by KLIPY** for that reason.

## Repository layout

```
VuloChat/
├── src/                          website source (React, Vite, Tailwind)
├── public/                       static files, such as the favicon
├── index.html                    website entry (source)
├── confirm.html                  email confirmation page
├── package.json                  website dependencies and scripts
├── Pc/                           Windows app (Electron)
├── Android/                      Android app (Capacitor)
├── supabase/schema.sql           database: tables, policies, functions, realtime, storage
├── supabase/functions/klipy/     GIF search (Supabase Edge Function)
└── .github/workflows/
    ├── pages.yml                 publishes the website to GitHub Pages
    └── build.yml                 builds the .exe and .apk, attaches them to releases
```

## Known limits in v1.0.0

- **Voice:** voice channels work best with about 6 people. Larger channels will need a media server, which is planned.
- **Status:** online and idle status is set by the app. If you close a tab without signing out, you may appear online until you sign in again.
- **Android notifications:** push notifications aren't set up yet. They need a Firebase project.
- **Look and feel:** VuloChat has its own name, logo, and violet accent, with a layout similar to Discord. It isn't a copy of Discord's design.
- **Emoji:** the picker has a curated set of standard emoji for now. The full set and skin tones are planned. Server emojis are custom to each server.
- **Animated flags:** uploads of GIF avatars and banners are marked as animated. Animated PNG and WebP files display correctly but aren't flagged.
- **Badges:** members can't pick these yet. The project owner grants them in the database.
- **Decorations:** the 25 built-in frames are available now. Uploading your own decoration is coming soon.
- **GIFs:** the GIF button works only after a KLIPY key is set (see step 5).
- **Anti-raid:** each person can send 8 messages in 10 seconds, and joins pause when 10 people join the same server within a minute.
- **Word filter:** messages and DMs are checked against a list of blocked words that the project owner manages. Only whole words are matched, so misspellings and symbol swaps are not caught. Images are not scanned yet.
- **Replies and forwards** work in server channels only, not yet in direct messages.
- **Themes:** the theme is saved on each device. A few small colors, such as the message hover, stay fixed.
