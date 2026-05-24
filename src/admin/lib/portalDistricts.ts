/** Maharashtra district → institute_code prefixes (first 2 digits). Mirrors `portal_districts` table. */
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
