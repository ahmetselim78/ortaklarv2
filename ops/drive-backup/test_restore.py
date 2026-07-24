import hashlib
import io
import json
import tarfile
import tempfile
import unittest
from pathlib import Path

import restore


class RestoreVerificationTests(unittest.TestCase):
    def create_archive(self, root: Path, *, unsafe_name: str | None = None) -> Path:
        payloads = {name: f"fixture:{name}\n".encode() for name in restore.BACKUP_FILES}
        payloads["table_summary.json"] = b'[{"schema":"public","table":"siparisler","estimated_rows":3}]'
        manifest = {
            "format_version": restore.FORMAT_VERSION,
            "project_ref": "abcdefghijklmnopqrst",
            "created_at": "2026-07-25T00:00:00+00:00",
            "git_commit": "fixture",
            "files": [
                {
                    "name": name,
                    "size": len(content),
                    "sha256": hashlib.sha256(content).hexdigest(),
                }
                for name, content in sorted(payloads.items())
            ],
        }
        archive = root / "backup.tar.gz"
        with tarfile.open(archive, "w:gz") as bundle:
            for name, content in payloads.items():
                info = tarfile.TarInfo(name)
                info.size = len(content)
                bundle.addfile(info, io.BytesIO(content))
            manifest_bytes = json.dumps(manifest).encode()
            info = tarfile.TarInfo("manifest.json")
            info.size = len(manifest_bytes)
            bundle.addfile(info, io.BytesIO(manifest_bytes))
            if unsafe_name:
                content = b"unsafe"
                info = tarfile.TarInfo(unsafe_name)
                info.size = len(content)
                bundle.addfile(info, io.BytesIO(content))
        return archive

    def test_valid_archive_is_extracted_and_verified(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            archive = self.create_archive(root)
            output = root / "output"
            output.mkdir()
            restore.safe_extract(archive, output)
            manifest = restore.verify_extracted(output)
            self.assertEqual(manifest["project_ref"], "abcdefghijklmnopqrst")

    def test_archive_with_traversal_member_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            archive = self.create_archive(root, unsafe_name="../outside")
            output = root / "output"
            output.mkdir()
            with self.assertRaises(RuntimeError):
                restore.safe_extract(archive, output)

    def test_modified_component_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            archive = self.create_archive(root)
            output = root / "output"
            output.mkdir()
            restore.safe_extract(archive, output)
            (output / "data.sql").write_text("tampered", encoding="utf-8")
            with self.assertRaises(RuntimeError):
                restore.verify_extracted(output)

    def test_production_target_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(RuntimeError, "production"):
                restore.restore_database(
                    Path(temp),
                    "postgresql://postgres.abcdefghijklmnopqrst@example.com/postgres",
                    "abcdefghijklmnopqrst",
                    "abcdefghijklmnopqrst",
                )

    def test_connection_url_is_moved_to_libpq_environment(self):
        environment = restore.connection_environment(
            "postgresql://postgres.abcdefghijklmnopqrst:p%40ss@pooler.supabase.com:5432/postgres?sslmode=require"
        )
        self.assertEqual(environment["PGUSER"], "postgres.abcdefghijklmnopqrst")
        self.assertEqual(environment["PGPASSWORD"], "p@ss")
        self.assertEqual(environment["PGDATABASE"], "postgres")
        self.assertEqual(environment["PGHOST"], "pooler.supabase.com")


if __name__ == "__main__":
    unittest.main()
