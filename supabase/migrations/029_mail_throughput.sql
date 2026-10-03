begin;
-- Existing provider, key, sender and enabled state are preserved.
alter table public.mail_settings add column send_interval_seconds integer not null default 1 check(send_interval_seconds between 1 and 60);
alter table public.mail_settings add column paused_until timestamptz;
create index if not exists email_outbox_due on public.email_outbox(next_attempt_at,created_at) where status in ('pending','failed','sending');
create or replace function public.process_mail_queue() returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.email_outbox; reply record; secret_key text; req_id bigint; accepted integer:=0; queued integer:=0; provider text; pause_seconds integer; error_kind text;
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
    if reply.status_code=429 then
     begin error_kind:=(reply.content::jsonb)->>'name';exception when others then error_kind:=null;end;
     pause_seconds:=60;
     if coalesce(reply.headers->>'retry-after','') ~ '^\d{1,6}$' then pause_seconds:=greatest(1,least(86400,(reply.headers->>'retry-after')::integer));end if;
     if error_kind='daily_quota_exceeded' then pause_seconds:=greatest(pause_seconds,extract(epoch from ((date_trunc('day',now() at time zone 'UTC')+interval '1 day') at time zone 'UTC')-now())::integer);end if;
     if error_kind='monthly_quota_exceeded' then pause_seconds:=greatest(pause_seconds,86400);end if;
     update public.mail_settings set paused_until=greatest(coalesce(paused_until,now()),now()+make_interval(secs=>pause_seconds));
    end if;
    update public.email_outbox set status='failed',last_error='provider_'||coalesce(reply.status_code::text,'unconfirmed'),next_attempt_at=now()+make_interval(secs=>least(3600,60*power(2,item.attempts))::integer),http_request_id=null where id=item.id;
   end if;
   delete from net._http_response where id=item.http_request_id;
  elsif item.next_attempt_at<=now() then
   -- A crash can lose pg_net's unlogged request/response. Retry only inside idempotency window.
   update public.email_outbox set status='failed',last_error='delivery_unconfirmed',http_request_id=null where id=item.id;
  end if;
 end loop;
 if not public.database_mail_configured() then return jsonb_build_object('configured',false,'accepted',accepted,'queued',0);end if;
 if exists(select 1 from public.mail_settings where paused_until>now() or last_enqueued_at>now()-make_interval(secs=>send_interval_seconds)) then return jsonb_build_object('configured',true,'accepted',accepted,'queued',0);end if;
 select decrypted_secret into secret_key from vault.decrypted_secrets where name='fameriser_resend_api_key';
 -- Shared throttle: one HTTPS request per second by default, never a parallel burst.
 -- Keep bounded in-flight requests if the provider stalls.
 if (select count(*) from public.email_outbox where status='sending')>=10 then return jsonb_build_object('configured',true,'accepted',accepted,'queued',0,'busy',true);end if;
 select * into item from public.email_outbox where status in ('pending','failed') and attempts<8 and next_attempt_at<=now() order by created_at,id for update skip locked limit 1;
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

-- The environment-key fallback obeys the same database-wide throttle and lease.
create or replace function public.claim_email_batch() returns setof public.email_outbox language plpgsql security definer set search_path='' as $$
declare item public.email_outbox;begin
 if not pg_try_advisory_xact_lock(17091701) then return;end if;
 if public.database_mail_configured() then return;end if;
 if exists(select 1 from public.mail_settings where paused_until>now() or last_enqueued_at>now()-make_interval(secs=>send_interval_seconds)) then return;end if;
 select * into item from public.email_outbox where status in ('pending','failed','sending') and http_request_id is null and attempts<8 and next_attempt_at<=now() order by created_at,id for update skip locked limit 1;
 if not found then return;end if;
 if item.first_attempt_at<now()-interval '23 hours' then update public.email_outbox set status='failed',attempts=8,last_error='manual_review_required' where id=item.id;return;end if;
 update public.mail_settings set last_enqueued_at=now();
 return query update public.email_outbox set status='sending',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),next_attempt_at=now()+interval '10 minutes' where id=item.id returning *;
end$$;
create function public.pause_mail_delivery(p_seconds integer) returns void language sql security definer set search_path='' as $$
 update public.mail_settings set paused_until=greatest(coalesce(paused_until,now()),now()+make_interval(secs=>greatest(1,least(86400,p_seconds))));
$$;
revoke all on function public.pause_mail_delivery(integer) from public,anon,authenticated;
grant execute on function public.pause_mail_delivery(integer) to service_role;
select cron.schedule('fameriser-transactional-mail','1 second','select public.process_mail_queue();');
notify pgrst,'reload schema';
commit;
