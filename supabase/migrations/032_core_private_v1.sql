-- Private v1.1 core. Legacy CZK/EUR scores and promo admissions are not imported.
-- Only server-side service_role RPCs may cross this boundary. The Sites owner
-- gate stays enabled until legal, Dodo and payment launch gates are complete.
begin;
create schema core_v1;
revoke all on schema core_v1 from public, anon, authenticated;

create table core_v1.creators (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.users(id) on delete set null,
  display_name text not null check (length(btrim(display_name)) between 2 and 80),
  country text check (country ~ '^[A-Z]{2}$'),
  publish_requested boolean not null default false,
  moderation_allowed boolean not null default true,
  erased_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  first_verified_at timestamptz,
  accepted_rules_version text not null check (accepted_rules_version = '2026-10-03.1'),
  accepted_at timestamptz not null default clock_timestamp()
);

create table core_v1.social_accounts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references core_v1.creators(id),
  provider text not null check (provider in ('facebook','twitch','x','youtube')),
  subject text not null check (length(btrim(subject)) between 1 and 200),
  source_connection_id uuid not null,
  social_url text not null check (length(social_url) between 10 and 500),
  label text not null check (length(btrim(label)) between 1 and 200),
  category_id text references public.categories(id),
  first_attached_at timestamptz not null default clock_timestamp(),
  unique(provider,subject)
);
create index core_v1_social_creator on core_v1.social_accounts(creator_id);

create table core_v1.fc_grants (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references core_v1.creators(id),
  social_account_id uuid unique references core_v1.social_accounts(id),
  kind text not null check (kind in ('welcome','launch')),
  amount_fc integer not null check ((kind='welcome' and amount_fc=1 and social_account_id is not null)
    or (kind='launch' and amount_fc=5 and social_account_id is null)),
  granted_at timestamptz not null default clock_timestamp()
);
create unique index core_v1_one_launch_per_creator on core_v1.fc_grants(creator_id) where kind='launch';

-- A launch bonus cannot be minted in the private phase. A separate reviewed
-- migration will set starts_at and add an atomic 1,000 creator admission path.
create table core_v1.launch_control (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  starts_at timestamptz,
  admitted_count integer not null default 0 check (admitted_count between 0 and 1000),
  check ((not enabled and starts_at is null and admitted_count=0)
    or (enabled and starts_at is not null))
);
insert into core_v1.launch_control(singleton) values(true);

create table core_v1.projection_clock (
  singleton boolean primary key default true check (singleton),
  revision bigint not null default 1 check (revision>0)
);
insert into core_v1.projection_clock(singleton) values(true);

create table core_v1.action_limits (
  user_id uuid primary key references public.users(id) on delete cascade,
  window_start timestamptz not null,
  requests integer not null check (requests between 1 and 30)
);

create table core_v1.rights_limits (
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('export','erase')),
  window_start timestamptz not null,
  requests integer not null check (requests between 1 and 3),
  primary key(user_id,kind)
);

-- An explicit email invitation is required even if someone calls the Auth
-- endpoint directly instead of using the owner-only Sites UI.
create table core_v1.signup_invites (
  email text primary key check (email=lower(btrim(email)) and length(email) between 3 and 320),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  check (expires_at>created_at)
);
create index core_v1_signup_invites_expiry on core_v1.signup_invites(expires_at);

create function public.core_v1_before_user_created(event jsonb) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public,core_v1,pg_temp as $$
declare v_email text:=lower(btrim(event->'user'->>'email'));
begin
  if event->'user'->'app_metadata'->>'provider'='email' and
    exists(select 1 from core_v1.signup_invites
      where email=v_email and expires_at>clock_timestamp()) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error',jsonb_build_object('http_code',403,
    'message','Registration is not available for this address'));
end $$;

-- Keep only the current quota window and a short troubleshooting margin.
-- pg_cron is enabled by migration 017 in Supabase; the guard keeps isolated
-- PGlite tests and restored databases without cron usable.
create function public.core_v1_prune_limits() returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public,core_v1,pg_temp as $$
declare v_actions integer; v_rights integer; v_invites integer;
begin
  delete from core_v1.action_limits where window_start<clock_timestamp()-interval '24 hours';
  get diagnostics v_actions=row_count;
  delete from core_v1.rights_limits where window_start<clock_timestamp()-interval '24 hours';
  get diagnostics v_rights=row_count;
  delete from core_v1.signup_invites where expires_at<=clock_timestamp();
  get diagnostics v_invites=row_count;
  return jsonb_build_object('actions',v_actions,'rights',v_rights,'invites',v_invites);
end $$;
do $$begin
  if to_regnamespace('cron') is not null then
    execute 'select cron.schedule(''fameriser-core-v1-limiter-prune'',
      ''0 * * * *'',''select public.core_v1_prune_limits();'')';
  end if;
end $$;

create function public.core_v1_consume_right(p_user uuid,p_kind text) returns boolean
language plpgsql security definer
set search_path=pg_catalog,public,core_v1,pg_temp as $$
declare v_allowed boolean;
begin
  if p_kind not in ('export','erase') then return false; end if;
  perform 1 from public.users where id=p_user for share;
  if not found then return false; end if;
  insert into core_v1.rights_limits(user_id,kind,window_start,requests)
    values(p_user,p_kind,date_trunc('hour',clock_timestamp()),1)
    on conflict(user_id,kind) do update set
      window_start=excluded.window_start,
      requests=case when core_v1.rights_limits.window_start=excluded.window_start
        then core_v1.rights_limits.requests+1 else 1 end
    where core_v1.rights_limits.window_start<excluded.window_start or
      (core_v1.rights_limits.window_start=excluded.window_start and
       core_v1.rights_limits.requests<3)
    returning true into v_allowed;
  return coalesce(v_allowed,false);
end $$;

create function public.core_v1_consume_action(p_user uuid) returns boolean
language plpgsql security definer
set search_path=pg_catalog,public,core_v1,pg_temp as $$
declare v_allowed boolean;
begin
  perform 1 from public.users where id=p_user and not banned for share;
  if not found then return false; end if;
  insert into core_v1.action_limits(user_id,window_start,requests)
    values(p_user,date_trunc('hour',clock_timestamp()),1)
    on conflict(user_id) do update set
      window_start=excluded.window_start,
      requests=case when core_v1.action_limits.window_start=excluded.window_start
        then core_v1.action_limits.requests+1 else 1 end
    where core_v1.action_limits.window_start<excluded.window_start or
      (core_v1.action_limits.window_start=excluded.window_start and
       core_v1.action_limits.requests<30)
    returning true into v_allowed;
  return coalesce(v_allowed,false);
end $$;

create function core_v1.advance_revision() returns trigger language plpgsql
security definer set search_path=pg_catalog,core_v1,pg_temp as $$
begin
  if tg_op='UPDATE' and to_jsonb(old)=to_jsonb(new) then return null; end if;
  update core_v1.projection_clock set revision=revision+1 where singleton=true;
  return null;
end $$;
create trigger core_creator_revision after insert or update or delete on core_v1.creators
  for each row execute function core_v1.advance_revision();
create trigger core_social_revision after insert or update or delete on core_v1.social_accounts
  for each row execute function core_v1.advance_revision();
create trigger core_fc_revision after insert or update or delete on core_v1.fc_grants
  for each row execute function core_v1.advance_revision();

-- Eligibility also depends on legacy proof and account-ban rows. A revision
-- must change when those rows change, even if no core_v1 row is mutated.
create function core_v1.advance_external_revision() returns trigger language plpgsql
security definer set search_path=pg_catalog,public,core_v1,pg_temp as $$
declare v_source uuid;
begin
  if tg_table_name='social_connections' then
    if tg_op='UPDATE' and row(old.status,old.method,old.remote_id,old.user_id,old.account_kind)
      is not distinct from row(new.status,new.method,new.remote_id,new.user_id,new.account_kind) then
      return null;
    end if;
    v_source:=case when tg_op='DELETE' then old.id else new.id end;
    if not exists(select 1 from core_v1.social_accounts where source_connection_id=v_source) then
      return null;
    end if;
  elsif tg_table_name='users' then
    if old.banned is not distinct from new.banned or
      not exists(select 1 from core_v1.creators where user_id=new.id) then return null; end if;
  end if;
  update core_v1.projection_clock set revision=revision+1 where singleton=true;
  return null;
end $$;
create trigger core_proof_revision after update or delete on public.social_connections
  for each row execute function core_v1.advance_external_revision();
create trigger core_ban_revision after update of banned on public.users
  for each row execute function core_v1.advance_external_revision();

-- Registration is explicit. It never copies an old profile or promo balance.
create function public.core_v1_register(
  p_user uuid,p_name text,p_country text,p_publish boolean,p_adult boolean,
  p_rules_version text
) returns uuid language plpgsql security definer
set search_path=pg_catalog,public,core_v1,pg_temp as $$
declare v_id uuid;
begin
  perform 1 from public.users where id=p_user and not banned for share;
  if p_adult is distinct from true or p_publish is null or
     p_rules_version is distinct from '2026-10-03.1' or
     p_name is null or length(btrim(p_name)) not between 2 and 80 or
     (p_country is not null and p_country !~ '^[A-Z]{2}$') or
     not exists(select 1 from public.users where id=p_user and not banned) then
    raise exception 'Invalid creator registration';
  end if;
  insert into core_v1.creators(user_id,display_name,country,publish_requested,accepted_rules_version)
    values(p_user,btrim(p_name),p_country,p_publish,p_rules_version)
    on conflict(user_id) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from core_v1.creators where user_id=p_user and erased_at is null;
    if v_id is null then raise exception 'Creator unavailable'; end if;
  end if;
  return v_id;
end $$;

-- The source is a server-verified OAuth connection. No supplied URL, subject,
-- screenshot or owner assertion is accepted as proof. Reconnects keep old FC.
create function public.core_v1_attach_verified(p_user uuid,p_connection uuid,p_category text default null)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,core_v1,pg_temp as $$
declare v_creator core_v1.creators%rowtype; v_connection public.social_connections%rowtype;
  v_account core_v1.social_accounts%rowtype; v_provider text; v_new boolean:=false;
  v_granted boolean:=false; v_now timestamptz:=clock_timestamp();
begin
  perform 1 from public.users where id=p_user and not banned for share;
  if not found then raise exception 'Active account required'; end if;
  select * into v_creator from core_v1.creators
    where user_id=p_user and erased_at is null for update;
  if not found or not exists(select 1 from public.users where id=p_user and not banned) then
    raise exception 'Creator registration required';
  end if;
  select * into v_connection from public.social_connections
    where id=p_connection and user_id=p_user and status='verified'
      and method in ('youtube_oauth','provider_oauth') and remote_id is not null
      and coalesce(account_kind,'')<>'facebook_page'
      and length(btrim(remote_id))>0 for update;
  if not found then raise exception 'Verified OAuth connection required'; end if;
  v_provider:=lower(v_connection.platform);
  if v_provider not in ('facebook','twitch','x','youtube') then
    raise exception 'Unsupported provider';
  end if;
  if p_category is not null and not exists(select 1 from public.categories where id=p_category) then
    raise exception 'Invalid category';
  end if;
  select * into v_account from core_v1.social_accounts
    where provider=v_provider and subject=v_connection.remote_id for update;
  if found then
    if v_account.creator_id<>v_creator.id then raise exception 'Social identity already claimed'; end if;
    update core_v1.social_accounts set source_connection_id=v_connection.id,
      social_url=v_connection.social_url,label=v_connection.label,
      category_id=coalesce(p_category,category_id) where id=v_account.id;
  else
    insert into core_v1.social_accounts
      (creator_id,provider,subject,source_connection_id,social_url,label,category_id,first_attached_at)
      values(v_creator.id,v_provider,v_connection.remote_id,v_connection.id,
        v_connection.social_url,v_connection.label,p_category,v_now)
      returning * into v_account;
    v_new:=true;
    if (select count(*) from core_v1.fc_grants where creator_id=v_creator.id and kind='welcome')<10 then
      insert into core_v1.fc_grants(creator_id,social_account_id,kind,amount_fc,granted_at)
        values(v_creator.id,v_account.id,'welcome',1,v_now);
      v_granted:=true;
    end if;
    update core_v1.creators set first_verified_at=coalesce(first_verified_at,v_now)
      where id=v_creator.id;
  end if;
  return jsonb_build_object('creator_id',v_creator.id,'account_id',v_account.id,
    'new_account',v_new,'welcome_granted',v_granted,'launch_granted',false);
end $$;

create function public.core_v1_set_publication(p_user uuid,p_publish boolean)
returns boolean language plpgsql security definer
set search_path=pg_catalog,public,core_v1,pg_temp as $$
begin
  if p_publish is null then raise exception 'Explicit publication choice required'; end if;
  perform 1 from public.users where id=p_user and not banned for share;
  if not found then raise exception 'Active account required'; end if;
  update core_v1.creators set publish_requested=p_publish
    where user_id=p_user and erased_at is null and publish_requested is distinct from p_publish
      and exists(select 1 from public.users where id=p_user and not banned);
  if found then return true; end if;
  perform 1 from core_v1.creators where user_id=p_user and erased_at is null
    and exists(select 1 from public.users where id=p_user and not banned);
  if not found then raise exception 'Creator unavailable'; end if;
  return false;
end $$;

-- A current verified OAuth connection is required on every read. Disconnecting
-- it hides the account/profile without erasing an already awarded FC grant.
create function public.core_v1_board(p_period text default 'all_time') returns jsonb
language plpgsql stable security definer
set search_path=pg_catalog,public,core_v1,pg_temp as $$
declare v_start timestamptz; v_as_of timestamptz:=statement_timestamp(); v_rows jsonb;
begin
  if p_period='daily' then
    v_start:=date_trunc('day',v_as_of at time zone 'UTC') at time zone 'UTC';
  elsif p_period='weekly' then
    v_start:=date_trunc('week',v_as_of at time zone 'UTC') at time zone 'UTC';
  elsif p_period is distinct from 'all_time' then
    raise exception 'Unsupported period';
  end if;
  with active_accounts as (
    select a.creator_id,a.provider,a.social_url,a.label,a.category_id
      from core_v1.social_accounts a
      join public.social_connections s on s.id=a.source_connection_id
        and s.status='verified' and s.method in ('youtube_oauth','provider_oauth')
        and coalesce(s.account_kind,'')<>'facebook_page'
        and s.remote_id=a.subject and lower(s.platform)=a.provider
        and s.user_id=(select c.user_id from core_v1.creators c where c.id=a.creator_id)
  ), eligible as (
    select c.id,c.display_name,c.country from core_v1.creators c
      where c.publish_requested and c.moderation_allowed and c.erased_at is null
        and exists(select 1 from public.users u where u.id=c.user_id and not u.banned)
        and exists(select 1 from active_accounts a where a.creator_id=c.id)
  ), scored as (
    select e.id,e.display_name,e.country,
      coalesce(sum(g.amount_fc),0)::integer as fc,
      max(g.granted_at) as attained_at,
      (select coalesce(jsonb_agg(jsonb_build_object('provider',a.provider,
        'label',a.label,'url',a.social_url,'category',a.category_id)
        order by a.provider,a.label),'[]'::jsonb)
        from active_accounts a where a.creator_id=e.id) as accounts
    from eligible e left join core_v1.fc_grants g on g.creator_id=e.id
      and (v_start is null or g.granted_at>=v_start) and g.granted_at<=v_as_of
    group by e.id,e.display_name,e.country
  ), ranked as (
    select row_number() over(order by fc desc,attained_at asc,id asc) as rank,
      id,display_name,country,fc,attained_at,accounts
    from scored where fc>0
  )
  select coalesce(jsonb_agg(jsonb_build_object('rank',rank,'creator_id',id,
    'display_name',display_name,'country',country,'accounts',accounts,
    'cash_usd_minor',0,'fc',fc,'combined_usd_minor',fc*100,
    'attained_at',to_char(attained_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
    order by rank),'[]'::jsonb) into v_rows from ranked;
  return jsonb_build_object('rules_version','2026-10-03.1','period',p_period,
    'period_start',case when v_start is null then null else
      to_char(v_start at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
    'as_of',to_char(v_as_of at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'projection_revision',(select revision from core_v1.projection_clock where singleton=true),
    'rows',v_rows);
end $$;

create function public.core_v1_owner(p_user uuid) returns jsonb
language sql stable security definer
set search_path=pg_catalog,public,core_v1,pg_temp as $$
  select coalesce((select jsonb_build_object('creator_id',c.id,'display_name',c.display_name,
    'country',c.country,'publish_requested',c.publish_requested,
    'fc',coalesce((select sum(g.amount_fc) from core_v1.fc_grants g where g.creator_id=c.id),0),
    'accounts',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,
      'provider',a.provider,'label',a.label,'url',a.social_url,'category',a.category_id,
      'active',exists(select 1 from public.social_connections s
        where s.id=a.source_connection_id and s.status='verified'
          and s.method in ('youtube_oauth','provider_oauth')
          and coalesce(s.account_kind,'')<>'facebook_page'
          and lower(s.platform)=a.provider and s.remote_id=a.subject and s.user_id=p_user)))
      from core_v1.social_accounts a where a.creator_id=c.id),'[]'::jsonb))
    from core_v1.creators c where c.user_id=p_user and c.erased_at is null),'null'::jsonb);
$$;

create function public.core_v1_export(p_user uuid) returns jsonb
language sql stable security definer
set search_path=pg_catalog,public,core_v1,pg_temp as $$
  select coalesce((select jsonb_build_object(
    'creator_id',c.id,'display_name',c.display_name,'country',c.country,
    'publish_requested',c.publish_requested,'created_at',c.created_at,
    'accepted_rules_version',c.accepted_rules_version,'accepted_at',c.accepted_at,
    'accounts',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'provider',a.provider,'subject',a.subject,'social_url',a.social_url,
      'label',a.label,'category_id',a.category_id,'first_attached_at',a.first_attached_at))
      from core_v1.social_accounts a where a.creator_id=c.id),'[]'::jsonb),
    'fc_grants',coalesce((select jsonb_agg(jsonb_build_object(
      'kind',g.kind,'amount_fc',g.amount_fc,'granted_at',g.granted_at))
      from core_v1.fc_grants g where g.creator_id=c.id),'[]'::jsonb))
    from core_v1.creators c where c.user_id=p_user and c.erased_at is null),'null'::jsonb);
$$;

-- Legacy account-erasure preparation is still the entrypoint for account
-- removal. Hide and minimize new-core data in that same transaction. No
-- historical payment data is present in this phase.
create function core_v1.prepare_erasure() returns trigger language plpgsql
security definer set search_path=pg_catalog,public,core_v1,pg_temp as $$
declare v_creator uuid;
begin
  if old.prepared_at is not null or new.prepared_at is null then return null; end if;
  delete from core_v1.action_limits where user_id=new.user_id;
  delete from core_v1.rights_limits where user_id=new.user_id;
  select id into v_creator from core_v1.creators where user_id=new.user_id for update;
  if v_creator is null then return null; end if;
  update core_v1.creators set erased_at=clock_timestamp(),publish_requested=false,
    display_name='Odstraněný profil',country=null where id=v_creator;
  delete from core_v1.fc_grants where creator_id=v_creator;
  delete from core_v1.social_accounts where creator_id=v_creator;
  return null;
end $$;
create trigger core_v1_on_erasure after update of prepared_at on public.deletion_requests
  for each row execute function core_v1.prepare_erasure();

alter default privileges in schema core_v1 revoke execute on functions from public;
revoke all on all tables in schema core_v1 from public,anon,authenticated,service_role;
revoke all on all functions in schema core_v1 from public,anon,authenticated,service_role;
revoke all on function public.core_v1_register(uuid,text,text,boolean,boolean,text),
  public.core_v1_attach_verified(uuid,uuid,text),public.core_v1_set_publication(uuid,boolean),
  public.core_v1_board(text),public.core_v1_owner(uuid),public.core_v1_export(uuid),
  public.core_v1_consume_action(uuid),public.core_v1_consume_right(uuid,text),
  public.core_v1_prune_limits(),public.core_v1_before_user_created(jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.core_v1_register(uuid,text,text,boolean,boolean,text),
  public.core_v1_attach_verified(uuid,uuid,text),public.core_v1_set_publication(uuid,boolean),
  public.core_v1_board(text),public.core_v1_owner(uuid),public.core_v1_export(uuid),
  public.core_v1_consume_action(uuid),public.core_v1_consume_right(uuid,text),
  public.core_v1_prune_limits() to service_role;
do $$begin
  if exists(select 1 from pg_roles where rolname='supabase_auth_admin') then
    grant execute on function public.core_v1_before_user_created(jsonb) to supabase_auth_admin;
  end if;
end $$;
notify pgrst,'reload schema';
commit;
