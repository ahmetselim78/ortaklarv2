#!/usr/bin/env python3
"""Authenticated Cloud Run service for backup runs and Drive OAuth rotation."""

import base64
import hashlib
import hmac
import html
import json
import os
import secrets
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing environment variable: {name}")
    return value


def metadata_token() -> str:
    request = urllib.request.Request(
        "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
        headers={"Metadata-Flavor": "Google"},
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.load(response)["access_token"]


def urlsafe_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def urlsafe_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def state_token(return_url: str, redirect_uri: str) -> str:
    payload = json.dumps(
        {
            "exp": int(time.time()) + 600,
            "nonce": secrets.token_urlsafe(18),
            "return_url": return_url,
            "redirect_uri": redirect_uri,
        },
        separators=(",", ":"),
    ).encode()
    encoded = urlsafe_encode(payload)
    signature = hmac.new(required("TRIGGER_SHARED_SECRET").encode(), encoded.encode(), hashlib.sha256).digest()
    return f"{encoded}.{urlsafe_encode(signature)}"


def parse_state(value: str) -> dict:
    encoded, supplied_signature = value.split(".", 1)
    expected = hmac.new(required("TRIGGER_SHARED_SECRET").encode(), encoded.encode(), hashlib.sha256).digest()
    if not hmac.compare_digest(urlsafe_decode(supplied_signature), expected):
        raise ValueError("invalid state signature")
    payload = json.loads(urlsafe_decode(encoded))
    if int(payload.get("exp", 0)) < int(time.time()):
        raise ValueError("expired state")
    if not payload.get("return_url") or not payload.get("redirect_uri"):
        raise ValueError("incomplete state")
    return payload


def validate_return_url(value: str) -> str:
    if len(value) > 1000:
        raise ValueError("return URL too long")
    parsed = urllib.parse.urlparse(value)
    local = parsed.hostname in {"localhost", "127.0.0.1"}
    if parsed.scheme != "https" and not (parsed.scheme == "http" and local):
        raise ValueError("return URL must use HTTPS")
    if parsed.username or parsed.password or not parsed.netloc:
        raise ValueError("invalid return URL")
    return value


def append_result(return_url: str, success: bool) -> str:
    parsed = urllib.parse.urlparse(return_url)
    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    query.append(("driveAccountChanged", "1" if success else "0"))
    return urllib.parse.urlunparse(parsed._replace(query=urllib.parse.urlencode(query)))


def exchange_code(code: str, redirect_uri: str) -> dict:
    payload = urllib.parse.urlencode(
        {
            "client_id": required("GOOGLE_DRIVE_CLIENT_ID"),
            "client_secret": required("GOOGLE_DRIVE_CLIENT_SECRET"),
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
        }
    ).encode()
    request = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=payload,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        tokens = json.load(response)
    if not tokens.get("refresh_token") or not tokens.get("access_token"):
        raise RuntimeError("Google did not return an offline refresh token")
    return tokens


def verify_drive_account(access_token: str) -> str:
    request = urllib.request.Request(
        "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        account = json.load(response)
    email = account.get("user", {}).get("emailAddress", "")
    if not email:
        raise RuntimeError("Google Drive account could not be verified")
    return email


def add_secret_version(secret_id: str, value: str) -> None:
    project = required("GOOGLE_CLOUD_PROJECT")
    url = f"https://secretmanager.googleapis.com/v1/projects/{project}/secrets/{secret_id}:addVersion"
    payload = json.dumps({"payload": {"data": base64.b64encode(value.encode()).decode()}}).encode()
    request = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={"Authorization": f"Bearer {metadata_token()}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        result = json.load(response)
    if not result.get("name"):
        raise RuntimeError("secret version was not created")


def store_drive_credentials(refresh_token: str) -> None:
    # The refresh token belongs to this exact OAuth client. Persist the client
    # pair first and the token last so a successful callback leaves a matched set.
    add_secret_version(required("DRIVE_CLIENT_SECRET_SECRET"), required("GOOGLE_DRIVE_CLIENT_SECRET"))
    add_secret_version(required("DRIVE_CLIENT_ID_SECRET"), required("GOOGLE_DRIVE_CLIENT_ID"))
    add_secret_version(required("DRIVE_REFRESH_TOKEN_SECRET"), refresh_token)


class Handler(BaseHTTPRequestHandler):
    def reply(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def redirect(self, location: str) -> None:
        self.send_response(303)
        self.send_header("Location", location)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def reply_html(self, status: int, message: str) -> None:
        payload = (
            "<!doctype html><meta charset='utf-8'><title>Google Drive yedek hesabı</title>"
            f"<main style='font:16px system-ui;max-width:640px;margin:64px auto;padding:24px'>"
            f"<h1>Google Drive yedek hesabı</h1><p>{html.escape(message)}</p></main>"
        ).encode()
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def authorized(self) -> bool:
        supplied = self.headers.get("Authorization", "").removeprefix("Bearer ")
        return hmac.compare_digest(supplied, required("TRIGGER_SHARED_SECRET"))

    def json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > 4096:
            raise ValueError("invalid request body")
        return json.loads(self.rfile.read(length))

    def start_backup(self) -> None:
        project = required("GOOGLE_CLOUD_PROJECT")
        region = required("BACKUP_JOB_REGION")
        job = required("BACKUP_JOB_NAME")
        url = f"https://run.googleapis.com/v2/projects/{project}/locations/{region}/jobs/{job}:run"
        request = urllib.request.Request(
            url,
            data=b"{}",
            method="POST",
            headers={"Authorization": f"Bearer {metadata_token()}", "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.load(response)
        self.reply(202, {"ok": True, "execution": result.get("name")})

    def oauth_start(self) -> None:
        body = self.json_body()
        return_url = validate_return_url(str(body.get("return_url", "")))
        host = self.headers.get("Host", "").strip()
        if not host or any(character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-:" for character in host):
            raise ValueError("invalid host")
        redirect_uri = f"https://{host}/oauth/callback"
        params = urllib.parse.urlencode(
            {
                "client_id": required("GOOGLE_DRIVE_CLIENT_ID"),
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "scope": "https://www.googleapis.com/auth/drive.file",
                "access_type": "offline",
                "prompt": "consent select_account",
                "state": state_token(return_url, redirect_uri),
            }
        )
        self.reply(200, {"ok": True, "auth_url": f"https://accounts.google.com/o/oauth2/v2/auth?{params}"})

    def oauth_callback(self) -> None:
        query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        try:
            state = parse_state(query.get("state", [""])[0])
        except Exception:
            self.reply_html(400, "Yetkilendirme isteği geçersiz veya süresi dolmuş. Yönetim panelinden yeniden başlatın.")
            return
        return_url = validate_return_url(state["return_url"])
        if query.get("error"):
            self.redirect(append_result(return_url, False))
            return
        code = query.get("code", [""])[0]
        if not code:
            self.redirect(append_result(return_url, False))
            return
        try:
            tokens = exchange_code(code, state["redirect_uri"])
            verify_drive_account(tokens["access_token"])
            store_drive_credentials(tokens["refresh_token"])
            self.redirect(append_result(return_url, True))
        except Exception as error:
            print(f"OAuth callback failed: {type(error).__name__}")
            self.redirect(append_result(return_url, False))

    def do_GET(self) -> None:  # noqa: N802
        if urllib.parse.urlparse(self.path).path == "/oauth/callback":
            self.oauth_callback()
            return
        self.reply(200, {"ok": True})

    def do_POST(self) -> None:  # noqa: N802
        if not self.authorized():
            self.reply(401, {"error": "unauthorized"})
            return
        path = urllib.parse.urlparse(self.path).path
        try:
            if path in {"/", "/run"}:
                self.start_backup()
            elif path == "/status":
                self.reply(
                    200,
                    {
                        "ok": True,
                        "automatic": True,
                        "schedule": os.environ.get("BACKUP_SCHEDULE", "0 2 * * *"),
                        "time_zone": os.environ.get("TIME_ZONE", "Europe/Istanbul"),
                    },
                )
            elif path == "/oauth/start":
                self.oauth_start()
            else:
                self.reply(404, {"error": "not_found"})
        except Exception as error:
            print(f"Request failed for {path}: {type(error).__name__}")
            self.reply(502, {"error": "request_failed"})

    def log_message(self, format: str, *args: object) -> None:
        print(format % args)


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("PORT", "8080"))), Handler).serve_forever()
