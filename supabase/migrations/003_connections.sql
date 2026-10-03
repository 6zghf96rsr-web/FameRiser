begin;
alter table public.social_platforms add constraint social_platforms_name_unique unique(name);
create table public.social_connections (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.users(id) on delete cascade,
 platform text not null references public.social_platforms(name),
 social_url text not null check (char_length(social_url) between 10 and 500),
 label text not null check (char_length(label) between 1 and 200),
 status text not null default 'unverified' check(status in ('unverified','pending','verified')),
 method text check(method in ('bio','youtube_oauth')),
 remote_id text,
 verified_at timestamptz,
 created_at timestamptz not null default now(),
 unique(user_id,platform,social_url),
 check ((status='verified') = (verified_at is not null))
);
create unique index one_verified_social_owner on public.social_connections(platform,social_url) where status='verified';
create table public.connection_challenges (
 id uuid primary key default gen_random_uuid(),
 connection_id uuid not null references public.social_connections(id) on delete cascade,
 user_id uuid not null references public.users(id) on delete cascade,
 social_url text not null,
 code text not null default ('rankme-'||replace(gen_random_uuid()::text,'-','')),
 status text not null default 'pending' check(status in ('pending','submitted','approved','rejected','expired')),
 expires_at timestamptz not null default (now()+interval '72 hours'),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz, reviewed_by uuid references public.users(id) on delete set null,
 review_note text
);
create unique index one_open_connection_challenge on public.connection_challenges(connection_id) where status in ('pending','submitted');
create table public.social_oauth_states (
 state_hash text primary key, user_id uuid not null references public.users(id) on delete cascade,
 verifier text not null, expires_at timestamptz not null default(now()+interval '10 minutes')
);
do $$declare t text;begin foreach t in array array['social_connections','connection_challenges','social_oauth_states'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
end loop;end$$;

-- Profile badges are derived from proof for the same owner and address.
create function public.profile_connection_badge() returns trigger language plpgsql security definer set search_path=public as $$begin
 new.verified := exists(select 1 from social_connections c join social_platforms s on s.name=c.platform
  where c.user_id=new.user_id and c.status='verified' and c.social_url=new.social_url and s.id=new.social_platform_id);
 return new;
end;$$;
create trigger profile_connection_badge before insert or update of social_url,social_platform_id,user_id,verified on public.profiles for each row execute function public.profile_connection_badge();
create function public.sync_connection_badges() returns trigger language plpgsql security definer set search_path=public as $$begin
 if TG_OP<>'INSERT' then update profiles set verified=false where user_id=old.user_id and social_url=old.social_url;end if;
 if TG_OP<>'DELETE' then update profiles set verified=(new.status='verified') where user_id=new.user_id and social_url=new.social_url;end if;
 return null;
end;$$;
create trigger sync_connection_badges after insert or update or delete on public.social_connections for each row execute function public.sync_connection_badges();

create function public.connection_action(p_user uuid,p_action text,p_id uuid default null,p_value jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public as $$
declare c social_connections; ch connection_challenges;begin
 if not exists(select 1 from users where id=p_user and not banned) then raise exception 'Forbidden';end if;
 perform pg_advisory_xact_lock(81482027);
 if p_action in ('approve','reject') then
  if not exists(select 1 from users where id=p_user and role='admin' and not banned) then raise exception 'Forbidden';end if;
  select * into ch from connection_challenges where id=p_id for update;
  if not found or ch.status<>'submitted' or ch.expires_at<=now() then raise exception 'Challenge unavailable';end if;
  select * into c from social_connections where id=ch.connection_id for update;
  if not found or c.social_url<>ch.social_url or c.user_id<>ch.user_id or not exists(select 1 from users where id=c.user_id and not banned) then raise exception 'Account changed';end if;
  if p_action='approve' and (p_value->>'code_seen') is distinct from ch.code then raise exception 'Check the exact code on the external profile';end if;
  update connection_challenges set status=case when p_action='approve' then 'approved' else 'rejected' end,reviewed_at=now(),reviewed_by=p_user,review_note=left(p_value->>'note',500) where id=ch.id;
  update social_connections set status=case when p_action='approve' then 'verified' else 'unverified' end,method=case when p_action='approve' then 'bio' else null end,verified_at=case when p_action='approve' then now() else null end where id=c.id;
  insert into admin_actions(admin_id,action,target_id,payload) values(p_user,'connection_'||p_action,c.id::text,jsonb_build_object('challenge_id',ch.id,'note',left(p_value->>'note',500)));
  return jsonb_build_object('ok',true);
 end if;
 select * into c from social_connections where id=p_id and user_id=p_user for update;
 if not found then raise exception 'Connection not found';end if;
 if p_action='disconnect' then
  delete from social_connections where id=c.id;
  return jsonb_build_object('ok',true);
 elsif p_action='challenge' then
  if c.status='verified' then raise exception 'Already verified';end if;
  update connection_challenges set status='expired' where connection_id=c.id and status in ('pending','submitted') and expires_at<=now();
  select * into ch from connection_challenges where connection_id=c.id and status in ('pending','submitted');
  if not found then insert into connection_challenges(connection_id,user_id,social_url) values(c.id,p_user,c.social_url) returning * into ch;end if;
  update social_connections set status='pending' where id=c.id;
  return to_jsonb(ch);
 elsif p_action='submit' then
  update connection_challenges set status='submitted' where connection_id=c.id and user_id=p_user and social_url=c.social_url and status in ('pending','submitted') and expires_at>now() returning * into ch;
  if not found then raise exception 'Challenge expired';end if;
  return to_jsonb(ch);
 end if;
 raise exception 'Unknown action';
end;$$;

create function public.consume_social_oauth(p_hash text,p_user uuid) returns text language plpgsql security definer set search_path=public as $$declare v text;begin
 if not exists(select 1 from users where id=p_user and not banned) then raise exception 'Forbidden';end if;
 delete from social_oauth_states where state_hash=p_hash and user_id=p_user and expires_at>now() returning verifier into v;
 if v is null then raise exception 'Invalid or expired state';end if;
 return v;
end;$$;

-- Only the server calls this after Google's channels.list(mine=true) succeeds.
create function public.verify_youtube_connections(p_user uuid,p_channels jsonb) returns void language plpgsql security definer set search_path=public as $$declare item jsonb; c_id uuid;begin
 if not exists(select 1 from users where id=p_user and not banned) then raise exception 'Forbidden';end if;
 if jsonb_typeof(p_channels)<>'array' or jsonb_array_length(p_channels) not between 1 and 50 then raise exception 'Invalid channels';end if;
 perform pg_advisory_xact_lock(81482027);
 for item in select * from jsonb_array_elements(p_channels) loop
  if (item->>'remote_id') !~ '^UC[A-Za-z0-9_-]{22}$' or (item->>'social_url') is distinct from 'https://youtube.com/channel/'||(item->>'remote_id') then raise exception 'Invalid channel';end if;
  insert into social_connections(user_id,platform,social_url,label,status,method,remote_id,verified_at)
  values(p_user,'YouTube',item->>'social_url',item->>'label','verified','youtube_oauth',item->>'remote_id',now())
  on conflict(user_id,platform,social_url) do update set label=excluded.label,status='verified',method='youtube_oauth',remote_id=excluded.remote_id,verified_at=now() returning id into c_id;
  update connection_challenges set status='expired' where connection_id=c_id and status in ('pending','submitted');
 end loop;
end;$$;

-- Retire legacy requests lacking an address snapshot or expiry.
update verification_requests set status='expired' where status='pending';
update profiles set verified=false where verified and not demo;
revoke all on function public.profile_connection_badge(),public.sync_connection_badges(),public.connection_action(uuid,text,uuid,jsonb),public.consume_social_oauth(text,uuid),public.verify_youtube_connections(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.connection_action(uuid,text,uuid,jsonb),public.consume_social_oauth(text,uuid),public.verify_youtube_connections(uuid,jsonb) to service_role;
commit;
