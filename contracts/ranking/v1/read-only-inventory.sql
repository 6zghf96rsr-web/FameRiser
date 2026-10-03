-- FR-AI-01B: aggregate inventory for an approved, isolated PostgreSQL snapshot.
-- READ ONLY by construction. Do not run on production without a separate
-- operational approval, schema check, access review and captured output plan.
-- Assumes public migrations through 030 are present. The first two SELECTs
-- report expected relations/columns; stop if anything marked required is absent.
-- Output contains counts and original-currency sums, no row IDs or PII.

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';

SELECT 'catalog_relation' AS section, relation_name,
       to_regclass('public.' || relation_name) IS NOT NULL AS present
FROM (VALUES ('users'), ('profiles'), ('social_connections'), ('payments'),
             ('dodo_orders'), ('dodo_events'), ('promo_admissions'),
             ('rank_history'), ('profile_traffic'), ('moderation_decisions'),
             ('deletion_requests')) AS required(relation_name)
ORDER BY relation_name;

SELECT 'catalog_column' AS section, table_name, column_name, required_for_base,
       EXISTS (SELECT 1 FROM information_schema.columns c
               WHERE c.table_schema = 'public'
                 AND c.table_name = required.table_name
                 AND c.column_name = required.column_name) AS present
FROM (VALUES ('profiles', 'country_verified', true),
             ('profiles', 'payment_required', true),
             ('social_connections', 'remote_id', true),
             ('social_connections', 'account_kind', true),
             ('dodo_orders', 'score_changed_at', true),
             ('promo_admissions', 'credit_minor', true),
             ('promo_admissions', 'credit_score', true),
             ('promo_admissions', 'remote_id', true),
             ('promo_admissions', 'manual_reason', false)) AS required(table_name, column_name, required_for_base)
ORDER BY table_name, column_name;

SELECT 'profiles_by_state' AS section, status, demo, verified,
       count(*)::bigint AS profile_count,
       count(*) FILTER (WHERE user_id IS NULL)::bigint AS no_owner_count,
       sum(total_paid::numeric) AS legacy_total_paid_czk_minor
FROM public.profiles
GROUP BY status, demo, verified
ORDER BY status, demo, verified;

WITH per_owner AS (
  SELECT user_id, count(*) AS profile_count,
         count(DISTINCT country_verified) FILTER (WHERE country_verified IS NOT NULL) AS verified_country_count,
         count(*) FILTER (WHERE payment_required)::bigint AS page_count
  FROM public.profiles
  WHERE user_id IS NOT NULL AND status <> 'deleted'
  GROUP BY user_id
)
SELECT 'owner_conflicts' AS section,
       count(*)::bigint AS owners_with_profiles,
       count(*) FILTER (WHERE profile_count > 1)::bigint AS owners_with_multiple_profiles,
       coalesce(sum(profile_count) FILTER (WHERE profile_count > 1), 0)::bigint AS profiles_on_multi_profile_owners,
       count(*) FILTER (WHERE verified_country_count > 1)::bigint AS owners_with_conflicting_verified_countries,
       count(*) FILTER (WHERE profile_count > 1 AND page_count > 0)::bigint AS multi_profile_owners_with_pages
FROM per_owner;

SELECT 'proof_anomalies' AS section,
       count(*) FILTER (WHERE p.verified)::bigint AS profiles_marked_verified,
       count(*) FILTER (WHERE p.verified AND NOT EXISTS (
         SELECT 1 FROM public.social_connections c
         JOIN public.social_platforms s ON s.name = c.platform
         WHERE c.user_id = p.user_id AND c.social_url = p.social_url
           AND s.id = p.social_platform_id AND c.status = 'verified'
       ))::bigint AS verified_profiles_without_current_matching_connection,
       count(*) FILTER (WHERE p.status = 'active' AND NOT p.verified)::bigint AS active_profiles_without_current_proof
FROM public.profiles p
WHERE NOT p.demo;

SELECT 'social_connections_by_state' AS section, platform, status, method,
       count(*)::bigint AS connection_count,
       count(*) FILTER (WHERE remote_id IS NULL)::bigint AS missing_stable_subject_count,
       count(*) FILTER (WHERE account_kind = 'facebook_page')::bigint AS page_count
FROM public.social_connections
GROUP BY platform, status, method
ORDER BY platform, status, method;

WITH repeated AS (
  SELECT platform, remote_id
  FROM public.social_connections
  WHERE status = 'verified' AND remote_id IS NOT NULL
  GROUP BY platform, remote_id HAVING count(*) > 1
)
SELECT 'verified_provider_subject_collisions' AS section,
       count(*)::bigint AS collision_groups
FROM repeated;

SELECT 'legacy_payments_by_currency_status' AS section, upper(currency) AS source_currency,
       status, count(*)::bigint AS payment_count,
       sum(amount::numeric) AS gross_original_minor,
       sum(refunded_amount::numeric) AS refunded_original_minor,
       sum(CASE WHEN status IN ('paid', 'partially_refunded')
                THEN (amount - refunded_amount)::numeric ELSE 0 END) AS active_original_minor,
       count(*) FILTER (WHERE paid_at IS NULL AND status IN ('paid', 'partially_refunded'))::bigint AS active_without_paid_at
FROM public.payments
GROUP BY upper(currency), status
ORDER BY source_currency, status;

WITH legacy_czk AS (
  SELECT profile_id,
         sum((amount - refunded_amount)::numeric) AS active_czk_minor
  FROM public.payments
  WHERE lower(currency) = 'czk' AND status IN ('paid', 'partially_refunded')
  GROUP BY profile_id
), difference AS (
  SELECT p.total_paid::numeric - coalesce(l.active_czk_minor, 0) AS delta
  FROM public.profiles p LEFT JOIN legacy_czk l ON l.profile_id = p.id
)
SELECT 'legacy_profile_total_vs_czk_payment_ledger' AS section,
       count(*) FILTER (WHERE delta <> 0)::bigint AS mismatched_profiles,
       coalesce(sum(abs(delta)) FILTER (WHERE delta <> 0), 0) AS absolute_difference_czk_minor
FROM difference;

SELECT 'dodo_orders_by_currency_status' AS section, currency AS source_currency,
       status, count(*)::bigint AS order_count,
       sum(amount::numeric) AS gross_original_minor,
       sum(refunded_amount::numeric) AS refunded_original_minor,
       sum(tax::numeric) AS recorded_tax_original_minor,
       sum(net::numeric) AS recorded_net_original_minor,
       sum(rank_score::numeric) AS old_rank_score,
       sum(active_score::numeric) AS old_active_score,
       count(*) FILTER (WHERE status IN ('paid', 'review', 'refunded')
                        AND (paid_at IS NULL OR provider_payment_id IS NULL OR tax IS NULL))::bigint AS finalized_missing_essential_evidence
FROM public.dodo_orders
GROUP BY currency, status
ORDER BY source_currency, status;

SELECT 'promo_by_platform' AS section, social_platform_id,
       count(*)::bigint AS admission_count,
       count(DISTINCT slot)::bigint AS distinct_slots,
       max(slot) AS highest_slot,
       coalesce(sum(credit_minor::numeric), 0) AS credit_usd_minor,
       coalesce(sum(credit_score::numeric), 0) AS old_credit_score,
       count(*) FILTER (WHERE profile_id IS NULL)::bigint AS detached_profile_count,
       count(*) FILTER (WHERE user_id IS NULL)::bigint AS detached_owner_count,
       count(*) FILTER (WHERE remote_id IS NULL)::bigint AS missing_stable_subject_count,
       count(*) FILTER (WHERE nullif(to_jsonb(a)->>'manual_reason', '') IS NOT NULL)::bigint AS manual_award_count_if_column_present
FROM public.promo_admissions a
GROUP BY social_platform_id
ORDER BY social_platform_id;

WITH by_owner AS (
  SELECT user_id, count(*) AS n
  FROM public.promo_admissions
  WHERE user_id IS NOT NULL
  GROUP BY user_id
)
SELECT 'promo_multiple_awards_per_login' AS section,
       count(*) FILTER (WHERE n > 1)::bigint AS owners_with_multiple_awards,
       coalesce(sum(n) FILTER (WHERE n > 1), 0)::bigint AS awards_on_those_owners
FROM by_owner;

SELECT 'legacy_profile_dependents' AS section,
       (SELECT count(*) FROM public.rank_history)::bigint AS rank_history_rows,
       (SELECT count(*) FROM public.profile_traffic)::bigint AS traffic_rows,
       (SELECT count(*) FROM public.moderation_decisions WHERE profile_id IS NOT NULL)::bigint AS moderation_rows_with_profile,
       (SELECT count(*) FROM public.deletion_requests WHERE prepared_at IS NOT NULL)::bigint AS prepared_erasure_requests;

COMMIT;
