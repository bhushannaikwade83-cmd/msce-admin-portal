/** Parse enrolled subjects from a `students` row (array column or legacy `subject` text). */
export function subjectsFromStudent(row: Record<string, unknown>): string[] {
  const raw = row.subjects
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((x) => String(x).trim()).filter(Boolean))]
  }
  if (typeof raw === 'string' && raw.trim() !== '') {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        return [...new Set(parsed.map((x) => String(x).trim()).filter(Boolean))]
      }
    } catch {
      /* fall through */
    }
  }
  const legacy = row.subject
  if (legacy != null && String(legacy).trim() !== '') {
    return [...new Set(String(legacy).split(',').map((s) => s.trim()).filter(Boolean))]
  }
  return []
}

export function subjectsToCsv(list: string[]): string {
  return list.join(', ')
}

export function parseSubjectsCsv(csv: string): string[] {
  return [...new Set(csv.split(',').map((s) => s.trim()).filter(Boolean))]
}

export function formatSubjectsDisplay(list: string[], max = 3): string {
  if (list.length === 0) return '—'
  if (list.length <= max) return list.join(', ')
  return `${list.slice(0, max).join(', ')} +${list.length - max}`
}
