-- FR-AI-04A synthetic read boundary, installed after pilot-ledger.sql in a
-- disposable database. This is NOT a production migration or provider adapter.
-- The schema owner remains trusted; application roles only receive functions.

alter table ranking_pilot.creators
  add column public_id uuid not null default gen_random_uuid(),
  add column consent_to_publish boolean not null default false,
  add column moderation_allowed boolean not null default true,
  add column erasure_hidden boolean not null default false,
  add constraint pilot_public_id_unique unique (public_id);

-- A transactional row counter, not a sequence: a concurrent writer must wait
-- for the preceding writer's commit/rollback before receiving its revision.
create table ranking_pilot.projection_clock (
  singleton boolean primary key default true check (singleton),
  revision bigint not null check (revision > 0)
);
insert into ranking_pilot.projection_clock(singleton, revision) values (true, 1);

create table ranking_pilot.projection_outbox (
  revision bigint primary key,
  changed_at timestamptz not null,
  reason text not null
);

create function ranking_pilot.advance_projection_revision() returns trigger
language plpgsql set search_path = pg_catalog, ranking_pilot, pg_temp as $$
declare v_revision bigint;
begin
  if tg_op = 'UPDATE' and to_jsonb(old) = to_jsonb(new) then return null; end if;
  update ranking_pilot.projection_clock set revision = revision + 1
    where singleton = true returning revision into v_revision;
  if v_revision is null then raise exception 'Projection clock is missing'; end if;
  insert into ranking_pilot.projection_outbox(revision, changed_at, reason)
    values (v_revision, statement_timestamp(), tg_table_name || ':' || tg_op);
  return null;
end;
$$;

create trigger projection_creator_change after insert or update or delete
  on ranking_pilot.creators for each row
  execute function ranking_pilot.advance_projection_revision();
create trigger projection_social_change after insert or update or delete
  on ranking_pilot.social_accounts for each row
  execute function ranking_pilot.advance_projection_revision();
create trigger projection_fc_change after insert or update or delete
  on ranking_pilot.fc_grants for each row
  execute function ranking_pilot.advance_projection_revision();
create trigger projection_cash_change after insert or update or delete
  on ranking_pilot.cash_payments for each row
  execute function ranking_pilot.advance_projection_revision();

create function ranking_pilot.set_publication_consent(p_creator_id text, p_allowed boolean)
returns boolean language plpgsql security definer
set search_path = pg_catalog, ranking_pilot, pg_temp as $$
begin
  if p_allowed is null then raise exception 'Consent must be explicit'; end if;
  update ranking_pilot.creators set consent_to_publish = p_allowed
    where creator_id = p_creator_id and not erasure_hidden
      and consent_to_publish is distinct from p_allowed;
  if found then return true; end if;
  perform 1 from ranking_pilot.creators where creator_id = p_creator_id and not erasure_hidden;
  if not found then raise exception 'Unknown or hidden creator'; end if;
  return false;
end;
$$;

create function ranking_pilot.set_moderation_allowed(p_creator_id text, p_allowed boolean)
returns boolean language plpgsql security definer
set search_path = pg_catalog, ranking_pilot, pg_temp as $$
begin
  if p_allowed is null then raise exception 'Moderation state must be explicit'; end if;
  update ranking_pilot.creators set moderation_allowed = p_allowed
    where creator_id = p_creator_id and not erasure_hidden
      and moderation_allowed is distinct from p_allowed;
  if found then return true; end if;
  perform 1 from ranking_pilot.creators where creator_id = p_creator_id and not erasure_hidden;
  if not found then raise exception 'Unknown or hidden creator'; end if;
  return false;
end;
$$;

-- Publication suppression only. Actual erasure workflow is a separate story.
create function ranking_pilot.mark_erasure_hidden(p_creator_id text)
returns boolean language plpgsql security definer
set search_path = pg_catalog, ranking_pilot, pg_temp as $$
begin
  update ranking_pilot.creators set erasure_hidden = true, consent_to_publish = false
    where creator_id = p_creator_id and not erasure_hidden;
  if found then return true; end if;
  perform 1 from ranking_pilot.creators where creator_id = p_creator_id;
  if not found then raise exception 'Unknown creator'; end if;
  return false;
end;
$$;

-- A long-lived REPEATABLE READ snapshot can predate revocation even when the
-- statement timestamp is new. Reject it rather than serving stale visibility.
create function ranking_pilot.require_fresh_read_committed() returns boolean
language plpgsql stable
set search_path = pg_catalog, ranking_pilot, pg_temp as $$
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Projection read requires a fresh READ COMMITTED statement';
  end if;
  return true;
end;
$$;

-- A STABLE function sees the caller statement's one MVCC snapshot for the
-- clock, visibility, cash and FC. Only currently eligible opaque public IDs
-- are returned. Event identifiers are local ordinals, never provider keys.
create function ranking_pilot.read_projection_evidence() returns jsonb
language sql stable security definer
set search_path = pg_catalog, ranking_pilot, pg_temp as $$
  select jsonb_build_object(
    'freshRead', ranking_pilot.require_fresh_read_committed(),
    'projectionRevision',
      (select revision::text from ranking_pilot.projection_clock where singleton = true),
    'asOf', to_char(statement_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'creators', coalesce((
      select jsonb_agg(jsonb_build_object(
        'creatorId', c.public_id::text,
        'cash', coalesce((
          select jsonb_agg(jsonb_build_object(
            'paymentId', 'cash:' || p.ordinal::text,
            'grossUsdMinor', p.gross_usd_minor,
            'effectiveAt', to_char(p.ranking_effective_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          ) order by p.ordinal)
          from (
            select row_number() over (order by source_key) as ordinal,
                   gross_usd_minor, ranking_effective_at
              from ranking_pilot.cash_payments
              where creator_id = c.creator_id and status = 'confirmed'
          ) p
        ), '[]'::jsonb),
        'fc', coalesce((
          select jsonb_agg(jsonb_build_object(
            'grantId', 'fc:' || g.ordinal::text,
            'amountFc', g.amount_fc,
            'grantedAt', to_char(g.granted_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          ) order by g.ordinal)
          from (
            select row_number() over (order by source_key) as ordinal,
                   amount_fc, granted_at
              from ranking_pilot.fc_grants where creator_id = c.creator_id
          ) g
        ), '[]'::jsonb)
      ) order by c.public_id)
      from ranking_pilot.creators c
      where c.consent_to_publish and c.moderation_allowed and not c.erasure_hidden
        and exists (
          select 1 from ranking_pilot.social_accounts a
            where a.creator_id = c.creator_id and a.verified
        )
    ), '[]'::jsonb)
  );
$$;

-- Pilot roles model the production trust boundary. The database owner is
-- intentionally outside the application threat model; never connect the app
-- using that role. No table, sequence or trigger-function grant is issued.
alter default privileges in schema ranking_pilot revoke execute on functions from public;
create role ranking_pilot_reader nologin;
create role ranking_pilot_proof_writer nologin;
create role ranking_pilot_payment_writer nologin;
create role ranking_pilot_consent_writer nologin;
create role ranking_pilot_moderator nologin;
create role ranking_pilot_erasure_writer nologin;

grant usage on schema ranking_pilot to ranking_pilot_reader,
  ranking_pilot_proof_writer, ranking_pilot_payment_writer,
  ranking_pilot_consent_writer, ranking_pilot_moderator,
  ranking_pilot_erasure_writer;

-- Existing pilot ledger functions were invoker functions in FR-AI-03B.
-- Call them as the schema owner while keeping app roles out of base tables.
alter function ranking_pilot.verify_social(text,text,text,text,text) security definer;
alter function ranking_pilot.verify_social(text,text,text,text,text)
  set search_path = pg_catalog, ranking_pilot, pg_temp;
alter function ranking_pilot.revoke_social(text,text) security definer;
alter function ranking_pilot.revoke_social(text,text)
  set search_path = pg_catalog, ranking_pilot, pg_temp;
alter function ranking_pilot.record_cash(text,text,bigint,text,text,boolean) security definer;
alter function ranking_pilot.record_cash(text,text,bigint,text,text,boolean)
  set search_path = pg_catalog, ranking_pilot, pg_temp;
alter function ranking_pilot.release_held_cash(text,text) security definer;
alter function ranking_pilot.release_held_cash(text,text)
  set search_path = pg_catalog, ranking_pilot, pg_temp;

alter table ranking_pilot.creators enable row level security;
alter table ranking_pilot.social_accounts enable row level security;
alter table ranking_pilot.fc_grants enable row level security;
alter table ranking_pilot.cash_payments enable row level security;
alter table ranking_pilot.projection_clock enable row level security;
alter table ranking_pilot.projection_outbox enable row level security;

revoke all on all tables in schema ranking_pilot from public;
revoke all on all functions in schema ranking_pilot from public;
grant execute on function ranking_pilot.read_projection_evidence()
  to ranking_pilot_reader;
grant execute on function ranking_pilot.verify_social(text,text,text,text,text),
  ranking_pilot.revoke_social(text,text) to ranking_pilot_proof_writer;
grant execute on function ranking_pilot.record_cash(text,text,bigint,text,text,boolean),
  ranking_pilot.release_held_cash(text,text) to ranking_pilot_payment_writer;
grant execute on function ranking_pilot.set_publication_consent(text,boolean)
  to ranking_pilot_consent_writer;
grant execute on function ranking_pilot.set_moderation_allowed(text,boolean)
  to ranking_pilot_moderator;
grant execute on function ranking_pilot.mark_erasure_hidden(text)
  to ranking_pilot_erasure_writer;
