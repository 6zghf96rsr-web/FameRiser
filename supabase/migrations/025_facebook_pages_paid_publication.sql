begin;
alter table public.social_connections add column account_kind text not null default 'profile' check(account_kind in ('profile','facebook_page'));
alter table public.profiles add column payment_required boolean not null default false;

-- Classify from trusted provider records even when the generic profile API is used.
create function public.require_page_payment() returns trigger language plpgsql security definer set search_path=public as $$begin
 if exists(select 1 from social_connections c join social_platforms s on s.name=c.platform where c.user_id=new.user_id and c.social_url=new.social_url and s.id=new.social_platform_id and c.account_kind='facebook_page') then
  new.payment_required:=true;
 end if;
 if tg_op='UPDATE' and old.payment_required then new.payment_required:=true;end if;
 return new;
end;$$;
create trigger require_page_payment before insert or update on public.profiles for each row execute function public.require_page_payment();
revoke all on function public.require_page_payment() from public,anon,authenticated;

create or replace function public.profile_publication_allowed(p_profile uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from profiles p where p.id=p_profile and (
  (p.publication_consent->'public'='true'::jsonb and p.non_political_confirmed_at is not null)
  or (not p.payment_required and exists(select 1 from social_connections c join social_platforms s on s.name=c.platform where c.id=p.login_connection_id and c.user_id=p.user_id and c.social_url=p.social_url and s.id=p.social_platform_id and c.status='verified' and c.method='provider_oauth')
   and exists(select 1 from account_acceptances a where a.user_id=p.user_id and a.adult))
 ));
$$;
create or replace function public.auto_promo_placement() returns trigger language plpgsql security definer set search_path=public as $$begin
 if not new.payment_required and new.verified and not new.demo and new.status='pending_payment' and profile_publication_allowed(new.id) and exists(select 1 from app_settings where key='public' and value->'promo_enabled'='true'::jsonb) then
  begin perform claim_promo_placement(new.user_id,new.id);
  exception when raise_exception then
   if sqlerrm not in ('Promo is full','Promo already used','Profile already paid','Promo is not active') then raise;end if;
  end;
 end if;
 return null;
end;$$;
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.claim_promo_placement(uuid,uuid)'::regprocedure);
 if position('if not p.verified' in definition)=0 then raise exception 'Unexpected promo function';end if;
 definition:=replace(definition,'if not p.verified','if p.payment_required then raise exception ''Page payment required'';end if;
 if not p.verified');
 execute definition;
end;$$;
create or replace function public.is_public_profile(p_profile uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from profiles p where p.id=p_profile and p.status='active' and p.verified and not p.demo and exists(select 1 from users where id=p.user_id and not banned)
 and (not p.payment_required or (profile_publication_allowed(p.id) and has_dodo_placement(p.id)))
 and (has_promo_placement(p.id) or has_dodo_placement(p.id) or (p.total_paid>0 and exists(select 1 from payments pay where pay.profile_id=p.id and pay.status in ('paid','partially_refunded') and pay.amount>pay.refunded_amount))));
$$;

-- One transaction: revalidated Meta data, explicit consent, private pending profile.
-- Only the server that has fetched /me/accounts may call this function.
create function public.prepare_facebook_page(p_user uuid,p_remote_id text,p_label text,p_avatar text,p_version text,p_accepted boolean,p_non_political boolean) returns jsonb language plpgsql security definer set search_path=public as $$
declare cid uuid;pid uuid;begin
 if p_accepted is distinct from true or p_non_political is distinct from true or p_version is null or length(p_version) not between 1 and 50 then raise exception 'Publication consent required';end if;
 perform pg_advisory_xact_lock(81482027);
 cid:=verify_provider_connection(p_user,'Facebook',p_remote_id,'https://facebook.com/'||p_remote_id,p_label,p_avatar);
 update social_connections set account_kind='facebook_page' where id=cid;
 pid:=activate_login_profile(p_user,cid);
 if exists(select 1 from profiles where id=pid and status not in ('pending_payment','active')) then raise exception 'Profile unavailable';end if;
 update profiles set payment_required=true,
  publication_consent=jsonb_build_object('version',p_version,'public',true,'import',true,'at',now(),'source','facebook_page_selection'),
  ownership_confirmed_at=now(),privacy_accepted_at=now(),non_political_confirmed_at=now()
 where id=pid;
 return jsonb_build_object('id',cid,'profile_id',pid);
end;$$;
revoke all on function public.prepare_facebook_page(uuid,text,text,text,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.prepare_facebook_page(uuid,text,text,text,text,boolean,boolean) to service_role;
notify pgrst,'reload schema';
commit;
