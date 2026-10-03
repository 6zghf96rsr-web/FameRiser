-- Facebook returns opaque app-scoped links as well as numeric/profile-name links.
-- Ownership still requires the server-verified numeric identity and service-role RPC.
begin;

create or replace function public.verify_provider_connection(p_user uuid,p_platform text,p_remote_id text,p_url text,p_label text,p_avatar text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare c_id uuid;begin
 perform pg_advisory_xact_lock(81482027);
 if not exists(select 1 from users where id=p_user and not banned) or not exists(select 1 from social_platforms where name=p_platform and active) then raise exception 'Forbidden';end if;
 if p_platform not in ('Facebook','Twitch','X') or p_remote_id is null or p_remote_id !~ '^[0-9]{1,40}$' or (p_url is null or length(p_url)>500) or p_label is null or length(p_label) not between 1 and 200 then raise exception 'Invalid provider account';end if;
 if (p_platform='Facebook' and p_url !~ '^https://facebook[.]com/(app_scoped_user_id/[A-Za-z0-9_-]+|people/[^/[:space:]?#]+/[0-9]{1,40}|[A-Za-z0-9_.-]+|profile[.]php[?]id=[0-9]+)$') or (p_platform='Twitch' and p_url !~ '^https://twitch[.]tv/[a-z0-9_]{1,25}$') or (p_platform='X' and p_url !~ '^https://x[.]com/[a-z0-9_]{1,15}$') then raise exception 'Invalid provider URL';end if;
 if exists(select 1 from social_connections where platform=p_platform and remote_id=p_remote_id and user_id<>p_user and status='verified') then raise exception 'Account already connected';end if;
 select id into c_id from social_connections where platform=p_platform and remote_id=p_remote_id and user_id=p_user;
 if found then
  -- A URL change invalidates the old profile via the existing badge trigger.
  update social_connections set social_url=p_url,label=p_label,avatar_url=p_avatar,status='verified',method='provider_oauth',verified_at=now() where id=c_id;
 else
  insert into social_connections(user_id,platform,social_url,label,status,method,remote_id,verified_at,avatar_url) values(p_user,p_platform,p_url,p_label,'verified','provider_oauth',p_remote_id,now(),p_avatar)
  on conflict(user_id,platform,social_url) do update set label=excluded.label,status='verified',method='provider_oauth',remote_id=excluded.remote_id,verified_at=now(),avatar_url=excluded.avatar_url returning id into c_id;
 end if;
 return c_id;
end;$$;
revoke all on function public.verify_provider_connection(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.verify_provider_connection(uuid,text,text,text,text,text) to service_role;

notify pgrst,'reload schema';
commit;
