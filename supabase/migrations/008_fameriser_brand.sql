-- Rename the original default brand without changing operator-customized settings.
update public.app_settings
set value = jsonb_set(value, '{name}', '"FameRiser"'::jsonb)
where key = 'public' and value->>'name' = 'RankMe';
