begin;
-- Public discovery metadata. Never inferred from IP, login email or private data.
alter table public.profiles add column language text not null default '' check(language='' or language ~ '^[a-z]{2}$');
alter table public.profiles add column country text not null default '' check(country='' or country ~ '^[A-Z]{2}$');
alter table public.profiles add column region text not null default '' check(char_length(region)<=80);
alter table public.profiles drop constraint profiles_bio_check;
alter table public.profiles add constraint profiles_bio_check check(char_length(bio)<=1000);
-- Only trusted provider responses may populate these snapshots.
alter table public.social_connections add column social_bio text not null default '' check(char_length(social_bio)<=5000);
alter table public.social_connections add column avatar_url text;
alter table public.social_connections add column suggested_language text;
alter table public.social_connections add column suggested_country text;

create function public.get_leaderboard_discovery() returns setof jsonb language sql stable security definer set search_path=public as $$
 select to_jsonb(b) || jsonb_build_object('language',p.language,'country',p.country,'region',p.region,'social_bio',coalesce(c.social_bio,''),'avatar_url',coalesce(p.avatar_url,c.avatar_url))
 from get_leaderboard() b join profiles p on p.id=b.id
 left join social_connections c on c.user_id=p.user_id and c.platform=b.platform and c.social_url=p.social_url and c.status='verified'
 order by b.total_paid desc,b.reached_amount_at,b.id;
$$;
revoke all on function public.get_leaderboard_discovery() from public,anon,authenticated;
grant execute on function public.get_leaderboard_discovery() to service_role;

create or replace function public.verify_youtube_connections(p_user uuid,p_channels jsonb) returns void language plpgsql security definer set search_path=public as $$declare item jsonb; c_id uuid;begin
 if not exists(select 1 from users where id=p_user and not banned) then raise exception 'Forbidden';end if;
 if jsonb_typeof(p_channels)<>'array' or jsonb_array_length(p_channels) not between 1 and 50 then raise exception 'Invalid channels';end if;
 perform pg_advisory_xact_lock(81482027);
 for item in select * from jsonb_array_elements(p_channels) loop
  if (item->>'remote_id') !~ '^UC[A-Za-z0-9_-]{22}$' or (item->>'social_url') is distinct from 'https://youtube.com/channel/'||(item->>'remote_id') then raise exception 'Invalid channel';end if;
  insert into social_connections(user_id,platform,social_url,label,status,method,remote_id,verified_at,social_bio,avatar_url,suggested_language,suggested_country)
  values(p_user,'YouTube',item->>'social_url',item->>'label','verified','youtube_oauth',item->>'remote_id',now(),coalesce(item->>'social_bio',''),item->>'avatar_url',item->>'suggested_language',item->>'suggested_country')
  on conflict(user_id,platform,social_url) do update set label=excluded.label,status='verified',method='youtube_oauth',remote_id=excluded.remote_id,verified_at=now(),social_bio=excluded.social_bio,avatar_url=excluded.avatar_url,suggested_language=excluded.suggested_language,suggested_country=excluded.suggested_country returning id into c_id;
  update connection_challenges set status='expired' where connection_id=c_id and status in ('pending','submitted');
 end loop;
end;$$;
notify pgrst, 'reload schema';
commit;
