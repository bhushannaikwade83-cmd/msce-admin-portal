-- District viewer portal (8 Maharashtra districts) — run ENTIRE file in Supabase SQL Editor.
--
-- ORDER:
--   1) MSCE APP: supabase/migrations/076_portal_district_viewers.sql  (once)
--   2) THIS FILE — full script below (safe to re-run)
--   3) sql/setup_mumbai_district_test_login.sql or setup_portal_district_logins.sql
--
-- Includes:
--   • Institute scope by code OR id prefix (11, 14, 15 = Mumbai, etc.)
--   • Instructors + admin-invite RPCs for district viewers (view-only website tabs)
--   • list_portal_institute_admin_invites — uses admin_invites + profiles only (NOT all institutes;
--     the old version that scanned every institute caused HTTP 500 / timeout)
--
-- After run: NOTIFY pgrst at bottom reloads API. Then sign out/in on /admin.
--
-- Quick fix only for 500 on list_portal_institute_admin_invites: sql/fix_list_portal_institute_admin_invites.sql

-- ---------------------------------------------------------------------------
-- Institute scope: code OR id (first 2 digits)
-- ---------------------------------------------------------------------------
create or replace function public.institute_code_in_portal_scope(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or public.is_coder()
    or (
      public.is_portal_district_viewer()
      and exists (
        select 1
        from unnest(public.portal_user_institute_prefixes()) pref
        where length(btrim(pref)) >= 2
          and left(public.normalized_institute_code(p_code), 2) = btrim(pref)
      )
    );
$$;

create or replace function public.institute_id_in_portal_scope(p_institute_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.institutes i
    where i.id = btrim(coalesce(p_institute_id, ''))
      and (
        public.institute_code_in_portal_scope(i.institute_code)
        or public.institute_code_in_portal_scope(i.id)
      )
  );
$$;

grant execute on function public.institute_code_in_portal_scope(text) to authenticated;
grant execute on function public.institute_id_in_portal_scope(text) to authenticated;

drop policy if exists "institutes_select_authenticated" on public.institutes;

create policy "institutes_select_authenticated"
  on public.institutes for select
  to authenticated
  using (
    public.is_super_admin()
    or public.is_coder()
    or (
      public.is_portal_district_viewer()
      and (
        public.institute_code_in_portal_scope(institute_code)
        or public.institute_code_in_portal_scope(id)
      )
    )
    or (
      not public.is_portal_district_viewer()
      and (
        public.is_institute_admin()
        or coalesce(is_active, true)
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Instructors list — district viewers (read-only)
-- ---------------------------------------------------------------------------
create or replace function public.list_portal_instructors_all()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'email', p.email,
        'phone_number', p.phone_number,
        'status', p.status,
        'institute_id', p.institute_id,
        'created_at', p.created_at,
        'last_login', p.last_login,
        'has_pin', coalesce(p.has_pin, false)
          or (p.pin_hash is not null and length(btrim(p.pin_hash)) > 0),
        'pin_set_at', p.pin_set_at,
        'institute_uuid', i.id,
        'institute_code', coalesce(nullif(btrim(i.institute_code), ''), i.id),
        'institute_name', coalesce(nullif(btrim(i.name), ''), i.id),
        'institute_active', i.is_active
      )
      order by coalesce(nullif(btrim(i.institute_code), ''), i.id), p.name
    ),
    '[]'::jsonb
  )
  from public.profiles p
  left join public.institutes i
    on i.id = p.institute_id
    or i.institute_code = p.institute_id
  where lower(coalesce(p.role, '')) = 'attendance_user'
    and i.id is not null
    and (
      public.can_access_portal_onboarding_list()
      or (
        public.is_portal_district_viewer()
        and (
          public.institute_code_in_portal_scope(i.institute_code)
          or public.institute_code_in_portal_scope(i.id)
        )
      )
    );
$$;

grant execute on function public.list_portal_instructors_all() to authenticated;

-- District viewers: read attendance_user profiles in their institute scope (direct-list fallback).
drop policy if exists "profiles_portal_district_attendance_select" on public.profiles;

create policy "profiles_portal_district_attendance_select"
  on public.profiles for select
  to authenticated
  using (
    public.is_portal_district_viewer()
    and lower(coalesce(role, '')) = 'attendance_user'
    and public.institute_id_in_portal_scope(institute_id)
  );

-- ---------------------------------------------------------------------------
-- portal_session_info — district tabs include instructors
-- ---------------------------------------------------------------------------
create or replace function public.portal_session_info()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_role text;
  v_status text;
  v_institute_id text;
  v_district_key text;
  v_district_name text;
  v_prefixes text[];
  v_is_district boolean;
  v_is_super boolean;
begin
  if v_uid is null then
    return jsonb_build_object(
      'authenticated', false,
      'can_list_onboarding', false,
      'portal_mode', 'anonymous',
      'read_only', true,
      'message', 'Not signed in'
    );
  end if;

  select lower(u.email::text) into v_email from auth.users u where u.id = v_uid;

  select p.role, p.status, p.institute_id, p.portal_district_key
  into v_role, v_status, v_institute_id, v_district_key
  from public.profiles p
  where p.id = v_uid;

  v_is_super := public.is_super_admin();
  v_is_district := public.is_portal_district_viewer();

  if v_is_district then
    select d.district_name, d.institute_prefixes
    into v_district_name, v_prefixes
    from public.portal_districts d
    where d.district_key = v_district_key;
  end if;

  return jsonb_build_object(
    'authenticated', true,
    'user_id', v_uid,
    'email', v_email,
    'profile_role', v_role,
    'profile_status', v_status,
    'institute_id', v_institute_id,
    'is_super_admin_fn', v_is_super,
    'is_coder_fn', public.is_coder(),
    'is_portal_district_viewer', v_is_district,
    'portal_district_key', v_district_key,
    'district_name', v_district_name,
    'institute_prefixes', coalesce(v_prefixes, array[]::text[]),
    'portal_mode',
      case
        when v_is_super then 'super_admin'
        when v_is_district then 'district_viewer'
        else 'other'
      end,
    'read_only', v_is_district and not v_is_super,
    'can_list_onboarding', public.can_access_portal_onboarding_list(),
    'allowed_tabs',
      case
        when v_is_super then jsonb_build_array(
          'overview', 'admins', 'instructors', 'institutes', 'add', 'students', 'integrity', 'reports'
        )
        when v_is_district then jsonb_build_array(
          'institutes', 'instructors', 'students', 'reports'
        )
        else jsonb_build_array()
      end,
    'message',
      case
        when v_is_super then 'OK — full portal access'
        when v_is_district then format(
          'OK — %s district view-only (institute codes: %s)',
          coalesce(v_district_name, v_district_key),
          array_to_string(coalesce(v_prefixes, array[]::text[]), ', ')
        )
        when public.can_access_portal_onboarding_list() then 'OK — portal onboarding list allowed'
        when v_role is null then 'No profiles row — contact MSCE tech support'
        when lower(coalesce(v_role, '')) = 'portal_district_viewer' and v_district_key is null then
          'District login missing portal_district_key on profiles — run setup_portal_district_logins.sql'
        when lower(coalesce(v_role, '')) <> 'super_admin' then
          format('profiles.role is "%s" — not authorised for this portal', v_role)
        when lower(coalesce(v_status, '')) not in ('approved', 'active', 'pending') then
          format('profiles.status is "%s" — set to approved', v_status)
        else 'Access denied — contact MSCE tech support'
      end
  );
end;
$$;

grant execute on function public.portal_session_info() to authenticated;

-- ---------------------------------------------------------------------------
-- Admin invite / password-setup status for Institutes tab (district + super admin)
-- Driven by admin_invites + admin profiles (not a full institutes scan — avoids 500 timeouts).
-- ---------------------------------------------------------------------------
create or replace function public.can_read_portal_institute_admin_row(p_institute_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or (
      public.is_portal_district_viewer()
      and public.institute_id_in_portal_scope(p_institute_id)
    );
$$;

grant execute on function public.can_read_portal_institute_admin_row(text) to authenticated;

create or replace function public.list_portal_institute_admin_invites()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(row_data order by institute_id), '[]'::jsonb)
  into v_result
  from (
    select
      jsonb_build_object(
        'institute_id', i.id,
        'full_name', ai.full_name,
        'phone', ai.phone,
        'email', ai.email,
        'claimed', coalesce(ai.claimed, false)
      ) as row_data,
      i.id as institute_id
    from public.admin_invites ai
    inner join public.institutes i on i.id = ai.institute_id
    where public.can_read_portal_institute_admin_row(i.id)

    union all

    select
      jsonb_build_object(
        'institute_id', i.id,
        'full_name', p.name,
        'phone', p.phone_number,
        'email', p.email,
        'claimed', true
      ) as row_data,
      i.id as institute_id
    from public.profiles p
    inner join public.institutes i on i.id = p.institute_id
    where lower(coalesce(p.role, '')) = 'admin'
      and lower(coalesce(p.status, '')) in ('approved', 'active', 'pending')
      and nullif(trim(coalesce(p.email, '')), '') is not null
      and public.can_read_portal_institute_admin_row(i.id)
      and not exists (
        select 1
        from public.admin_invites ai2
        where ai2.institute_id = i.id
      )
  ) combined;

  return coalesce(v_result, '[]'::jsonb);
exception
  when others then
    raise exception 'list_portal_institute_admin_invites: %', sqlerrm;
end;
$$;

grant execute on function public.list_portal_institute_admin_invites() to authenticated;

drop policy if exists "admin_invites_portal_district_select" on public.admin_invites;

create policy "admin_invites_portal_district_select"
  on public.admin_invites for select
  to authenticated
  using (
    public.is_portal_district_viewer()
    and public.institute_id_in_portal_scope(institute_id)
  );

notify pgrst, 'reload schema';
