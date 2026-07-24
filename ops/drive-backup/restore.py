#!/usr/bin/env python3
"""Decrypt, verify, and optionally restore an OrtaklarV2 Drive backup."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.parse
from pathlib import Path


FORMAT_VERSION = "4"
BACKUP_FILES = {
    "roles.sql",
    "schema.sql",
    "data.sql",
    "migration_history.sql",
    "auth.dump",
    "storage.dump",
    "auth_storage_diff.sql",
    "migrations.tar.gz",
    "table_summary.json",
}
ARCHIVE_FILES = BACKUP_FILES | {"manifest.json"}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(command: list[str], *, env: dict[str, str] | None = None) -> None:
    try:
        subprocess.run(command, check=True, env=env)
    except FileNotFoundError as error:
        raise RuntimeError(f"Gerekli araç bulunamadı: {Path(command[0]).name}") from error
    except subprocess.CalledProcessError as error:
        # Commands may contain a database URL; never echo the full command.
        raise RuntimeError(
            f"{Path(command[0]).name} komutu başarısız oldu (çıkış {error.returncode})"
        ) from error


def decrypt_archive(encrypted: Path, identity: Path, output: Path) -> None:
    if not encrypted.is_file():
        raise RuntimeError(f"Şifreli yedek bulunamadı: {encrypted}")
    if not identity.is_file():
        raise RuntimeError(f"age private anahtarı bulunamadı: {identity}")
    run(["age", "--decrypt", "-i", str(identity), "-o", str(output), str(encrypted)])


def safe_extract(archive: Path, destination: Path) -> None:
    """Extract only the exact root-level files defined by the backup format."""
    with tarfile.open(archive, "r:gz") as bundle:
        members = bundle.getmembers()
        names = [member.name for member in members]
        if len(names) != len(set(names)):
            raise RuntimeError("Arşivde yinelenen dosya adı var")
        if set(names) != ARCHIVE_FILES:
            missing = sorted(ARCHIVE_FILES - set(names))
            extra = sorted(set(names) - ARCHIVE_FILES)
            raise RuntimeError(f"Arşiv içeriği geçersiz; eksik={missing}, fazla={extra}")
        for member in members:
            if not member.isfile() or Path(member.name).name != member.name:
                raise RuntimeError(f"Güvenli olmayan arşiv üyesi: {member.name}")
        bundle.extractall(destination, members=members, filter="data")


def verify_extracted(directory: Path) -> dict:
    manifest_path = directory / "manifest.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError("Manifest okunamadı") from error

    if str(manifest.get("format_version")) != FORMAT_VERSION:
        raise RuntimeError(
            f"Desteklenmeyen yedek formatı: {manifest.get('format_version')!r}"
        )
    project_ref = str(manifest.get("project_ref", ""))
    if not re.fullmatch(r"[a-z0-9]{20}", project_ref):
        raise RuntimeError("Manifest Supabase proje ref'i geçersiz")
    entries = manifest.get("files")
    if not isinstance(entries, list):
        raise RuntimeError("Manifest dosya listesi geçersiz")

    found: set[str] = set()
    for entry in entries:
        if not isinstance(entry, dict):
            raise RuntimeError("Manifest dosya girdisi geçersiz")
        name = str(entry.get("name", ""))
        if name not in BACKUP_FILES or name in found:
            raise RuntimeError(f"Manifest dosya adı geçersiz: {name!r}")
        found.add(name)
        path = directory / name
        expected_size = entry.get("size")
        expected_hash = str(entry.get("sha256", ""))
        if not isinstance(expected_size, int) or expected_size < 0:
            raise RuntimeError(f"Manifest dosya boyutu geçersiz: {name}")
        if not re.fullmatch(r"[0-9a-f]{64}", expected_hash):
            raise RuntimeError(f"Manifest SHA-256 değeri geçersiz: {name}")
        if path.stat().st_size != expected_size or sha256_file(path) != expected_hash:
            raise RuntimeError(f"Yedek bileşeni bütünlük kontrolünü geçemedi: {name}")
    if found != BACKUP_FILES:
        raise RuntimeError(f"Manifestte eksik bileşen var: {sorted(BACKUP_FILES - found)}")

    try:
        summary = json.loads((directory / "table_summary.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError("Tablo özeti okunamadı") from error
    if not isinstance(summary, list) or any(
        not isinstance(row, dict)
        or not isinstance(row.get("schema"), str)
        or not isinstance(row.get("table"), str)
        or not isinstance(row.get("estimated_rows"), int)
        for row in summary
    ):
        raise RuntimeError("Tablo özeti biçimi geçersiz")
    return manifest


def prepare_backup(encrypted: Path, identity: Path, destination: Path) -> dict:
    destination.mkdir(parents=True, exist_ok=False)
    plain = destination.parent / f"{destination.name}.tar.gz"
    try:
        decrypt_archive(encrypted, identity, plain)
        safe_extract(plain, destination)
        return verify_extracted(destination)
    finally:
        plain.unlink(missing_ok=True)


def connection_environment(db_url: str) -> dict[str, str]:
    parsed = urllib.parse.urlparse(db_url)
    if parsed.scheme not in {"postgres", "postgresql"} or not parsed.hostname:
        raise RuntimeError("RESTORE_DB_URL geçerli bir PostgreSQL URL'si değil")
    database = parsed.path.removeprefix("/")
    if not parsed.username or not database:
        raise RuntimeError("RESTORE_DB_URL kullanıcı ve veritabanı içermelidir")
    query = urllib.parse.parse_qs(parsed.query)
    environment = os.environ.copy()
    environment.update({
        "PGHOST": parsed.hostname,
        "PGPORT": str(parsed.port or 5432),
        "PGUSER": urllib.parse.unquote(parsed.username),
        "PGDATABASE": urllib.parse.unquote(database),
        "PGSSLMODE": query.get("sslmode", ["require"])[0],
    })
    if parsed.password:
        environment["PGPASSWORD"] = urllib.parse.unquote(parsed.password)
    return environment


def restore_database(directory: Path, db_url: str, target_project_ref: str, source_project_ref: str) -> None:
    if not re.fullmatch(r"[a-z0-9]{20}", target_project_ref):
        raise RuntimeError("Hedef Supabase proje ref'i geçersiz")
    if target_project_ref == source_project_ref:
        raise RuntimeError("Yedek doğrudan kaynak production projesine geri yüklenemez")
    if target_project_ref not in db_url:
        raise RuntimeError("Hedef veritabanı URL'si ile hedef proje ref'i eşleşmiyor")

    env = connection_environment(db_url)
    psql = ["psql", "-X", "-v", "ON_ERROR_STOP=1"]
    run([*psql, "-f", str(directory / "roles.sql")], env=env)
    run([*psql, "-f", str(directory / "schema.sql")], env=env)
    diff = directory / "auth_storage_diff.sql"
    if diff.stat().st_size:
        run([*psql, "-f", str(diff)], env=env)
    run([*psql, "-c", "SET session_replication_role = replica", "-f", str(directory / "data.sql")], env=env)
    run([
        "pg_restore", f"--dbname={env['PGDATABASE']}", "--data-only", "--no-owner",
        "--no-privileges", "--exit-on-error", str(directory / "auth.dump"),
    ], env=env)
    run([
        "pg_restore", f"--dbname={env['PGDATABASE']}", "--data-only", "--no-owner",
        "--no-privileges", "--exit-on-error", str(directory / "storage.dump"),
    ], env=env)
    run([*psql, "-f", str(directory / "migration_history.sql")], env=env)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Şifreli Google Drive yedeğini doğrula veya izole Supabase projesine geri yükle."
    )
    parser.add_argument("archive", type=Path, help="Drive'dan indirilen .tar.gz.age dosyası")
    parser.add_argument("--identity", required=True, type=Path, help="Offline age private anahtar dosyası")
    parser.add_argument("--extract-to", type=Path, help="Doğrulanmış bileşenleri bu yeni dizine çıkar")
    parser.add_argument("--target-project-ref", help="İzole hedef Supabase proje ref'i")
    parser.add_argument(
        "--confirm-restore",
        action="store_true",
        help="Doğrulama sonrasında hedef veritabanına yazmayı açıkça onayla",
    )
    args = parser.parse_args()
    args.restore_db_url = os.environ.get("RESTORE_DB_URL", "").strip()
    restore_values = [args.restore_db_url, args.target_project_ref, args.confirm_restore]
    if any(restore_values) and not all(restore_values):
        parser.error(
            "restore için RESTORE_DB_URL, --target-project-ref ve --confirm-restore birlikte gerekir"
        )
    return args


def main() -> None:
    args = parse_args()
    if args.extract_to:
        destination = args.extract_to.resolve()
        manifest = prepare_backup(args.archive.resolve(), args.identity.resolve(), destination)
        temporary = None
    else:
        temporary = tempfile.TemporaryDirectory(prefix="ortaklar-drive-restore-")
        destination = Path(temporary.name) / "verified"
        manifest = prepare_backup(args.archive.resolve(), args.identity.resolve(), destination)
    try:
        if args.restore_db_url:
            restore_database(
                destination,
                args.restore_db_url,
                args.target_project_ref,
                manifest["project_ref"],
            )
            event = "restored"
        else:
            event = "verified"
        print(json.dumps({
            "event": event,
            "project_ref": manifest["project_ref"],
            "created_at": manifest.get("created_at"),
            "git_commit": manifest.get("git_commit"),
        }, ensure_ascii=False))
    finally:
        if temporary:
            temporary.cleanup()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Hata: {error}", file=sys.stderr)
        raise SystemExit(1) from error
