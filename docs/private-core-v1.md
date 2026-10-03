# Private core v1.1 deployment packet

The new `/private` site uses the approved 2026-10-03 rules. It is isolated in `core_v1`; it does not import old paid scores or promo balances. `CORE_V1_PRIVATE_ENABLED` defaults to `false`. Sites must remain owner-only in this phase. Dodo payments and public access are a later release; additional login providers follow that release.

## Contract

- Confirmed email, one creator per user, explicit acceptance of rules `2026-10-03.2`, explicit publication choice.
- Verified provider OAuth social evidence only; YouTube is the supported pilot flow. One welcome FC per distinct social subject, lifetime cap ten per creator. Reconnect awards none. No launch FC and no cash in this phase.
- Global All-Time, Daily (00:00 UTC), Weekly (Monday 00:00 UTC); score = `cash_usd_minor + 100 * FC`. Higher score, then earlier attained time, then ascending public creator UUID. Only active verified accounts permit listing.
- Export, immediate profile hiding during erasure, action and rights quotas. The migration schedules hourly pruning of quota rows older than 24 hours and expired signup invitations when `pg_cron` is available. A disputed transfer of social ownership requires manual review.

## Operator

Petr Suchý, IČO 87155982, Československé armády 723, Místek, 738 01 Frýdek-Místek. Verified against [official ARES](https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/87155982) on 2026-10-03. Runtime `SUPPORT_EMAIL` must be live before registrations.

## Observed production state, 2026-10-03

- Sites project `appgprj_6aa7b646e04c8191ae321c79e547694c` is owner-only custom access, with one allowed account and no group/visitor grant. `PAYMENTS_ENABLED=false`, `DODO_APPROVED=false`, `LEGAL_REVIEW_APPROVED=false`.
- Supabase project `bllrojkejdshqlevlleg` is reachable in its dashboard. Migration history contains 001–019 plus markers 026, 027, 031. The 031 marker is named `page_check_private_hosting`; it is preserved as a no-op source marker, so the new core is migration 032. Some later schema objects already exist despite missing migration records. Do not replay 020–030 blindly. Compare catalog objects and migration SQL first.
- `core_v1` is absent. Email confirmations are enabled. New Auth signups were turned off pending the legal and migration gates. Redirect URLs for `/auth/private-confirm` and its `?reset=1` variant were added on the canonical domain. The invitation hook exists only in migration 032; it is not configured in the live Auth dashboard.
- Supabase Free plan has no project backups. Custom SMTP is disabled; the operator confirmed info@fameriser.com sends and receives via its mailbox, and public MX/SPF records point to WEDOS. The default Supabase Auth mail service is restricted to team addresses and low rate limits. This is insufficient for a multi-user email pilot. [Supabase SMTP guidance](https://supabase.com/docs/guides/auth/auth-smtp).

## Go/no-go for private participant access

1. Follow [the production backup and migration reconciliation procedure](production-db-backup-and-reconciliation.md). Complete an isolated restore drill and catalog comparison before repairing history or applying 032. Migration 032 already contains its own transaction.
2. Review [the legal packet](private-legal-review-v1.md), actual processing terms, suppliers, data transfers, retention and backup deletion. The operator confirmed that info@fameriser.com receives and sends mail. Record a lawyer-approved exact legal version; do not set `LEGAL_REVIEW_APPROVED` from this engineering review. Supabase Auth custom SMTP remains separately unconfigured.
3. Configure verified custom SMTP before inviting people outside the Supabase project team. Public DNS for fameriser.com currently shows WEDOS MX, WEDOS SPF, and DMARC p=none; obtain the actual SMTP host/port/user from the mailbox provider configuration (do not infer the sending host from MX). WEDOS documents SSL 465 or STARTTLS 587, but the account-specific host must be confirmed. Enter the existing SMTP password only in the Supabase secret field, not in this repository or chat. Test delivery to a real non-team address, confirmation links, password reset and failed-delivery handling. [Supabase SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp), [WEDOS configuration](https://help.wedos.cz/otazka/jak-nastavit-imap-a-smtp-pouze-porty-a-bezpecnostni-zasady/15906/). After migration 032, configure the Supabase **Before User Created** Postgres hook `public.core_v1_before_user_created` with the project owner. Seed `core_v1.signup_invites` with normalized, approved pilot email addresses and short expirations through the SQL editor. Verify direct Auth API signup is denied for an uninvited address, an expired invitation and a non-email provider, then succeeds only for an invited address with email confirmation. Keep the global Auth signup switch off until the hook is enabled and these hosted checks pass. The private UI alone cannot protect the direct Auth API.
4. Configure Sites env with the migrated Supabase project and `LEGAL_REVIEW_APPROVED_VERSION=2026-10-03.2`, then enable `CORE_V1_PRIVATE_ENABLED`. Test actual signup, confirmation, YouTube proof, FC/reconnect, UTC boards, hiding, export, deletion and rollback on the owner-only live URL.
5. Verify that the `fameriser-core-v1-limiter-prune` cron job was created and ran after migration; approve the corresponding retention text. No public access or Dodo checkout is included in this packet.

Local evidence before merge: `npm test`, `npm run migrations:check`, `npm run typecheck`, `npm run lint:baseline`, default and private builds, and both HTTP smoke scripts. PGlite and local Wrangler do not prove hosted Supabase behavior.
