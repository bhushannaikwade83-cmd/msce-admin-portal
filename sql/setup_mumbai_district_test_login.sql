-- Mumbai district viewer (testing) — mumbai@gmail.com
--
-- Prerequisites:
--   1) Run MSCE APP migration 076_portal_district_viewers.sql
--   2) Run sql/manual_portal_district_viewers.sql
--
-- Step A — Supabase Dashboard → Authentication → Users → Add user
--   Email:    mumbai@gmail.com
--   Password: (choose a test password you will use on /admin login)
--
-- Step B — Run this entire script in SQL Editor

insert into public.profiles (id, email, role, status, name, portal_district_key, created_at)
select
  u.id,
  u.email,
  'portal_district_viewer',
  'approved',
  'Mumbai District Viewer (test)',
  'mumbai',
  now()
from auth.users u
where lower(u.email) = lower('mumbai@gmail.com')
on conflict (id) do update
set
  email = excluded.email,
  role = 'portal_district_viewer',
  status = 'approved',
  name = excluded.name,
  portal_district_key = 'mumbai';

-- Must return 1 row with district Mumbai and prefixes {11,14,15}
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
where lower(p.email) = lower('mumbai@gmail.com');

-- After signing in at /admin as mumbai@gmail.com, expected portal_session_info includes:
--   portal_mode: district_viewer
--   read_only: true
--   district_name: Mumbai
--   institute_prefixes: ["11","14","15"]
--   allowed_tabs: institutes, instructors, students, reports
