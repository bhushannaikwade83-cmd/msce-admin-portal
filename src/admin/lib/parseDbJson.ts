/**
 * DB columns sometimes store JSON objects; PostgREST may return either an object or a stringified JSON blob.
 */
export function parseDbJsonObject(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value === 'string') {
    const t = value.trim()
    if (!t) return {}
    try {
      const j = JSON.parse(t) as unknown
      if (j !== null && typeof j === 'object' && !Array.isArray(j)) return j as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return {}
}
