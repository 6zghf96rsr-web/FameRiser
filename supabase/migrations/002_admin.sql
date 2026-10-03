begin;
create function public.admin_mutation(p_admin uuid,p_action text,p_target text,p_value jsonb) returns void language plpgsql security definer set search_path=public as $$declare old_ranks jsonb;begin
 if not exists(select 1 from users where id=p_admin and role='admin' and not banned) then raise exception 'Forbidden';end if;
 perform pg_advisory_xact_lock(81482026);
 select jsonb_object_agg(id,r) into old_ranks from(select id,row_number() over(order by total_paid desc,reached_amount_at,id) r from profiles where status='active' and not demo) q;
 if p_action='moderate' then
 if p_value->>'status' not in ('active','under_review','hidden','banned','deleted') then raise exception 'Invalid status';end if;
 if p_value->>'status'='active' and not exists(select 1 from profiles where id=p_target::uuid and total_paid>0) then raise exception 'Unpaid profiles cannot be ranked';end if;
 update profiles set status=p_value->>'status',updated_at=now() where id=p_target::uuid;
 elsif p_action='edit' then
 if char_length(p_value->>'name') not between 2 and 60 or char_length(p_value->>'bio')>160 or (p_value->>'name')~'[<>]' or (p_value->>'bio')~'[<>]' then raise exception 'Invalid profile text';end if;
 update profiles set name=p_value->>'name',bio=p_value->>'bio',avatar_url=case when (p_value->>'remove_avatar')::boolean then null else avatar_url end,updated_at=now() where id=p_target::uuid;
 elsif p_action='ban' then
 if p_target::uuid=p_admin then raise exception 'Cannot ban self';end if;
 update users set banned=coalesce((p_value->>'banned')::boolean,true) where id=p_target::uuid;
 if (p_value->>'banned')::boolean then update profiles set status='banned' where user_id=p_target::uuid;end if;
 elsif p_action='verify' then
 if not exists(select 1 from verification_requests where id=p_target::uuid and status='pending') then raise exception 'Verification request not found';end if;
 update profiles set verified=true where id=(select profile_id from verification_requests where id=p_target::uuid);
 update verification_requests set status='approved' where id=p_target::uuid;
 elsif p_action='report' then update reports set status='resolved' where id=p_target::uuid;
 elsif p_action='settings' then
 if p_target='public' then
 if (p_value->>'minimum')::bigint<100 or (p_value->>'increment')::bigint<100 or (p_value->>'minimum')::bigint>100000000 or (p_value->>'increment')::bigint>100000000 or char_length(p_value->>'name') not between 2 and 40 then raise exception 'Invalid settings';end if;
 elsif p_target='security' then
 if jsonb_typeof(p_value->'blacklist')<>'array' or jsonb_typeof(p_value->'allowed_domains')<>'array' then raise exception 'Invalid domain configuration';end if;
 elsif p_target<>'payments' then raise exception 'Invalid setting';end if;
 update app_settings set value=p_value where key=p_target;
 elsif p_action='taxonomy' then
 if p_value->>'type'='category' then update categories set active=(p_value->>'active')::boolean where id=p_target;
 elsif p_value->>'type'='platform' then update social_platforms set active=(p_value->>'active')::boolean where id=p_target;
 else raise exception 'Invalid taxonomy';end if;
 else raise exception 'Unknown action';end if;
 insert into rank_history(profile_id,old_rank,new_rank,total_paid) select id,(old_ranks->>id::text)::bigint,r,total_paid from(select id,total_paid,row_number() over(order by total_paid desc,reached_amount_at,id) r from profiles where status='active' and not demo) q where (old_ranks->>id::text)::bigint is distinct from r;
 insert into admin_actions(admin_id,action,target_id,payload) values(p_admin,p_action,p_target,p_value);
 insert into activity(kind,payload) values('moderation','{}');
end;$$;
revoke all on function public.admin_mutation(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.admin_mutation(uuid,text,text,jsonb) to service_role;
commit;
