begin;
-- One fixed valuation for the entire campaign so exchange-rate movements cannot
-- reorder equal promo awards. ECB fixing: 2026-09-21, 1 EUR = 1.1490 USD.
-- The credit is never inserted into either payment ledger.
alter table public.promo_admissions
 add column credit_minor integer not null default 500 check(credit_minor=500),
 add column credit_currency text not null default 'USD' check(credit_currency='USD'),
 add column credit_score bigint not null default 4351610 check(credit_score=4351610),
 add column credit_fx_rate numeric not null default 1.1490 check(credit_fx_rate=1.1490),
 add column credit_fx_date date not null default '2026-09-21' check(credit_fx_date='2026-09-21'),
 add column credit_granted_at timestamptz not null default now(),
 add column priority_at timestamptz;
update public.promo_admissions a set priority_at=coalesce((select created_at from public.users where id=a.user_id),a.granted_at);
alter table public.promo_admissions alter column priority_at set not null;
create function public.stamp_promo_credit() returns trigger language plpgsql set search_path=public as $$begin
 new.priority_at:=coalesce((select created_at from users where id=new.user_id),new.granted_at);
 new.credit_granted_at:=now();
 return new;
end;$$;
create trigger stamp_promo_credit before insert on public.promo_admissions for each row execute function public.stamp_promo_credit();
create function public.protect_promo_credit() returns trigger language plpgsql set search_path=public as $$begin
 if row(new.credit_minor,new.credit_currency,new.credit_score,new.credit_fx_rate,new.credit_fx_date,new.credit_granted_at,new.priority_at,new.slot,new.granted_at,new.social_url,new.social_platform_id,new.remote_id)
 is distinct from row(old.credit_minor,old.credit_currency,old.credit_score,old.credit_fx_rate,old.credit_fx_date,old.credit_granted_at,old.priority_at,old.slot,old.granted_at,old.social_url,old.social_platform_id,old.remote_id) then raise exception 'Immutable promo award';end if;
 return new;
end;$$;
create trigger protect_promo_credit before update on public.promo_admissions for each row execute function public.protect_promo_credit();
-- Reuse the existing proof and consent checks, global advisory lock and quota.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.claim_promo_placement(uuid,uuid)'::regprocedure);
 definition:=replace(definition,'if p.total_paid>0 then','if p.total_paid>0 or has_dodo_placement(p.id) then');
 execute definition;
end;$$;
-- A previously created profile becomes eligible when proof or consent is completed.
drop trigger auto_promo_placement on public.profiles;
create trigger auto_promo_placement after insert or update of verified,publication_consent,non_political_confirmed_at on public.profiles for each row execute function public.auto_promo_placement();

create function public.get_promo_credit(p_profile uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('promo_credit_minor',a.credit_minor,'promo_credit_currency',a.credit_currency,'promo_credit_score',a.credit_score,'promo_credit_granted_at',a.credit_granted_at,'promo_priority_at',a.priority_at,'promo_slot',a.slot)
 from promo_admissions a where a.profile_id=p_profile and has_promo_placement(p_profile);
$$;
create function public.get_owned_promo_credits(p_user uuid) returns setof jsonb language sql stable security definer set search_path=public as $$
 select get_promo_credit(p.id)||jsonb_build_object('id',p.id) from profiles p where p.user_id=p_user and has_promo_placement(p.id);
$$;
-- Preserve paid amounts and payment-period timestamps unchanged. Promo metadata
-- adds a distinct non-cash score to public ranking output.
alter function public.get_commerce_board() rename to get_paid_commerce_board;
create function public.get_commerce_board() returns setof jsonb language sql stable security definer set search_path=public as $$
 select b||coalesce(credit,'{}'::jsonb)||case when credit is null or b->>'rank_score' is null then '{}'::jsonb else jsonb_build_object(
 'rank_score',(b->>'rank_score')::bigint+(credit->>'promo_credit_score')::bigint,
 'today_score',coalesce((b->>'today_score')::bigint,0)+case when (credit->>'promo_credit_granted_at')::timestamptz>now()-interval '24 hours' then (credit->>'promo_credit_score')::bigint else 0 end,
 'week_score',coalesce((b->>'week_score')::bigint,0)+case when (credit->>'promo_credit_granted_at')::timestamptz>now()-interval '7 days' then (credit->>'promo_credit_score')::bigint else 0 end,
 'month_score',coalesce((b->>'month_score')::bigint,0)+case when (credit->>'promo_credit_granted_at')::timestamptz>now()-interval '30 days' then (credit->>'promo_credit_score')::bigint else 0 end) end
 from get_paid_commerce_board() b left join lateral(select get_promo_credit((b->>'id')::uuid) credit) a on true order by b->>'id';
$$;
revoke all on function public.get_promo_credit(uuid),public.get_owned_promo_credits(uuid),public.get_commerce_board() from public,anon,authenticated;
grant execute on function public.get_promo_credit(uuid),public.get_owned_promo_credits(uuid),public.get_commerce_board() to service_role;
-- Backfill only already-consented, verified, unpaid genuine profiles, oldest
-- registration first. No identities, proofs, consent or payments are fabricated.
do $$declare candidate record;begin
 if exists(select 1 from app_settings where key='public' and value->'promo_enabled'='true'::jsonb) then
 for candidate in select p.id,p.user_id from profiles p join users u on u.id=p.user_id where p.verified and not p.demo and not u.banned and p.status in ('pending_payment','active') and p.total_paid=0 and not has_dodo_placement(p.id) and not has_promo_placement(p.id) and p.publication_consent->'public'='true'::jsonb and p.non_political_confirmed_at is not null and exists(select 1 from social_connections c join social_platforms s on s.name=c.platform where c.user_id=p.user_id and c.social_url=p.social_url and s.id=p.social_platform_id and c.status='verified' and s.active) order by u.created_at,p.created_at,p.id loop
 begin perform claim_promo_placement(candidate.user_id,candidate.id);
 exception when raise_exception then if sqlerrm not in ('Promo is full','Promo already used') then raise;end if;
 end;
 end loop;
 end if;
end;$$;
notify pgrst,'reload schema';
commit;
