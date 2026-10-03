-- A refund or a resolved dispute changes when the remaining score was reached.
-- Replayed events that do not change score must not move the tie-break timestamp.
alter table public.dodo_orders add column score_changed_at timestamptz;
update public.dodo_orders set score_changed_at=paid_at where paid_at is not null;
create function public.stamp_dodo_score() returns trigger language plpgsql set search_path=public as $$begin
 if old.status='pending' and new.paid_at is not null then new.score_changed_at:=new.paid_at;
 elsif new.active_score is distinct from old.active_score or new.status is distinct from old.status then new.score_changed_at:=now();end if;
 return new;end$$;
create trigger stamp_dodo_score before update on public.dodo_orders for each row execute function public.stamp_dodo_score();
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.get_commerce_board()'::regprocedure);
 if position('max(paid_at)' in definition)=0 then raise exception 'unexpected board definition';end if;
 definition:=replace(definition,'max(paid_at)','max(score_changed_at)');
 definition:=replace(definition,'where profile_id=p.id and status=''paid'' and active_score>0','where profile_id=p.id');
 definition:=replace(definition,'where is_public_profile(p.id);','where is_public_profile(p.id) order by p.id;');
 execute definition;
end$$;
