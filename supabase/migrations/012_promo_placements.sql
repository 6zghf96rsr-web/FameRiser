begin;
-- Promo is a placement entitlement, never a fictitious payment. Activation is explicit.
update public.app_settings set value=value || '{"promo_enabled":false}'::jsonb where key='public';
alter table public.profiles add column promo_granted_at timestamptz;
create table public.promo_admissions (
 id uuid primary key default gen_random_uuid(),
 profile_id uuid unique references public.profiles(id) on delete set null,
 user_id uuid references public.users(id) on delete set null,
 social_platform_id text not null references public.social_platforms(id),
 social_url text not null,
 slot integer not null check(slot between 1 and 100),
 granted_at timestamptz not null default clock_timestamp(),
 unique(social_platform_id,slot),unique(user_id,social_platform_id),unique(social_platform_id,social_url)
);
alter table public.promo_admissions enable row level security;
revoke all on public.promo_admissions from public,anon,authenticated;
grant all on public.promo_admissions to service_role;
create function public.has_promo_placement(p_profile uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from profiles p join promo_admissions a on a.profile_id=p.id and a.user_id=p.user_id and a.social_platform_id=p.social_platform_id and a.social_url=p.social_url and a.granted_at=p.promo_granted_at where p.id=p_profile);
$$;
revoke all on function public.has_promo_placement(uuid) from public,anon,authenticated;
grant execute on function public.has_promo_placement(uuid) to service_role;
create or replace function public.is_public_profile(p_profile uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from profiles p where p.id=p_profile and p.status='active' and p.verified and not p.demo
 and exists(select 1 from users where id=p.user_id and not banned)
 and (has_promo_placement(p.id) or (p.total_paid>0 and exists(select 1 from payments pay where pay.profile_id=p.id and pay.status in ('paid','partially_refunded') and pay.amount>pay.refunded_amount))));
$$;
create function public.clear_changed_promo() returns trigger language plpgsql set search_path=public as $$begin
 if new.user_id is distinct from old.user_id or new.social_url is distinct from old.social_url or new.social_platform_id is distinct from old.social_platform_id then new.promo_granted_at:=null;end if;
 return new;
end;$$;
create trigger clear_changed_promo before update of user_id,social_url,social_platform_id on public.profiles for each row execute function public.clear_changed_promo();
create function public.claim_promo_placement(p_user uuid,p_profile uuid) returns jsonb language plpgsql security definer set search_path=public as $$declare p profiles; a promo_admissions; n integer;begin
 perform pg_advisory_xact_lock(81482026);
 select * into p from profiles where id=p_profile for update;
 if not found or p.user_id is distinct from p_user or p.demo or p.status not in ('active','pending_payment') or not exists(select 1 from users where id=p_user and not banned) then raise exception 'Profile is not eligible';end if;
 if not p.verified or not exists(select 1 from social_connections c join social_platforms s on s.name=c.platform where c.user_id=p_user and c.social_url=p.social_url and s.id=p.social_platform_id and c.status='verified' and s.active) then raise exception 'Profile verification required';end if;
 select * into a from promo_admissions where profile_id=p.id and user_id=p_user and social_platform_id=p.social_platform_id and social_url=p.social_url;
 if not found then
  if not exists(select 1 from app_settings where key='public' and value->'promo_enabled'='true'::jsonb) then raise exception 'Promo is not active';end if;
  if p.total_paid>0 then raise exception 'Profile already paid';end if;
  if exists(select 1 from promo_admissions where (user_id=p_user and social_platform_id=p.social_platform_id) or profile_id=p.id or (social_platform_id=p.social_platform_id and social_url=p.social_url)) then raise exception 'Promo already used';end if;
  select coalesce(max(slot),0)+1 into n from promo_admissions where social_platform_id=p.social_platform_id;
  if n>100 then raise exception 'Promo is full';end if;
  insert into promo_admissions(profile_id,user_id,social_platform_id,social_url,slot) values(p.id,p_user,p.social_platform_id,p.social_url,n) returning * into a;
 end if;
 update profiles set promo_granted_at=a.granted_at,status='active',reached_amount_at=case when total_paid=0 then a.granted_at else reached_amount_at end,updated_at=now() where id=p.id;
 return jsonb_build_object('id',p.id,'slug',p.slug,'slot',a.slot,'promo_granted_at',a.granted_at);
end;$$;
revoke all on function public.claim_promo_placement(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_promo_placement(uuid,uuid) to service_role;
create or replace function public.get_leaderboard_discovery() returns setof jsonb language sql stable security definer set search_path=public as $$
 select to_jsonb(b) || jsonb_build_object('promo_granted_at',case when has_promo_placement(p.id) then p.promo_granted_at end,'language',p.language,'country',p.country,'region',p.region,'social_bio',coalesce(c.social_bio,''),'avatar_url',coalesce(p.avatar_url,c.avatar_url),
 'views',(select count(*) from profile_traffic where profile_id=p.id and kind='impression'),'clicks',(select count(*) from profile_traffic where profile_id=p.id and kind='outbound_click'),'week_paid',coalesce(w.amount,0),'week_reached_at',w.reached,'month_paid',coalesce(m.amount,0),'month_reached_at',m.reached)
 from get_leaderboard() b join profiles p on p.id=b.id
 left join social_connections c on c.user_id=p.user_id and c.platform=b.platform and c.social_url=p.social_url and c.status='verified'
 left join lateral (select sum(amount-refunded_amount) amount,max(paid_at) reached from payments where profile_id=p.id and status in ('paid','partially_refunded') and amount>refunded_amount and paid_at>now()-interval '7 days') w on true
 left join lateral (select sum(amount-refunded_amount) amount,max(paid_at) reached from payments where profile_id=p.id and status in ('paid','partially_refunded') and amount>refunded_amount and paid_at>now()-interval '30 days') m on true
 order by b.total_paid desc,b.reached_amount_at,b.id;
$$;
create or replace function public.creator_insights(p_user uuid,p_days integer default 30) returns jsonb language plpgsql stable security definer set search_path=public as $$declare result jsonb;begin
 if not exists(select 1 from users where id=p_user and not banned) or p_days not in (0,1,7,30) or p_days is null then raise exception 'Forbidden';end if;
 select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) into result from (
 select p.id profile_id,
 count(t.id) filter(where kind='leaderboard_page_view') board_views,
 count(t.id) filter(where kind='impression') impressions,
 count(t.id) filter(where kind='name_impression') name_views,
 count(distinct t.visitor_hash) filter(where kind='name_impression') daily_name_viewers,
 count(t.id) filter(where kind='profile_detail_view') detail_views,
 count(t.id) filter(where kind='outbound_click') clicks,
 count(distinct t.visitor_hash) filter(where kind='outbound_click') daily_clickers,
 (select coalesce(jsonb_agg(to_jsonb(d) order by d.day),'[]'::jsonb) from
   (select (created_at at time zone 'UTC')::date as day,count(*) filter(where kind='name_impression') name_views,count(*) filter(where kind='impression') impressions,count(*) filter(where kind='outbound_click') clicks
    from profile_traffic where profile_id=p.id and created_at>=now()-interval '30 days' group by 1) d) daily
 from profiles p left join profile_traffic t on t.profile_id=p.id and (p_days=0 or t.created_at>now()-make_interval(days=>p_days))
 where p.user_id=p_user and (p.total_paid>0 or has_promo_placement(p.id)) and p.verified and not p.demo and p.status<>'deleted' group by p.id
 ) s;
 return jsonb_build_object('profiles',result,'days',p_days,'as_of',now());
end;$$;
revoke all on function public.creator_insights(uuid,integer) from public,anon,authenticated;
grant execute on function public.creator_insights(uuid,integer) to service_role;

create or replace function public.apply_refund(p_event text,p_intent text,p_refunded bigint) returns boolean language plpgsql security definer set search_path=public as $$declare pay payments;delta bigint;before_ranks jsonb;begin
 perform pg_advisory_xact_lock(81482026);
 if exists(select 1 from webhook_events where id=p_event) then return false;end if;
 select * into pay from payments where stripe_payment_id=p_intent for update;
 if not found then raise exception 'Unknown payment';end if;
 if p_refunded>pay.amount then raise exception 'Refund exceeds payment';end if;
 delta=greatest(0,p_refunded-pay.refunded_amount);
 if delta>0 then
 select jsonb_object_agg(id,r) into before_ranks from(select id,row_number() over(order by total_paid desc,reached_amount_at,id) r from profiles where is_public_profile(id)) q;
 update payments set refunded_amount=p_refunded,status=case when p_refunded=amount then 'refunded' else 'partially_refunded' end where id=pay.id;
 update profiles set total_paid=greatest(0,total_paid-delta),reached_amount_at=case when total_paid-delta<=0 and has_promo_placement(id) then promo_granted_at else clock_timestamp() end,updated_at=now(),status=case when total_paid-delta<=0 and status='active' and not has_promo_placement(id) then 'pending_payment' else status end where id=pay.profile_id;
 insert into rank_history(profile_id,old_rank,new_rank,total_paid) select id,(before_ranks->>id::text)::bigint,r,total_paid from(select id,total_paid,row_number() over(order by total_paid desc,reached_amount_at,id) r from profiles where is_public_profile(id)) q where (before_ranks->>id::text)::bigint is distinct from r;
 insert into activity(profile_id,kind,payload) values(pay.profile_id,'refund',jsonb_build_object('amount',delta));end if;
 insert into webhook_events values(p_event,'charge.refunded',now());return delta>0;
end;$$;

create or replace function public.admin_mutation(p_admin uuid,p_action text,p_target text,p_value jsonb) returns void language plpgsql security definer set search_path=public as $$declare old_ranks jsonb;begin
 if not exists(select 1 from users where id=p_admin and role='admin' and not banned) then raise exception 'Forbidden';end if;
 perform pg_advisory_xact_lock(81482026);
 select jsonb_object_agg(id,r) into old_ranks from(select id,row_number() over(order by total_paid desc,reached_amount_at,id) r from profiles where status='active' and not demo) q;
 if p_action='moderate' then
 if p_value->>'status' not in ('active','under_review','hidden','banned','deleted') then raise exception 'Invalid status';end if;
 if p_value->>'status'='active' and not exists(select 1 from profiles where id=p_target::uuid and verified and (total_paid>0 or has_promo_placement(id))) then raise exception 'Verified placement required';end if;
 update profiles set status=p_value->>'status',updated_at=now() where id=p_target::uuid;
 elsif p_action='edit' then
 if char_length(p_value->>'name') not between 2 and 60 or char_length(p_value->>'bio')>160 or (p_value->>'name')~'[<>]' or (p_value->>'bio')~'[<>]' then raise exception 'Invalid profile text';end if;
 update profiles set name=p_value->>'name',bio=p_value->>'bio',avatar_url=case when (p_value->>'remove_avatar')::boolean then null else avatar_url end,updated_at=now() where id=p_target::uuid;
 elsif p_action='ban' then
 if p_target::uuid=p_admin then raise exception 'Cannot ban self';end if;
 update users set banned=coalesce((p_value->>'banned')::boolean,true) where id=p_target::uuid;
 if (p_value->>'banned')::boolean then update profiles set status='banned' where user_id=p_target::uuid;end if;
 elsif p_action='verify' then
 if not exists(select 1 from verification_requests where id=p_target::uuid and status='pending') then raise exception 'Verification request not found';end if;
 update profiles set verified=true where id=(select profile_id from verification_requests where id=p_target::uuid);
 update verification_requests set status='approved' where id=p_target::uuid;
 elsif p_action='report' then update reports set status='resolved' where id=p_target::uuid;
 elsif p_action='settings' then
 if p_target='public' then
 if p_value ? 'promo_enabled' and jsonb_typeof(p_value->'promo_enabled') is distinct from 'boolean' then raise exception 'Invalid promo setting';end if;
 if (p_value->>'minimum')::bigint<100 or (p_value->>'increment')::bigint<100 or (p_value->>'minimum')::bigint>100000000 or (p_value->>'increment')::bigint>100000000 or char_length(p_value->>'name') not between 2 and 40 then raise exception 'Invalid settings';end if;
 elsif p_target='security' then
 if jsonb_typeof(p_value->'blacklist')<>'array' or jsonb_typeof(p_value->'allowed_domains')<>'array' then raise exception 'Invalid domain configuration';end if;
 elsif p_target<>'payments' then raise exception 'Invalid setting';end if;
 update app_settings set value=p_value where key=p_target;
 elsif p_action='taxonomy' then
 if p_value->>'type'='category' then update categories set active=(p_value->>'active')::boolean where id=p_target;
 elsif p_value->>'type'='platform' then update social_platforms set active=(p_value->>'active')::boolean where id=p_target;
 else raise exception 'Invalid taxonomy';end if;
 else raise exception 'Unknown action';end if;
 insert into rank_history(profile_id,old_rank,new_rank,total_paid) select id,(old_ranks->>id::text)::bigint,r,total_paid from(select id,total_paid,row_number() over(order by total_paid desc,reached_amount_at,id) r from profiles where status='active' and not demo) q where (old_ranks->>id::text)::bigint is distinct from r;
 insert into admin_actions(admin_id,action,target_id,payload) values(p_admin,p_action,p_target,p_value);
 insert into activity(kind,payload) values('moderation','{}');
end;$$;
revoke all on function public.admin_mutation(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.admin_mutation(uuid,text,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
