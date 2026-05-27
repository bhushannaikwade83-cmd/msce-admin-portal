-- Portal instructor edit/delete/create from the MSCE website.
--
-- 1) Ensure list RPC exists (from MSCE app migration 075_list_portal_instructors_all.sql).
-- 2) Deploy Edge Function: supabase/functions/portal-manage-instructor
--    (Supabase Dashboard → Edge Functions → Deploy, or CLI: supabase functions deploy portal-manage-instructor)
-- 3) Run this file for PIN-uniqueness check when updating an instructor's PIN (optional but recommended).
-- 4) NOTIFY pgrst, 'reload schema';

-- Allow pin_taken check to ignore the profile being edited (website "change PIN").
create or replace function public.institute_instructor_pin_taken(
  p_institute_key text,
  p_pin_hash text,
  p_exclude_profile_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    inner join public.institutes i
      on i.id = btrim(p_institute_key)
      or i.institute_code = btrim(p_institute_key)
    where p.role = 'attendance_user'
      and p.pin_hash = btrim(p_pin_hash)
      and (p_exclude_profile_id is null or p.id <> p_exclude_profile_id)
      and (
        p.institute_id = i.id::text
        or p.institute_id = i.institute_code
      )
  );
$$;

revoke all on function public.institute_instructor_pin_taken(text, text, uuid) from public;
grant execute on function public.institute_instructor_pin_taken(text, text, uuid) to authenticated, service_role;

-- Keep 2-arg calls working (mobile app + older edge builds).
grant execute on function public.institute_instructor_pin_taken(text, text) to authenticated, service_role;
