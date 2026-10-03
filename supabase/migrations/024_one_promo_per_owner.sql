begin;
-- Existing awards stay intact. Refuse conflicting historical data rather than revoke credit.
create unique index promo_one_per_owner on public.promo_admissions(user_id) where user_id is not null;
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.claim_promo_placement(uuid,uuid)'::regprocedure);
 if position('if not found then' in definition)=0 then raise exception 'Unexpected promo function';end if;
 definition:=replace(definition,'if not found then','if not found then
  if exists(select 1 from promo_admissions where user_id=p_user) then raise exception ''Promo already used'';end if;');
 execute definition;
end;$$;
notify pgrst,'reload schema';
commit;
