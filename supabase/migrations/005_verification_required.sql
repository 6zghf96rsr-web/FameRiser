begin;
-- A paid slot is usable only while this exact profile has valid ownership proof.
create or replace function public.is_public_profile(p_profile uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from profiles p where p.id=p_profile and p.status='active' and p.verified and p.total_paid>0 and not p.demo
 and exists(select 1 from payments pay where pay.profile_id=p.id and pay.status in ('paid','partially_refunded') and pay.amount>pay.refunded_amount));
$$;

create or replace function public.reserve_checkout(p_user uuid,p_profile uuid,p_target bigint,p_request uuid) returns public.payments language plpgsql security definer set search_path=public as $$declare p profiles;pay payments;cfg jsonb;begin
 perform pg_advisory_xact_lock(hashtextextended(p_profile::text,0));
 select * into p from profiles where id=p_profile for update;
 if p.user_id is distinct from p_user or p.status not in ('active','pending_payment') or p.demo or exists(select 1 from users where id=p_user and banned) then raise exception 'Profile is not eligible';end if;
 if not p.verified then raise exception 'Profile verification required';end if;
 select * into pay from payments where request_id=p_request and user_id=p_user and profile_id=p_profile;
 if found then if pay.target_total<>p_target then raise exception 'Request amount changed';end if;return pay;end if;
 -- Pending sessions are released by verified expiration/failed-payment events, never by a browser clock.
 if exists(select 1 from payments where profile_id=p_profile and status='pending') then raise exception 'A checkout is already pending for this profile';end if;
 select value into cfg from app_settings where key='public';
 if p_target<p.total_paid+(cfg->>'increment')::bigint or p_target<(cfg->>'minimum')::bigint or p_target>100000000 then raise exception 'Invalid target amount';end if;
 insert into payments(user_id,profile_id,amount,target_total,request_id) values(p_user,p_profile,p_target-p.total_paid,p_target,p_request) returning * into pay;return pay;
end;$$;

create or replace function public.apply_stripe_payment(p_event text,p_type text,p_payment uuid,p_checkout text,p_intent text,p_amount bigint,p_currency text) returns boolean language plpgsql security definer set search_path=public as $$declare pay payments;old_total bigint;before_ranks jsonb;new_position bigint;begin
 perform pg_advisory_xact_lock(81482026);
 if exists(select 1 from webhook_events where id=p_event) then return false;end if;
 select * into pay from payments where id=p_payment for update;
 if not found or pay.stripe_checkout_id is distinct from p_checkout or pay.amount<>p_amount or pay.currency<>p_currency then raise exception 'Payment mismatch';end if;
 if pay.status in ('paid','refunded','partially_refunded','refund_requested') then insert into webhook_events values(p_event,p_type,now());return false;end if;
 if pay.status<>'pending' then raise exception 'Unexpected payment state';end if;
 select jsonb_object_agg(id,r) into before_ranks from(select id,row_number() over(order by total_paid desc,reached_amount_at,id) r from profiles where is_public_profile(id)) q;
 select total_paid into old_total from profiles where id=pay.profile_id for update;
 -- Credit the amount actually received, even if an earlier payment was refunded while checkout was open.
 update payments set status='paid',stripe_payment_id=p_intent,paid_at=clock_timestamp() where id=pay.id;
 update profiles set total_paid=total_paid+pay.amount,reached_amount_at=clock_timestamp(),updated_at=now(),status=case when status='pending_payment' then 'active' else status end where id=pay.profile_id;
 insert into rank_history(profile_id,old_rank,new_rank,total_paid) select id,(before_ranks->>id::text)::bigint,r,total_paid from(select id,total_paid,row_number() over(order by total_paid desc,reached_amount_at,id) r from profiles where is_public_profile(id)) q where (before_ranks->>id::text)::bigint is distinct from r or id=pay.profile_id;
 select r into new_position from(select id,row_number() over(order by total_paid desc,reached_amount_at,id) r from profiles where is_public_profile(id)) q where id=pay.profile_id;
 insert into activity(profile_id,kind,payload) values(pay.profile_id,'payment',jsonb_build_object('amount',pay.amount,'rank',new_position,'old_rank',before_ranks->>pay.profile_id::text));
 insert into webhook_events values(p_event,p_type,now());return true;
end;$$;

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
 update profiles set total_paid=greatest(0,total_paid-delta),reached_amount_at=clock_timestamp(),updated_at=now(),status=case when total_paid-delta<=0 and status='active' then 'pending_payment' else status end where id=pay.profile_id;
 insert into rank_history(profile_id,old_rank,new_rank,total_paid) select id,(before_ranks->>id::text)::bigint,r,total_paid from(select id,total_paid,row_number() over(order by total_paid desc,reached_amount_at,id) r from profiles where is_public_profile(id)) q where (before_ranks->>id::text)::bigint is distinct from r;
 insert into activity(profile_id,kind,payload) values(pay.profile_id,'refund',jsonb_build_object('amount',delta));end if;
 insert into webhook_events values(p_event,'charge.refunded',now());return delta>0;
end;$$;

-- Retire the old public-bio challenge flow. Existing completed proofs remain valid.
update connection_challenges set status='expired' where status in ('pending','submitted');
update social_connections set status='unverified' where status='pending';
create or replace function public.connection_action(p_user uuid,p_action text,p_id uuid default null,p_value jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public as $$begin
 if not exists(select 1 from users where id=p_user and not banned) then raise exception 'Forbidden';end if;
 if p_action<>'disconnect' then raise exception 'Bio verification retired';end if;
 perform pg_advisory_xact_lock(81482027);
 delete from social_connections where id=p_id and user_id=p_user;
 if not found then raise exception 'Connection not found';end if;
 return jsonb_build_object('ok',true);
end;$$;
commit;
