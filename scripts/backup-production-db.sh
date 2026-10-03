#!/usr/bin/env bash
# One-time logical database export. Run locally with a connection from Supabase Connect.
# Do not commit or upload the unencrypted archive. A restore drill is required before migrations.
set -euo pipefail
umask 077

project_ref='bllrojkejdshqlevlleg'
FR_DB_HOST="${FR_DB_HOST:-aws-1-eu-west-1.pooler.supabase.com}"
FR_DB_USER="${FR_DB_USER:-postgres.$project_ref}"
backup_root="${FR_BACKUP_DIR:-$HOME/Documents/Codex/FameRiser-private-backups}"
if [[ "${FR_DB_HOST}" != *.supabase.com || "${FR_DB_USER}" != "postgres.$project_ref" && "${FR_DB_USER}" != 'postgres' ]]; then
  echo 'Unexpected Supabase host or database user; refusing export.' >&2
  exit 2
fi
if [[ -n "${PGPASSWORD:-}" ]]; then
  echo 'Do not supply the database password in a persistent environment variable.' >&2
  exit 2
fi
mkdir -p "$backup_root"
chmod 700 "$backup_root"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$backup_root/$project_ref-$stamp"
mkdir "$out"
chmod 700 "$out"
trap 'unset PGPASSWORD; if [[ -n "${out:-}" && ! -f "$out/VERIFIED_ARCHIVE" ]]; then echo "Incomplete export in $out" >&2; fi' EXIT

read -r -s -p 'Existing Supabase database password (input hidden): ' PGPASSWORD
printf '\n'
export PGPASSWORD PGSSLMODE=require PGCONNECT_TIMEOUT=15
db_port="${FR_DB_PORT:-5432}"
conn="host=$FR_DB_HOST port=$db_port user=$FR_DB_USER dbname=postgres"
psql -X -qAt -v ON_ERROR_STOP=1 -d "$conn" -c "select current_database(),current_user,current_setting('server_version')" > "$out/source.txt"
pg_dump -d "$conn" --format=custom --no-owner --no-privileges --file "$out/database.dump"
test -s "$out/database.dump"
pg_restore --list "$out/database.dump" > "$out/archive-contents.txt"
test -s "$out/archive-contents.txt"
shasum -a 256 "$out/database.dump" > "$out/SHA256"
date -u +%Y-%m-%dT%H:%M:%SZ > "$out/VERIFIED_ARCHIVE"
chmod 600 "$out"/*
unset PGPASSWORD
echo "Logical archive created and readable: $out"
echo 'NEXT: restore to an isolated Supabase project and verify auth, public data and functions.'
echo 'Database exports do not contain Storage object bytes or external Auth/SMTP settings.'
