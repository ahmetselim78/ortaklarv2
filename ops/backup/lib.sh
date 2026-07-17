#!/usr/bin/env bash
set -Eeuo pipefail

log_metric() {
  local event="$1" status="$2" detail="${3:-}"
  jq -cn \
    --arg event "$event" \
    --arg status "$status" \
    --arg detail "$detail" \
    --arg timestamp "$(date -u +%FT%TZ)" \
    '{severity:(if $status == "ok" then "INFO" else "ERROR" end),event:$event,status:$status,detail:$detail,timestamp:$timestamp}'
}

send_ops_alert() {
  local title="$1" message="$2"
  [[ -n "${REPORT_ERROR_URL:-}" && -n "${OPS_ALERT_SECRET:-}" ]] || return 0
  curl -fsS --max-time 15 "$REPORT_ERROR_URL" \
    -H "Content-Type: application/json" \
    -H "X-Ops-Alert-Secret: ${OPS_ALERT_SECRET}" \
    --data "$(jq -cn --arg title "$title" --arg message "$message" '{source:"backup_restore",severity:"critical",title:$title,message:$message,context:{job_mode:env.JOB_MODE}}')" \
    >/dev/null || true
}

require_env() {
  local missing=0
  for name in "$@"; do
    if [[ -z "${!name:-}" ]]; then
      echo "Eksik ortam değişkeni: $name" >&2
      missing=1
    fi
  done
  [[ "$missing" -eq 0 ]]
}

sha256_file() {
  sha256sum "$1" | cut -d' ' -f1
}

immutable_upload() {
  local source="$1" destination="$2"
  gcloud storage cp --if-generation-match=0 "$source" "$destination"
}

latest_manifest_uri() {
  local bucket="$1"
  gcloud storage ls "gs://${bucket}/backups/**/manifest.json" --sort-by=~time-created --limit=1
}

trap_failure() {
  local event="$1"
  trap 'code=$?; log_metric "'"$event"'" "failed" "exit=${code}"; send_ops_alert "OrtaklarV2 operasyon hatası" "'"$event"' exit=${code}"; exit "$code"' ERR
}
