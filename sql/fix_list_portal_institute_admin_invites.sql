-- Quick fix ONLY: list_portal_institute_admin_invites HTTP 500 (old version scanned all institutes).
-- Prefer running the full sql/manual_portal_district_viewers.sql instead (same functions, end of file).
-- Run this in Supabase SQL Editor if you already ran an older manual_portal_district_viewers.sql.

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

notify pgrst, 'reload schema';
