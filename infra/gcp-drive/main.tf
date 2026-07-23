locals {
  required_services = toset([
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "cloudscheduler.googleapis.com",
    "drive.googleapis.com",
    "iam.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
  ])
  backup_secret_ids = toset([
    var.secret_ids.drive_client_id,
    var.secret_ids.drive_client_secret,
    var.secret_ids.drive_refresh_token,
    var.secret_ids.trigger_shared_secret,
    var.secret_ids.supabase_access_token,
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

resource "google_artifact_registry_repository" "drive_backup" {
  location      = var.region
  repository_id = "ortaklar-drive-backup"
  format        = "DOCKER"
  description   = "OrtaklarV2 Google Drive yedekleme imajı"
  depends_on    = [google_project_service.required]
}

resource "google_secret_manager_secret" "drive_backup" {
  for_each  = toset(values(var.secret_ids))
  secret_id = each.value
  replication {
    auto {}
  }
  depends_on = [google_project_service.required]
}

resource "google_service_account" "backup_job" {
  account_id   = "ortaklar-drive-backup"
  display_name = "Ortaklar Drive backup job"
}

resource "google_service_account" "trigger" {
  account_id   = "ortaklar-drive-trigger"
  display_name = "Ortaklar Drive backup trigger"
}

resource "google_service_account" "scheduler" {
  account_id   = "ortaklar-drive-scheduler"
  display_name = "Ortaklar Drive backup scheduler"
}

resource "google_service_account" "builder" {
  account_id   = "ortaklar-drive-builder"
  display_name = "Ortaklar Drive backup image builder"
}

resource "google_project_iam_member" "builder_roles" {
  for_each = toset([
    "roles/artifactregistry.writer",
    "roles/cloudbuild.builds.builder",
    "roles/logging.logWriter",
  ])
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.builder.email}"
}

resource "google_secret_manager_secret_iam_member" "builder_supabase_token" {
  secret_id = google_secret_manager_secret.drive_backup[var.secret_ids.supabase_access_token].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.builder.email}"
}

resource "google_secret_manager_secret_iam_member" "backup_secrets" {
  for_each  = local.backup_secret_ids
  secret_id = google_secret_manager_secret.drive_backup[each.value].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.backup_job.email}"
}

resource "google_secret_manager_secret_iam_member" "trigger_secret" {
  secret_id = google_secret_manager_secret.drive_backup[var.secret_ids.trigger_shared_secret].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.trigger.email}"
}

resource "google_secret_manager_secret_iam_member" "trigger_oauth_secrets" {
  for_each = toset([
    var.secret_ids.drive_client_id,
    var.secret_ids.drive_client_secret,
  ])
  secret_id = google_secret_manager_secret.drive_backup[each.value].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.trigger.email}"
}

resource "google_secret_manager_secret_iam_member" "trigger_web_oauth_secrets" {
  for_each = toset([
    var.secret_ids.drive_web_client_id,
    var.secret_ids.drive_web_client_secret,
  ])
  secret_id = google_secret_manager_secret.drive_backup[each.value].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.trigger.email}"
}

resource "google_secret_manager_secret_iam_member" "trigger_refresh_token_writer" {
  secret_id = google_secret_manager_secret.drive_backup[var.secret_ids.drive_refresh_token].id
  role      = "roles/secretmanager.secretVersionAdder"
  member    = "serviceAccount:${google_service_account.trigger.email}"
}

resource "google_secret_manager_secret_iam_member" "trigger_client_credentials_writer" {
  for_each = toset([
    var.secret_ids.drive_client_id,
    var.secret_ids.drive_client_secret,
  ])
  secret_id = google_secret_manager_secret.drive_backup[each.value].id
  role      = "roles/secretmanager.secretVersionAdder"
  member    = "serviceAccount:${google_service_account.trigger.email}"
}

resource "google_cloud_run_v2_job" "backup" {
  for_each = toset(["scheduled", "manual"])
  name     = "ortaklar-drive-backup-${each.key}"
  location = var.region
  template {
    template {
      service_account = google_service_account.backup_job.email
      timeout         = "7200s"
      max_retries     = 0
      containers {
        image = var.backup_image
        env {
          name  = "BACKUP_TRIGGER"
          value = each.key
        }
        env {
          name  = "SUPABASE_PROJECT_REF"
          value = var.supabase_project_ref
        }
        env {
          name  = "SUPABASE_POOLER_HOST"
          value = var.supabase_pooler_host
        }
        env {
          name  = "BACKUP_STATUS_URL"
          value = "https://${var.supabase_project_ref}.supabase.co/functions/v1/drive-backup-admin"
        }
        env {
          name  = "TIME_ZONE"
          value = var.time_zone
        }
        env {
          name  = "DRIVE_ROOT_FOLDER"
          value = var.drive_root_folder
        }
        env {
          name  = "DAILY_RETENTION"
          value = "7"
        }
        env {
          name  = "MONTHLY_RETENTION"
          value = "12"
        }
        env {
          name  = "BACKUP_AGE_RECIPIENT"
          value = var.age_recipient
        }
        dynamic "env" {
          for_each = {
            SUPABASE_ACCESS_TOKEN      = var.secret_ids.supabase_access_token
            TRIGGER_SHARED_SECRET      = var.secret_ids.trigger_shared_secret
            GOOGLE_DRIVE_CLIENT_ID     = var.secret_ids.drive_client_id
            GOOGLE_DRIVE_CLIENT_SECRET = var.secret_ids.drive_client_secret
            GOOGLE_DRIVE_REFRESH_TOKEN = var.secret_ids.drive_refresh_token
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
  depends_on = [google_secret_manager_secret_iam_member.backup_secrets]
}

resource "google_cloud_run_v2_service" "trigger" {
  name     = "ortaklar-drive-trigger"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"
  lifecycle {
    # Cloud Run API returns explicit zeroes for these provider-default fields,
    # which otherwise creates a no-op diff after every successful apply.
    ignore_changes = [scaling]
  }
  template {
    service_account = google_service_account.trigger.email
    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }
    containers {
      image   = var.backup_image
      command = ["python3"]
      args    = ["/app/trigger_server.py"]
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "BACKUP_JOB_REGION"
        value = var.region
      }
      env {
        name  = "BACKUP_JOB_NAME"
        value = google_cloud_run_v2_job.backup["manual"].name
      }
      env {
        name  = "BACKUP_SCHEDULE"
        value = var.schedule
      }
      env {
        name  = "TIME_ZONE"
        value = var.time_zone
      }
      env {
        name  = "DRIVE_CLIENT_ID_SECRET"
        value = var.secret_ids.drive_client_id
      }
      env {
        name  = "DRIVE_CLIENT_SECRET_SECRET"
        value = var.secret_ids.drive_client_secret
      }
      env {
        name  = "DRIVE_REFRESH_TOKEN_SECRET"
        value = var.secret_ids.drive_refresh_token
      }
      dynamic "env" {
        for_each = {
          GOOGLE_DRIVE_CLIENT_ID     = var.secret_ids.drive_web_client_id
          GOOGLE_DRIVE_CLIENT_SECRET = var.secret_ids.drive_web_client_secret
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
      env {
        name = "TRIGGER_SHARED_SECRET"
        value_source {
          secret_key_ref {
            secret  = var.secret_ids.trigger_shared_secret
            version = "latest"
          }
        }
      }
      resources {
        limits = {
          cpu    = "1"
          memory = "256Mi"
        }
        cpu_idle = true
      }
    }
  }
  depends_on = [
    google_secret_manager_secret_iam_member.trigger_secret,
    google_secret_manager_secret_iam_member.trigger_oauth_secrets,
    google_secret_manager_secret_iam_member.trigger_web_oauth_secrets,
    google_secret_manager_secret_iam_member.trigger_client_credentials_writer,
    google_secret_manager_secret_iam_member.trigger_refresh_token_writer,
  ]
}

# Supabase Edge Function GCP kimlik anahtarı taşımaz. Endpoint ağ seviyesinde açık,
# fakat işi yalnız Secret Manager'daki 256-bit bearer secret ile başlatabilir.
resource "google_cloud_run_v2_service_iam_member" "trigger_public_transport" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.trigger.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_job_iam_member" "trigger_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_job.backup["manual"].name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.trigger.email}"
}

resource "google_cloud_run_v2_job_iam_member" "scheduler_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_job.backup["scheduled"].name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler.email}"
}

resource "google_service_account_iam_member" "scheduler_token_creator" {
  service_account_id = google_service_account.scheduler.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-cloudscheduler.iam.gserviceaccount.com"
  depends_on         = [google_project_service.required]
}

resource "google_cloud_scheduler_job" "daily_backup" {
  name      = "ortaklar-drive-nightly-backup"
  schedule  = var.schedule
  time_zone = var.time_zone
  http_target {
    http_method = "POST"
    uri         = "https://run.googleapis.com/v2/projects/${var.project_id}/locations/${var.region}/jobs/${google_cloud_run_v2_job.backup["scheduled"].name}:run"
    oauth_token {
      service_account_email = google_service_account.scheduler.email
    }
  }
  depends_on = [google_cloud_run_v2_job_iam_member.scheduler_invoker]
}
