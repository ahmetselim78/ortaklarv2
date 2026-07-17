variable "project_id" {
  type = string
}

variable "region" {
  type    = string
  default = "europe-west1"
}

variable "environment" {
  type    = string
  default = "prod"
}

variable "ops_image" {
  type = string
}

variable "artifact_repository_id" {
  type    = string
  default = "ortaklar-ops"
}

variable "supabase_project_ref" {
  type = string
}

variable "restore_supabase_project_ref" {
  description = "Yalnız izole aylık restore projesinin ref'i; production ref ile aynı olamaz."
  type        = string
  validation {
    condition     = var.restore_supabase_project_ref != var.supabase_project_ref
    error_message = "Restore Supabase proje ref'i production proje ref'inden farklı olmalıdır."
  }
}

variable "daily_bucket_name" {
  type = string
}

variable "monthly_bucket_name" {
  type = string
}

variable "audit_bucket_name" {
  type = string
}

variable "monitoring_email" {
  type    = string
  default = ""
}

variable "time_zone" {
  type    = string
  default = "Europe/Istanbul"
}

variable "report_error_url" {
  description = "Aşama 5 sonrası güvenli report-error Edge Function URL'si."
  type        = string
  default     = ""
}

variable "secret_ids" {
  description = "Secret Manager secret adları; değerler Terraform dışında eklenir."
  type = object({
    prod_db_url               = string
    supabase_access_token     = string
    restore_db_url            = string
    restore_supabase_url      = string
    restore_supabase_anon_key = string
    auth_canary_email         = string
    auth_canary_password      = string
    auth_canary_uuid          = string
    ops_alert_secret          = string
  })
}
