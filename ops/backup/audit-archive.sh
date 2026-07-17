#!/usr/bin/env bash
set -Eeuo pipefail
source /app/lib.sh
trap_failure audit_archive
require_env PROD_DB_URL AUDIT_BUCKET AUDIT_KMS_KEY AUDIT_KMS_KEYRING AUDIT_KMS_LOCATION

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
cd "$workdir"
start="$(date -u -d "$(date -u +%Y-%m-01) -1 month" +%Y-%m-01T00:00:00Z)"
end="$(date -u +%Y-%m-01T00:00:00Z)"
month="${start:0:7}"

psql "$PROD_DB_URL" -X -q -v ON_ERROR_STOP=1 -v start="$start" -v end="$end" -Atc \
  "SELECT row_to_json(e)::text FROM public.audit_events e WHERE occurred_at >= :'start'::timestamptz AND occurred_at < :'end'::timestamptz ORDER BY occurred_at, id" \
  > audit.jsonl
jq -e -c . audit.jsonl >/dev/null
gzip -9 audit.jsonl
openssl rand -out audit.dek 32
nonce_b64="$(python3 /app/encrypt_audit.py encrypt audit.jsonl.gz audit.dek "audit-${month}.jsonl.gz.enc")"
AUDIT_NONCE_B64="$nonce_b64" python3 /app/encrypt_audit.py decrypt "audit-${month}.jsonl.gz.enc" audit.dek audit.verify.jsonl.gz
[[ "$(sha256_file audit.verify.jsonl.gz)" == "$(sha256_file audit.jsonl.gz)" ]] || {
  echo "Audit şifreleme geri okuma bütünlük testi başarısız" >&2
  exit 1
}
gcloud kms encrypt \
  --location "$AUDIT_KMS_LOCATION" --keyring "$AUDIT_KMS_KEYRING" --key "$AUDIT_KMS_KEY" \
  --plaintext-file audit.dek --ciphertext-file "audit-${month}.dek.kms"

rows="$(gzip -dc audit.jsonl.gz | wc -l | tr -d ' ')"
jq -n --arg month "$month" --arg start "$start" --arg end "$end" --argjson rows "$rows" \
  --arg archive_sha256 "$(sha256_file "audit-${month}.jsonl.gz.enc")" \
  --arg plaintext_sha256 "$(sha256_file audit.jsonl.gz)" \
  --arg key_sha256 "$(sha256_file "audit-${month}.dek.kms")" \
  --arg nonce_b64 "$nonce_b64" \
  '{format:"jsonl.gz.enc",encryption:"AES-256-GCM",ciphertext_layout:"ciphertext+tag",nonce_b64:$nonce_b64,aad:"OrtaklarV2-audit-v1",key_wrap:"GCP-KMS",month:$month,start:$start,end:$end,rows:$rows,plaintext_sha256:$plaintext_sha256,archive_sha256:$archive_sha256,wrapped_key_sha256:$key_sha256}' \
  > "audit-${month}.manifest.json"

prefix="gs://${AUDIT_BUCKET}/audit/${month}"
immutable_upload "audit-${month}.jsonl.gz.enc" "${prefix}/audit-${month}.jsonl.gz.enc"
immutable_upload "audit-${month}.dek.kms" "${prefix}/audit-${month}.dek.kms"
immutable_upload "audit-${month}.manifest.json" "${prefix}/manifest.json"
log_metric audit_archive ok "${prefix} rows=${rows}"
