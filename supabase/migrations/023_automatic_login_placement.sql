begin;
-- Trusted social sign-in creates the profile without inventing checkbox consents.
alter table public.profiles add column login_connection_id uuid unique references public.social_connections(id) on delete set null;
alter table public.profiles alter column ownership_confirmed_at drop not null;
alter table public.profiles alter column privacy_accepted_at drop not null;
create function public.profile_publication_allowed(p_profile uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from profiles p where p.id=p_profile and (
  (p.publication_consent->'public'='true'::jsonb and p.non_political_confirmed_at is not null)
  or (exists(select 1 from social_connections c join social_platforms s on s.name=c.platform where c.id=p.login_connection_id and c.user_id=p.user_id and c.social_url=p.social_url and s.id=p.social_platform_id and c.status='verified' and c.method='provider_oauth')
   and exists(select 1 from account_acceptances a where a.user_id=p.user_id and a.adult))
 ));
$$;
revoke all on function public.profile_publication_allowed(uuid) from public,anon,authenticated;
grant execute on function public.profile_publication_allowed(uuid) to service_role;
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.claim_promo_placement(uuid,uuid)'::regprocedure);
 if position('if p.publication_consent' in definition)=0 then raise exception 'Unexpected promo function';end if;
 definition:=replace(definition,'if p.publication_consent->''public'' is distinct from ''true''::jsonb or p.non_political_confirmed_at is null then','if not profile_publication_allowed(p.id) then');
 execute definition;
end;$$;
create or replace function public.auto_promo_placement() returns trigger language plpgsql security definer set search_path=public as $$begin
 if new.verified and not new.demo and new.status='pending_payment' and profile_publication_allowed(new.id) and exists(select 1 from app_settings where key='public' and value->'promo_enabled'='true'::jsonb) then
  begin perform claim_promo_placement(new.user_id,new.id);
  exception when raise_exception then
   if sqlerrm not in ('Promo is full','Promo already used','Profile already paid','Promo is not active') then raise;end if;
  end;
 end if;
 return null;
end;$$;
drop trigger auto_promo_placement on public.profiles;
create trigger auto_promo_placement after insert or update of verified,publication_consent,non_political_confirmed_at,login_connection_id on public.profiles for each row execute function public.auto_promo_placement();
-- Service-only: called immediately after the provider response matches auth identity.
create function public.activate_login_profile(p_user uuid,p_connection uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare c social_connections; pid uuid; network text;begin
 perform pg_advisory_xact_lock(81482027);
 select * into c from social_connections where id=p_connection and user_id=p_user and status='verified' and method='provider_oauth' and remote_id is not null;
 if not found or not exists(select 1 from users where id=p_user and not banned) then raise exception 'Verified login required';end if;
 select id into network from social_platforms where name=c.platform and active;
 if network is null then raise exception 'Network inactive';end if;
 select id into pid from profiles where user_id=p_user and (login_connection_id=c.id or (social_platform_id=network and social_url=c.social_url)) order by created_at,id limit 1;
 if found then
  -- Never overwrite edited content or reactivate a hidden, deleted or moderated profile.
  update profiles set login_connection_id=c.id where id=pid and login_connection_id is null and status='pending_payment';
  return pid;
 end if;
 pid:=gen_random_uuid();
 insert into profiles(id,user_id,name,username,slug,avatar_url,social_url,social_platform_id,category_id,login_connection_id,ownership_confirmed_at,privacy_accepted_at)
 values(pid,p_user,case when length(c.label)>=2 then left(c.label,60) else c.platform||' profil' end,left(c.label,50),lower(c.platform)||'-'||pid::text,c.avatar_url,c.social_url,network,'creators',c.id,null,null);
 return pid;
end;$$;
revoke all on function public.activate_login_profile(uuid,uuid) from public,anon,authenticated;
grant execute on function public.activate_login_profile(uuid,uuid) to service_role;
-- Existing account age/terms confirmation remains part of registration, not a profile wizard.
create function public.complete_login_placements() returns trigger language plpgsql security definer set search_path=public as $$begin
 update profiles set verified=verified where user_id=new.user_id and login_connection_id is not null and status='pending_payment';
 return null;
end;$$;
create trigger complete_login_placements after insert or update on public.account_acceptances for each row execute function public.complete_login_placements();
-- Amount first; equal amounts use first registration, never the last login or payment time.
alter function public.get_commerce_board() rename to get_credit_commerce_board;
create function public.get_commerce_board() returns setof jsonb language sql stable security definer set search_path=public as $$
 select b||jsonb_build_object('registration_at',u.created_at) from get_credit_commerce_board() b join profiles p on p.id=(b->>'id')::uuid join users u on u.id=p.user_id order by b->>'id';
$$;
revoke all on function public.get_commerce_board() from public,anon,authenticated;
grant execute on function public.get_commerce_board() to service_role;
notify pgrst,'reload schema';
commit;
