# Vulo Bot API

The full, up-to-date reference is the developer portal: **https://vulochat.com/developers**

Bots run on their owner's computer. VuloChat does not host or execute bot code.

## Set up a bot
1. In VuloChat open **Settings → Developer** and turn on **Enable developer mode**.
2. Create a bot. Its token is shown once. Copy it and keep it private. Use **New token** if it is ever exposed.
3. As a server owner or someone with Manage Server, open **Server Settings → Bots** and add the bot. Turn on Read messages and Send messages.
4. Download `Vulo.js` (Node.js 18+) or `Vulo.py` (Python 3.10+) from the portal, and run your program with `VULO_TOKEN` and `CHANNEL_ID` set.

## Premade bots
Server owners can add **Welcomer**, **Auto-responder** and **Announcer** from **Server Settings → Bots**. Each one needs its script running on a computer. The scripts are in `public/examples/` and are published at `https://vulochat.com/examples/`.

## API
Base URL: `https://yejtrubajgyphbggtjrd.supabase.co/functions/v1/vulo-bots`

Send a POST with a JSON body and your token in the `x-vulo-token` header.

| Action | Body | Needs |
|---|---|---|
| `send_message` | `channel_id`, `content` | Send messages |
| `get_messages` | `channel_id` | Read messages |
| `get_members` | `channel_id` | Read messages |
| `get_config` | `channel_id` | Bot enabled in the server |
| `update_profile` | `display_name`, `avatar_url`, `banner_url`, `about` (any) | Nothing |

The API checks that the bot is installed in the server and that its permissions allow the action. Never put a bot token in browser code, public repositories, or screenshots. A bot token is not a Supabase key.

The app itself also uses `create`, `create_from_template`, `install`, `edit_profile` and `regenerate_token`. Creating bots and regenerating tokens need Developer mode.
