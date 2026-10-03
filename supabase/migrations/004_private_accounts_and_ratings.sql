begin;
-- Public visibility depends on a confirmed, non-refunded payment for THIS profile.
create function public.is_public_profile(p_profile uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from profiles p where p.id=p_profile and p.status='active' and p.total_paid>0 and not p.demo
 and exists(select 1 from payments pay where pay.profile_id=p.id and pay.status in ('paid','partially_refunded') and pay.amount>pay.refunded_amount));
$$;
-- This public predicate returns only public availability, never private account data.
revoke all on function public.is_public_profile(uuid) from public;
grant execute on function public.is_public_profile(uuid) to anon,authenticated,service_role;

create or replace function public.get_leaderboard() returns table(id uuid,name text,username text,slug text,bio text,avatar_url text,social_url text,platform text,category text,total_paid bigint,reached_amount_at timestamptz,created_at timestamptz,status text,verified boolean,views bigint,clicks bigint,today_paid bigint,today_reached_at timestamptz) language sql stable security definer set search_path=public as $$
 select p.id,p.name,p.username,p.slug,p.bio,p.avatar_url,p.social_url,s.name,c.name,p.total_paid,p.reached_amount_at,p.created_at,p.status,p.verified,
 (select count(*) from profile_views v where v.profile_id=p.id),(select count(*) from outbound_clicks o where o.profile_id=p.id),
 coalesce((select sum(pay.amount-pay.refunded_amount) from payments pay where pay.profile_id=p.id and pay.status in ('paid','partially_refunded') and pay.paid_at>now()-interval '24 hours'),0),
 (select max(pay.paid_at) from payments pay where pay.profile_id=p.id and pay.status in ('paid','partially_refunded') and pay.paid_at>now()-interval '24 hours')
 from profiles p join social_platforms s on s.id=p.social_platform_id join categories c on c.id=p.category_id where is_public_profile(p.id) order by p.total_paid desc,p.reached_amount_at asc,p.id;
$$;
drop policy activity_public on public.activity;
create policy activity_public on public.activity for select using(profile_id is null or is_public_profile(profile_id));

create table public.profile_ratings (
 profile_id uuid not null references public.profiles(id) on delete cascade,
 user_id uuid not null references public.users(id) on delete cascade,
 score smallint not null check(score between 1 and 5),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(profile_id,user_id)
);
alter table public.profile_ratings enable row level security;
revoke all on public.profile_ratings from anon,authenticated;
grant all on public.profile_ratings to service_role;

create function public.get_profile_ratings(p_profile uuid,p_user uuid default null) returns jsonb language plpgsql stable security definer set search_path=public as $$declare n bigint;rating numeric;mine smallint;can_vote boolean;own boolean;begin
 if not is_public_profile(p_profile) then raise exception 'Profile not public';end if;
 select count(*),round(avg(r.score)::numeric,1) into n,rating from profile_ratings r join users u on u.id=r.user_id where r.profile_id=p_profile and not u.banned;
 select score into mine from profile_ratings where profile_id=p_profile and user_id=p_user;
 select user_id=p_user into own from profiles where id=p_profile;
 can_vote:=p_user is not null and not coalesce(own,false) and exists(select 1 from users where id=p_user and not banned);
 return jsonb_build_object('count',n,'average',rating,'mine',mine,'can_rate',can_vote,'is_owner',coalesce(own,false),'signed_in',p_user is not null);
end;$$;

-- Being a payer is deliberately NOT required. One vote per signed-in person/profile.
create function public.set_profile_rating(p_user uuid,p_profile uuid,p_score integer) returns jsonb language plpgsql security definer set search_path=public as $$begin
 perform pg_advisory_xact_lock(81482026);
 if not exists(select 1 from users where id=p_user and not banned) then raise exception 'Forbidden';end if;
 if not is_public_profile(p_profile) then raise exception 'Profile not public';end if;
 if exists(select 1 from profiles where id=p_profile and user_id=p_user) then raise exception 'Cannot rate own profile';end if;
 if p_score is null then delete from profile_ratings where profile_id=p_profile and user_id=p_user;
 elsif p_score between 1 and 5 then insert into profile_ratings(user_id,profile_id,score) values(p_user,p_profile,p_score)
 on conflict(profile_id,user_id) do update set score=excluded.score,updated_at=now();
 else raise exception 'Invalid rating';end if;
 return get_profile_ratings(p_profile,p_user);
end;$$;
revoke all on function public.get_profile_ratings(uuid,uuid),public.set_profile_rating(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.get_profile_ratings(uuid,uuid),public.set_profile_rating(uuid,uuid,integer) to service_role;
commit;
