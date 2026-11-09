"""Vulo.py: the VuloChat bot SDK for Python 3.10+.

Get a bot token from Settings -> Developer, then run: VULO_TOKEN=... python your_bot.py
"""
import json
import urllib.error
import urllib.request

DEFAULT_URL = "https://yejtrubajgyphbggtjrd.supabase.co/functions/v1/vulo-bots"


class Vulo:
    def __init__(self, token, base_url=DEFAULT_URL):
        if not token:
            raise ValueError("A Vulo bot token is required")
        self.token = token
        self.base_url = base_url.rstrip("/")

    def request(self, action, **data):
        payload = json.dumps({"action": action, **data}).encode()
        req = urllib.request.Request(
            self.base_url,
            data=payload,
            headers={"Content-Type": "application/json", "x-vulo-token": self.token},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as exc:
            try:
                detail = json.loads(exc.read()).get("error", str(exc))
            except Exception:
                detail = str(exc)
            raise RuntimeError(detail) from exc

    def send_message(self, channel_id, content):
        """Posts a message. Returns {"message": {...}}, where message["id"] identifies it."""
        return self.request("send_message", channel_id=channel_id, content=content)

    def get_messages(self, channel_id):
        """The 50 most recent messages in a channel, oldest first."""
        return self.request("get_messages", channel_id=channel_id)

    def get_members(self, channel_id):
        """Up to 100 server members, newest first."""
        return self.request("get_members", channel_id=channel_id)

    def get_config(self, channel_id):
        """The settings and permissions the server owner chose for this bot in this server."""
        return self.request("get_config", channel_id=channel_id)

    def update_profile(self, **fields):
        """Changes the bot's own profile: display_name, avatar_url, banner_url, about."""
        return self.request("update_profile", **fields)
