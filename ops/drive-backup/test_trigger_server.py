import os
import unittest
from unittest import mock

import trigger_server


class TriggerServerSecurityTests(unittest.TestCase):
    def setUp(self):
        os.environ["TRIGGER_SHARED_SECRET"] = "t" * 32

    def test_signed_state_round_trip(self):
        token = trigger_server.state_token(
            "https://app.example.com/admin/yedekleme",
            "https://trigger.example.run.app/oauth/callback",
        )
        payload = trigger_server.parse_state(token)
        self.assertEqual(payload["return_url"], "https://app.example.com/admin/yedekleme")
        self.assertEqual(payload["redirect_uri"], "https://trigger.example.run.app/oauth/callback")

    def test_tampered_state_is_rejected(self):
        token = trigger_server.state_token(
            "https://app.example.com/admin/yedekleme",
            "https://trigger.example.run.app/oauth/callback",
        )
        with self.assertRaises(ValueError):
            trigger_server.parse_state(f"x{token}")

    def test_return_url_requires_https_except_localhost(self):
        self.assertEqual(
            trigger_server.validate_return_url("https://app.example.com/admin/yedekleme"),
            "https://app.example.com/admin/yedekleme",
        )
        self.assertEqual(
            trigger_server.validate_return_url("http://localhost:5173/admin/yedekleme"),
            "http://localhost:5173/admin/yedekleme",
        )
        with self.assertRaises(ValueError):
            trigger_server.validate_return_url("http://app.example.com/admin/yedekleme")

    def test_result_parameter_is_appended(self):
        result = trigger_server.append_result("https://app.example.com/admin/yedekleme?tab=drive", True)
        self.assertIn("tab=drive", result)
        self.assertIn("driveAccountChanged=1", result)

    @mock.patch("trigger_server.add_secret_version")
    def test_drive_credentials_are_stored_as_a_matched_set(self, add_secret_version):
        os.environ.update(
            {
                "GOOGLE_DRIVE_CLIENT_ID": "web-client-id",
                "GOOGLE_DRIVE_CLIENT_SECRET": "web-client-secret",
                "DRIVE_CLIENT_ID_SECRET": "backup-client-id",
                "DRIVE_CLIENT_SECRET_SECRET": "backup-client-secret",
                "DRIVE_REFRESH_TOKEN_SECRET": "backup-refresh-token",
            }
        )

        trigger_server.store_drive_credentials("new-refresh-token")

        self.assertEqual(
            add_secret_version.call_args_list,
            [
                mock.call("backup-client-secret", "web-client-secret"),
                mock.call("backup-client-id", "web-client-id"),
                mock.call("backup-refresh-token", "new-refresh-token"),
            ],
        )


if __name__ == "__main__":
    unittest.main()
