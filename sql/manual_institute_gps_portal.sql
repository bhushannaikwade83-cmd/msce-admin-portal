-- Run this once in Supabase SQL Editor to enable portal-side GPS lock/unlock,
-- current coordinate storage, and GPS history in the web admin.

alter table public.gps_settings
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.gps_settings_history (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null,
  admin_id uuid not null,
  action text null,
  note text null,
  old_is_locked boolean null,
  new_is_locked boolean null,
  old_latitude double precision null,
  old_longitude double precision null,
  new_latitude double precision null,
  new_longitude double precision null,
  changed_at timestamptz not null default now(),
  changed_by_user_id uuid null,
  changed_by_email text null
);

create index if not exists gps_settings_history_inst_admin_changed_idx
  on public.gps_settings_history (institute_id, admin_id, changed_at desc);

alter table public.gps_settings_history enable row level security;

drop policy if exists gps_settings_history_select_authenticated on public.gps_settings_history;
create policy gps_settings_history_select_authenticated
  on public.gps_settings_history
  for select
  to authenticated
  using (true);

drop policy if exists gps_settings_history_insert_authenticated on public.gps_settings_history;
create policy gps_settings_history_insert_authenticated
  on public.gps_settings_history
  for insert
  to authenticated
  with check (true);

create or replace function public.list_institute_gps_history_portal(
  p_institute_id uuid,
  p_admin_id uuid
)
returns table (
  id uuid,
  institute_id uuid,
  admin_id uuid,
  action text,
  note text,
  old_is_locked boolean,
  new_is_locked boolean,
  old_latitude double precision,
  old_longitude double precision,
  new_latitude double precision,
  new_longitude double precision,
  changed_at timestamptz,
  changed_by_user_id uuid,
  changed_by_email text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select lower(coalesce(p.role, ''))
    into v_role
  from public.profiles p
  where p.id = auth.uid();

  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if v_role <> 'super_admin' then
    raise exception 'Only super admins can read GPS history';
  end if;

  return query
  select
    h.id,
    h.institute_id,
    h.admin_id,
    h.action,
    h.note,
    h.old_is_locked,
    h.new_is_locked,
    h.old_latitude,
    h.old_longitude,
    h.new_latitude,
    h.new_longitude,
    h.changed_at,
    h.changed_by_user_id,
    h.changed_by_email
  from public.gps_settings_history h
  where h.institute_id = p_institute_id
    and h.admin_id = p_admin_id
  order by h.changed_at desc;
end;
$$;

create or replace function public.update_institute_gps_setting_portal(
  p_institute_id uuid,
  p_admin_id uuid,
  p_is_locked boolean,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_prev public.gps_settings%rowtype;
  v_email text;
  v_action text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select lower(coalesce(p.role, ''))
    into v_role
  from public.profiles p
  where p.id = auth.uid();

  if v_role <> 'super_admin' then
    raise exception 'Only super admins can update GPS settings';
  end if;

  if p_latitude is not null and (p_latitude < -90 or p_latitude > 90) then
    raise exception 'Latitude must be between -90 and 90';
  end if;

  if p_longitude is not null and (p_longitude < -180 or p_longitude > 180) then
    raise exception 'Longitude must be between -180 and 180';
  end if;

  if p_is_locked = false and (p_latitude is null or p_longitude is null) then
    raise exception 'Unlocked GPS requires both latitude and longitude';
  end if;

  select *
    into v_prev
  from public.gps_settings g
  where g.institute_id = p_institute_id
    and g.admin_id = p_admin_id;

  select nullif(auth.jwt() ->> 'email', '')
    into v_email;

  if found then
    if coalesce(v_prev.is_locked, false) <> p_is_locked and p_is_locked = false then
      v_action := 'unlock';
    elsif coalesce(v_prev.is_locked, false) <> p_is_locked and p_is_locked = true then
      v_action := 'lock';
    else
      v_action := 'set_gps';
    end if;
  else
    v_action := case when p_is_locked then 'create_locked' else 'create_unlocked' end;
  end if;

  insert into public.gps_settings_history (
    institute_id,
    admin_id,
    action,
    note,
    old_is_locked,
    new_is_locked,
    old_latitude,
    old_longitude,
    new_latitude,
    new_longitude,
    changed_at,
    changed_by_user_id,
    changed_by_email
  )
  values (
    p_institute_id,
    p_admin_id,
    v_action,
    nullif(trim(coalesce(p_note, '')), ''),
    v_prev.is_locked,
    p_is_locked,
    v_prev.latitude,
    v_prev.longitude,
    p_latitude,
    p_longitude,
    now(),
    auth.uid(),
    v_email
  );

  if v_prev.institute_id is null then
    insert into public.gps_settings (
      institute_id,
      admin_id,
      is_locked,
      latitude,
      longitude,
      updated_at
    )
    values (
      p_institute_id,
      p_admin_id,
      p_is_locked,
      p_latitude,
      p_longitude,
      now()
    );
  else
    update public.gps_settings
    set
      is_locked = p_is_locked,
      latitude = p_latitude,
      longitude = p_longitude,
      updated_at = now()
    where institute_id = p_institute_id
      and admin_id = p_admin_id;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'institutes'
      and column_name = 'gps_locked'
  ) then
    execute 'update public.institutes set gps_locked = $1, updated_at = now() where id = $2'
      using p_is_locked, p_institute_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'message', 'GPS updated',
    'action', v_action
  );
end;
$$;

grant execute on function public.list_institute_gps_history_portal(uuid, uuid) to authenticated;
grant execute on function public.update_institute_gps_setting_portal(uuid, uuid, boolean, double precision, double precision, text) to authenticated;
