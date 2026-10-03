-- Private operational records. No anonymous table reads, even for public forms.
create table public.account_acceptances (
 user_id uuid primary key references public.users(id) on delete cascade,
 version text not null, adult boolean not null check(adult), accepted_at timestamptz not null default now(),
 documents jsonb not null, documents_hash text not null check(length(documents_hash)=64)
);
create table public.service_requests (
 id uuid primary key default gen_random_uuid(), request_id uuid not null unique,
 case_number bigint generated always as identity unique,
 kind text not null check(kind in ('withdrawal','refund','appeal','country')),
 user_id uuid references public.users(id) on delete set null,
 email text not null, name text not null, reference text not null,
 details text not null default '', country text,
 payload_hash text not null check(length(payload_hash)=64),
 status text not null default 'open' check(status in ('open','reviewing','resolved')),
 resolution text not null default '', created_at timestamptz not null default now(), resolved_at timestamptz
);
create table public.moderation_decisions (
 id uuid primary key default gen_random_uuid(), user_id uuid references public.users(id) on delete set null,
 profile_id uuid references public.profiles(id) on delete set null,
 admin_id uuid references public.users(id) on delete set null,
 action text not null, reason text not null check(length(reason)>=20), rule text not null check(length(rule)>=3),
 payment_impact text not null check(length(payment_impact)>=10), automated boolean not null default false,
 appeal_until timestamptz not null default (now()+interval '6 months'), created_at timestamptz not null default now()
);
create table public.email_outbox (
 id uuid primary key default gen_random_uuid(), dedupe_key text not null unique,
 recipient text not null, subject text not null, body text not null,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed','cancelled')),
 attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
 provider_id text, last_error text, created_at timestamptz not null default now(), sent_at timestamptz
);
alter table public.profiles add column country_verified text check(country_verified ~ '^[A-Z]{2}$');
alter table public.profiles add column country_verified_at timestamptz;
alter table public.profiles add column publication_consent jsonb;
alter table public.profiles add column non_political_confirmed_at timestamptz;
do $$declare t text;begin
 foreach t in array array['account_acceptances','service_requests','moderation_decisions','email_outbox'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end$$;
grant usage,select on sequence public.service_requests_case_number_seq to service_role;
-- Claim with a lease; workers cannot send the same pending item concurrently.
create function public.claim_email_batch() returns setof public.email_outbox language sql security definer set search_path=public as $$
 update email_outbox set status='sending',attempts=attempts+1,next_attempt_at=now()+interval '10 minutes'
 where id in (select id from email_outbox where status in ('pending','failed','sending') and attempts<8 and next_attempt_at<=now() order by created_at for update skip locked limit 10) returning *;
$$;
-- A moderation decision and profile restriction are one transaction, including its notification.
create function public.decide_profile(p_admin uuid,p_profile uuid,p_action text,p_reason text,p_rule text,p_impact text) returns uuid
language plpgsql security definer set search_path=public as $$
declare owner_id uuid; decision_id uuid; contact text;begin
 if not exists(select 1 from users where id=p_admin and role='admin' and not banned) then raise exception 'forbidden';end if;
 if p_action not in ('active','under_review','hidden','banned','deleted') then raise exception 'invalid action';end if;
 select user_id into owner_id from profiles where id=p_profile for update;
 if not found then raise exception 'profile not found';end if;
 if p_action='active' and not exists(select 1 from profiles where id=p_profile and verified and (total_paid>0 or has_promo_placement(id))) then raise exception 'verified placement required';end if;
 insert into moderation_decisions(user_id,profile_id,admin_id,action,reason,rule,payment_impact)
 values(owner_id,p_profile,p_admin,p_action,trim(p_reason),trim(p_rule),trim(p_impact)) returning id into decision_id;
 update profiles set status=p_action,updated_at=now() where id=p_profile;
 select email into contact from auth.users where id=owner_id;
 if contact is not null then
 insert into email_outbox(dedupe_key,recipient,subject,body) values('moderation-'||decision_id,contact,'FameRiser — rozhodnutí o profilu',
 'Rozhodnutí: '||decision_id||E'\nOpatření: '||p_action||E'\nDůvod: '||p_reason||E'\nPravidlo: '||p_rule||E'\nDopad na platbu: '||p_impact||E'\nRozhodnutí provedl člověk. Bezplatný přezkum: https://fameriser.com/requests (druh Odvolání, reference toto číslo rozhodnutí). Lhůta nejméně šest měsíců. Zákonné prostředky nápravy zůstávají zachované. Kontakt: info@fameriser.com');
 end if;
 insert into admin_actions(admin_id,action,target_id,payload) values(p_admin,'moderation_decision',p_profile::text,jsonb_build_object('decision_id',decision_id));
 return decision_id;
end$$;
create function public.resolve_service_request(p_admin uuid,p_id uuid,p_resolution text,p_verified_country text default null) returns void
language plpgsql security definer set search_path=public as $$
declare r service_requests;begin
 if not exists(select 1 from users where id=p_admin and role='admin' and not banned) then raise exception 'forbidden';end if;
 select * into r from service_requests where id=p_id for update;
 if not found or r.status='resolved' or length(trim(p_resolution))<20 then raise exception 'invalid resolution';end if;
 if p_verified_country is not null then
  if r.kind<>'country' or r.user_id is null or p_verified_country is distinct from r.country then raise exception 'invalid country verification';end if;
  update profiles set country_verified=p_verified_country,country_verified_at=now() where id::text=r.reference and user_id=r.user_id;
  if not found then raise exception 'profile not found';end if;
 end if;
 update service_requests set status='resolved',resolution=p_resolution,resolved_at=now() where id=p_id;
 insert into email_outbox(dedupe_key,recipient,subject,body) values('request-resolution-'||p_id,r.email,'FameRiser — vyřízení žádosti FR-S-'||r.case_number,p_resolution||E'\nKontakt: info@fameriser.com');
 insert into admin_actions(admin_id,action,target_id,payload) values(p_admin,'service_request_resolved',p_id::text,jsonb_build_object('verified_country',p_verified_country,'resolution',p_resolution));
end$$;
revoke all on function public.claim_email_batch(),public.decide_profile(uuid,uuid,text,text,text,text),public.resolve_service_request(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_email_batch(),public.decide_profile(uuid,uuid,text,text,text,text),public.resolve_service_request(uuid,uuid,text,text) to service_role;
-- Notices enter the same transactional email queue, including decision notifications.
alter table public.email_outbox add column notice_id uuid references public.content_notices(id) on delete set null;
alter table public.email_outbox add column purpose text;
create function public.queue_notice_email() returns trigger language plpgsql set search_path=public as $$begin
 if new.reporter_email='' then return new;end if;
 if tg_op='INSERT' then
  insert into email_outbox(dedupe_key,recipient,subject,body,notice_id,purpose) values('notice-receipt-'||new.id,new.reporter_email,'FameRiser — přijetí oznámení FR-'||lpad(new.case_number::text,7,'0'),'Přijali jsme oznámení FR-'||lpad(new.case_number::text,7,'0')||E'\nPřijato: '||new.created_at||E'\nPodání posoudí správce. Kontakt: info@fameriser.com',new.id,'receipt') on conflict(dedupe_key) do nothing;
 elsif new.status='resolved' and (old.decision is distinct from new.decision or old.redress is distinct from new.redress) then
  insert into email_outbox(dedupe_key,recipient,subject,body,notice_id,purpose) values('notice-decision-'||new.id||'-'||md5(new.decision||new.redress),new.reporter_email,'FameRiser — rozhodnutí FR-'||lpad(new.case_number::text,7,'0'),new.decision||E'\nMožnosti přezkumu: '||new.redress||E'\nKontakt: info@fameriser.com',new.id,'decision') on conflict(dedupe_key) do nothing;
 end if;return new;end$$;
create trigger queue_notice_email after insert or update of decision,redress on public.content_notices for each row execute function public.queue_notice_email();
create function public.record_notice_email() returns trigger language plpgsql set search_path=public as $$begin
 if new.status='sent' and old.status<>'sent' and new.notice_id is not null then
 if new.purpose='receipt' then update content_notices set receipt_state='sent',receipt_sent_at=new.sent_at,receipt_provider_id=new.provider_id where id=new.notice_id and receipt_state='pending';
 elsif new.purpose='decision' then update content_notices set decision_sent_at=new.sent_at where id=new.notice_id;end if;
 end if;return new;end$$;
create trigger record_notice_email after update of status on public.email_outbox for each row execute function public.record_notice_email();
-- Backfill only unsent acknowledgements; existing sent/manual mail must not be resent.
insert into email_outbox(dedupe_key,recipient,subject,body,notice_id,purpose)
select 'notice-receipt-'||id,reporter_email,'FameRiser — přijetí oznámení FR-'||lpad(case_number::text,7,'0'),'Přijali jsme oznámení FR-'||lpad(case_number::text,7,'0')||E'\nPřijato: '||created_at||E'\nKontakt: info@fameriser.com',id,'receipt'
from content_notices where receipt_state='pending' and reporter_email<>'' on conflict(dedupe_key) do nothing;
create table public.account_acceptance_history(id uuid primary key default gen_random_uuid(),user_id uuid references public.users(id) on delete set null,version text not null,adult boolean not null,documents jsonb not null,documents_hash text not null,accepted_at timestamptz not null);
alter table public.account_acceptance_history enable row level security;revoke all on public.account_acceptance_history from anon,authenticated;grant select,insert on public.account_acceptance_history to service_role;
create function public.archive_account_acceptance() returns trigger language plpgsql security definer set search_path=public as $$begin
 insert into account_acceptance_history(user_id,version,adult,documents,documents_hash,accepted_at) values(new.user_id,new.version,new.adult,new.documents,new.documents_hash,new.accepted_at);return new;end$$;
create trigger archive_account_acceptance after insert or update on public.account_acceptances for each row execute function public.archive_account_acceptance();

create function public.cancel_manual_notice_email() returns trigger language plpgsql set search_path=public as $$begin
 if new.receipt_state='manual' then update email_outbox set status='cancelled' where notice_id=new.id and purpose='receipt' and status in ('pending','failed');end if;
 if new.decision_sent_at is not null then update email_outbox set status='cancelled' where notice_id=new.id and purpose='decision' and status in ('pending','failed');end if;
 return new;end$$;
create trigger cancel_manual_notice_email after update of receipt_state,decision_sent_at on public.content_notices for each row execute function public.cancel_manual_notice_email();
