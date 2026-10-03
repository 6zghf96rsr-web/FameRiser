begin;
-- Single-use random tickets avoid a persistent shared worker credential.
create table public.page_worker_tickets(token_hash text primary key,expires_at timestamptz not null);
alter table public.page_worker_tickets enable row level security;
revoke all on public.page_worker_tickets from public,anon,authenticated;
grant all on public.page_worker_tickets to service_role;
create function public.consume_page_worker_ticket(p_token text) returns boolean language plpgsql security definer set search_path=public as $$
declare consumed text;begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return false;end if;
 delete from page_worker_tickets where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and expires_at>now() returning token_hash into consumed;
 return consumed is not null;
end;$$;
create function public.schedule_page_checks(p_probe boolean default false) returns bigint language plpgsql security definer set search_path=public as $$
declare ticket text;request_id bigint;begin
 delete from page_worker_tickets where expires_at<=now();
 if not p_probe and not exists(select 1 from facebook_page_grants where next_check_at<=now()) then return null;end if;
 ticket:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 insert into page_worker_tickets values(encode(sha256(convert_to(ticket,'UTF8')),'hex'),now()+interval '2 minutes');
 select net.http_post(url:='https://fameriser.com/api/internal/page-checks',headers:=jsonb_build_object('Authorization','Bearer '||ticket,'Content-Type','application/json'),body:='{}'::jsonb,timeout_milliseconds:=25000) into request_id;
 return request_id;
end;$$;
revoke all on function public.consume_page_worker_ticket(text),public.schedule_page_checks(boolean) from public,anon,authenticated;
grant execute on function public.consume_page_worker_ticket(text),public.schedule_page_checks(boolean) to service_role;
select cron.schedule('fameriser-page-permissions','* * * * *','select public.schedule_page_checks();');
commit;
