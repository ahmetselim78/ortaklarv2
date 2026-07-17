locals {
  prefix = "ortaklar-${var.environment}"
  required_services = toset([
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "cloudkms.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "storage.googleapis.com",
    "cloudscheduler.googleapis.com",
  ])
}

data "google_project" "current" {
  project_id = var.project_id
}

resource "google_project_service" "required" {
  for_each           = local.required_services
  service            = each.value
  disable_on_destroy = false
}

resource "google_kms_key_ring" "backup" {
  name       = "${local.prefix}-backup"
  location   = var.region
  depends_on = [google_project_service.required]
}

resource "google_kms_crypto_key" "backup" {
  name            = "backup-objects"
  key_ring        = google_kms_key_ring.backup.id
  rotation_period = "7776000s"
  lifecycle { prevent_destroy = true }
}

resource "google_artifact_registry_repository" "ops" {
  location      = var.region
  repository_id = var.artifact_repository_id
  format        = "DOCKER"
  description   = "OrtaklarV2 sürümlü operasyon Job imajları"
  depends_on    = [google_project_service.required]
}

data "google_storage_project_service_account" "gcs" {}

resource "google_kms_crypto_key_iam_member" "gcs_cmek" {
  crypto_key_id = google_kms_crypto_key.backup.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = "serviceAccount:${data.google_storage_project_service_account.gcs.email_address}"
}

resource "google_storage_bucket" "daily" {
  name                        = var.daily_bucket_name
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  encryption {
    default_kms_key_name = google_kms_crypto_key.backup.id
  }
  retention_policy {
    retention_period = 2592000
    is_locked        = false
  }
  lifecycle_rule {
    condition { age = 30 }
    action { type = "Delete" }
  }

  depends_on = [google_kms_crypto_key_iam_member.gcs_cmek]
  lifecycle {
    prevent_destroy = true
  }
}

resource "google_storage_bucket" "monthly" {
  name                        = var.monthly_bucket_name
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  encryption {
    default_kms_key_name = google_kms_crypto_key.backup.id
  }
  retention_policy {
    retention_period = 31536000
    is_locked        = false
  }
  lifecycle_rule {
    condition { age = 365 }
    action { type = "Delete" }
  }

  depends_on = [google_kms_crypto_key_iam_member.gcs_cmek]
  lifecycle {
    prevent_destroy = true
  }
}

resource "google_storage_bucket" "audit" {
  name                        = var.audit_bucket_name
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  encryption {
    default_kms_key_name = google_kms_crypto_key.backup.id
  }
  retention_policy {
    retention_period = 31536000
    is_locked        = false
  }

  depends_on = [google_kms_crypto_key_iam_member.gcs_cmek]
  lifecycle {
    prevent_destroy = true
  }
}

resource "google_service_account" "backup_writer" {
  account_id   = "ortaklar-backup-writer"
  display_name = "Ortaklar backup create-only"
}

resource "google_service_account" "backup_verifier" {
  account_id   = "ortaklar-backup-verifier"
  display_name = "Ortaklar backup read-only verifier"
}

resource "google_service_account" "restore_tester" {
  account_id   = "ortaklar-restore-tester"
  display_name = "Ortaklar isolated restore tester"
}

resource "google_service_account" "audit_archiver" {
  account_id   = "ortaklar-audit-archiver"
  display_name = "Ortaklar append-only audit archiver"
}

resource "google_service_account" "scheduler_invoker" {
  account_id   = "ortaklar-scheduler"
  display_name = "Ortaklar Cloud Run Job invoker"
}

resource "google_service_account_iam_member" "scheduler_token_creator" {
  service_account_id = google_service_account.scheduler_invoker.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-cloudscheduler.iam.gserviceaccount.com"
  depends_on         = [google_project_service.required]
}

resource "google_service_account" "ops_builder" {
  account_id   = "ortaklar-ops-builder"
  display_name = "Ortaklar operations image builder"
}

resource "google_project_iam_member" "ops_builder_project_roles" {
  for_each = toset([
    "roles/artifactregistry.writer",
    "roles/cloudbuild.builds.builder",
    "roles/logging.logWriter",
    "roles/run.developer",
  ])
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.ops_builder.email}"
}

resource "google_service_account_iam_member" "ops_builder_act_as" {
  for_each = {
    backup  = google_service_account.backup_writer.name
    verify  = google_service_account.backup_verifier.name
    restore = google_service_account.restore_tester.name
    audit   = google_service_account.audit_archiver.name
  }
  service_account_id = each.value
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.ops_builder.email}"
}

resource "google_storage_bucket_iam_member" "writer_daily" {
  bucket = google_storage_bucket.daily.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.backup_writer.email}"
}

resource "google_storage_bucket_iam_member" "writer_monthly" {
  bucket = google_storage_bucket.monthly.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.backup_writer.email}"
}

resource "google_storage_bucket_iam_member" "verifier_daily" {
  bucket = google_storage_bucket.daily.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.backup_verifier.email}"
}

resource "google_storage_bucket_iam_member" "verifier_monthly" {
  bucket = google_storage_bucket.monthly.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.backup_verifier.email}"
}

resource "google_storage_bucket_iam_member" "restore_monthly" {
  bucket = google_storage_bucket.monthly.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.restore_tester.email}"
}

resource "google_storage_bucket_iam_member" "audit_writer" {
  bucket = google_storage_bucket.audit.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.audit_archiver.email}"
}

resource "google_kms_crypto_key_iam_member" "audit_wrap" {
  crypto_key_id = google_kms_crypto_key.backup.id
  role          = "roles/cloudkms.cryptoKeyEncrypter"
  member        = "serviceAccount:${google_service_account.audit_archiver.email}"
}

resource "google_secret_manager_secret" "ops" {
  for_each  = toset(values(var.secret_ids))
  secret_id = each.value
  replication {
    auto {}
  }
  depends_on = [google_project_service.required]
}

locals {
  backup_secret_names = toset([var.secret_ids.prod_db_url])
  restore_secret_names = toset([
    var.secret_ids.restore_db_url,
    var.secret_ids.restore_supabase_url,
    var.secret_ids.restore_supabase_anon_key,
    var.secret_ids.auth_canary_email,
    var.secret_ids.auth_canary_password,
    var.secret_ids.auth_canary_uuid,
  ])
}

resource "google_secret_manager_secret_iam_member" "backup" {
  for_each  = local.backup_secret_names
  secret_id = google_secret_manager_secret.ops[each.value].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.backup_writer.email}"
}

resource "google_secret_manager_secret_iam_member" "ops_builder_supabase" {
  secret_id = google_secret_manager_secret.ops[var.secret_ids.supabase_access_token].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.ops_builder.email}"
}

resource "google_secret_manager_secret_iam_member" "restore" {
  for_each  = local.restore_secret_names
  secret_id = google_secret_manager_secret.ops[each.value].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.restore_tester.email}"
}

resource "google_secret_manager_secret_iam_member" "audit" {
  secret_id = google_secret_manager_secret.ops[var.secret_ids.prod_db_url].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.audit_archiver.email}"
}

resource "google_secret_manager_secret_iam_member" "ops_alert" {
  for_each = {
    backup  = google_service_account.backup_writer.email
    verify  = google_service_account.backup_verifier.email
    restore = google_service_account.restore_tester.email
    audit   = google_service_account.audit_archiver.email
  }
  secret_id = google_secret_manager_secret.ops[var.secret_ids.ops_alert_secret].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${each.value}"
}

resource "google_cloud_run_v2_job" "backup" {
  name     = "ortaklar-db-backup"
  location = var.region
  template {
    template {
      service_account = google_service_account.backup_writer.email
      timeout         = "7200s"
      max_retries     = 1
      containers {
        image = var.ops_image
        env {
          name  = "JOB_MODE"
          value = "backup"
        }
        env {
          name  = "DAILY_BUCKET"
          value = google_storage_bucket.daily.name
        }
        env {
          name  = "MONTHLY_BUCKET"
          value = google_storage_bucket.monthly.name
        }
        env {
          name  = "SUPABASE_PROJECT_REF"
          value = var.supabase_project_ref
        }
        env {
          name  = "TIME_ZONE"
          value = var.time_zone
        }
        env {
          name = "PROD_DB_URL"
          value_source {
            secret_key_ref {
              secret  = var.secret_ids.prod_db_url
              version = "latest"
            }
          }
        }
        env {
          name  = "REPORT_ERROR_URL"
          value = var.report_error_url
        }
        env {
          name = "OPS_ALERT_SECRET"
          value_source {
            secret_key_ref {
              secret  = var.secret_ids.ops_alert_secret
              version = "latest"
            }
          }
        }
        resources {
          limits = {
            cpu    = "2"
            memory = "4Gi"
          }
        }
      }
    }
  }
  depends_on = [google_secret_manager_secret_iam_member.backup]
}

resource "google_cloud_run_v2_job" "verify" {
  name     = "ortaklar-backup-verify"
  location = var.region
  template {
    template {
      service_account = google_service_account.backup_verifier.email
      timeout         = "3600s"
      max_retries     = 1
      containers {
        image = var.ops_image
        env {
          name  = "JOB_MODE"
          value = "verify"
        }
        env {
          name  = "DAILY_BUCKET"
          value = google_storage_bucket.daily.name
        }
        env {
          name  = "MONTHLY_BUCKET"
          value = google_storage_bucket.monthly.name
        }
        env {
          name  = "TIME_ZONE"
          value = var.time_zone
        }
        env {
          name  = "REPORT_ERROR_URL"
          value = var.report_error_url
        }
        env {
          name = "OPS_ALERT_SECRET"
          value_source {
            secret_key_ref {
              secret  = var.secret_ids.ops_alert_secret
              version = "latest"
            }
          }
        }
        resources {
          limits = {
            cpu    = "1"
            memory = "2Gi"
          }
        }
      }
    }
  }
}

resource "google_cloud_run_v2_job" "restore" {
  name     = "ortaklar-restore-test"
  location = var.region
  template {
    template {
      service_account = google_service_account.restore_tester.email
      timeout         = "14400s"
      max_retries     = 0
      containers {
        image = var.ops_image
        env {
          name  = "JOB_MODE"
          value = "restore"
        }
        env {
          name  = "MONTHLY_BUCKET"
          value = google_storage_bucket.monthly.name
        }
        env {
          name  = "SUPABASE_PROJECT_REF"
          value = var.supabase_project_ref
        }
        env {
          name  = "RESTORE_SUPABASE_PROJECT_REF"
          value = var.restore_supabase_project_ref
        }
        env {
          name  = "REPORT_ERROR_URL"
          value = var.report_error_url
        }
        env {
          name = "OPS_ALERT_SECRET"
          value_source {
            secret_key_ref {
              secret  = var.secret_ids.ops_alert_secret
              version = "latest"
            }
          }
        }
        dynamic "env" {
          for_each = {
            RESTORE_DB_URL            = var.secret_ids.restore_db_url
            RESTORE_SUPABASE_URL      = var.secret_ids.restore_supabase_url
            RESTORE_SUPABASE_ANON_KEY = var.secret_ids.restore_supabase_anon_key
            AUTH_CANARY_EMAIL         = var.secret_ids.auth_canary_email
            AUTH_CANARY_PASSWORD      = var.secret_ids.auth_canary_password
            AUTH_CANARY_UUID          = var.secret_ids.auth_canary_uuid
          }
          content {
            name = env.key
            value_source {
              secret_key_ref {
                secret  = env.value
                version = "latest"
              }
            }
          }
        }
        resources {
          limits = {
            cpu    = "2"
            memory = "4Gi"
          }
        }
      }
    }
  }
  depends_on = [google_secret_manager_secret_iam_member.restore]
}

resource "google_cloud_run_v2_job" "audit" {
  name     = "ortaklar-audit-archive"
  location = var.region
  template {
    template {
      service_account = google_service_account.audit_archiver.email
      timeout         = "7200s"
      max_retries     = 1
      containers {
        image = var.ops_image
        env {
          name  = "JOB_MODE"
          value = "audit-archive"
        }
        env {
          name  = "AUDIT_BUCKET"
          value = google_storage_bucket.audit.name
        }
        env {
          name  = "AUDIT_KMS_KEY"
          value = google_kms_crypto_key.backup.name
        }
        env {
          name  = "AUDIT_KMS_KEYRING"
          value = google_kms_key_ring.backup.name
        }
        env {
          name  = "AUDIT_KMS_LOCATION"
          value = var.region
        }
        env {
          name  = "REPORT_ERROR_URL"
          value = var.report_error_url
        }
        env {
          name = "OPS_ALERT_SECRET"
          value_source {
            secret_key_ref {
              secret  = var.secret_ids.ops_alert_secret
              version = "latest"
            }
          }
        }
        env {
          name = "PROD_DB_URL"
          value_source {
            secret_key_ref {
              secret  = var.secret_ids.prod_db_url
              version = "latest"
            }
          }
        }
        resources {
          limits = {
            cpu    = "1"
            memory = "2Gi"
          }
        }
      }
    }
  }
  depends_on = [google_secret_manager_secret_iam_member.audit, google_kms_crypto_key_iam_member.audit_wrap]
}

resource "google_cloud_run_v2_job_iam_member" "scheduler" {
  for_each = {
    backup  = google_cloud_run_v2_job.backup.name
    verify  = google_cloud_run_v2_job.verify.name
    restore = google_cloud_run_v2_job.restore.name
    audit   = google_cloud_run_v2_job.audit.name
  }
  project  = var.project_id
  location = var.region
  name     = each.value
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler_invoker.email}"
}

resource "google_cloud_scheduler_job" "backup" {
  name      = "ortaklar-nightly-backup"
  schedule  = "0 2 * * *"
  time_zone = var.time_zone
  http_target {
    http_method = "POST"
    uri         = "https://run.googleapis.com/v2/projects/${var.project_id}/locations/${var.region}/jobs/${google_cloud_run_v2_job.backup.name}:run"
    oauth_token { service_account_email = google_service_account.scheduler_invoker.email }
  }
}

resource "google_cloud_scheduler_job" "verify" {
  name      = "ortaklar-daily-backup-verify"
  schedule  = "0 4 * * *"
  time_zone = var.time_zone
  http_target {
    http_method = "POST"
    uri         = "https://run.googleapis.com/v2/projects/${var.project_id}/locations/${var.region}/jobs/${google_cloud_run_v2_job.verify.name}:run"
    oauth_token { service_account_email = google_service_account.scheduler_invoker.email }
  }
}

resource "google_cloud_scheduler_job" "restore" {
  name      = "ortaklar-monthly-restore-test"
  schedule  = "0 4 2 * *"
  time_zone = var.time_zone
  http_target {
    http_method = "POST"
    uri         = "https://run.googleapis.com/v2/projects/${var.project_id}/locations/${var.region}/jobs/${google_cloud_run_v2_job.restore.name}:run"
    oauth_token { service_account_email = google_service_account.scheduler_invoker.email }
  }
}

resource "google_cloud_scheduler_job" "audit" {
  name      = "ortaklar-monthly-audit-archive"
  schedule  = "0 3 5 * *"
  time_zone = var.time_zone
  http_target {
    http_method = "POST"
    uri         = "https://run.googleapis.com/v2/projects/${var.project_id}/locations/${var.region}/jobs/${google_cloud_run_v2_job.audit.name}:run"
    oauth_token { service_account_email = google_service_account.scheduler_invoker.email }
  }
}

resource "google_logging_metric" "ops_failure" {
  name   = "ortaklar_ops_failure"
  filter = "resource.type=\"cloud_run_job\" AND jsonPayload.status=\"failed\""
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
}

resource "google_logging_metric" "backup_success" {
  name   = "ortaklar_backup_success"
  filter = "resource.type=\"cloud_run_job\" AND jsonPayload.event=\"backup\" AND jsonPayload.status=\"ok\""
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
}

resource "google_monitoring_notification_channel" "email" {
  count        = var.monitoring_email == "" ? 0 : 1
  display_name = "Ortaklar operasyon e-posta"
  type         = "email"
  labels       = { email_address = var.monitoring_email }
}

resource "google_monitoring_alert_policy" "ops_failure" {
  display_name = "Ortaklar kritik operasyon hatası"
  combiner     = "OR"
  conditions {
    display_name = "Cloud Run backup/verify/restore başarısız"
    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.ops_failure.name}\" AND resource.type=\"cloud_run_job\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_SUM"
      }
    }
  }
  notification_channels = google_monitoring_notification_channel.email[*].name
}

resource "google_monitoring_alert_policy" "backup_missing" {
  display_name = "Ortaklar yedek 24 saati geçti"
  combiner     = "OR"
  conditions {
    display_name = "25 saattir başarılı tam yedek yok"
    condition_absent {
      filter   = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.backup_success.name}\" AND resource.type=\"cloud_run_job\""
      duration = "90000s"
    }
  }
  notification_channels = google_monitoring_notification_channel.email[*].name
}
