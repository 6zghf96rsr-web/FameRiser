begin;
alter table public.profile_traffic drop constraint profile_traffic_kind_check;
alter table public.profile_traffic add constraint profile_traffic_kind_check check(kind in ('leaderboard_page_view','impression','name_impression','profile_detail_view','outbound_click'));
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
 where p.user_id=p_user and p.total_paid>0 and not p.demo and p.status<>'deleted' group by p.id
 ) s;
 return jsonb_build_object('profiles',result,'days',p_days,'as_of',now());
end;$$;
revoke all on function public.creator_insights(uuid,integer) from public,anon,authenticated;
grant execute on function public.creator_insights(uuid,integer) to service_role;

create or replace function public.record_profile_traffic(p_user uuid,p_ids uuid[],p_kind text,p_event uuid,p_hash text,p_source text) returns bigint language plpgsql security definer set search_path=public as $$declare n bigint;begin
 if cardinality(p_ids) not between 1 and 50 or p_event is null or p_hash is null or length(p_hash)<>64 or p_kind not in ('leaderboard_page_view','impression','name_impression','profile_detail_view') or p_kind is null or p_source not in ('all','profile','Instagram','Facebook','TikTok','YouTube','Twitch','X') or p_source is null then raise exception 'Invalid event';end if;
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
