begin;
-- Expand the launch catalog to X, which migration 006 deferred.
-- This enables platform selection only, not account verification or publication.
update public.social_platforms set active=true where id='x' and name='X';
commit;
