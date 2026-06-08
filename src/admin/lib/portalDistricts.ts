/** Maharashtra district → institute id/code prefixes (first 2 digits). Mirrors `portal_districts` table. */
export type PortalDistrict = (typeof PORTAL_DISTRICTS)[number]

export const PORTAL_DISTRICTS = [
  { key: 'mumbai', name: 'Mumbai', prefixes: ['11', '14', '15'] },
  { key: 'pune', name: 'Pune', prefixes: ['21', '22', '23'] },
  { key: 'nashik', name: 'Nashik', prefixes: ['31', '32', '33', '34'] },
  { key: 'kolhapur', name: 'Kolhapur', prefixes: ['41', '42', '43', '44', '45'] },
  {
    key: 'chhatrapati_sambhajinagar',
    name: 'Chhatrapati Sambhajinagar',
    prefixes: ['51', '52', '53', '54', '55'],
  },
  { key: 'amrawati', name: 'Amrawati', prefixes: ['61', '62', '63', '64', '65'] },
  { key: 'nagpur', name: 'Nagpur', prefixes: ['71', '72', '73', '74', '75', '76'] },
  { key: 'latur', name: 'Latur', prefixes: ['81', '82', '83'] },
] as const

export function instituteCodeMatchesPrefixes(
  instituteCode: string | null | undefined,
  prefixes: readonly string[],
): boolean {
  const raw = (instituteCode ?? '').trim()
  if (!raw || prefixes.length === 0) return false
  const normalized = raw.padStart(5, '0')
  const head = normalized.slice(0, 2)
  return prefixes.some((p) => head === p)
}

export function instituteRowMatchesPrefixes(
  row: { id: string; institute_code?: string | null },
  prefixes: readonly string[],
): boolean {
  if (!prefixes.length) return true
  return (
    instituteCodeMatchesPrefixes(row.id, prefixes) ||
    instituteCodeMatchesPrefixes(row.institute_code, prefixes)
  )
}

/** Client-side guard when RLS or RPC returns extra rows (super-admin paths). */
export function filterInstitutesByPortalPrefixes<T extends { id: string; institute_code?: string | null }>(
  rows: readonly T[],
  prefixes: readonly string[],
): T[] {
  if (!prefixes.length) return [...rows]
  return rows.filter((r) => instituteRowMatchesPrefixes(r, prefixes))
}

export function findPortalDistrictByKey(key: string): PortalDistrict | undefined {
  return PORTAL_DISTRICTS.find((d) => d.key === key)
}

/** Map session `institute_prefixes` from district viewer login to a portal district row. */
export function findPortalDistrictForPrefixes(prefixes: readonly string[]): PortalDistrict | undefined {
  if (!prefixes.length) return undefined
  const set = new Set(prefixes.map(String))
  const exact = PORTAL_DISTRICTS.find(
    (d) => d.prefixes.length === set.size && d.prefixes.every((p) => set.has(p)),
  )
  if (exact) return exact
  return PORTAL_DISTRICTS.find((d) => d.prefixes.some((p) => set.has(p)))
}

export function formatDistrictPrefixHint(prefixes: readonly string[]): string {
  return prefixes.join(', ')
}

export function countInstitutesPerDistrict(
  rows: readonly { id: string; institute_code?: string | null }[],
): Record<string, number> {
  const counts: Record<string, number> = { '': rows.length }
  for (const d of PORTAL_DISTRICTS) {
    counts[d.key] = rows.filter((r) => instituteRowMatchesPrefixes(r, d.prefixes)).length
  }
  return counts
}

/** First matching MSCE portal district for an institute id/code, else null. */
export function resolvePortalDistrictName(
  row: { id: string; institute_code?: string | null },
): string | null {
  for (const d of PORTAL_DISTRICTS) {
    if (instituteRowMatchesPrefixes(row, d.prefixes)) return d.name
  }
  return null
}

export type DistrictAdminStats = {
  district: string
  prefixes: string
  total: number
  active: number
  inactive: number
  pendingPassword: number
  passwordSetInApp: number
  noAdminInvite: number
}

export function computeDistrictAdminStats(
  rows: readonly { id: string; institute_code?: string | null; is_active?: boolean | null }[],
  invites: Record<string, { claimed?: boolean | null } | null | undefined>,
): DistrictAdminStats[] {
  const byDistrict = new Map<string, DistrictAdminStats>()

  const ensure = (name: string, prefixes: string) => {
    let row = byDistrict.get(name)
    if (!row) {
      row = {
        district: name,
        prefixes,
        total: 0,
        active: 0,
        inactive: 0,
        pendingPassword: 0,
        passwordSetInApp: 0,
        noAdminInvite: 0,
      }
      byDistrict.set(name, row)
    }
    return row
  }

  for (const d of PORTAL_DISTRICTS) {
    ensure(d.name, formatDistrictPrefixHint(d.prefixes))
  }
  ensure('Unassigned', '—')

  for (const inst of rows) {
    const districtName = resolvePortalDistrictName(inst) ?? 'Unassigned'
    const prefixes =
      PORTAL_DISTRICTS.find((d) => d.name === districtName)?.prefixes.join(', ') ?? '—'
    const bucket = ensure(districtName, prefixes)
    bucket.total += 1
    if (inst.is_active !== false) bucket.active += 1
    else bucket.inactive += 1
    const inv = invites[inst.id]
    if (!inv) bucket.noAdminInvite += 1
    else if (inv.claimed) bucket.passwordSetInApp += 1
    else bucket.pendingPassword += 1
  }

  const ordered = PORTAL_DISTRICTS.map((d) => byDistrict.get(d.name)!)
  const unassigned = byDistrict.get('Unassigned')
  if (unassigned && unassigned.total > 0) ordered.push(unassigned)
  return ordered
}
