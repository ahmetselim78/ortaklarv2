output "artifact_repository" { value = google_artifact_registry_repository.drive_backup.repository_id }
output "backup_jobs" { value = { for key, job in google_cloud_run_v2_job.backup : key => job.name } }
output "trigger_url" { value = google_cloud_run_v2_service.trigger.uri }
output "scheduler" { value = google_cloud_scheduler_job.daily_backup.name }
