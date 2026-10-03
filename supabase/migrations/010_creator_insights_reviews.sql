begin;
-- Only aggregate sums are public; payment records and their real-time deltas stay private.
revoke select on public.activity from anon,authenticated;
create table public.profile_traffic (
 id bigint generated always as identity primary key,
 profile_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in ('leaderboard_page_view','impression','profile_detail_view','outbound_click')),
 event_id uuid not null,visitor_hash text not null,source text not null default 'profile',
 created_at timestamptz not null default now(),
 unique(profile_id,visitor_hash,kind,event_id)
);
create index profile_traffic_summary on public.profile_traffic(profile_id,created_at,kind);
alter table public.profile_traffic enable row level security;
revoke all on public.profile_traffic from anon,authenticated;
grant all on public.profile_traffic to service_role;
grant usage,select on sequence public.profile_traffic_id_seq to service_role;
-- Historical measurements retain their old once-per-day granularity.
insert into profile_traffic(profile_id,kind,event_id,visitor_hash,created_at) select profile_id,kind,gen_random_uuid(),visitor_hash,created_at from profile_views;
insert into profile_traffic(profile_id,kind,event_id,visitor_hash,created_at) select profile_id,'outbound_click',gen_random_uuid(),visitor_hash,created_at from outbound_clicks;
create or replace function public.get_leaderboard_discovery() returns setof jsonb language sql stable security definer set search_path=public as $$
 select to_jsonb(b) || jsonb_build_object('language',p.language,'country',p.country,'region',p.region,'social_bio',coalesce(c.social_bio,''),'avatar_url',coalesce(p.avatar_url,c.avatar_url),
 'views',(select count(*) from profile_traffic where profile_id=p.id and kind='impression'),'clicks',(select count(*) from profile_traffic where profile_id=p.id and kind='outbound_click'),'week_paid',coalesce(w.amount,0),'week_reached_at',w.reached,'month_paid',coalesce(m.amount,0),'month_reached_at',m.reached)
 from get_leaderboard() b join profiles p on p.id=b.id
 left join social_connections c on c.user_id=p.user_id and c.platform=b.platform and c.social_url=p.social_url and c.status='verified'
 left join lateral (select sum(amount-refunded_amount) amount,max(paid_at) reached from payments where profile_id=p.id and status in ('paid','partially_refunded') and amount>refunded_amount and paid_at>now()-interval '7 days') w on true
 left join lateral (select sum(amount-refunded_amount) amount,max(paid_at) reached from payments where profile_id=p.id and status in ('paid','partially_refunded') and amount>refunded_amount and paid_at>now()-interval '30 days') m on true
 order by b.total_paid desc,b.reached_amount_at,b.id;
$$;
create function public.creator_insights(p_user uuid,p_days integer default 30) returns jsonb language plpgsql stable security definer set search_path=public as $$declare result jsonb;begin
 if not exists(select 1 from users where id=p_user and not banned) or p_days not in (0,1,7,30) or p_days is null then raise exception 'Forbidden';end if;
 select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) into result from (
 select p.id profile_id,
 count(t.id) filter(where kind='leaderboard_page_view') board_views,
 count(t.id) filter(where kind='impression') impressions,
 count(t.id) filter(where kind='profile_detail_view') detail_views,
 count(t.id) filter(where kind='outbound_click') clicks,
 count(distinct t.visitor_hash) filter(where kind='outbound_click') daily_clickers,
 (select coalesce(jsonb_agg(to_jsonb(d) order by d.day),'[]'::jsonb) from
   (select (created_at at time zone 'UTC')::date as day,count(*) filter(where kind='impression') impressions,count(*) filter(where kind='outbound_click') clicks
    from profile_traffic where profile_id=p.id and created_at>=now()-interval '30 days' group by 1) d) daily
 from profiles p left join profile_traffic t on t.profile_id=p.id and (p_days=0 or t.created_at>now()-make_interval(days=>p_days))
 where p.user_id=p_user and p.total_paid>0 and not p.demo and p.status<>'deleted' group by p.id
 ) s;
 return jsonb_build_object('profiles',result,'days',p_days,'as_of',now());
end;$$;
revoke all on function public.creator_insights(uuid,integer) from public,anon,authenticated;
grant execute on function public.creator_insights(uuid,integer) to service_role;

create table public.profile_reviews (
 id uuid primary key default gen_random_uuid(),profile_id uuid not null references public.profiles(id) on delete cascade,
 user_id uuid not null references public.users(id) on delete cascade,
 author_name text not null check(char_length(btrim(author_name)) between 2 and 60),
 body text not null check(char_length(btrim(body)) between 10 and 2000),score smallint check(score between 1 and 5),
 status text not null default 'pending' check(status in ('pending','published','hidden')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(profile_id,user_id)
);
create index profile_reviews_public on public.profile_reviews(profile_id,created_at desc,id);
alter table public.profile_reviews enable row level security;
revoke all on public.profile_reviews from anon,authenticated;
grant all on public.profile_reviews to service_role;
alter table public.reports add column review_id uuid references public.profile_reviews(id) on delete set null;
create function public.get_profile_reviews(p_profile uuid,p_user uuid default null,p_page integer default 1) returns jsonb language plpgsql stable security definer set search_path=public as $$declare result jsonb; mine jsonb; own boolean; can_write boolean; n bigint; stars bigint; avg_score numeric;begin
 if not is_public_profile(p_profile) then raise exception 'Profile not public';end if;
 if p_page is null or p_page not between 1 and 100000 then raise exception 'Invalid page';end if;
 select count(*),count(r.score),round(avg(r.score),1) into n,stars,avg_score from profile_reviews r join users u on u.id=r.user_id where r.profile_id=p_profile and r.status='published' and not u.banned;
 select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) into result from
 (select r.id,r.author_name,r.body,r.score,r.created_at,r.updated_at from profile_reviews r join users u on u.id=r.user_id where r.profile_id=p_profile and r.status='published' and not u.banned order by r.created_at desc,r.id limit 20 offset (p_page-1)*20) s;
 select jsonb_build_object('id',id,'author_name',author_name,'body',body,'score',score,'status',status) into mine from profile_reviews where profile_id=p_profile and user_id=p_user;
 select user_id=p_user into own from profiles where id=p_profile;
 can_write:=p_user is not null and not coalesce(own,false) and exists(select 1 from users where id=p_user and not banned);
 return jsonb_build_object('items',result,'count',n,'rated_count',stars,'average',avg_score,'mine',mine,'can_write',can_write,'is_owner',coalesce(own,false),'signed_in',p_user is not null,'page',p_page);
end;$$;
create function public.save_profile_review(p_user uuid,p_profile uuid,p_author text,p_body text,p_score integer) returns jsonb language plpgsql security definer set search_path=public as $$begin
 if not exists(select 1 from users where id=p_user and not banned) then raise exception 'Forbidden';end if;
 if p_body is null then delete from profile_reviews where user_id=p_user and profile_id=p_profile;return jsonb_build_object('deleted',true);end if;
 if not is_public_profile(p_profile) or exists(select 1 from profiles where id=p_profile and user_id=p_user) then raise exception 'Profile not eligible';end if;
 insert into profile_reviews(user_id,profile_id,author_name,body,score) values(p_user,p_profile,btrim(p_author),btrim(p_body),p_score)
 on conflict(profile_id,user_id) do update set author_name=excluded.author_name,body=excluded.body,score=excluded.score,status='pending',updated_at=now();
 return get_profile_reviews(p_profile,p_user,1);
end;$$;
create function public.moderate_profile_review(p_admin uuid,p_review uuid,p_status text) returns void language plpgsql security definer set search_path=public as $$begin
 if not exists(select 1 from users where id=p_admin and role='admin' and not banned) or p_status is null or p_status not in ('published','hidden') then raise exception 'Forbidden';end if;
 update profile_reviews set status=p_status where id=p_review;
 if not found then raise exception 'Review not found';end if;
 insert into admin_actions(admin_id,action,target_id,payload) values(p_admin,'review_moderation',p_review::text,jsonb_build_object('status',p_status));
end;$$;
revoke all on function public.get_profile_reviews(uuid,uuid,integer),public.save_profile_review(uuid,uuid,text,text,integer),public.moderate_profile_review(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.get_profile_reviews(uuid,uuid,integer),public.save_profile_review(uuid,uuid,text,text,integer),public.moderate_profile_review(uuid,uuid,text) to service_role;
create function public.record_profile_traffic(p_user uuid,p_ids uuid[],p_kind text,p_event uuid,p_hash text,p_source text) returns bigint language plpgsql security definer set search_path=public as $$declare n bigint;begin
 if cardinality(p_ids) not between 1 and 50 or p_event is null or p_hash is null or length(p_hash)<>64 or p_kind not in ('leaderboard_page_view','impression','profile_detail_view') or p_kind is null or p_source not in ('all','profile','Instagram','Facebook','TikTok','YouTube','Twitch','X') or p_source is null then raise exception 'Invalid event';end if;
 insert into profile_traffic(profile_id,kind,event_id,visitor_hash,source)
 select p.id,p_kind,p_event,p_hash,p_source from profiles p join social_platforms s on s.id=p.social_platform_id
 where p.id=any(p_ids) and is_public_profile(p.id) and (p_user is null or p.user_id is distinct from p_user) and (p_source in ('all','profile') or s.name=p_source)
 on conflict(profile_id,visitor_hash,kind,event_id) do nothing;
 get diagnostics n=row_count;return n;
end;$$;
revoke all on function public.record_profile_traffic(uuid,uuid[],text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.record_profile_traffic(uuid,uuid[],text,uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;
