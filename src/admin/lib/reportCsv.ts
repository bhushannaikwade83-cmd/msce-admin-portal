/** UTF-8 CSV helpers for institute / student / attendance exports */

export function csvEscape(cell: string | number | boolean | null | undefined): string {
  const s = cell === null || cell === undefined ? '' : String(cell)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function downloadCsv(filename: string, header: string[], rows: string[][]): void {
  const lines = [
    header.map(csvEscape).join(','),
    ...rows.map((r) => r.map(csvEscape).join(',')),
  ]
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function pick(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k]
    if (v !== null && v !== undefined && v !== '') return String(v)
  }
  return ''
}

export function instituteDirectoryCsvRows(
  rows: Array<{
    id: string
    institute_code?: string | null
    name?: string | null
    city?: string | null
    pincode?: string | null
    state?: string | null
    is_active?: boolean | null
    studentCount?: number | null
  }>,
  invites?: Record<string, { full_name?: string | null; phone?: string | null; email?: string | null; claimed?: boolean | null } | null | undefined>,
  districtLookup?: (id: string) => string | null,
): { header: string[]; data: string[][] } {
  const header = [
    'Sr No',
    'Institute ID',
    'Institute Code',
    'Name',
    'District',
    'City',
    'Pincode',
    'State',
    'Status',
    'Total Students',
    'Admin Name',
    'Phone',
    'Email',
  ]

  function createRows(filteredRows: typeof rows): string[][] {
    return filteredRows.map((r, index) => [
      String(index + 1),
      r.id,
      r.institute_code ?? '',
      r.name ?? '',
      districtLookup?.(r.id) ?? 'Unassigned',
      r.city ?? '',
      r.pincode ?? '',
      r.state ?? '',
      r.is_active !== false ? 'Active' : 'Inactive',
      String(r.studentCount ?? 0),
      invites?.[r.id]?.full_name?.trim() || '',
      invites?.[r.id]?.phone?.trim() || '',
      invites?.[r.id]?.email?.trim() || '',
    ])
  }

  // Separate into two groups
  const passwordSet = rows.filter((r) => invites?.[r.id]?.claimed === true)
  const passwordNotSet = rows.filter((r) => invites?.[r.id]?.claimed !== true)

  const data: string[][] = []

  // Add "Password Set in App" section
  if (passwordSet.length > 0) {
    data.push(['PASSWORD SET IN APP', '', '', '', '', '', '', '', '', '', '', '', ''])
    data.push(header)
    data.push(...createRows(passwordSet))
    data.push(['', '', '', '', '', '', '', '', '', '', '', '', ''])
  }

  // Add "Password Not Set in App" section
  if (passwordNotSet.length > 0) {
    data.push(['PASSWORD NOT SET IN APP', '', '', '', '', '', '', '', '', '', '', '', ''])
    data.push(header)
    data.push(...createRows(passwordNotSet))
  }

  return { header, data }
}

/** One row per student; institute columns repeated for filtering in Excel */
export function instituteStudentRosterRows(
  institute: {
    id: string
    institute_code?: string | null
    name?: string | null
    city?: string | null
    state?: string | null
  },
  students: Record<string, unknown>[],
): { header: string[]; data: string[][] } {
  const header = [
    'institute_id',
    'institute_code',
    'institute_name',
    'institute_city',
    'institute_state',
    'student_id',
    'student_name',
    'roll_sr_no',
    'class_name',
    'section',
    'email',
    'phone',
    'active',
  ]
  const data = students.map((s) => {
    const name = pick(s, 'name', 'student_name', 'full_name')
    const roll = pick(s, 'sr_no', 'user_id', 'roll_no', 'roll_number', 'rollno', 'admission_no')
    const cls = pick(s, 'class_name', 'class', 'grade', 'standard', 'std')
    const sec = pick(s, 'section', 'div', 'division')
    const active = s.is_active !== false ? 'yes' : 'no'
    return [
      institute.id,
      institute.institute_code ?? '',
      institute.name ?? '',
      institute.city ?? '',
      institute.state ?? '',
      String(s.id ?? ''),
      name,
      roll,
      cls,
      sec,
      pick(s, 'email', 'email_id'),
      pick(s, 'phone', 'mobile', 'phone_number'),
      active,
    ]
  })
  return { header, data }
}

export function attendanceReportRows(
  rows: Array<{
    date: string
    status: string
    inTime: string
    outTime: string
    inPhoto: string
    outPhoto: string
  }>,
): { header: string[]; data: string[][] } {
  const header = ['date', 'status', 'in_time', 'out_time', 'in_photo_url', 'out_photo_url']
  const data = rows.map((r) => [r.date, r.status, r.inTime, r.outTime, r.inPhoto, r.outPhoto])
  return { header, data }
}
