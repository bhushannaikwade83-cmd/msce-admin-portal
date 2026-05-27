-- Run this in Supabase SQL Editor if you see:
-- "Could not choose the best candidate function between ... update_institute_gps_setting_portal ..."
--
-- Then re-run the full manual_institute_gps_portal.sql (or at least the
-- update_institute_gps_setting_portal create block from that file).
-- Finally: NOTIFY pgrst, 'reload schema';

drop function if exists public.update_institute_gps_setting_portal(text, text, boolean, double precision, double precision, text);
drop function if exists public.update_institute_gps_setting_portal(text, text, boolean, double precision, double precision, text, boolean);
