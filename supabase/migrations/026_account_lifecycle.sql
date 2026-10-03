begin;
-- A proof is a renewable lease. No token is exposed through connections or public RPCs.
create table public.facebook_page_grants(
 connection_id uuid primary key references public.social_connections(id) on delete cascade,
 version uuid not null default gen_random_uuid(),
 encrypted_token text not null,
 token_expires_at timestamptz not null,
 checked_at timestamptz not null default now(),
 valid_until timestamptz not null,
 next_check_at timestamptz not null default now(),
 last_error text check(last_error in ('permission_removed','token_expired','provider_unavailable'))
);
alter table public.facebook_page_grants enable row level security;
revoke all on public.facebook_page_grants from public,anon,authenticated;
grant all on public.facebook_page_grants to service_role;
create function public.page_proof_current(p_profile uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from profiles p where p.id=p_profile and (not p.payment_required or exists(
 select 1 from social_connections c join facebook_page_grants g on g.connection_id=c.id
 where c.user_id=p.user_id and c.social_url=p.social_url and c.account_kind='facebook_page' and c.status='verified' and g.valid_until>now() and g.token_expires_at>now())));
$$;
-- Preserve the function identity used by existing policies and readers.
create or replace function public.is_public_profile(p_profile uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from profiles p where p.id=p_profile and p.status='active' and p.verified and not p.demo and exists(select 1 from users where id=p.user_id and not banned)
 and page_proof_current(p.id)
 and (not p.payment_required or (profile_publication_allowed(p.id) and has_dodo_placement(p.id)))
 and (has_promo_placement(p.id) or has_dodo_placement(p.id) or (p.total_paid>0 and exists(select 1 from payments pay where pay.profile_id=p.id and pay.status in ('paid','partially_refunded') and pay.amount>pay.refunded_amount))));
$$;
create function public.prepare_monitored_facebook_page(p_user uuid,p_remote_id text,p_label text,p_avatar text,p_version text,p_accepted boolean,p_non_political boolean,p_token text,p_expires timestamptz) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;begin
 if p_token is null or length(p_token) not between 40 and 6000 or p_expires<=now() or p_expires>now()+interval '61 days' then raise exception 'Invalid provider grant';end if;
 result:=prepare_facebook_page(p_user,p_remote_id,p_label,p_avatar,p_version,p_accepted,p_non_political);
 insert into facebook_page_grants(connection_id,encrypted_token,token_expires_at,valid_until,next_check_at)
 values((result->>'id')::uuid,p_token,p_expires,least(p_expires,now()+interval '24 hours'),now()+interval '1 hour')
 on conflict(connection_id) do update set version=gen_random_uuid(),encrypted_token=excluded.encrypted_token,token_expires_at=excluded.token_expires_at,checked_at=now(),valid_until=excluded.valid_until,next_check_at=excluded.next_check_at,last_error=null;
 return result;
end;$$;
create function public.finish_page_check(p_connection uuid,p_version uuid,p_result text) returns boolean language plpgsql security definer set search_path=public as $$
declare g facebook_page_grants;begin
 -- Same lock order as reconnect, disconnect and account deletion; stale jobs cannot undo a reconnect.
 perform pg_advisory_xact_lock(81482027);
 select * into g from facebook_page_grants where connection_id=p_connection and version=p_version for update;
 if not found then return false;end if;
 if p_result='valid' and g.token_expires_at>now() then
  update facebook_page_grants set version=gen_random_uuid(),checked_at=now(),valid_until=least(token_expires_at,now()+interval '24 hours'),next_check_at=now()+interval '1 hour',last_error=null where connection_id=p_connection;
 elsif p_result in ('permission_removed','token_expired') then
  update facebook_page_grants set version=gen_random_uuid(),encrypted_token='',valid_until=now(),next_check_at='infinity',last_error=p_result where connection_id=p_connection;
  update social_connections set status='unverified',verified_at=null where id=p_connection;
 elsif p_result='provider_unavailable' then
  update facebook_page_grants set version=gen_random_uuid(),next_check_at=now()+interval '10 minutes',last_error=p_result where connection_id=p_connection;
 else raise exception 'Invalid check outcome';end if;
 return true;
end;$$;
create function public.claim_page_checks() returns setof public.facebook_page_grants language sql security definer set search_path=public as $$
 update facebook_page_grants set next_check_at=now()+interval '5 minutes'
 where connection_id in(select connection_id from facebook_page_grants where next_check_at<=now() order by next_check_at for update skip locked limit 50)
 returning *;
$$;
-- Refuse a new checkout when the verification lease has expired, even if the worker is down.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.reserve_checkout(uuid,uuid,bigint,uuid)'::regprocedure);
 if position('if not p.verified' in definition)=0 then raise exception 'Unexpected checkout function';end if;
 execute replace(definition,'if not p.verified','if not page_proof_current(p.id) or not p.verified');
end;$$;
alter table public.deletion_requests add column prepared_at timestamptz;
create function public.request_account_erasure(p_user uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare request deletion_requests;begin
 perform pg_advisory_xact_lock(81482027);
 perform 1 from users where id=p_user for update;
 if not found then raise exception 'Account not found';end if;
 select * into request from deletion_requests where user_id=p_user order by created_at desc limit 1 for update;
 if request.prepared_at is not null then return jsonb_build_object('id',request.id,'status',request.status);end if;
 if request.id is null then insert into deletion_requests(user_id) values(p_user) returning * into request;end if;
 -- Prevent a later login, new connection or delayed webhook from making this account public again.
 update users set banned=true where id=p_user;
 update profiles set status='hidden' where user_id=p_user and status<>'deleted';
 delete from profile_ratings where user_id=p_user;
 delete from review_reactions where user_id=p_user;
 delete from review_replies where user_id=p_user;
 delete from profile_reviews where user_id=p_user;
 delete from social_connections where user_id=p_user;
 delete from social_oauth_states where user_id=p_user;
 update deletion_requests set status='awaiting_retention_review',prepared_at=now() where id=request.id returning * into request;
 insert into activity(kind,payload) values('moderation','{}');
 return jsonb_build_object('id',request.id,'status',request.status);
end;$$;
-- Serialize a write already in flight with erasure, so it cannot re-create deleted data.
create function public.guard_erased_account_write() returns trigger language plpgsql security definer set search_path=public as $$begin
 perform 1 from users where id=new.user_id for share;
 if exists(select 1 from deletion_requests where user_id=new.user_id and prepared_at is not null) then raise exception 'Account erasure already requested';end if;
 return new;
end;$$;
do $$declare t text;begin foreach t in array array['social_connections','social_oauth_states','profile_ratings','profile_reviews','review_replies','review_reactions','account_acceptances'] loop
 execute format('create trigger guard_erased_account_write before insert or update on public.%I for each row execute function public.guard_erased_account_write()',t);
end loop;end;$$;
revoke all on function public.guard_erased_account_write() from public,anon,authenticated;
create function public.prevent_erasure_reactivation() returns trigger language plpgsql security definer set search_path=public as $$begin
 if not new.banned and exists(select 1 from deletion_requests where user_id=new.id and prepared_at is not null) then raise exception 'Account erasure already requested';end if;
 return new;
end;$$;
create trigger prevent_erasure_reactivation before update of banned on public.users for each row execute function public.prevent_erasure_reactivation();
revoke all on function public.prevent_erasure_reactivation() from public,anon,authenticated;
revoke all on function public.page_proof_current(uuid),public.prepare_monitored_facebook_page(uuid,text,text,text,text,boolean,boolean,text,timestamptz),public.finish_page_check(uuid,uuid,text),public.claim_page_checks(),public.request_account_erasure(uuid) from public,anon,authenticated;
grant execute on function public.page_proof_current(uuid),public.prepare_monitored_facebook_page(uuid,text,text,text,text,boolean,boolean,text,timestamptz),public.finish_page_check(uuid,uuid,text),public.claim_page_checks(),public.request_account_erasure(uuid) to service_role;
notify pgrst,'reload schema';
commit;
