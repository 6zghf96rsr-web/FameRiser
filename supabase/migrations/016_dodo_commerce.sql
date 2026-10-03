create table public.dodo_orders (
 id uuid primary key default gen_random_uuid(), request_id uuid not null unique,
 user_id uuid references public.users(id) on delete set null,profile_id uuid not null references public.profiles(id),
 amount bigint not null check(amount>0),currency text not null check(currency in ('CZK','EUR','USD','PLN','JPY')),
 billing_country text not null,product_id text not null,
 status text not null default 'pending' check(status in ('pending','paid','review','refunded')),
 session_id text unique,checkout_url text,provider_payment_id text unique,
 tax bigint,net bigint,fx_rate text,fx_date date,rank_score bigint not null default 0 check(rank_score>=0),
 refunded_amount bigint not null default 0 check(refunded_amount>=0 and refunded_amount<=amount),
 active_score bigint not null default 0 check(active_score>=0),
 documents jsonb not null,documents_hash text not null check(length(documents_hash)=64),consents jsonb not null,
 created_at timestamptz not null default now(),paid_at timestamptz,
 check(tax is null or tax between 0 and amount),check(net is null or net=amount-tax)
);
create table public.dodo_events (id text primary key,kind text not null,order_id uuid references public.dodo_orders(id),created_at timestamptz not null default now());
alter table public.dodo_orders enable row level security;alter table public.dodo_events enable row level security;
revoke all on public.dodo_orders,public.dodo_events from anon,authenticated;
grant all on public.dodo_orders,public.dodo_events to service_role;
create index dodo_profile_score on public.dodo_orders(profile_id,paid_at) where status='paid';
create function public.apply_dodo_payment(p_order uuid,p_event text,p_kind text,p_payment text,p_tax bigint,p_fx text,p_fx_date date,p_score bigint,p_refund bigint,p_review boolean,p_paid_at timestamptz) returns void
language plpgsql security definer set search_path=public as $$declare o dodo_orders;begin
 select * into o from dodo_orders where id=p_order for update;if not found then raise exception 'order not found';end if;
 if exists(select 1 from dodo_events where id=p_event) then return;end if;
 if o.provider_payment_id is not null and o.provider_payment_id<>p_payment then raise exception 'payment mismatch';end if;
 if p_score<0 or p_tax<0 or p_tax>o.amount or p_refund<0 or p_refund>o.amount or p_fx::numeric<=0 or p_paid_at is null then raise exception 'invalid amounts';end if;
 if o.paid_at is null then
  update dodo_orders set provider_payment_id=p_payment,tax=p_tax,net=amount-p_tax,fx_rate=p_fx,fx_date=p_fx_date,rank_score=p_score,paid_at=p_paid_at where id=o.id;
 end if;
 -- Cumulative refunds only grow; never restore money after an out-of-order delivery.
 update dodo_orders set refunded_amount=greatest(refunded_amount,p_refund),
 status=case when p_review then 'review' when greatest(refunded_amount,p_refund)=amount then 'refunded' else 'paid' end,
 active_score=case when p_review then 0 else floor(rank_score::numeric*(amount-greatest(refunded_amount,p_refund))/amount)::bigint end
 where id=o.id;
 update profiles set status='active',updated_at=now() where id=o.profile_id and verified and status='pending_payment' and not p_review;
 insert into dodo_events(id,kind,order_id) values(p_event,p_kind,o.id);
end$$;
create function public.has_dodo_placement(p_profile uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from dodo_orders d join profiles p on p.id=d.profile_id where d.profile_id=p_profile and d.user_id=p.user_id and d.status='paid' and d.active_score>0);
$$;
create or replace function public.is_public_profile(p_profile uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from profiles p where p.id=p_profile and p.status='active' and p.verified and not p.demo and exists(select 1 from users where id=p.user_id and not banned)
 and (has_promo_placement(p.id) or has_dodo_placement(p.id) or (p.total_paid>0 and exists(select 1 from payments pay where pay.profile_id=p.id and pay.status in ('paid','partially_refunded') and pay.amount>pay.refunded_amount))));
$$;
-- Preserve the legacy ledger; never reinterpret historical CZK amounts as EUR.
create function public.get_commerce_board() returns setof jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('id',p.id,'name',p.name,'username',p.username,'slug',p.slug,'bio',p.bio,'social_bio','','avatar_url',p.avatar_url,'platform',s.name,'category',c.name,'social_url',p.social_url,'language',p.language,'country',p.country_verified,'region',p.region,'status',p.status,'verified',p.verified,'total_paid',p.total_paid,'today_paid',0,'created_at',p.created_at,'reached_amount_at',coalesce(d.reached,p.reached_amount_at),'today_reached_at',d.tday,'week_reached_at',d.wday,'month_reached_at',d.mday,'promo_granted_at',case when has_promo_placement(p.id) then p.promo_granted_at end,
 'rank_score',case when p.total_paid>0 then null else coalesce(d.score,0) end,'today_score',coalesce(d.today,0),'week_score',coalesce(d.week,0),'month_score',coalesce(d.month_score,0),
 'paid_totals',coalesce((select jsonb_object_agg(currency,amount) from (select currency,sum(amount-refunded_amount) amount from dodo_orders where profile_id=p.id and status in ('paid','refunded') group by currency) a),'{}'::jsonb),
 'views',(select count(*) from profile_traffic where profile_id=p.id and kind='impression'),'clicks',(select count(*) from profile_traffic where profile_id=p.id and kind='outbound_click'))
 from profiles p join social_platforms s on s.id=p.social_platform_id join categories c on c.id=p.category_id
 left join lateral(select sum(active_score) score,max(paid_at) reached,sum(active_score) filter(where paid_at>now()-interval '24 hours') today,max(paid_at) filter(where paid_at>now()-interval '24 hours') tday,sum(active_score) filter(where paid_at>now()-interval '7 days') week,max(paid_at) filter(where paid_at>now()-interval '7 days') wday,sum(active_score) filter(where paid_at>now()-interval '30 days') month_score,max(paid_at) filter(where paid_at>now()-interval '30 days') mday from dodo_orders where profile_id=p.id and status='paid' and active_score>0) d on true
 where is_public_profile(p.id);
$$;
-- Extend existing entitlement-dependent operations without altering their other security checks.
do $$declare definition text; name text;begin
 foreach name in array array['public.creator_insights(uuid,integer)','public.claim_promo_placement(uuid,uuid)','public.decide_profile(uuid,uuid,text,text,text,text)'] loop
 definition:=pg_get_functiondef(name::regprocedure);
 definition:=replace(definition,'p.total_paid>0','(p.total_paid>0 or has_dodo_placement(p.id))');
 definition:=replace(definition,'total_paid>0 or has_promo_placement(id)','total_paid>0 or has_dodo_placement(id) or has_promo_placement(id)');
 execute definition;
 end loop;
end$$;
revoke all on function public.apply_dodo_payment(uuid,text,text,text,bigint,text,date,bigint,bigint,boolean,timestamptz),public.has_dodo_placement(uuid),public.get_commerce_board() from public,anon,authenticated;
grant execute on function public.apply_dodo_payment(uuid,text,text,text,bigint,text,date,bigint,bigint,boolean,timestamptz),public.has_dodo_placement(uuid),public.get_commerce_board() to service_role;
create function public.protect_dodo_snapshot() returns trigger language plpgsql set search_path=public as $$begin
 if row(new.amount,new.currency,new.profile_id,new.product_id,new.billing_country,new.documents,new.documents_hash,new.consents,new.created_at) is distinct from row(old.amount,old.currency,old.profile_id,old.product_id,old.billing_country,old.documents,old.documents_hash,old.consents,old.created_at) then raise exception 'immutable contract snapshot';end if;
 if old.paid_at is not null and row(new.tax,new.net,new.fx_rate,new.fx_date,new.rank_score,new.paid_at) is distinct from row(old.tax,old.net,old.fx_rate,old.fx_date,old.rank_score,old.paid_at) then raise exception 'immutable payment valuation';end if;
 return new;end$$;
create trigger protect_dodo_snapshot before update on public.dodo_orders for each row execute function public.protect_dodo_snapshot();
create table public.dodo_refund_jobs(order_id uuid primary key references public.dodo_orders(id),admin_id uuid references public.users(id) on delete set null,provider_refund_id text,created_at timestamptz not null default now());
alter table public.dodo_refund_jobs enable row level security;revoke all on public.dodo_refund_jobs from anon,authenticated;grant all on public.dodo_refund_jobs to service_role;
