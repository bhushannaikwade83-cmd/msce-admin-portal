// Predefined subject list organized by subject family and level
export const PREDEFINED_SUBJECTS = [
  // GCC TBC ENG (English)
  { family: 'GCC TBC ENG', level: '30', name: 'GCC TBC ENG 30' },
  { family: 'GCC TBC ENG', level: '40', name: 'GCC TBC ENG 40' },
  { family: 'GCC TBC ENG', level: '50', name: 'GCC TBC ENG 50' },

  // GCC TBC MAR (Marathi)
  { family: 'GCC TBC MAR', level: '30', name: 'GCC TBC MAR 30' },
  { family: 'GCC TBC MAR', level: '40', name: 'GCC TBC MAR 40' },
  { family: 'GCC TBC MAR', level: '50', name: 'GCC TBC MAR 50' },

  // GCC TBC HINDI (Hindi)
  { family: 'GCC TBC HINDI', level: '30', name: 'GCC TBC HINDI 30' },
  { family: 'GCC TBC HINDI', level: '40', name: 'GCC TBC HINDI 40' },
  { family: 'GCC TBC HINDI', level: '50', name: 'GCC TBC HINDI 50' },
]

export function groupSubjectsByFamily(subjects: typeof PREDEFINED_SUBJECTS) {
  const grouped = new Map<string, typeof PREDEFINED_SUBJECTS>()
  for (const subject of subjects) {
    if (!grouped.has(subject.family)) {
      grouped.set(subject.family, [])
    }
    grouped.get(subject.family)!.push(subject)
  }
  return grouped
}
