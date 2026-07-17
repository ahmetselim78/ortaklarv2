#!/usr/bin/env bash
set -Eeuo pipefail
source /app/lib.sh
trap_failure backup

require_env PROD_DB_URL DAILY_BUCKET MONTHLY_BUCKET SUPABASE_PROJECT_REF
[[ "$PROD_DB_URL" == *"${SUPABASE_PROJECT_REF}"* ]] || {
  echo "Production DB bağlantısı ile proje ref'i eşleşmiyor" >&2
  exit 1
}

started_at="$(date -u +%FT%TZ)"
stamp="$(date -u +%Y/%m/%d/%Y%m%dT%H%M%SZ)"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
cd "$workdir"

supabase db dump --db-url "$PROD_DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$PROD_DB_URL" -f schema.sql
supabase db dump --db-url "$PROD_DB_URL" -f data.sql --use-copy --data-only \
  -x storage.buckets_vectors -x storage.vector_indexes
supabase db dump --db-url "$PROD_DB_URL" -f migration_history.sql \
  --use-copy --data-only --schema supabase_migrations

pg_dump "$PROD_DB_URL" --format=custom --data-only --schema=auth \
  --no-owner --no-privileges -f auth.dump
pg_dump "$PROD_DB_URL" --format=custom --data-only --schema=storage \
  --exclude-table=storage.buckets_vectors --exclude-table=storage.vector_indexes \
  --no-owner --no-privileges -f storage.dump

# Manifestteki satır özeti operasyonel karşılaştırma içindir. Büyük tablolarda
# kilit oluşturmamak için PostgreSQL istatistik tahminleri kullanılır.
psql "$PROD_DB_URL" -X -v ON_ERROR_STOP=1 -At -F $'\t' -c \
  "SELECT schemaname, relname, COALESCE(n_live_tup, 0)::bigint FROM pg_stat_user_tables ORDER BY 1,2" \
  | jq -R -s 'split("\n") | map(select(length > 0) | split("\t") | {schema:.[0],table:.[1],estimated_rows:(.[2]|tonumber)})' \
  > table_summary.json

# `supabase db diff` nested Docker kullandığı için Cloud Run içinde çalıştırılmaz.
# Cloud Build bu dosyayı linked proje üzerinden üretip operasyon imajına gömer.
[[ -f /workspace/supabase/auth_storage_diff.sql ]] || {
  echo "İmajda auth_storage_diff.sql bulunamadı; eksik Auth/Storage yedeği üretilmeyecek" >&2
  exit 1
}
cp /workspace/supabase/auth_storage_diff.sql auth_storage_diff.sql

mkdir migrations
cp -R /workspace/supabase/migrations/. migrations/
tar -czf migrations.tar.gz migrations

files=(roles.sql schema.sql data.sql migration_history.sql auth.dump storage.dump auth_storage_diff.sql migrations.tar.gz table_summary.json)
jq -n \
  --arg version "1" \
  --arg project_ref "$SUPABASE_PROJECT_REF" \
  --arg started_at "$started_at" \
  --arg completed_at "$(date -u +%FT%TZ)" \
  --arg git_commit "${GIT_COMMIT:-unknown}" \
  --arg pg_dump_version "$(pg_dump --version)" \
  --arg postgres_version "$(psql "$PROD_DB_URL" -X -At -c 'SHOW server_version')" \
  --arg supabase_cli_version "$(supabase --version)" \
  --argjson files "$(for f in "${files[@]}"; do jq -cn --arg name "$f" --arg sha256 "$(sha256_file "$f")" --argjson size "$(stat -c%s "$f")" '{name:$name,sha256:$sha256,size:$size}'; done | jq -s '.')" \
  '{format_version:$version,project_ref:$project_ref,started_at:$started_at,completed_at:$completed_at,git_commit:$git_commit,tools:{postgres:$postgres_version,pg_dump:$pg_dump_version,supabase_cli:$supabase_cli_version},files:$files}' \
  > manifest.json

archive="backup-${SUPABASE_PROJECT_REF}-$(date -u +%Y%m%dT%H%M%SZ)-$(sha256_file manifest.json | cut -c1-16).tar.gz"
tar -czf "$archive" "${files[@]}" manifest.json
archive_hash="$(sha256_file "$archive")"
jq -n --arg name "$archive" --arg sha256 "$archive_hash" --arg created_at "$(date -u +%FT%TZ)" \
  '{archive:$name,sha256:$sha256,created_at:$created_at}' > archive-manifest.json

prefix="gs://${DAILY_BUCKET}/backups/${stamp}"
immutable_upload "$archive" "${prefix}/${archive}"
immutable_upload archive-manifest.json "${prefix}/manifest.json"

# Scheduler Europe/Istanbul ile çalışır; UTC'de ayın son günü olabilen 02:00
# çalışmasını yanlış sınıflandırmamak için aylık seçim açık yerel saatle yapılır.
if [[ "$(TZ="${TIME_ZONE:-Europe/Istanbul}" date +%d)" == "01" ]]; then
  monthly_prefix="gs://${MONTHLY_BUCKET}/backups/${stamp}"
  immutable_upload "$archive" "${monthly_prefix}/${archive}"
  immutable_upload archive-manifest.json "${monthly_prefix}/manifest.json"
fi

log_metric backup ok "${prefix}/${archive}"
