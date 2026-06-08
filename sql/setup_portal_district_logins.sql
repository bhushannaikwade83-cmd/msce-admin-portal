-- Create 8 district view-only portal logins (one per MSCE district).
--
-- Prerequisites (run in order):
--   1) MSCE APP: supabase/migrations/076_portal_district_viewers.sql
--   2) This repo: sql/manual_portal_district_viewers.sql
--
-- For EACH district:
--   A) Supabase Dashboard → Authentication → Users → Add user (email + password)
--   B) Uncomment ONE block below, set the email, run in SQL Editor
--
-- Website: same /admin login page as super admin. User sees only their district’s
-- institutes (by institute ID / code prefix), view-only: Institutes, Instructors,
-- Students, Reports.

-- ┌─────────────┬──────────────────────────────────┬─────────────────────────┐
-- │ District    │ portal_district_key              │ ID prefixes             │
-- ├─────────────┼──────────────────────────────────┼─────────────────────────┤
-- │ Mumbai      │ mumbai                           │ 11, 14, 15              │
-- │ Pune        │ pune                             │ 21, 22, 23              │
-- │ Nashik      │ nashik                           │ 31, 32, 33, 34          │
-- │ Kolhapur    │ kolhapur                         │ 41, 42, 43, 44, 45      │
-- │ Ch. Sambhaji│ chhatrapati_sambhajinagar        │ 51, 52, 53, 54, 55      │
-- │ Amrawati    │ amrawati                         │ 61, 62, 63, 64, 65      │
-- │ Nagpur      │ nagpur                           │ 71, 72, 73, 74, 75, 76  │
-- │ Latur       │ latur                            │ 81, 82, 83              │
-- └─────────────┴──────────────────────────────────┴─────────────────────────┘

-- Mumbai (test login: mumbai@gmail.com — see sql/setup_mumbai_district_test_login.sql)
-- insert into public.profiles (id, email, role, status, name, portal_district_key, created_at)
-- select u.id, u.email, 'portal_district_viewer', 'approved', 'Mumbai District Viewer', 'mumbai', now()
-- from auth.users u where lower(u.email) = lower('mumbai@gmail.com')
-- on conflict (id) do update set
--   email = excluded.email,
--   role = 'portal_district_viewer',
--   status = 'approved',
--   name = excluded.name,
--   portal_district_key = 'mumbai';

-- Pune → portal_district_key = 'pune'
-- Nashik → 'nashik'
-- Kolhapur → 'kolhapur'
-- Chhatrapati Sambhajinagar → 'chhatrapati_sambhajinagar'
-- Amrawati → 'amrawati'
-- Nagpur → 'nagpur'
-- Latur → 'latur'
-- (Use the same INSERT … ON CONFLICT pattern as Mumbai, with the correct key and email.)

-- Verify all district accounts:
select
  p.email,
  p.name,
  p.role,
  p.status,
  p.portal_district_key,
  d.district_name,
  d.institute_prefixes
from public.profiles p
left join public.portal_districts d on d.district_key = p.portal_district_key
where lower(coalesce(p.role, '')) = 'portal_district_viewer'
order by d.district_name;

-- After signing in on the website, run as that user (or check browser network → portal_session_info):
-- select public.portal_session_info();
