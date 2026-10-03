begin;
-- A shared, monotonic quota. Deleted admissions never return capacity.
alter table public.promo_admissions drop constraint promo_admissions_slot_check;
alter table public.promo_admissions drop constraint promo_admissions_social_platform_id_slot_key;
alter table public.promo_admissions drop constraint promo_admissions_user_id_social_platform_id_key;
with numbered as (select id,row_number() over(order by granted_at,id)::integer n from public.promo_admissions)
update public.promo_admissions a set slot=n.n from numbered n where a.id=n.id;
alter table public.promo_admissions add constraint promo_admissions_slot_check check(slot between 1 and 1000);
alter table public.promo_admissions add constraint promo_global_slot unique(slot);
alter table public.promo_admissions add column remote_id text;
update public.promo_admissions a set remote_id=c.remote_id from public.social_connections c join public.social_platforms s on s.name=c.platform where a.social_platform_id=s.id and a.social_url=c.social_url and c.status='verified';
create unique index promo_remote_account on public.promo_admissions(social_platform_id,remote_id) where remote_id is not null;
alter table public.social_connections drop constraint social_connections_method_check;
alter table public.social_connections add constraint social_connections_method_check check(method in ('bio','youtube_oauth','provider_oauth'));
create unique index one_verified_remote_account on public.social_connections(platform,remote_id) where status='verified' and remote_id is not null;
create or replace function public.claim_promo_placement(p_user uuid,p_profile uuid) returns jsonb language plpgsql security definer set search_path=public as $$declare p profiles; a promo_admissions; n integer;begin
 perform pg_advisory_xact_lock(81482026);
 select * into p from profiles where id=p_profile for update;
 if not found or p.user_id is distinct from p_user or p.demo or p.status not in ('active','pending_payment') or not exists(select 1 from users where id=p_user and not banned) then raise exception 'Profile is not eligible';end if;
 if not p.verified or not exists(select 1 from social_connections c join social_platforms s on s.name=c.platform where c.user_id=p_user and c.social_url=p.social_url and s.id=p.social_platform_id and c.status='verified' and s.active) then raise exception 'Profile verification required';end if;
 if p.publication_consent->'public' is distinct from 'true'::jsonb or p.non_political_confirmed_at is null then raise exception 'Publication consent required';end if;
 select * into a from promo_admissions where profile_id=p.id and user_id=p_user and social_platform_id=p.social_platform_id and social_url=p.social_url;
 if not found then
  if not exists(select 1 from app_settings where key='public' and value->'promo_enabled'='true'::jsonb) then raise exception 'Promo is not active';end if;
  if p.total_paid>0 then raise exception 'Profile already paid';end if;
  if exists(select 1 from promo_admissions where profile_id=p.id or (social_platform_id=p.social_platform_id and social_url=p.social_url)) then raise exception 'Promo already used';end if;
  if exists(select 1 from promo_admissions admission join social_connections c on c.remote_id=admission.remote_id and c.platform=(select name from social_platforms where id=admission.social_platform_id) where c.user_id=p_user and c.social_url=p.social_url and c.status='verified') then raise exception 'Promo already used';end if;
  select coalesce(max(slot),0)+1 into n from promo_admissions;
  if n>1000 then raise exception 'Promo is full';end if;
  insert into promo_admissions(profile_id,user_id,social_platform_id,social_url,slot,remote_id) values(p.id,p_user,p.social_platform_id,p.social_url,n,(select remote_id from social_connections where user_id=p_user and social_url=p.social_url and status='verified' and platform=(select name from social_platforms where id=p.social_platform_id))) returning * into a;
 end if;
 update profiles set promo_granted_at=a.granted_at,status='active',reached_amount_at=case when total_paid=0 then a.granted_at else reached_amount_at end,updated_at=now() where id=p.id;
 return jsonb_build_object('id',p.id,'slug',p.slug,'slot',a.slot,'promo_granted_at',a.granted_at);
end;$$;

create or replace function public.has_promo_placement(p_profile uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from profiles p join promo_admissions a on a.profile_id=p.id and a.user_id=p.user_id and a.social_platform_id=p.social_platform_id and a.social_url=p.social_url and a.granted_at=p.promo_granted_at where p.id=p_profile and (a.remote_id is null or exists(select 1 from social_connections c join social_platforms s on s.name=c.platform where c.user_id=p.user_id and c.social_url=p.social_url and s.id=p.social_platform_id and c.remote_id=a.remote_id and c.status='verified')));
$$;

-- Called only with identity and profile data fetched by our server from the provider.
create function public.verify_provider_connection(p_user uuid,p_platform text,p_remote_id text,p_url text,p_label text,p_avatar text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare c_id uuid;begin
 perform pg_advisory_xact_lock(81482027);
 if not exists(select 1 from users where id=p_user and not banned) or not exists(select 1 from social_platforms where name=p_platform and active) then raise exception 'Forbidden';end if;
 if p_platform not in ('Facebook','Twitch','X') or p_remote_id is null or p_remote_id !~ '^[0-9]{1,40}$' or p_url is null or p_label is null or length(p_label) not between 1 and 200 then raise exception 'Invalid provider account';end if;
 if (p_platform='Facebook' and p_url !~ '^https://facebook[.]com/(app_scoped_user_id/[0-9]+|[A-Za-z0-9_.-]+|profile[.]php[?]id=[0-9]+)$') or (p_platform='Twitch' and p_url !~ '^https://twitch[.]tv/[a-z0-9_]{1,25}$') or (p_platform='X' and p_url !~ '^https://x[.]com/[a-z0-9_]{1,15}$') then raise exception 'Invalid provider URL';end if;
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

create function public.auto_promo_placement() returns trigger language plpgsql security definer set search_path=public as $$begin
 if new.verified and not new.demo and new.status='pending_payment' and new.publication_consent->'public'='true'::jsonb and new.non_political_confirmed_at is not null and exists(select 1 from app_settings where key='public' and value->'promo_enabled'='true'::jsonb) then
  begin
   perform claim_promo_placement(new.user_id,new.id);
  exception when raise_exception then
   if sqlerrm not in ('Promo is full','Promo already used','Profile already paid','Promo is not active') then raise;end if;
  end;
 end if;
 return null;
end;$$;
create trigger auto_promo_placement after insert on public.profiles for each row execute function public.auto_promo_placement();
notify pgrst,'reload schema';
commit;
