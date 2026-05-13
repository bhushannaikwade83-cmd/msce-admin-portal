/**
 * Helpers for `attendance_in_out` (flat entry/exit rows: institute_code, attendance_date, additional JSON).
 */

export type InstituteCodeSource = {
  id: string
  institute_code: string | null
}

/** Flutter stores human institute_code; legacy rows may use institute UUID in this column. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase builder types recurse deeply with generics
export function applyInstituteCodeFilter(q: any, inst: InstituteCodeSource): any {
  const code = inst.institute_code?.trim()
  if (code && code !== inst.id) {
    return q.or(`institute_code.eq.${code},institute_code.eq.${inst.id}`)
  }
  return q.eq('institute_code', code || inst.id)
}

export function flattenAttendanceInOutRow(row: Record<string, unknown>): Record<string, unknown> {
  const add =
    row.additional !== null && typeof row.additional === 'object'
      ? (row.additional as Record<string, unknown>)
      : {}
  const type = String(row.type ?? '')
  const dateVal = row.attendance_date ?? row.date
  const dateStr = dateVal != null ? String(dateVal).slice(0, 10) : null

  const rawStatus = add.status != null ? String(add.status) : ''
  const status =
    rawStatus.trim() ||
    (type === 'entry' || type === 'exit' ? 'present' : '')

  let inTime: string | null = null
  let outTime: string | null = null
  if (add.entryTime) inTime = String(add.entryTime)
  if (add.exitTime) outTime = String(add.exitTime)
  if (type === 'entry' && !inTime && row.created_at != null) inTime = String(row.created_at)
  if (type === 'exit' && !outTime && row.created_at != null) outTime = String(row.created_at)

  const photo = row.photo_url != null ? String(row.photo_url) : ''
  const inPhoto =
    type === 'entry'
      ? photo || (add.entryPhoto != null ? String(add.entryPhoto) : '') || null
      : (add.entryPhoto != null ? String(add.entryPhoto) : null)
  const outPhoto =
    type === 'exit'
      ? photo || (add.exitPhoto != null ? String(add.exitPhoto) : '') || null
      : (add.exitPhoto != null ? String(add.exitPhoto) : null)

  const subj = add.subject != null ? String(add.subject) : ''

  return {
    ...row,
    id: String(row.id ?? ''),
    date: dateStr,
    status: status || null,
    in_time: inTime,
    out_time: outTime,
    in_photo_url: inPhoto,
    out_photo_url: outPhoto,
    student_id: row.student_id != null ? String(row.student_id) : null,
    subject_id: subj || null,
  }
}
