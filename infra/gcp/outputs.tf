output "daily_bucket" { value = google_storage_bucket.daily.name }
output "monthly_bucket" { value = google_storage_bucket.monthly.name }
output "audit_bucket" { value = google_storage_bucket.audit.name }
output "backup_writer" { value = google_service_account.backup_writer.email }
output "backup_verifier" { value = google_service_account.backup_verifier.email }
output "restore_tester" { value = google_service_account.restore_tester.email }
output "bucket_lock_pending" {
  value = "Retention testleri ve yedi günlük kabul sonrası ops/backup/runbook.md ile manuel kilitlenmelidir."
}
