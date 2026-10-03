begin;
-- Older environment workers did not stamp first_attempt_at. Treat their age
-- conservatively instead of starting a new 24-hour idempotency window.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.process_mail_queue()'::regprocedure);
 if position('if item.first_attempt_at is not null and item.first_attempt_at<' in definition)=0 then raise exception 'Unexpected mail worker';end if;
 definition:=replace(definition,'if item.first_attempt_at is not null and item.first_attempt_at<','if item.attempts>0 and coalesce(item.first_attempt_at,item.created_at)<');
 execute definition;
 definition:=pg_get_functiondef('public.claim_email_batch()'::regprocedure);
 if position('if item.first_attempt_at<' in definition)=0 then raise exception 'Unexpected fallback worker';end if;
 definition:=replace(definition,'if item.first_attempt_at<','if item.attempts>0 and coalesce(item.first_attempt_at,item.created_at)<');
 execute definition;
end$$;
commit;
