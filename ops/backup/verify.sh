#!/usr/bin/env bash
set -Eeuo pipefail
source /app/lib.sh
trap_failure backup_verify

require_env DAILY_BUCKET MONTHLY_BUCKET
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

verify_bucket() {
  local bucket="$1" label="$2"
  local directory="${workdir}/${label}"
  mkdir -p "$directory"
  cd "$directory"

  local manifest_uri archive_name archive_uri expected actual completed_epoch age_seconds
  manifest_uri="$(latest_manifest_uri "$bucket")"
  [[ -n "$manifest_uri" ]] || { echo "${label}: doğrulanacak manifest bulunamadı" >&2; exit 1; }
  gcloud storage cp "$manifest_uri" archive-manifest.json
  archive_name="$(jq -r .archive archive-manifest.json)"
  archive_uri="${manifest_uri%/manifest.json}/${archive_name}"
  gcloud storage cp "$archive_uri" "$archive_name"

  expected="$(jq -r .sha256 archive-manifest.json)"
  actual="$(sha256_file "$archive_name")"
  [[ "$expected" == "$actual" ]] || { echo "${label}: arşiv SHA-256 uyuşmuyor" >&2; exit 1; }

  tar -tzf "$archive_name" > archive-files.txt
  for required in roles.sql schema.sql data.sql migration_history.sql auth.dump storage.dump auth_storage_diff.sql migrations.tar.gz table_summary.json manifest.json; do
    grep -Fxq "$required" archive-files.txt || { echo "${label}: eksik yedek bileşeni: $required" >&2; exit 1; }
  done

  tar -xzf "$archive_name"
  jq -e '.format_version and .project_ref and .completed_at and .tools.postgres and (.files | length >= 9)' manifest.json >/dev/null
  completed_epoch="$(date -u -d "$(jq -r .completed_at manifest.json)" +%s)"
  age_seconds="$(( $(date -u +%s) - completed_epoch ))"
  [[ "$age_seconds" -ge 0 && "$age_seconds" -le 86400 ]] || { echo "${label}: yedek yaşı 24 saat sınırını aşıyor: ${age_seconds}s" >&2; exit 1; }
  jq -e 'type == "array" and all(.[]; (.schema|type)=="string" and (.table|type)=="string" and (.estimated_rows|type)=="number")' table_summary.json >/dev/null
  while IFS=$'\t' read -r name sha; do
    [[ "$(sha256_file "$name")" == "$sha" ]] || { echo "${label}: bileşen SHA-256 uyuşmuyor: $name" >&2; exit 1; }
  done < <(jq -r '.files[] | [.name,.sha256] | @tsv' manifest.json)

  pg_restore --list auth.dump >/dev/null
  pg_restore --list storage.dump >/dev/null
  log_metric backup_verify ok "${label} ${archive_uri}"
}

verify_bucket "$DAILY_BUCKET" daily

# Ayın ilk yerel günündeki verifier aynı nightly arşivin aylık bucket'a da
# gerçekten yazıldığını ve orada okunabildiğini bağımsız olarak kanıtlar.
if [[ "$(TZ="${TIME_ZONE:-Europe/Istanbul}" date +%d)" == "01" ]]; then
  verify_bucket "$MONTHLY_BUCKET" monthly
fi
