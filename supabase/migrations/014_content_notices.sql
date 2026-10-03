-- Private DSA notices: separate from legacy quick reports, retained if a profile is deleted.
create table public.content_notices (
 id uuid primary key default gen_random_uuid(),
 case_number bigint generated always as identity unique,
 request_id uuid not null unique,
 payload_hash text not null check(char_length(payload_hash)=64),
 reporter_hash text not null,
 content_url text not null check(char_length(content_url) between 10 and 2000),
 reason text not null check(reason in ('impersonation','copyright','trademark','scam','threats','hate','sexual','illegal','privacy','other')),
 details text not null check(char_length(details) between 20 and 10000),
 reporter_name text not null default '' check(char_length(reporter_name)<=150),
 reporter_email text not null default '' check(char_length(reporter_email)<=254),
 child_safety boolean not null default false,
 good_faith boolean not null check(good_faith),
 attachments jsonb not null default '[]' check(jsonb_typeof(attachments)='array' and jsonb_array_length(attachments)<=3),
 status text not null default 'open' check(status in ('open','reviewing','resolved')),
 receipt_state text not null default 'pending' check(receipt_state in ('pending','sent','manual','not_requested')),
 receipt_sent_at timestamptz,
 receipt_provider_id text,
 decision text not null default '' check(char_length(decision)<=10000),
 redress text not null default '' check(char_length(redress)<=5000),
 decision_sent_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check ((char_length(reporter_name)>=2 and char_length(reporter_email)>=3) or (child_safety and reason='sexual')),
 check(not child_safety or (reason='sexual' and jsonb_array_length(attachments)=0)),
 check(status <> 'resolved' or (char_length(decision)>=20 and char_length(redress)>=10))
);
create index content_notices_queue on public.content_notices(status,created_at);
alter table public.content_notices enable row level security;
revoke all on public.content_notices from anon,authenticated;
grant all on public.content_notices to service_role;
grant usage,select on sequence public.content_notices_case_number_seq to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('notice-evidence','notice-evidence',false,2097152,array['image/png','image/jpeg','application/pdf']);
-- No storage policies grant browser access. Evidence is served only through an authenticated admin route.
create function public.update_content_notice(p_admin uuid,p_id uuid,p_action text,p_value jsonb default '{}') returns void
language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from users where id=p_admin and role='admin' and not banned) then raise exception 'forbidden';end if;
 perform 1 from content_notices where id=p_id for update;
 if not found then raise exception 'notice not found';end if;
 if p_action='reviewing' then
  update content_notices set status='reviewing',updated_at=now() where id=p_id and status<>'resolved';
 elsif p_action='decision' then
  update content_notices set status='resolved',decision=trim(p_value->>'decision'),redress=trim(p_value->>'redress'),decision_sent_at=null,updated_at=now() where id=p_id;
 elsif p_action='receipt_sent' then
  update content_notices set receipt_state='manual',receipt_sent_at=now(),updated_at=now() where id=p_id and reporter_email<>'';
 elsif p_action='decision_sent' then
  update content_notices set decision_sent_at=now(),updated_at=now() where id=p_id and status='resolved' and reporter_email<>'';
 else raise exception 'invalid action';end if;
 insert into admin_actions(admin_id,action,target_id,payload) values(p_admin,'notice_'||p_action,p_id::text,'{}'::jsonb);
end$$;
revoke all on function public.update_content_notice(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.update_content_notice(uuid,uuid,text,jsonb) to service_role;
