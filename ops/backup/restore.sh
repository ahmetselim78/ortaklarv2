#!/usr/bin/env bash
set -Eeuo pipefail
source /app/lib.sh
trap_failure restore_test

require_env MONTHLY_BUCKET RESTORE_DB_URL RESTORE_SUPABASE_URL RESTORE_SUPABASE_ANON_KEY AUTH_CANARY_EMAIL AUTH_CANARY_PASSWORD AUTH_CANARY_UUID SUPABASE_PROJECT_REF RESTORE_SUPABASE_PROJECT_REF
[[ "$SUPABASE_PROJECT_REF" != "$RESTORE_SUPABASE_PROJECT_REF" ]] || {
  echo "Restore hedefi production proje ref'i ile aynı olamaz" >&2
  exit 1
}
[[ "$RESTORE_SUPABASE_URL" == *"${RESTORE_SUPABASE_PROJECT_REF}"* ]] || {
  echo "Restore URL ile izole proje ref'i eşleşmiyor" >&2
  exit 1
}
[[ "$RESTORE_DB_URL" == *"${RESTORE_SUPABASE_PROJECT_REF}"* ]] || {
  echo "Restore DB bağlantısı ile izole proje ref'i eşleşmiyor" >&2
  exit 1
}
started="$(date +%s)"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
cd "$workdir"

manifest_uri="$(latest_manifest_uri "$MONTHLY_BUCKET")"
[[ -n "$manifest_uri" ]] || { echo "Aylık restore manifesti bulunamadı" >&2; exit 1; }
gcloud storage cp "$manifest_uri" archive-manifest.json
archive_name="$(jq -r .archive archive-manifest.json)"
gcloud storage cp "${manifest_uri%/manifest.json}/${archive_name}" "$archive_name"
[[ "$(sha256_file "$archive_name")" == "$(jq -r .sha256 archive-manifest.json)" ]]
tar -xzf "$archive_name"

psql "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 -f roles.sql
psql "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 -f schema.sql
[[ ! -s auth_storage_diff.sql ]] || psql "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 -f auth_storage_diff.sql
psql "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 -f data.sql
pg_restore --dbname="$RESTORE_DB_URL" --data-only --no-owner --no-privileges --exit-on-error auth.dump
pg_restore --dbname="$RESTORE_DB_URL" --data-only --no-owner --no-privileges --exit-on-error storage.dump
psql "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 -f migration_history.sql

response="$(curl -fsS "${RESTORE_SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${RESTORE_SUPABASE_ANON_KEY}" -H 'Content-Type: application/json' \
  --data "$(jq -cn --arg email "$AUTH_CANARY_EMAIL" --arg password "$AUTH_CANARY_PASSWORD" '{email:$email,password:$password}')")"
[[ "$(jq -r .user.id <<<"$response")" == "$AUTH_CANARY_UUID" ]] || { echo "Auth canary UUID uyuşmuyor" >&2; exit 1; }

access_token="$(jq -r .access_token <<<"$response")"
business_rows="$(psql "$RESTORE_DB_URL" -X -At -c 'SELECT count(*) FROM public.siparisler')"
[[ "$business_rows" -gt 0 ]] || { echo "RLS canary testi için restore edilmiş sipariş kaydı yok" >&2; exit 1; }
status="$(curl -sS -o canary-rls.json -w '%{http_code}' "${RESTORE_SUPABASE_URL}/rest/v1/siparisler?select=id&limit=1" \
  -H "apikey: ${RESTORE_SUPABASE_ANON_KEY}" -H "Authorization: Bearer ${access_token}")"
[[ "$status" == "200" && "$(jq 'length' canary-rls.json)" == "0" ]] || {
  echo "Canary RLS negatif testi başarısız: HTTP $status" >&2
  exit 1
}

elapsed="$(( $(date +%s) - started ))"
[[ "$elapsed" -le 14400 ]] || { echo "RTO hedefi aşıldı: ${elapsed}s" >&2; exit 1; }
log_metric restore_test ok "elapsed_seconds=${elapsed}"
