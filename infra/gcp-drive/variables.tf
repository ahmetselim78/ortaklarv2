variable "project_id" {
  type = string
}

variable "region" {
  type    = string
  default = "europe-west1"
}

variable "backup_image" {
  description = "Cloud Build tarafından üretilen Drive yedekleme imajı."
  type        = string
}

variable "supabase_project_ref" {
  type = string
}

variable "supabase_pooler_host" {
  type = string
}

variable "time_zone" {
  type    = string
  default = "Europe/Istanbul"
}

variable "schedule" {
  type    = string
  default = "0 2 * * *"
}

variable "drive_root_folder" {
  type    = string
  default = "Yedekler"
}

variable "age_recipient" {
  description = "Şifreleme için public age1... recipient; private anahtar değildir."
  type        = string
  validation {
    condition     = startswith(var.age_recipient, "age1")
    error_message = "age_recipient public age1... değeri olmalıdır."
  }
}

variable "secret_ids" {
  description = "Secret değerleri Terraform'a verilmez; yalnız Secret Manager adlarıdır."
  type = object({
    prod_db_url             = string
    drive_client_id         = string
    drive_client_secret     = string
    drive_refresh_token     = string
    drive_web_client_id     = string
    drive_web_client_secret = string
    trigger_shared_secret   = string
    supabase_access_token   = string
  })
  default = {
    prod_db_url             = "ortaklar-drive-prod-db-url"
    drive_client_id         = "ortaklar-drive-client-id"
    drive_client_secret     = "ortaklar-drive-client-secret"
    drive_refresh_token     = "ortaklar-drive-refresh-token"
    drive_web_client_id     = "ortaklar-drive-web-client-id"
    drive_web_client_secret = "ortaklar-drive-web-client-secret"
    trigger_shared_secret   = "ortaklar-drive-trigger-secret"
    supabase_access_token   = "ortaklar-supabase-access-token"
  }
}
