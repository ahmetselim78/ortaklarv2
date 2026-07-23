#!/usr/bin/env python3
"""Create an encrypted Supabase backup and retain it in Google Drive."""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo


DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file"
DRIVE_API = "https://www.googleapis.com/drive/v3"
DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3"
FOLDER_MIME = "application/vnd.google-apps.folder"


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Gerekli ortam değişkeni eksik: {name}")
    return value


def run(command: list[str], cwd: Path | None = None, capture: bool = False) -> str:
    try:
        result = subprocess.run(
            command,
            cwd=cwd,
            check=True,
            text=True,
            stdout=subprocess.PIPE if capture else None,
            stderr=None,
        )
    except subprocess.CalledProcessError as error:
        # Never include the full command: database URLs can contain credentials.
        raise RuntimeError(f"{Path(command[0]).name} komutu başarısız oldu (çıkış {error.returncode})") from error
    return (result.stdout or "").strip()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def md5_file(path: Path) -> str:
    digest = hashlib.md5(usedforsecurity=False)
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def send_status(payload: dict[str, object], required_response: bool = False) -> None:
    """Report job state through the Edge Function without exposing a DB password."""
    request = urllib.request.Request(
        required("BACKUP_STATUS_URL"),
        data=json.dumps({"operation": "job_status", **payload}).encode(),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-backup-secret": required("TRIGGER_SHARED_SECRET"),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.load(response)
            if result.get("ok") is not True:
                raise RuntimeError("Yedekleme durum servisi islemi onaylamadi")
    except Exception as error:
        if required_response:
            raise RuntimeError("Yedekleme durum servisine ulasilamadi") from error
        print(f"Durum kaydi guncellenemedi: {error}", file=sys.stderr)


def record_run(run_id: str, **fields: object) -> None:
    """Best-effort completion update; the encrypted backup remains valid if it fails."""
    send_status({"run_id": run_id, **fields})


def create_run(trigger: str) -> str:
    run_id = str(uuid.uuid4())
    # The Edge Function inserts the row through service_role; the partial unique
    # index rejects a second concurrent backup.
    send_status(
        {"run_id": run_id, "trigger_source": trigger, "status": "running"},
        required_response=True,
    )
    return run_id


class DriveClient:
    def __init__(self) -> None:
        self.client_id = required("GOOGLE_DRIVE_CLIENT_ID")
        self.client_secret = required("GOOGLE_DRIVE_CLIENT_SECRET")
        self.refresh_token = required("GOOGLE_DRIVE_REFRESH_TOKEN")
        self.access_token = ""
        self.refresh_access_token()

    def refresh_access_token(self) -> None:
        body = urllib.parse.urlencode({
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "refresh_token": self.refresh_token,
            "grant_type": "refresh_token",
        }).encode()
        request = urllib.request.Request(
            "https://oauth2.googleapis.com/token",
            data=body,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            self.access_token = json.load(response)["access_token"]

    def request(self, method: str, url: str, body: bytes | None = None, headers: dict[str, str] | None = None) -> dict:
        request_headers = {"Authorization": f"Bearer {self.access_token}"}
        request_headers.update(headers or {})
        request = urllib.request.Request(url, data=body, method=method, headers=request_headers)
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                raw = response.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")[:1000]
            raise RuntimeError(f"Google Drive API HTTP {error.code}: {detail}") from error

    def list_files(self, query: str, order_by: str = "createdTime desc") -> list[dict]:
        params = urllib.parse.urlencode({
            "q": query,
            "orderBy": order_by,
            "pageSize": "1000",
            "fields": "files(id,name,size,md5Checksum,createdTime,appProperties)",
        })
        return self.request("GET", f"{DRIVE_API}/files?{params}").get("files", [])

    def ensure_folder(self, name: str, parent_id: str | None = None) -> str:
        safe_name = name.replace("'", "\\'")
        query = f"name = '{safe_name}' and mimeType = '{FOLDER_MIME}' and trashed = false"
        if parent_id:
            query += f" and '{parent_id}' in parents"
        matches = self.list_files(query)
        if matches:
            return matches[0]["id"]
        metadata: dict[str, object] = {"name": name, "mimeType": FOLDER_MIME}
        if parent_id:
            metadata["parents"] = [parent_id]
        return self.request(
            "POST",
            f"{DRIVE_API}/files?fields=id",
            json.dumps(metadata).encode(),
            {"Content-Type": "application/json"},
        )["id"]

    def upload(self, path: Path, parent_id: str, backup_type: str, sha256: str) -> dict:
        metadata = {
            "name": path.name,
            "parents": [parent_id],
            "appProperties": {
                "managed_by": "ortaklarv2",
                "backup_type": backup_type,
                "sha256": sha256,
            },
        }
        request = urllib.request.Request(
            f"{DRIVE_UPLOAD_API}/files?uploadType=resumable&fields=id,name,size,md5Checksum,createdTime,appProperties",
            data=json.dumps(metadata).encode(),
            method="POST",
            headers={
                "Authorization": f"Bearer {self.access_token}",
                "Content-Type": "application/json; charset=UTF-8",
                "X-Upload-Content-Type": "application/octet-stream",
                "X-Upload-Content-Length": str(path.stat().st_size),
            },
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            upload_url = response.headers["Location"]
        total = path.stat().st_size
        result: dict = {}
        chunk_size = 8 * 1024 * 1024
        with path.open("rb") as handle:
            offset = 0
            while offset < total:
                chunk = handle.read(chunk_size)
                end = offset + len(chunk) - 1
                upload_request = urllib.request.Request(
                    upload_url,
                    data=chunk,
                    method="PUT",
                    headers={
                        "Authorization": f"Bearer {self.access_token}",
                        "Content-Type": "application/octet-stream",
                        "Content-Length": str(len(chunk)),
                        "Content-Range": f"bytes {offset}-{end}/{total}",
                    },
                )
                try:
                    with urllib.request.urlopen(upload_request, timeout=300) as response:
                        raw = response.read()
                        result = json.loads(raw) if raw else {}
                except urllib.error.HTTPError as error:
                    if error.code != 308:
                        detail = error.read().decode("utf-8", errors="replace")[:1000]
                        raise RuntimeError(f"Google Drive yükleme HTTP {error.code}: {detail}") from error
                offset = end + 1
        if int(result.get("size", -1)) != path.stat().st_size or result.get("md5Checksum") != md5_file(path):
            raise RuntimeError("Drive yüklemesi boyut/MD5 doğrulamasını geçemedi")
        if result.get("appProperties", {}).get("sha256") != sha256:
            raise RuntimeError("Drive yüklemesi SHA-256 manifest doğrulamasını geçemedi")
        return result

    def copy_to_monthly(self, source_id: str, source_name: str, parent_id: str, sha256: str, backup_month: str) -> dict:
        metadata = {
            "name": source_name,
            "parents": [parent_id],
            "appProperties": {
                "managed_by": "ortaklarv2", "backup_type": "monthly",
                "backup_month": backup_month, "sha256": sha256,
            },
        }
        fields = urllib.parse.quote("id,name,size,md5Checksum,createdTime,appProperties", safe=",")
        return self.request(
            "POST", f"{DRIVE_API}/files/{source_id}/copy?fields={fields}",
            json.dumps(metadata).encode(), {"Content-Type": "application/json"},
        )

    def prune(self, parent_id: str, backup_type: str, keep: int) -> None:
        query = (
            f"'{parent_id}' in parents and trashed = false and "
            f"appProperties has {{ key='managed_by' and value='ortaklarv2' }} and "
            f"appProperties has {{ key='backup_type' and value='{backup_type}' }}"
        )
        files = self.list_files(query)
        for item in files[keep:]:
            self.request("DELETE", f"{DRIVE_API}/files/{item['id']}")


def temporary_db_url(project_ref: str) -> tuple[str, int]:
    """Create Supabase's short-lived CLI backup login and return a pooler URL."""
    token = required("SUPABASE_ACCESS_TOKEN")
    host = required("SUPABASE_POOLER_HOST")
    if not re.fullmatch(r"[a-z0-9.-]+", host):
        raise RuntimeError("Gecersiz Supabase pooler sunucusu")
    request = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{project_ref}/cli/login-role",
        data=b'{"read_only":false}',
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "OrtaklarV2-Drive-Backup/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"Supabase gecici baglanti HTTP {error.code}") from error

    role = str(result.get("role", ""))
    password = str(result.get("password", ""))
    ttl_seconds = int(result.get("ttl_seconds", 0))
    if not re.fullmatch(r"[A-Za-z0-9_]+", role) or len(password) < 24 or ttl_seconds < 60:
        raise RuntimeError("Supabase gecici baglanti yaniti gecersiz")
    pooler_role = role if role.endswith(f".{project_ref}") else f"{role}.{project_ref}"
    os.environ["PGPASSWORD"] = password
    os.environ["PGSSLMODE"] = "require"
    username = urllib.parse.quote(pooler_role, safe="")
    return f"postgresql://{username}@{host}:5432/postgres", ttl_seconds


def wait_for_database(db_url: str) -> None:
    """Wait for the temporary Supabase role to propagate to the pooler."""
    environment = os.environ.copy()
    environment["PGCONNECT_TIMEOUT"] = "10"
    for attempt in range(8):
        result = subprocess.run(
            ["psql", db_url, "-X", "-At", "-c", "SELECT 1"],
            text=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env=environment,
            check=False,
        )
        if result.returncode == 0:
            return
        if attempt < 7:
            time.sleep(min(2 ** attempt, 10))
    raise RuntimeError("Supabase gecici veritabani baglantisi hazir olmadi")


def build_archive(workdir: Path, project_ref: str) -> Path:
    """Build a complete export with pg_dump and a short-lived Supabase login."""
    project_root = Path(os.environ.get("SUPABASE_WORKDIR", "/workspace"))
    if not (project_root / "supabase" / "config.toml").is_file():
        raise RuntimeError("Supabase proje yapilandirmasi yedekleme imajinda yok")
    db_url, ttl_seconds = temporary_db_url(project_ref)
    wait_for_database(db_url)
    common = ["--no-owner", "--no-privileges", "--role=postgres"]
    exclusions = [
        "--exclude-table=storage.buckets_vectors",
        "--exclude-table=storage.vector_indexes",
    ]
    (workdir / "roles.sql").write_text(
        "-- Supabase managed cluster roles are provisioned by the target project.\n"
        "-- Application grants and policies are included in schema.sql.\n",
        encoding="utf-8",
    )
    run(["pg_dump", db_url, "--schema-only", *common, f"--file={workdir / 'schema.sql'}"])
    run(["pg_dump", db_url, "--data-only", *common, *exclusions,
         f"--file={workdir / 'data.sql'}"])
    run(["pg_dump", db_url, "--data-only", *common, "--schema=supabase_migrations",
         f"--file={workdir / 'migration_history.sql'}"])
    run(["pg_dump", db_url, "--schema-only", *common, "--schema=auth", "--schema=storage",
         f"--file={workdir / 'managed_schema.sql'}"])
    run(["pg_dump", db_url, "--data-only", *common, "--schema=auth", "--schema=storage",
         *exclusions, f"--file={workdir / 'managed_data.sql'}"])

    stats = run([
        "psql", db_url, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t", "-c",
        "SELECT schemaname, relname, COALESCE(n_live_tup,0)::bigint "
        "FROM pg_stat_user_tables ORDER BY 1,2",
    ], capture=True)
    summary = []
    for line in stats.splitlines():
        schema, table, rows = line.split("\t")
        summary.append({"schema": schema, "table": table, "estimated_rows": int(rows)})
    (workdir / "table_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    source = project_root / "supabase"
    diff = source / "auth_storage_diff.sql"
    if not diff.is_file():
        raise RuntimeError("Supabase Auth/Storage restore diff is missing")
    shutil.copy2(diff, workdir / diff.name)
    shutil.copytree(source / "migrations", workdir / "migrations")
    with tarfile.open(workdir / "migrations.tar.gz", "w:gz") as archive:
        archive.add(workdir / "migrations", arcname="migrations")

    files = [
        "roles.sql",
        "schema.sql",
        "data.sql",
        "migration_history.sql",
        "managed_schema.sql",
        "managed_data.sql",
        "auth_storage_diff.sql",
        "migrations.tar.gz",
        "table_summary.json",
    ]
    manifest = {
        "format_version": "3",
        "project_ref": project_ref,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "temporary_login_ttl_seconds": ttl_seconds,
        "git_commit": os.environ.get("GIT_COMMIT", "unknown"),
        "tools": {
            "postgres": run(["psql", db_url, "-X", "-At", "-c", "SHOW server_version"], capture=True),
            "pg_dump": run(["pg_dump", "--version"], capture=True),
        },
        "files": [
            {
                "name": name,
                "size": (workdir / name).stat().st_size,
                "sha256": sha256_file(workdir / name),
            }
            for name in files
        ],
    }
    (workdir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    plain = workdir / f"backup-{project_ref}-{stamp}.tar.gz"
    with tarfile.open(plain, "w:gz") as archive:
        for name in [*files, "manifest.json"]:
            archive.add(workdir / name, arcname=name)
    encrypted = plain.with_suffix(plain.suffix + ".age")
    run(["age", "-r", required("BACKUP_AGE_RECIPIENT"), "-o", str(encrypted), str(plain)])
    plain.unlink()
    return encrypted


def main() -> None:
    trigger = os.environ.get("BACKUP_TRIGGER", "scheduled")
    run_id = create_run(trigger)
    started = time.monotonic()
    try:
        project_ref = required("SUPABASE_PROJECT_REF")
        with tempfile.TemporaryDirectory(prefix="ortaklar-drive-backup-") as temp:
            archive = build_archive(Path(temp), project_ref)
            digest = sha256_file(archive)
            drive = DriveClient()
            root = drive.ensure_folder(os.environ.get("DRIVE_ROOT_FOLDER", "Yedekler"))
            daily_folder = drive.ensure_folder("Günlük Yedekler", root)
            monthly_folder = drive.ensure_folder("Aylık Yedekler", root)
            uploaded = drive.upload(archive, daily_folder, "daily", digest)

            local_now = datetime.now(ZoneInfo(os.environ.get("TIME_ZONE", "Europe/Istanbul")))
            backup_month = local_now.strftime("%Y-%m")
            monthly_id = None
            monthly_query = (
                f"'{monthly_folder}' in parents and trashed = false and "
                "appProperties has { key='managed_by' and value='ortaklarv2' } and "
                "appProperties has { key='backup_type' and value='monthly' } and "
                f"appProperties has {{ key='backup_month' and value='{backup_month}' }}"
            )
            if not drive.list_files(monthly_query):
                monthly = drive.copy_to_monthly(uploaded["id"], archive.name, monthly_folder, digest, backup_month)
                if int(monthly.get("size", -1)) != archive.stat().st_size or monthly.get("md5Checksum") != md5_file(archive):
                    raise RuntimeError("Aylık Drive kopyası bütünlük doğrulamasını geçemedi")
                monthly_id = monthly["id"]

            # Pruning happens only after the new daily/monthly object has been verified.
            drive.prune(daily_folder, "daily", int(os.environ.get("DAILY_RETENTION", "7")))
            if monthly_id:
                drive.prune(monthly_folder, "monthly", int(os.environ.get("MONTHLY_RETENTION", "12")))

            record_run(
                run_id,
                status="succeeded",
                completed_at=datetime.now(timezone.utc).isoformat(),
                drive_file_id=uploaded["id"],
                drive_file_name=archive.name,
                monthly_drive_file_id=monthly_id,
                size_bytes=archive.stat().st_size,
                sha256=digest,
                duration_seconds=round(time.monotonic() - started),
                error_message=None,
            )
            print(json.dumps({"event": "drive_backup", "status": "ok", "run_id": run_id, "file": archive.name}))
    except Exception as error:
        record_run(
            run_id,
            status="failed",
            completed_at=datetime.now(timezone.utc).isoformat(),
            duration_seconds=round(time.monotonic() - started),
            error_message=str(error)[:1000],
        )
        print(json.dumps({"event": "drive_backup", "status": "failed", "run_id": run_id, "error": str(error)[:500]}), file=sys.stderr)
        raise


if __name__ == "__main__":
    main()
