export function instituteIdSortKey(id: string): number {
  const n = parseInt(String(id).replace(/\D/g, ''), 10)
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER
}

export function compareInstituteId(a: string, b: string): number {
  const na = instituteIdSortKey(a)
  const nb = instituteIdSortKey(b)
  if (na !== nb) return na - nb
  return String(a).localeCompare(String(b), undefined, { numeric: true })
}

export function sortByInstituteId<T extends { id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => compareInstituteId(a.id, b.id))
}
