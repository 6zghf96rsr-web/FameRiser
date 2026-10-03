-- RankMe: all amounts are integer minor units (haléře). Apply in a Supabase project.
begin;
create extension if not exists pgcrypto;
create table public.users(id uuid primary key references auth.users(id) on delete cascade, role text not null default 'user' check(role in ('user','admin')), banned boolean not null default false, created_at timestamptz not null default now());
create table public.identities(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.users(id) on delete cascade,label text not null);
create table public.social_platforms(id text primary key, name text not null, domains text[] not null default '{}',active boolean not null default true);
create table public.categories(id text primary key,name text not null,active boolean not null default true);
create table public.profiles(id uuid primary key default gen_random_uuid(),user_id uuid references public.users(id) on delete set null,identity_id uuid references public.identities(id) on delete set null,name text not null check(char_length(name) between 2 and 60),username text not null,slug text not null unique,bio text not null default '' check(char_length(bio)<=160),avatar_url text,social_url text not null,social_platform_id text not null references public.social_platforms(id),category_id text not null references public.categories(id),total_paid bigint not null default 0 check(total_paid>=0),reached_amount_at timestamptz not null default now(),status text not null default 'pending_payment' check(status in ('pending_payment','active','under_review','hidden','banned','deleted')),verified boolean not null default false,ownership_confirmed_at timestamptz not null default now(),privacy_accepted_at timestamptz not null default now(),demo boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index profiles_order on public.profiles(total_paid desc,reached_amount_at asc,id) where status='active';
create index profiles_search on public.profiles using gin(to_tsvector('simple',name||' '||username||' '||bio));
create unique index profile_owner_url on public.profiles(user_id,social_url) where status<>'deleted';
create table public.payments(id uuid primary key default gen_random_uuid(),user_id uuid references public.users(id) on delete set null,profile_id uuid not null references public.profiles(id),amount bigint not null check(amount>0),currency text not null default 'czk',target_total bigint not null,request_id uuid not null unique,stripe_checkout_id text unique,stripe_payment_id text unique,status text not null default 'pending' check(status in ('pending','paid','failed','expired','refunded','partially_refunded','refund_requested')),refunded_amount bigint not null default 0 check(refunded_amount>=0 and refunded_amount<=amount),expires_at timestamptz not null default now()+interval '31 minutes',created_at timestamptz not null default now(),paid_at timestamptz,terms_accepted_at timestamptz not null default now());
create unique index one_pending_payment on public.payments(profile_id) where status='pending';
create index payments_recent on public.payments(paid_at desc) where status in ('paid','partially_refunded');
create table public.webhook_events(id text primary key,type text not null,created_at timestamptz not null default now());
create table public.rank_history(id bigint generated always as identity primary key,profile_id uuid not null references public.profiles(id) on delete cascade,old_rank bigint,new_rank bigint,total_paid bigint not null,created_at timestamptz not null default now());
create index rank_history_profile on public.rank_history(profile_id,created_at desc);
create table public.profile_views(id bigint generated always as identity primary key,profile_id uuid not null references public.profiles(id) on delete cascade,visitor_hash text not null,kind text not null check(kind in ('impression','profile_detail_view')),position integer,day date not null default current_date,created_at timestamptz not null default now(),unique(profile_id,visitor_hash,kind,day));
create table public.outbound_clicks(id bigint generated always as identity primary key,profile_id uuid not null references public.profiles(id) on delete cascade,visitor_hash text not null,day date not null default current_date,created_at timestamptz not null default now(),unique(profile_id,visitor_hash,day));
create table public.activity(id bigint generated always as identity primary key,profile_id uuid references public.profiles(id) on delete cascade,kind text not null,payload jsonb not null default '{}',created_at timestamptz not null default now());
create table public.reports(id uuid primary key default gen_random_uuid(),profile_id uuid references public.profiles(id) on delete cascade,reporter_hash text not null,reason text not null check(reason in ('fake','impersonation','illegal','adult','spam','scam','other')),details text not null default '' check(char_length(details)<=1000),status text not null default 'open' check(status in ('open','resolved')),created_at timestamptz not null default now());
create table public.admin_actions(id bigint generated always as identity primary key,admin_id uuid references public.users(id) on delete set null,action text not null,target_id text,payload jsonb not null default '{}',created_at timestamptz not null default now());
create table public.app_settings(key text primary key,value jsonb not null);
create table public.rate_limits(key text primary key,count integer not null default 1,reset_at timestamptz not null);
create table public.deletion_requests(id uuid primary key default gen_random_uuid(),user_id uuid references public.users(id) on delete set null,status text not null default 'open',created_at timestamptz not null default now());
create table public.verification_requests(id uuid primary key default gen_random_uuid(),profile_id uuid not null references public.profiles(id) on delete cascade,code text not null default ('rankme-'||encode(gen_random_bytes(8),'hex')),status text not null default 'pending',created_at timestamptz not null default now());
insert into public.app_settings values('public','{"name":"RankMe","minimum":10000,"increment":1000}'),('security','{"blacklist":["bit.ly","tinyurl.com","t.co","goo.gl"],"allowed_domains":[]}'),('payments','{"refunds_enabled":false}');
insert into public.categories select lower(v),v,true from unnest(array['Creators','Influencers','Gamers','Streamers','Music','Models','Business','Developers','Artists','Fitness','Lifestyle','Photography','Comedy','Other']) v;
insert into public.social_platforms(id,name) select lower(v),v from unnest(array['Instagram','TikTok','YouTube','X','Facebook','Twitch','LinkedIn','Threads','Snapchat','Pinterest','Kick','Reddit','Jiná']) v;
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$begin insert into public.users(id) values(new.id) on conflict do nothing;return new;end;$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
insert into public.users(id) select id from auth.users on conflict do nothing;
-- No client can write profiles, money, verification, admin flags, events or statistics.
do $$declare t text;begin foreach t in array array['users','identities','profiles','social_platforms','categories','payments','webhook_events','rank_history','profile_views','outbound_clicks','activity','reports','admin_actions','app_settings','rate_limits','deletion_requests','verification_requests'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon, authenticated',t);execute format('grant all on public.%I to service_role',t);end loop;end$$;
grant select on public.categories,public.social_platforms,public.activity to anon,authenticated;
create policy categories_public on public.categories for select using(active);
create policy platforms_public on public.social_platforms for select using(active);
-- Activity payload contains only public IDs, amounts and ranks, never email or session data.
create policy activity_public on public.activity for select using(true);
alter publication supabase_realtime add table public.activity;
create function public.get_leaderboard() returns table(id uuid,name text,username text,slug text,bio text,avatar_url text,social_url text,platform text,category text,total_paid bigint,reached_amount_at timestamptz,created_at timestamptz,status text,verified boolean,views bigint,clicks bigint,today_paid bigint,today_reached_at timestamptz) language sql stable security definer set search_path=public as $$
 select p.id,p.name,p.username,p.slug,p.bio,p.avatar_url,p.social_url,s.name,c.name,p.total_paid,p.reached_amount_at,p.created_at,p.status,p.verified,
 (select count(*) from profile_views v where v.profile_id=p.id),(select count(*) from outbound_clicks o where o.profile_id=p.id),
 coalesce((select sum(pay.amount-pay.refunded_amount) from payments pay where pay.profile_id=p.id and pay.status in ('paid','partially_refunded') and pay.paid_at>now()-interval '24 hours'),0),
 (select max(pay.paid_at) from payments pay where pay.profile_id=p.id and pay.status in ('paid','partially_refunded') and pay.paid_at>now()-interval '24 hours')
 from profiles p join social_platforms s on s.id=p.social_platform_id join categories c on c.id=p.category_id where p.status='active' and not p.demo order by p.total_paid desc,p.reached_amount_at asc,p.id;
$$;
create function public.consume_rate(p_key text,p_limit int,p_window int) returns boolean language plpgsql security definer set search_path=public as $$declare n int;begin insert into rate_limits(key,count,reset_at) values(p_key,1,now()+make_interval(secs=>p_window)) on conflict(key) do update set count=case when rate_limits.reset_at<now() then 1 else rate_limits.count+1 end,reset_at=case when rate_limits.reset_at<now() then now()+make_interval(secs=>p_window) else rate_limits.reset_at end returning count into n;return n<=p_limit;end;$$;
-- Reserve one checkout per profile. Client supplies desired total; database computes only the delta.
create function public.reserve_checkout(p_user uuid,p_profile uuid,p_target bigint,p_request uuid) returns public.payments language plpgsql security definer set search_path=public as $$declare p profiles;pay payments;cfg jsonb;begin
 perform pg_advisory_xact_lock(hashtextextended(p_profile::text,0));
 select * into p from profiles where id=p_profile for update;
 if p.user_id is distinct from p_user or p.status not in ('active','pending_payment') or p.demo or exists(select 1 from users where id=p_user and banned) then raise exception 'Profile is not eligible';end if;
 select * into pay from payments where request_id=p_request and user_id=p_user and profile_id=p_profile;
 if found then if pay.target_total<>p_target then raise exception 'Request amount changed';end if;return pay;end if;
 -- Pending sessions are released by verified expiration/failed-payment events, never by a browser clock.
 if exists(select 1 from payments where profile_id=p_profile and status='pending') then raise exception 'A checkout is already pending for this profile';end if;
 select value into cfg from app_settings where key='public';
 if p_target<p.total_paid+(cfg->>'increment')::bigint or p_target<(cfg->>'minimum')::bigint or p_target>100000000 then raise exception 'Invalid target amount';end if;
 insert into payments(user_id,profile_id,amount,target_total,request_id) values(p_user,p_profile,p_target-p.total_paid,p_target,p_request) returning * into pay;return pay;
end;$$;
-- This RPC is called exclusively by the server after Stripe signature, session, currency and amount verification.
create function public.apply_stripe_payment(p_event text,p_type text,p_payment uuid,p_checkout text,p_intent text,p_amount bigint,p_currency text) returns boolean language plpgsql security definer set search_path=public as $$declare pay payments;old_total bigint;before_ranks jsonb;new_position bigint;begin
 perform pg_advisory_xact_lock(81482026);
 if exists(select 1 from webhook_events where id=p_event) then return false;end if;
 select * into pay from payments where id=p_payment for update;
 if not found or pay.stripe_checkout_id is distinct from p_checkout or pay.amount<>p_amount or pay.currency<>p_currency then raise exception 'Payment mismatch';end if;
 if pay.status in ('paid','refunded','partially_refunded','refund_requested') then insert into webhook_events values(p_event,p_type,now());return false;end if;
 if pay.status<>'pending' then raise exception 'Unexpected payment state';end if;
 select jsonb_object_agg(id,r) into before_ranks from(select id,row_number() over(order by total_paid desc,reached_amount_at,id) r from profiles where status='active' and not demo) q;
 select total_paid into old_total from profiles where id=pay.profile_id for update;
 -- Credit the amount actually received, even if an earlier payment was refunded while checkout was open.
 update payments set status='paid',stripe_payment_id=p_intent,paid_at=clock_timestamp() where id=pay.id;
 update profiles set total_paid=total_paid+pay.amount,reached_amount_at=clock_timestamp(),updated_at=now(),status=case when status='pending_payment' then 'active' else status end where id=pay.profile_id;
 insert into rank_history(profile_id,old_rank,new_rank,total_paid) select id,(before_ranks->>id::text)::bigint,r,total_paid from(select id,total_paid,row_number() over(order by total_paid desc,reached_amount_at,id) r from profiles where status='active' and not demo) q where (before_ranks->>id::text)::bigint is distinct from r or id=pay.profile_id;
 select r into new_position from(select id,row_number() over(order by total_paid desc,reached_amount_at,id) r from profiles where status='active' and not demo) q where id=pay.profile_id;
 insert into activity(profile_id,kind,payload) values(pay.profile_id,'payment',jsonb_build_object('amount',pay.amount,'rank',new_position,'old_rank',before_ranks->>pay.profile_id::text));
 insert into webhook_events values(p_event,p_type,now());return true;
end;$$;
create function public.apply_refund(p_event text,p_intent text,p_refunded bigint) returns boolean language plpgsql security definer set search_path=public as $$declare pay payments;delta bigint;before_ranks jsonb;begin
 perform pg_advisory_xact_lock(81482026);
 if exists(select 1 from webhook_events where id=p_event) then return false;end if;
 select * into pay from payments where stripe_payment_id=p_intent for update;
 if not found then raise exception 'Unknown payment';end if;
 if p_refunded>pay.amount then raise exception 'Refund exceeds payment';end if;
 delta=greatest(0,p_refunded-pay.refunded_amount);
 if delta>0 then
 select jsonb_object_agg(id,r) into before_ranks from(select id,row_number() over(order by total_paid desc,reached_amount_at,id) r from profiles where status='active' and not demo) q;
 update payments set refunded_amount=p_refunded,status=case when p_refunded=amount then 'refunded' else 'partially_refunded' end where id=pay.id;
 update profiles set total_paid=greatest(0,total_paid-delta),reached_amount_at=clock_timestamp(),updated_at=now(),status=case when total_paid-delta<=0 and status='active' then 'pending_payment' else status end where id=pay.profile_id;
 insert into rank_history(profile_id,old_rank,new_rank,total_paid) select id,(before_ranks->>id::text)::bigint,r,total_paid from(select id,total_paid,row_number() over(order by total_paid desc,reached_amount_at,id) r from profiles where status='active' and not demo) q where (before_ranks->>id::text)::bigint is distinct from r;
 insert into activity(profile_id,kind,payload) values(pay.profile_id,'refund',jsonb_build_object('amount',delta));end if;
 insert into webhook_events values(p_event,'charge.refunded',now());return delta>0;
end;$$;
-- Explicit EXECUTE grants: SECURITY DEFINER functions must never be executable by the browser.
do $$declare f record;begin for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('get_leaderboard','consume_rate','reserve_checkout','apply_stripe_payment','apply_refund','handle_new_user') loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;end$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('avatars','avatars',true,2097152,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
-- Uploads use an authenticated server endpoint and service-role storage client. No public upload policies.
commit;
