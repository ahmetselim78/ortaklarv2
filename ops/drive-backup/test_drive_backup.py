import tempfile
import unittest
from pathlib import Path
from unittest import mock

import drive_backup


class DriveBackupTests(unittest.TestCase):
    @mock.patch("drive_backup.run")
    def test_managed_custom_trigger_snapshot_is_appended(self, run):
        run.return_value = (
            'DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;\n'
            'CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users '
            'FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();'
        )
        with tempfile.TemporaryDirectory() as temp:
            destination = Path(temp) / "auth_storage_diff.sql"
            destination.write_text("-- build-time diff\n", encoding="utf-8")
            drive_backup.write_managed_customizations("postgresql://example", destination)
            content = destination.read_text(encoding="utf-8")

        self.assertIn("-- build-time diff", content)
        self.assertIn("Runtime snapshot", content)
        self.assertIn("on_auth_user_created", content)
        self.assertIn("pg_get_triggerdef", run.call_args.args[0][-1])

    def test_required_rejects_blank_values(self):
        with mock.patch.dict("os.environ", {"MISSING_FOR_TEST": "  "}):
            with self.assertRaises(RuntimeError):
                drive_backup.required("MISSING_FOR_TEST")


if __name__ == "__main__":
    unittest.main()
