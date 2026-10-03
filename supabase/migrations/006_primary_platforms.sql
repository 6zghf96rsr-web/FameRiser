begin;
-- Initial launch scope. Preserve an operator's disabled state on primary networks.
-- Availability here only permits drafts; it does not activate ownership proof.
update public.social_platforms set active=false
where name not in ('Instagram','Facebook','TikTok','YouTube','Twitch');
commit;
