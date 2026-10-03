-- Administrator edits and account restrictions also produce a reviewable human decision.
create function public.decide_account_content(p_admin uuid,p_profile uuid,p_action text,p_reason text,p_rule text,p_impact text,p_name text default null,p_bio text default null,p_remove_avatar boolean default false) returns uuid
language plpgsql security definer set search_path=public as $$
declare owner_id uuid;decision_id uuid;contact text;begin
 if not exists(select 1 from users where id=p_admin and role='admin' and not banned) then raise exception 'forbidden';end if;
 if p_action not in ('edit','ban_user','unban_user') then raise exception 'invalid action';end if;
 select user_id into owner_id from profiles where id=p_profile for update;if not found then raise exception 'profile not found';end if;
 if p_action='edit' then
  if length(trim(p_name)) not between 2 and 60 or p_name is null or p_bio is null or length(p_bio)>1000 then raise exception 'invalid content';end if;
  update profiles set name=trim(p_name),bio=p_bio,avatar_url=case when p_remove_avatar then null else avatar_url end,updated_at=now() where id=p_profile;
 else
  if owner_id=p_admin or exists(select 1 from users where id=owner_id and role='admin') then raise exception 'cannot restrict administrator';end if;
  update users set banned=(p_action='ban_user') where id=owner_id;
 end if;
 insert into moderation_decisions(user_id,profile_id,admin_id,action,reason,rule,payment_impact) values(owner_id,p_profile,p_admin,p_action,trim(p_reason),trim(p_rule),trim(p_impact)) returning id into decision_id;
 select email into contact from auth.users where id=owner_id;
 if contact is not null then insert into email_outbox(dedupe_key,recipient,subject,body) values('moderation-'||decision_id,contact,'FameRiser — rozhodnutí o účtu',
 'Rozhodnutí: '||decision_id||E'\nOpatření: '||p_action||E'\nDůvod: '||p_reason||E'\nPravidlo: '||p_rule||E'\nDopad na platby: '||p_impact||E'\nRozhodnutí provedl člověk. Bezplatné odvolání nejméně šest měsíců: https://fameriser.com/requests . Zákonné prostředky nápravy zůstávají zachované. Kontakt: info@fameriser.com');end if;
 insert into admin_actions(admin_id,action,target_id,payload) values(p_admin,'moderation_decision',p_profile::text,jsonb_build_object('decision_id',decision_id));return decision_id;
end$$;
revoke all on function public.decide_account_content(uuid,uuid,text,text,text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.decide_account_content(uuid,uuid,text,text,text,text,text,text,boolean) to service_role;
