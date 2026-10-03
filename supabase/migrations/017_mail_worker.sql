-- Secrets are entered through Vault UI, never included in migrations or cron commands.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
create table public.mail_settings(singleton boolean primary key default true check(singleton),enabled boolean not null default false,last_enqueued_at timestamptz);
insert into public.mail_settings (singleton,enabled) values(true,false);
alter table public.mail_settings enable row level security;
revoke all on public.mail_settings from public,anon,authenticated;
grant select,update on public.mail_settings to service_role;
alter table public.email_outbox add column http_request_id bigint;
alter table public.email_outbox add column first_attempt_at timestamptz;
revoke all on net.http_request_queue,net._http_response from public,anon,authenticated;

create function public.database_mail_configured() returns boolean language sql security definer set search_path='' as $$
 select exists(select 1 from public.mail_settings where enabled)
 and exists(select 1 from vault.secrets where name='fameriser_resend_api_key');
$$;

create function public.process_mail_queue() returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.email_outbox; reply record; secret_key text; req_id bigint; accepted integer:=0; queued integer:=0; provider text;
begin
 if not pg_try_advisory_xact_lock(17091701) then return jsonb_build_object('configured',true,'busy',true);end if;
 -- Reconcile previously submitted HTTPS requests, including requests sent before a pause.
 for item in select * from public.email_outbox where status='sending' and http_request_id is not null for update skip locked loop
  select * into reply from net._http_response where id=item.http_request_id;
  if found then
   provider:=null;
   if reply.status_code between 200 and 299 then
    begin provider:=(reply.content::jsonb)->>'id';exception when others then provider:=null;end;
   end if;
   if provider is not null and length(provider)>0 then
    update public.email_outbox set status='sent',provider_id=provider,sent_at=now(),last_error=null where id=item.id;
    accepted:=accepted+1;
   else
    update public.email_outbox set status='failed',last_error='provider_'||coalesce(reply.status_code::text,'unconfirmed'),next_attempt_at=now()+make_interval(secs=>least(3600,60*power(2,item.attempts))::integer),http_request_id=null where id=item.id;
   end if;
   delete from net._http_response where id=item.http_request_id;
  elsif item.next_attempt_at<=now() then
   -- A crash can lose pg_net's unlogged request/response. Retry only inside idempotency window.
   update public.email_outbox set status='failed',last_error='delivery_unconfirmed',http_request_id=null where id=item.id;
  end if;
 end loop;
 if not public.database_mail_configured() then return jsonb_build_object('configured',false,'accepted',accepted,'queued',0);end if;
 if exists(select 1 from public.mail_settings where last_enqueued_at>now()-interval '1 minute') then return jsonb_build_object('configured',true,'accepted',accepted,'queued',0);end if;
 select decrypted_secret into secret_key from vault.decrypted_secrets where name='fameriser_resend_api_key';
 -- One message per minute avoids bursts on the initial provider account. Backlog remains visible to admin.
 select * into item from public.email_outbox where status in ('pending','failed') and attempts<8 and next_attempt_at<=now() order by created_at for update skip locked limit 1;
 if found then
  if item.first_attempt_at is not null and item.first_attempt_at<now()-interval '23 hours' then
   update public.email_outbox set status='failed',attempts=8,last_error='manual_review_required' where id=item.id;
  else
   select net.http_post(url:='https://api.resend.com/emails',
    headers:=jsonb_build_object('Authorization','Bearer '||secret_key,'Content-Type','application/json','Idempotency-Key',item.id::text),
    body:=jsonb_build_object('from','FameRiser <info@fameriser.com>','to',jsonb_build_array(item.recipient),'subject',item.subject,'text',item.body,'reply_to','info@fameriser.com'),timeout_milliseconds:=8000) into req_id;
   update public.email_outbox set status='sending',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),next_attempt_at=now()+interval '10 minutes',http_request_id=req_id where id=item.id;
   update public.mail_settings set last_enqueued_at=now();
   queued:=1;
  end if;
 end if;
 return jsonb_build_object('configured',true,'accepted',accepted,'queued',queued);
end$$;
revoke all on function public.database_mail_configured(),public.process_mail_queue() from public,anon,authenticated;
grant execute on function public.database_mail_configured(),public.process_mail_queue() to service_role;
select cron.schedule('fameriser-transactional-mail','* * * * *','select public.process_mail_queue();');
