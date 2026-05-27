import { getSupabase } from './supabase'

export type PortalGpsSettingRow = Record<string, unknown> & {
  institute_id: string
  admin_id: string
  is_locked: boolean | null
  latitude?: number | null
  longitude?: number | null
  updated_at?: string | null
  created_at?: string | null
}

export type PortalGpsAdminLine = {
  adminId: string
  label: string
  hasRow: boolean
  is_locked: boolean | null
  latitude: number | null
  longitude: number | null
  updated_at: string | null
}

export type PortalGpsHistoryRow = {
  id: string
  institute_id: string
  admin_id: string
  action: string | null
  note: string | null
  old_is_locked: boolean | null
  new_is_locked: boolean | null
  old_latitude: number | null
  old_longitude: number | null
  new_latitude: number | null
  new_longitude: number | null
  changed_at: string
  changed_by_user_id: string | null
  changed_by_email: string | null
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function gpsLatitude(row: Record<string, unknown> | null | undefined): number | null {
  if (!row) return null
  return num(row.latitude ?? row.lat ?? row.gps_latitude)
}

export function gpsLongitude(row: Record<string, unknown> | null | undefined): number | null {
  if (!row) return null
  return num(row.longitude ?? row.lng ?? row.gps_longitude)
}

export function gpsUpdatedAt(row: Record<string, unknown> | null | undefined): string | null {
  if (!row) return null
  const v = row.updated_at ?? row.modified_at ?? row.created_at
  return v != null && String(v).trim() !== '' ? String(v) : null
}

export function formatGpsPair(lat: number | null, lng: number | null): string | null {
  if (!Number.isFinite(lat ?? NaN) || !Number.isFinite(lng ?? NaN)) return null
  return `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`
}

export function googleMapsUrl(lat: number | null, lng: number | null): string | null {
  if (!Number.isFinite(lat ?? NaN) || !Number.isFinite(lng ?? NaN)) return null
  return `https://www.google.com/maps?q=${lat},${lng}`
}

export function hasGpsCoordinates(lat: number | null, lng: number | null): boolean {
  return formatGpsPair(lat, lng) != null
}

export async function fetchGpsSettingRow(instituteId: string, adminId: string): Promise<PortalGpsSettingRow | null> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('gps_settings')
    .select('*')
    .eq('institute_id', instituteId)
    .eq('admin_id', adminId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data ?? null) as PortalGpsSettingRow | null
}

export async function fetchGpsHistoryRows(instituteId: string, adminId: string): Promise<PortalGpsHistoryRow[]> {
  const sb = getSupabase()
  const { data, error } = await sb.rpc('list_institute_gps_history_portal', {
    p_institute_id: instituteId,
    p_admin_id: adminId,
  })
  if (error) {
    throw new Error(`${error.message} Run sql/manual_institute_gps_portal.sql in Supabase if history is not enabled yet.`)
  }
  if (!Array.isArray(data)) return []
  return data.map((row) => row as PortalGpsHistoryRow)
}

type SaveGpsResult = {
  success?: boolean
  message?: string
}

export async function saveGpsSettingWithHistory(params: {
  instituteId: string
  adminId: string
  isLocked: boolean
  latitude: number | null
  longitude: number | null
  note?: string
}): Promise<void> {
  const sb = getSupabase()
  const { data, error } = await sb.rpc('update_institute_gps_setting_portal', {
    p_institute_id: params.instituteId,
    p_admin_id: params.adminId,
    p_is_locked: params.isLocked,
    p_latitude: params.latitude,
    p_longitude: params.longitude,
    p_note: params.note?.trim() || null,
    p_clear_coordinates: false,
  })
  if (error) {
    throw new Error(`${error.message} Run sql/manual_institute_gps_portal.sql in Supabase if portal GPS write access is not enabled yet.`)
  }
  const result = (data ?? {}) as SaveGpsResult
  if (result.success === false) {
    throw new Error(result.message ?? 'Could not save GPS settings.')
  }
}

/** Clears GPS (null lat/lng, unlocked). Previous coordinates are stored in history as "old". */
export async function clearGpsSettingWithHistory(params: {
  instituteId: string
  adminId: string
  note?: string
}): Promise<void> {
  const sb = getSupabase()
  const { data, error } = await sb.rpc('update_institute_gps_setting_portal', {
    p_institute_id: params.instituteId,
    p_admin_id: params.adminId,
    p_is_locked: false,
    p_latitude: null,
    p_longitude: null,
    p_note:
      params.note?.trim() ||
      'Portal: GPS cleared — previous location saved; institute sets new location from app.',
    p_clear_coordinates: true,
  })
  if (error) {
    throw new Error(
      `${error.message} Run sql/manual_institute_gps_portal.sql in Supabase (includes clear GPS support).`,
    )
  }
  const result = (data ?? {}) as SaveGpsResult
  if (result.success === false) {
    throw new Error(result.message ?? 'Could not clear GPS settings.')
  }
}
