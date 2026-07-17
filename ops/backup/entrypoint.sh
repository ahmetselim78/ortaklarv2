#!/usr/bin/env bash
set -Eeuo pipefail

case "${JOB_MODE:-}" in
  backup) exec /app/backup.sh ;;
  verify) exec /app/verify.sh ;;
  restore) exec /app/restore.sh ;;
  audit-archive) exec /app/audit-archive.sh ;;
  *) echo "JOB_MODE backup, verify, restore veya audit-archive olmalıdır" >&2; exit 64 ;;
esac
