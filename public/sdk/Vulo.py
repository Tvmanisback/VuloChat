"""Vulo.py: the VuloChat bot SDK for Python 3.10+.

Get a bot token from Settings -> Developer, then run: VULO_TOKEN=... python your_bot.py

Encryption: messages in end-to-end encrypted servers arrive encrypted for your bot. Reading them needs the
"cryptography" package (pip install cryptography). The first time your bot reads messages, this SDK creates a key
pair in a local file (vulo-key.json, or VULO_KEY_FILE), sends only the public key to VuloChat, and decrypts with the
private key. Keep that file private. If you delete it, your bot gets a new key, and older messages stay unreadable.
"""
import base64
import json
import os
import urllib.error
import urllib.request

DEFAULT_URL = "https://yejtrubajgyphbggtjrd.supabase.co/functions/v1/vulo-bots"
INFO = b"VuloChat E2EE message v1"


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


def _unb64(text: str) -> bytes:
    return base64.b64decode(text)


NEEDS_CRYPTO = "Reading encrypted messages needs the cryptography package: pip install cryptography"


class VuloCryptoMissing(RuntimeError):
    """Raised when the cryptography package is not installed."""


def _crypto():
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    except ImportError as exc:
        raise VuloCryptoMissing(NEEDS_CRYPTO) from exc
    return hashes, serialization, ec, AESGCM, HKDF


def _new_key_pair() -> tuple[str, str]:
    """Returns (public key, private key) as base64. The public key is raw P-256, the private key is PKCS#8."""
    _, serialization, ec, _, _ = _crypto()
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_raw = private_key.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    private_der = private_key.private_bytes(
        serialization.Encoding.DER, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    )
    return _b64(public_raw), _b64(private_der)


def _decrypt_envelope(envelope: dict, private_key_der: bytes) -> str:
    hashes, serialization, ec, AESGCM, HKDF = _crypto()
    private_key = serialization.load_der_private_key(private_key_der, password=None)
    ephemeral = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), _unb64(envelope["ephemeralPublicKey"]))
    packed = _unb64(envelope["ciphertext"])
    salt, ciphertext = packed[:32], packed[32:]
    shared = private_key.exchange(ec.ECDH(), ephemeral)
    key = HKDF(algorithm=hashes.SHA256(), length=32, salt=salt, info=INFO).derive(shared)
    return AESGCM(key).decrypt(_unb64(envelope["iv"]), ciphertext, salt).decode()


class Vulo:
    def __init__(self, token, base_url=DEFAULT_URL, key_file=None):
        if not token:
            raise ValueError("A Vulo bot token is required")
        self.token = token
        self.base_url = base_url.rstrip("/")
        self.key_file = key_file or os.environ.get("VULO_KEY_FILE", "vulo-key.json")
        self._keys = None

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

    def decryption_keys(self) -> dict:
        """This bot's decryption key. Creates the key file the first time, and registers the public key with VuloChat."""
        if self._keys is None:
            _crypto()  # raises VuloCryptoMissing when the package is not installed
            saved = None
            if os.path.exists(self.key_file):
                with open(self.key_file) as f:
                    saved = json.load(f)
            if saved is None:
                public_key, private_key = _new_key_pair()
                saved = {"publicKey": public_key, "privateKey": private_key}
                fd = os.open(self.key_file, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
                with os.fdopen(fd, "w") as f:
                    json.dump(saved, f, indent=2)
            self.request("register_device", public_key=saved["publicKey"])
            self._keys = {"publicKey": saved["publicKey"], "privateKey": _unb64(saved["privateKey"])}
        return self._keys

    def _read(self, message: dict, keys, crypto_error=None) -> dict:
        try:
            parsed = json.loads(message.get("content") or "")
        except (ValueError, TypeError):
            parsed = None
        if not isinstance(parsed, dict) or parsed.get("__vulo_e2ee") != 1:
            return {**message, "encrypted": False}
        if keys is None:
            return {**message, "encrypted": True, "content": None, "decrypt_error": crypto_error or NEEDS_CRYPTO}
        mine = next((r for r in parsed.get("recipients", []) if r.get("publicKey") == keys["publicKey"]), None)
        if mine is None:
            return {**message, "encrypted": True, "content": None, "decrypt_error": "This message was not encrypted for this bot."}
        try:
            return {**message, "encrypted": True, "content": _decrypt_envelope(mine["envelope"], keys["privateKey"])}
        except Exception:
            return {**message, "encrypted": True, "content": None, "decrypt_error": "Could not decrypt this message."}

    def send_message(self, channel_id, content):
        """Posts a message. Returns {"message": {...}}, where message["id"] identifies it."""
        return self.request("send_message", channel_id=channel_id, content=content)

    def get_messages(self, channel_id):
        """
        The 50 most recent messages in a channel, oldest first. Encrypted messages come back with their plain text in
        "content". A message this bot cannot read has content None and a "decrypt_error".
        """
        # Register the key before fetching, so the server includes this bot in encrypted messages it returns.
        keys, crypto_error = None, None
        try:
            keys = self.decryption_keys()
        except VuloCryptoMissing as exc:
            crypto_error = str(exc)
        result = self.request("get_messages", channel_id=channel_id)
        result["messages"] = [self._read(message, keys, crypto_error) for message in result["messages"]]
        return result

    def get_members(self, channel_id):
        """Up to 100 server members, newest first."""
        return self.request("get_members", channel_id=channel_id)

    def get_config(self, channel_id):
        """The settings and permissions the server owner chose for this bot in this server."""
        return self.request("get_config", channel_id=channel_id)

    def update_profile(self, **fields):
        """Changes the bot's own profile: display_name, avatar_url, banner_url, about."""
        return self.request("update_profile", **fields)
