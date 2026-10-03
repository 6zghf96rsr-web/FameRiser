# Production database backup and migration reconciliation

Project: Supabase `bllrojkejdshqlevlleg` (production). Status on 2026-10-03: **no verified recoverable backup; no repair or migration 032 has been applied**. Keep Auth new signups disabled and the Sites project owner-only until this gate passes.

## Why the current state needs care

[Supabase Free does not include daily managed backups](https://supabase.com/docs/guides/platform/backups). A database password is needed for a logical export; the dashboard does not show the existing password. No database password was found in this workspace, and it should not be sent in chat. The operator must either enter the existing password into the local script's hidden terminal prompt or personally reset it in Supabase Database Settings. Changing the database password is an operator action and may affect other direct database clients; check them first.

The read-only production audit found:

| Versions | Production migration history | Verified production evidence |
| --- | --- | --- |
| 001–019 | Present as timestamped records | Existing legacy schema and service are live. |
| 020–025 | No history rows | Key objects exist: global promo slot, unique remote identity indexes, provider verification, USD promo credit, login connection, one-promo-per-owner index, social account kind and payment-required field. This does not prove all data transformations or function bodies match the files. |
| 026, 027 | Present as literal version markers | Each has an empty statements array and NULL created_by. Account erasure preparation and page-check objects exist. |
| 028–030 | No history rows | Paged leaderboard/normalizer, Dodo order index, mail settings/queue indexes, pause function, one-second cron, and retry-window changes in both mail functions exist. Function definitions and data effects still need comparison. |
| 031 | Present as marker | Name `page_check_private_hosting`, empty statements array. |
| 032 | Absent | `core_v1` schema is absent. Apply only after backup, reconciliation and legal/SMTP gates. |

The history table has `version text`, nullable `statements text[]`, `name text`, `created_by text`, `idempotency_key text` and `rollback text[]` (column types and nullability checked in SQL Editor). Existing 026/027/031 rows are source markers, not stored migration SQL. Do **not** rerun 020–030 or insert missing history markers based only on object names.

## Backup procedure

1. The script includes the verified 2026-10-03 Session pooler host `aws-1-eu-west-1.pooler.supabase.com` and user `postgres.bllrojkejdshqlevlleg` from Supabase Dashboard > Connect. Recheck those details if the project connection changes. Do not include the password in shell history. In a local terminal:
   ```sh
   ./scripts/backup-production-db.sh
   ```
   The script prompts invisibly for the existing database password, writes a PostgreSQL custom-format archive under `~/Documents/Codex/FameRiser-private-backups` with private file permissions, runs `pg_restore --list`, and stores its SHA-256.
2. Verify the archive contains `public`, `auth`, `storage`, `supabase_migrations` and the expected row data. A readable table of contents and checksum prove file integrity, **not** recoverability.
3. Restore into a **new isolated Supabase project** following [Supabase's manual migration guidance](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore). Do not restore into production or use `--clean` against it. Match extensions and managed Auth/Storage setup, then verify sampled row counts, Auth sign-in, migration history, key functions and a test account. Record project ID, start/end time, exact commands, errors, and outcome. Supabase's documented roles/schema/data flow may be needed if a full custom-format restore conflicts with managed schemas.
4. Export Storage object **bytes** separately where present; a database dump contains only Storage metadata, [not the objects](https://supabase.com/docs/guides/platform/backups). Preserve Auth project configuration, OAuth settings, SMTP settings, secrets and Sites environment separately in a secure inventory; none are in this archive. Copy the archive to an encrypted offsite location accessible to the operator, then verify its SHA-256 after download. Define and enforce backup retention and deletion.
5. Mark the backup gate complete only after an isolated restore drill passes. Run a fresh backup immediately before production migration 032.

## Migration reconciliation procedure after the restore drill

1. Compare production catalog definitions of all objects, constraints, triggers, indexes and function bodies in 020–030 with a clean schema produced from the repository at the matching PostgreSQL/Supabase version. Check data transformations, especially promo slot renumbering and remote IDs, account/publication links, page payment requirements and mail retry windows. Save a dated discrepancy report. Any difference requires a focused forward migration, not silent marking.
2. In a single transaction, after proving equivalence, add missing `020`–`025` and `028`–`030` rows to `supabase_migrations.schema_migrations` with their exact file names and empty statements arrays, matching the existing marker convention. Preserve existing rows untouched. Verify all 001–031 source versions are represented and take a post-repair snapshot. Do not invent timestamp versions for the missing files.
3. Apply migration 032 once to the now-baselined production database. Check `core_v1` RLS/grants, invitation hook, signup denial, scores and erasure trigger before enabling new registrations. Keep a tested rollback plan: disable private flag and new signups, preserve data, and restore the prior archive to an isolated project if needed. A production rollback by dropping `core_v1` is not safe after participant writes.

The migration repair is prepared as a procedure, not yet executed. The blocker is the missing database password and a proved restore target; hiding this gap with manual history rows would make the database less auditable.
