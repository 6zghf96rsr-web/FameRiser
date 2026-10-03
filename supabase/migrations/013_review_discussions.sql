begin;
create table public.review_replies (
 id uuid primary key default gen_random_uuid(),review_id uuid not null references public.profile_reviews(id) on delete cascade,
 user_id uuid not null references public.users(id) on delete cascade,
 author_name text not null check(char_length(btrim(author_name)) between 2 and 60),
 body text not null check(char_length(btrim(body)) between 2 and 2000),
 status text not null default 'pending' check(status in ('pending','published','hidden')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(review_id,id)
);
create index review_replies_thread on public.review_replies(review_id,created_at,id);
create index review_replies_moderation on public.review_replies(status,created_at,id);
alter table public.review_replies enable row level security;
revoke all on public.review_replies from public,anon,authenticated;
grant all on public.review_replies to service_role;
create table public.review_reactions (
 review_id uuid not null references public.profile_reviews(id) on delete cascade,
 reply_id uuid, user_id uuid not null references public.users(id) on delete cascade,
 emoji text not null check(char_length(emoji) between 1 and 32),created_at timestamptz not null default now(),
 foreign key(review_id,reply_id) references public.review_replies(review_id,id) on delete cascade
);
create unique index review_reactions_root_user on public.review_reactions(review_id,user_id) where reply_id is null;
create unique index review_reactions_reply_user on public.review_reactions(reply_id,user_id) where reply_id is not null;
alter table public.review_reactions enable row level security;
revoke all on public.review_reactions from public,anon,authenticated;
grant all on public.review_reactions to service_role;
alter table public.reports add column reply_id uuid references public.review_replies(id) on delete set null;
create function public.review_reaction_summary(p_review uuid,p_reply uuid,p_user uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(s) order by s.count desc,s.emoji),'[]'::jsonb) from (
 select r.emoji,count(*) as count,coalesce(bool_or(r.user_id=p_user),false) mine from review_reactions r join users u on u.id=r.user_id
 where r.review_id=p_review and r.reply_id is not distinct from p_reply and not u.banned group by r.emoji) s;
$$;
create function public.get_review_discussion(p_review uuid,p_user uuid default null,p_page integer default 1) returns jsonb language plpgsql stable security definer set search_path=public as $$declare r profile_reviews; p profiles; result jsonb; n bigint;begin
 select * into r from profile_reviews where id=p_review and status='published';
 if not found or not is_public_profile(r.profile_id) or not exists(select 1 from users where id=r.user_id and not banned) then raise exception 'Review not public';end if;
 if p_page is null or p_page not between 1 and 100000 then raise exception 'Invalid page';end if;
 select * into p from profiles where id=r.profile_id;
 select count(*) into n from review_replies d join users u on u.id=d.user_id where d.review_id=r.id and not u.banned and (d.status='published' or d.user_id=p_user);
 select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at,s.id),'[]'::jsonb) into result from (
 select d.id,d.author_name,d.body,d.status,d.created_at,d.updated_at,coalesce(d.user_id=p_user,false) is_mine,d.user_id=p.user_id is_owner,
 review_reaction_summary(r.id,d.id,p_user) reactions
 from review_replies d join users u on u.id=d.user_id where d.review_id=r.id and not u.banned and (d.status='published' or d.user_id=p_user)
 order by d.created_at,d.id limit 20 offset (p_page-1)*20) s;
 return jsonb_build_object('items',result,'count',n,'page',p_page,'can_reply',coalesce(p_user in (r.user_id,p.user_id),false) and exists(select 1 from users where id=p_user and not banned),
 'viewer_name',case when p_user=p.user_id then p.name when p_user=r.user_id then r.author_name else null end,
 'is_owner',coalesce(p_user=p.user_id,false));
end;$$;
create function public.save_review_reply(p_user uuid,p_review uuid,p_body text,p_reply uuid default null) returns jsonb language plpgsql security definer set search_path=public as $$declare r profile_reviews; p profiles; d review_replies; label text;begin
 if not exists(select 1 from users where id=p_user and not banned) then raise exception 'Forbidden';end if;
 -- Deleting one's own text remains possible when the parent/profile is hidden.
 if p_body is null then
  delete from review_replies where id=p_reply and review_id=p_review and user_id=p_user;
  if not found then raise exception 'Reply not owned';end if;
  return jsonb_build_object('deleted',true);
 end if;
 select * into r from profile_reviews where id=p_review and status='published';
 if not found or not is_public_profile(r.profile_id) or not exists(select 1 from users where id=r.user_id and not banned) then raise exception 'Review not public';end if;
 select * into p from profiles where id=r.profile_id;
 if p_user is distinct from p.user_id and p_user is distinct from r.user_id then raise exception 'Only discussion participants may reply';end if;
 label:=case when p_user=p.user_id then p.name else r.author_name end;
 if p_reply is null then insert into review_replies(review_id,user_id,author_name,body) values(r.id,p_user,label,btrim(p_body)) returning * into d;
 else update review_replies set body=btrim(p_body),status='pending',updated_at=now() where id=p_reply and review_id=r.id and user_id=p_user returning * into d;
 if not found then raise exception 'Reply not owned';end if;end if;
 return jsonb_build_object('id',d.id,'status',d.status);
end;$$;
create function public.set_review_reaction(p_user uuid,p_review uuid,p_reply uuid,p_emoji text) returns jsonb language plpgsql security definer set search_path=public as $$declare r profile_reviews; author uuid; current_emoji text;begin
 if not exists(select 1 from users where id=p_user and not banned) then raise exception 'Forbidden';end if;
 select * into r from profile_reviews where id=p_review and status='published';
 if not found or not is_public_profile(r.profile_id) or not exists(select 1 from users where id=r.user_id and not banned) then raise exception 'Review not public';end if;
 author:=r.user_id;
 if p_reply is not null then
 select d.user_id into author from review_replies d join users u on u.id=d.user_id where d.id=p_reply and d.review_id=r.id and d.status='published' and not u.banned;
 if not found then raise exception 'Reply not public';end if;end if;
 if author=p_user then raise exception 'No self reaction';end if;
 if p_emoji is not null and char_length(p_emoji) not between 1 and 32 then raise exception 'Invalid emoji';end if;
 -- Serialize a person's toggles so concurrent clicks cannot double-count.
 perform pg_advisory_xact_lock(hashtextextended(p_user::text||coalesce(p_reply,p_review)::text,0));
 select emoji into current_emoji from review_reactions where review_id=p_review and reply_id is not distinct from p_reply and user_id=p_user;
 delete from review_reactions where review_id=p_review and reply_id is not distinct from p_reply and user_id=p_user;
 if p_emoji is not null and p_emoji is distinct from current_emoji then insert into review_reactions(review_id,reply_id,user_id,emoji) values(p_review,p_reply,p_user,p_emoji);end if;
 return review_reaction_summary(p_review,p_reply,p_user);
end;$$;
create function public.moderate_review_reply(p_admin uuid,p_reply uuid,p_status text) returns void language plpgsql security definer set search_path=public as $$begin
 if not exists(select 1 from users where id=p_admin and role='admin' and not banned) or p_status is null or p_status not in ('published','hidden') then raise exception 'Forbidden';end if;
 update review_replies set status=p_status where id=p_reply;
 if not found then raise exception 'Reply not found';end if;
 insert into admin_actions(admin_id,action,target_id,payload) values(p_admin,'reply_moderation',p_reply::text,jsonb_build_object('status',p_status));
end;$$;
revoke all on function public.review_reaction_summary(uuid,uuid,uuid),public.get_review_discussion(uuid,uuid,integer),public.save_review_reply(uuid,uuid,text,uuid),public.set_review_reaction(uuid,uuid,uuid,text),public.moderate_review_reply(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.review_reaction_summary(uuid,uuid,uuid),public.get_review_discussion(uuid,uuid,integer),public.save_review_reply(uuid,uuid,text,uuid),public.set_review_reaction(uuid,uuid,uuid,text),public.moderate_review_reply(uuid,uuid,text) to service_role;
create or replace function public.get_profile_reviews(p_profile uuid,p_user uuid default null,p_page integer default 1) returns jsonb language plpgsql stable security definer set search_path=public as $$declare result jsonb; mine jsonb; own boolean; can_write boolean; n bigint; stars bigint; avg_score numeric;begin
 if not is_public_profile(p_profile) then raise exception 'Profile not public';end if;
 if p_page is null or p_page not between 1 and 100000 then raise exception 'Invalid page';end if;
 select count(*),count(r.score),round(avg(r.score),1) into n,stars,avg_score from profile_reviews r join users u on u.id=r.user_id where r.profile_id=p_profile and r.status='published' and not u.banned;
 select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) into result from
 (select r.id,r.author_name,r.body,r.score,r.created_at,r.updated_at,coalesce(r.user_id=p_user,false) is_mine,review_reaction_summary(r.id,null,p_user) reactions,(select count(*) from review_replies d join users du on du.id=d.user_id where d.review_id=r.id and not du.banned and (d.status='published' or d.user_id=p_user)) reply_count from profile_reviews r join users u on u.id=r.user_id where r.profile_id=p_profile and r.status='published' and not u.banned order by r.created_at desc,r.id limit 20 offset (p_page-1)*20) s;
 select jsonb_build_object('id',id,'author_name',author_name,'body',body,'score',score,'status',status) into mine from profile_reviews where profile_id=p_profile and user_id=p_user;
 select user_id=p_user into own from profiles where id=p_profile;
 can_write:=p_user is not null and not coalesce(own,false) and exists(select 1 from users where id=p_user and not banned);
 return jsonb_build_object('items',result,'count',n,'rated_count',stars,'average',avg_score,'mine',mine,'can_write',can_write,'is_owner',coalesce(own,false),'signed_in',p_user is not null,'page',p_page);
end;$$;
notify pgrst,'reload schema';
commit;
