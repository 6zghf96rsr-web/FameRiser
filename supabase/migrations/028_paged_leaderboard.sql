begin;
-- Preserve the existing visibility and score functions. Rank before discovery
-- filtering, except country, which has its own ranking just like the current UI.
create function public.discovery_normalize(value text) returns text language sql immutable parallel safe set search_path='' as $$
 select lower(trim(regexp_replace(normalize(coalesce(value,''),NFD),U&'[\0300-\036f]','','g')));
$$;
create function public.get_board_page(p_options jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare platform_filter text:=coalesce(p_options->>'platform','all');period_filter text:=coalesce(p_options->>'period','all');
 category_filter text:=coalesce(p_options->>'category','all');language_filter text:=coalesce(p_options->>'language','all');country_filter text:=coalesce(p_options->>'country','all');
 query_filter text:=discovery_normalize(left(p_options->>'query',200));region_filter text:=discovery_normalize(left(p_options->>'region',80));
 requested_page integer:=greatest(1,least(999999,coalesce((p_options->>'page')::integer,1)));page_size integer:=case when p_options->>'full'='true' then 100 else 10 end; result jsonb;
begin
 if period_filter not in ('all','today','week','month') or platform_filter not in ('all','Instagram','Facebook','TikTok','YouTube','Twitch','X') then raise exception 'Invalid board filter';end if;
 if page_size=10 then requested_page:=1;end if;
 with source as materialized(select b from get_commerce_board() b),
 scored as materialized(select b,
 case when b->>'rank_score' is null then coalesce((b->>case period_filter when 'today' then 'today_paid' when 'week' then 'week_paid' when 'month' then 'month_paid' else 'total_paid' end)::bigint,0)
 else coalesce((b->>case period_filter when 'today' then 'today_score' when 'week' then 'week_score' when 'month' then 'month_score' else 'rank_score' end)::bigint,0) end score,
 coalesce(b->>'registration_at',b->>'reached_amount_at',b->>'created_at')::timestamptz priority
 from source),
 eligible as materialized(select * from scored where score>0 or b->>'promo_granted_at' is not null),
 available as materialized(select * from eligible where platform_filter='all' or b->>'platform'=platform_filter),
 ranked as materialized(select b,row_number() over(order by score desc,priority,(b->>'created_at')::timestamptz,b->>'id') rank from available where country_filter='all' or b->>'country'=country_filter),
 filtered as materialized(select * from ranked where (category_filter='all' or b->>'category'=category_filter)
 and (language_filter='all' or b->>'language'=language_filter)
 and (region_filter='' or discovery_normalize(b->>'region')=region_filter)
 and (query_filter='' or position(query_filter in discovery_normalize(concat_ws(' ',b->>'name',b->>'username',b->>'platform',b->>'category',
 case b->>'category' when 'Creators' then 'Tvůrci' when 'Influencers' then 'Influenceři' when 'Gamers' then 'Hráči' when 'Streamers' then 'Streameři' when 'Music' then 'Hudebníci' when 'Models' then 'Modeling' when 'Business' then 'Firmy a podnikání' when 'Developers' then 'Vývojáři' when 'Artists' then 'Umělci a malíři' when 'Fitness' then 'Fitness a trenéři' when 'Lifestyle' then 'Životní styl' when 'Photography' then 'Fotografové' when 'Comedy' then 'Humor a zábava' else 'Ostatní' end,b->>'bio',b->>'social_bio',b->>'region')))>0)),
 totals as (select count(*) total,greatest(1,ceil(count(*)::numeric/page_size)::integer) pages from filtered),
 paging as (select *,least(requested_page,pages) page from totals),
 selected as (select b||jsonb_build_object('rank',rank) b,rank from filtered order by rank limit page_size offset (select (page-1)*page_size from paging)),
 lifetime as materialized(select b from source where platform_filter='all' or b->>'platform'=platform_filter),
 amounts as (select key currency,value::bigint amount from lifetime cross join lateral jsonb_each_text(coalesce(b->'paid_totals','{}'::jsonb))
 union all select 'CZK',coalesce((b->>'total_paid')::bigint,0) from lifetime
 union all select coalesce(b->>'promo_credit_currency','USD'),coalesce((b->>'promo_credit_minor')::bigint,0) from lifetime),
 currency_totals as (select currency,sum(amount) amount from amounts group by currency having sum(amount)>0)
 select jsonb_build_object('profiles',coalesce((select jsonb_agg(b order by rank) from selected),'[]'::jsonb),
 'meta',jsonb_build_object('page',page,'pages',pages,'size',page_size,'total',total,
 'counts',coalesce((select jsonb_object_agg(network,n) from (select b->>'platform' network,count(*) n from eligible group by b->>'platform') counts),'{}'::jsonb)||jsonb_build_object('all',(select count(*) from eligible)),
 'facets',jsonb_build_object('languages',coalesce((select jsonb_agg(v order by v) from (select distinct b->>'language' v from available where coalesce(b->>'language','')<>'') a),'[]'::jsonb),
 'countries',coalesce((select jsonb_agg(v order by v) from (select distinct b->>'country' v from available where coalesce(b->>'country','')<>'') a),'[]'::jsonb),
 'regions',coalesce((select jsonb_agg(v order by v) from (select distinct b->>'region' v from available where coalesce(b->>'region','')<>'' and (country_filter='all' or b->>'country'=country_filter)) a),'[]'::jsonb)),
 'summary',jsonb_build_object('count',(select count(*) from lifetime),'views',(select coalesce(sum((b->>'views')::bigint),0) from lifetime),'clicks',(select coalesce(sum((b->>'clicks')::bigint),0) from lifetime),'totals',coalesce((select jsonb_object_agg(currency,amount) from currency_totals),'{}'::jsonb)))) into result from paging;
 return result;
end$$;
revoke all on function public.discovery_normalize(text),public.get_board_page(jsonb) from public,anon,authenticated;
grant execute on function public.discovery_normalize(text),public.get_board_page(jsonb) to service_role;
-- The current commerce board checks all orders for each profile, including refunds.
create index if not exists dodo_profile_all_orders on public.dodo_orders(profile_id);
create index if not exists traffic_profile_kind on public.profile_traffic(profile_id,kind);
notify pgrst,'reload schema';
commit;
