-- FR-AI-03B synthetic-only contract. Loaded into a fresh in-memory PGlite DB.
-- Deliberately absent from supabase/migrations: no production schema change.
-- The schema owner can write tables directly and bypass function invariants.
-- A production role/grant/RLS design and real PostgreSQL race tests are required.
create schema ranking_pilot;
revoke all on schema ranking_pilot from public;

create table ranking_pilot.creators (
  creator_id text primary key check (length(btrim(creator_id)) > 0),
  registered_at timestamptz not null,
  first_verified_at timestamptz
);

create table ranking_pilot.social_accounts (
  social_account_id text primary key check (length(btrim(social_account_id)) > 0),
  creator_id text not null references ranking_pilot.creators(creator_id),
  provider text not null check (length(btrim(provider)) > 0 and provider = lower(provider)),
  subject text not null check (length(btrim(subject)) > 0),
  first_verified_at timestamptz not null,
  verified boolean not null default true,
  unique (provider, subject)
);

create table ranking_pilot.launch_campaign (
  campaign_id text primary key check (campaign_id = 'launch'),
  starts_at timestamptz not null,
  capacity integer not null check (capacity = 1000),
  admitted_count integer not null check (admitted_count between 0 and capacity)
);

create table ranking_pilot.fc_grants (
  source_key text primary key,
  creator_id text not null references ranking_pilot.creators(creator_id),
  grant_kind text not null check (grant_kind in ('welcome', 'campaign_launch')),
  social_account_id text references ranking_pilot.social_accounts(social_account_id),
  amount_fc integer not null check (amount_fc in (1, 5)),
  granted_at timestamptz not null,
  check ((grant_kind = 'welcome' and social_account_id is not null and amount_fc = 1)
      or (grant_kind = 'campaign_launch' and social_account_id is null and amount_fc = 5))
);
create unique index pilot_one_welcome_per_account
  on ranking_pilot.fc_grants(social_account_id) where grant_kind = 'welcome';
create unique index pilot_one_campaign_per_creator
  on ranking_pilot.fc_grants(creator_id) where grant_kind = 'campaign_launch';

create table ranking_pilot.cash_payments (
  source_key text primary key check (length(btrim(source_key)) > 0),
  creator_id text not null references ranking_pilot.creators(creator_id),
  gross_usd_minor bigint not null check (gross_usd_minor >= 500 and gross_usd_minor % 100 = 0
    and gross_usd_minor <= 9007199254740991),
  provider_success_at timestamptz not null,
  first_recorded_at timestamptz not null,
  held_initially boolean not null,
  status text not null check (status in ('held', 'confirmed')),
  ranking_effective_at timestamptz,
  released_at timestamptz,
  check ((status = 'held' and held_initially and ranking_effective_at is null and released_at is null)
      or (status = 'confirmed' and ranking_effective_at is not null
        and ((held_initially and released_at = ranking_effective_at)
          or (not held_initially and released_at is null and ranking_effective_at = provider_success_at))))
);

create function ranking_pilot.parse_utc(value text) returns timestamptz
language plpgsql as $$
declare
  v_timestamp timestamptz;
  v_milliseconds text;
begin
  if value is null or value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,3})?Z$' then
    raise exception 'Expected canonical UTC second/millisecond timestamp';
  end if;
  v_timestamp := value::timestamptz;
  v_milliseconds := rpad(coalesce(substring(value from '\.([0-9]{1,3})Z$'), ''), 3, '0');
  if to_char(v_timestamp at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') <> left(value, 19) or
     to_char(v_timestamp at time zone 'UTC', 'MS') <> v_milliseconds then
    raise exception 'Non-canonical UTC timestamp';
  end if;
  return v_timestamp;
end;
$$;

-- Trusted proof input only. The creator row lock serializes the welcome cap and
-- first-verification decision. The campaign UPDATE atomically claims one slot.
create function ranking_pilot.verify_social(
  p_creator_id text, p_account_id text, p_provider text, p_subject text, p_verified_at text
) returns table(welcome_granted boolean, campaign_granted boolean)
language plpgsql as $$
declare
  v_at timestamptz := ranking_pilot.parse_utc(p_verified_at);
  v_first timestamptz;
  v_registered timestamptz;
  v_existing ranking_pilot.social_accounts%rowtype;
  v_welcome_count integer;
  v_campaign_start timestamptz;
  v_slot integer;
begin
  welcome_granted := false;
  campaign_granted := false;
  if p_account_id is null or length(btrim(p_account_id)) = 0 or
     p_provider is null or length(btrim(p_provider)) = 0 or p_provider <> lower(p_provider) or
     p_subject is null or length(btrim(p_subject)) = 0 then
    raise exception 'Invalid social identity';
  end if;

  select first_verified_at, registered_at into v_first, v_registered
    from ranking_pilot.creators where creator_id = p_creator_id for update;
  if not found then raise exception 'Unknown creator'; end if;
  if v_at < v_registered then raise exception 'Proof predates creator registration'; end if;

  select * into v_existing from ranking_pilot.social_accounts
    where provider = p_provider and subject = p_subject for update;
  if found then
    if v_existing.creator_id <> p_creator_id or v_existing.social_account_id <> p_account_id then
      raise exception 'Social identity already belongs to another account or creator';
    end if;
    if v_at < v_existing.first_verified_at then
      raise exception 'Earlier proof requires reconciliation';
    end if;
    update ranking_pilot.social_accounts set verified = true
      where social_account_id = p_account_id;
    return next;
    return;
  end if;
  if v_first is not null and v_at < v_first then
    raise exception 'Out-of-order first verification requires reconciliation';
  end if;

  insert into ranking_pilot.social_accounts
    (social_account_id, creator_id, provider, subject, first_verified_at)
    values (p_account_id, p_creator_id, p_provider, p_subject, v_at);
  select count(*) into v_welcome_count from ranking_pilot.fc_grants
    where creator_id = p_creator_id and grant_kind = 'welcome';
  if v_welcome_count < 10 then
    insert into ranking_pilot.fc_grants
      (source_key, creator_id, grant_kind, social_account_id, amount_fc, granted_at)
      values ('welcome:' || p_account_id, p_creator_id, 'welcome', p_account_id, 1, v_at);
    welcome_granted := true;
  end if;

  if v_first is null then
    update ranking_pilot.creators set first_verified_at = v_at where creator_id = p_creator_id;
    select starts_at into v_campaign_start from ranking_pilot.launch_campaign
      where campaign_id = 'launch';
    if not found then raise exception 'Launch campaign configuration missing'; end if;
    if v_at >= v_campaign_start then
      update ranking_pilot.launch_campaign
        set admitted_count = admitted_count + 1
        where campaign_id = 'launch' and admitted_count < capacity
        returning admitted_count into v_slot;
      if found then
        insert into ranking_pilot.fc_grants
          (source_key, creator_id, grant_kind, social_account_id, amount_fc, granted_at)
          values ('campaign:launch:' || p_creator_id, p_creator_id, 'campaign_launch', null, 5, v_at);
        campaign_granted := true;
      end if;
    end if;
  end if;
  return next;
end;
$$;

create function ranking_pilot.revoke_social(p_creator_id text, p_account_id text) returns boolean
language plpgsql as $$
declare v_verified boolean;
begin
  select verified into v_verified from ranking_pilot.social_accounts
    where creator_id = p_creator_id and social_account_id = p_account_id for update;
  if not found then raise exception 'Unknown or foreign social account'; end if;
  update ranking_pilot.social_accounts set verified = false
    where social_account_id = p_account_id;
  return v_verified;
end;
$$;

-- Trusted confirmed provider input only; retry time is deliberately not an
-- identity field. One SQL call commits all columns or none of them.
create function ranking_pilot.record_cash(
  p_source_key text, p_creator_id text, p_gross_usd_minor bigint,
  p_provider_success_at text, p_recorded_at text, p_held boolean
) returns boolean language plpgsql as $$
declare
  v_success timestamptz := ranking_pilot.parse_utc(p_provider_success_at);
  v_recorded timestamptz := ranking_pilot.parse_utc(p_recorded_at);
  v_inserted text;
  v_existing ranking_pilot.cash_payments%rowtype;
begin
  if p_source_key is null or length(btrim(p_source_key)) = 0 or p_held is null or
     p_gross_usd_minor is null or p_gross_usd_minor < 500 or p_gross_usd_minor % 100 <> 0 or
     p_gross_usd_minor > 9007199254740991 then
    raise exception 'Invalid confirmed cash input';
  end if;
  if v_recorded < v_success then raise exception 'Recorded time predates provider success'; end if;
  insert into ranking_pilot.cash_payments
    (source_key, creator_id, gross_usd_minor, provider_success_at, first_recorded_at,
     held_initially, status, ranking_effective_at)
    values (p_source_key, p_creator_id, p_gross_usd_minor, v_success, v_recorded,
      p_held, case when p_held then 'held' else 'confirmed' end,
      case when p_held then null else v_success end)
    on conflict (source_key) do nothing returning source_key into v_inserted;
  if found then return true; end if;
  select * into v_existing from ranking_pilot.cash_payments
    where source_key = p_source_key for update;
  if v_existing.creator_id <> p_creator_id or v_existing.gross_usd_minor <> p_gross_usd_minor or
     v_existing.provider_success_at <> v_success or v_existing.held_initially <> p_held then
    raise exception 'Conflicting replay for cash source key';
  end if;
  return false;
end;
$$;

create function ranking_pilot.release_held_cash(p_source_key text, p_released_at text)
returns boolean language plpgsql as $$
declare
  v_at timestamptz := ranking_pilot.parse_utc(p_released_at);
  v_existing ranking_pilot.cash_payments%rowtype;
begin
  select * into v_existing from ranking_pilot.cash_payments
    where source_key = p_source_key for update;
  if not found then raise exception 'Unknown cash source key'; end if;
  if not v_existing.held_initially then raise exception 'Payment was never held'; end if;
  if v_at < v_existing.provider_success_at or v_at < v_existing.first_recorded_at then
    raise exception 'Release predates payment evidence';
  end if;
  if v_existing.status = 'confirmed' then
    if v_existing.released_at <> v_at then raise exception 'Conflicting release replay'; end if;
    return false;
  end if;
  update ranking_pilot.cash_payments
    set status = 'confirmed', ranking_effective_at = v_at, released_at = v_at
    where source_key = p_source_key;
  return true;
end;
$$;

create view ranking_pilot.verified_creators as
  select distinct creator_id from ranking_pilot.social_accounts where verified;

revoke all on all tables in schema ranking_pilot from public;
revoke all on all functions in schema ranking_pilot from public;
