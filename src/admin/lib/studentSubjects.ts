/** Parse enrolled subjects from a `students` row (array column, legacy `subject` text, or individual sub1-sub8 fields). */
export function subjectsFromStudent(row: Record<string, unknown>): string[] {
  const subjects = new Set<string>()

  // Check array column
  const raw = row.subjects
  if (Array.isArray(raw)) {
    for (const x of raw) {
      const s = String(x).trim()
      if (s) subjects.add(s)
    }
    if (subjects.size > 0) return [...subjects]
  }

  // Check JSON string
  if (typeof raw === 'string' && raw.trim() !== '') {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        for (const x of parsed) {
          const s = String(x).trim()
          if (s) subjects.add(s)
        }
        if (subjects.size > 0) return [...subjects]
      }
    } catch {
      /* fall through */
    }
  }

  // Check legacy subject field
  const legacy = row.subject
  if (legacy != null && String(legacy).trim() !== '') {
    for (const s of String(legacy).split(',').map(x => x.trim()).filter(Boolean)) {
      subjects.add(s)
    }
    if (subjects.size > 0) return [...subjects]
  }

  // Check individual sub1-sub8 fields
  for (let i = 1; i <= 8; i++) {
    const subField = row[`sub${i}`]
    if (subField != null && String(subField).trim() !== '') {
      subjects.add(String(subField).trim())
    }
  }

  return [...subjects]
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
