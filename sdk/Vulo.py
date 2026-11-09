"""Vulo.py — local VuloChat bot SDK (Python 3.10+)."""
import urllib.request, urllib.error, json

class Vulo:
    def __init__(self, token, base_url="https://yejtrubajgyphbggtjrd.supabase.co/functions/v1/vulo-bots"):
        if not token: raise ValueError("A Vulo bot token is required")
        self.token, self.base_url = token, base_url.rstrip("/")
    def request(self, action, **data):
        payload=json.dumps({"action":action, **data}).encode()
        req=urllib.request.Request(self.base_url, data=payload, headers={"Content-Type":"application/json","x-vulo-token":self.token}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=20) as response: return json.loads(response.read())
        except urllib.error.HTTPError as exc:
            try: detail=json.loads(exc.read()).get("error", str(exc))
            except Exception: detail=str(exc)
            raise RuntimeError(detail) from exc
    def send_message(self, channel_id, content):
        return self.request("send_message", channel_id=channel_id, content=content)
    def get_messages(self, channel_id):
        return self.request("get_messages", channel_id=channel_id)
    def get_members(self, channel_id):
        return self.request("get_members", channel_id=channel_id)
