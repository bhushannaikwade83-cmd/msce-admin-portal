import { getSupabase } from './supabase'

export type PortalInstructorManageResult = {
  success: boolean
  message?: string
  error?: string
  userId?: string
}

function parseFnPayload(raw: unknown): PortalInstructorManageResult {
  if (raw && typeof raw === 'object') {
    const data = raw as Record<string, unknown>
    if (data.success === true) {
      return {
        success: true,
        message: data.message?.toString(),
        userId: data.userId?.toString() ?? data.profileId?.toString(),
      }
    }
    const err = data.error ?? data.message
    return {
      success: false,
      message: err?.toString() ?? 'Request failed',
    }
  }
  return { success: false, message: 'Unexpected response from server' }
}

function parseFnError(e: unknown): string {
  if (e && typeof e === 'object') {
    const err = e as { message?: string; context?: { body?: unknown }; details?: unknown }
    const body = err.context?.body
    if (body && typeof body === 'object') {
      const b = body as Record<string, unknown>
      const msg = b.error ?? b.message
      if (msg != null && String(msg).trim()) return String(msg).trim()
    }
    if (typeof err.details === 'object' && err.details !== null) {
      const d = err.details as Record<string, unknown>
      const msg = d.error ?? d.message
      if (msg != null && String(msg).trim()) return String(msg).trim()
    }
    if (err.message?.trim()) return err.message.trim()
  }
  return e instanceof Error ? e.message : String(e)
}

async function invokePortalManageInstructor(
  body: Record<string, unknown>,
): Promise<PortalInstructorManageResult> {
  const sb = getSupabase()
  try {
    const { data, error } = await sb.functions.invoke('portal-manage-instructor', { body })
    if (error) {
      const msg = parseFnError(error)
      if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
        return {
          success: false,
          message:
            'Instructor service is not deployed. In Supabase Dashboard → Edge Functions, deploy `portal-manage-instructor` from this repo (supabase/functions/portal-manage-instructor).',
        }
      }
      return { success: false, message: msg }
    }
    return parseFnPayload(data)
  } catch (e) {
    return { success: false, message: parseFnError(e) }
  }
}

export async function createPortalInstructor(params: {
  instituteKey: string
  firstName: string
  middleName: string
  lastName: string
  mobile: string
  pin: string
}): Promise<PortalInstructorManageResult> {
  const first = params.firstName.trim()
  const middle = params.middleName.trim()
  const last = params.lastName.trim()
  const mobile = params.mobile.replace(/\D/g, '')
  const pin = params.pin.trim()
  const fullName = [first, middle, last].filter(Boolean).join(' ')

  return invokePortalManageInstructor({
    action: 'create',
    instituteKey: params.instituteKey.trim(),
    firstName: first,
    middleName: middle,
    lastName: last,
    fullName,
    mobile,
    pin,
  })
}

export async function updatePortalInstructor(params: {
  profileId: string
  fullName: string
  mobile: string
  pin?: string
}): Promise<PortalInstructorManageResult> {
  const body: Record<string, unknown> = {
    action: 'update',
    profileId: params.profileId,
    fullName: params.fullName.trim(),
    mobile: params.mobile.replace(/\D/g, ''),
  }
  const pin = params.pin?.trim()
  if (pin) body.pin = pin
  return invokePortalManageInstructor(body)
}

export async function deletePortalInstructor(profileId: string): Promise<PortalInstructorManageResult> {
  return invokePortalManageInstructor({
    action: 'delete',
    profileId,
  })
}

export function isValidInstructorPin(pin: string): boolean {
  return /^\d{4}$/.test(pin.trim())
}

export function isValidInstructorMobile(mobile: string): boolean {
  const d = mobile.replace(/\D/g, '')
  return d.length >= 10 && d.length <= 15
}
