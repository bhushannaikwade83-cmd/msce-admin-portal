import { StudentDisplayPhoto } from './StudentDisplayPhoto'

type Student = Record<string, unknown> & {
  id: string
  name?: string | null
  roll_no?: string | null
  class_name?: string | null
  section?: string | null
  subjects?: string[] | string | null
  photo_url?: string | null
  face_photo_url?: string | null
  registration_photo_path?: string | null
}

type Institute = Record<string, unknown> & {
  id: string
  name?: string | null
  institute_code?: string | null
  city?: string | null
  state?: string | null
}

function pick(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k]
    if (v !== null && v !== undefined && v !== '') return String(v)
  }
  return null
}

function subjectsDisplay(subjects: unknown): string {
  if (Array.isArray(subjects)) return subjects.slice(0, 3).join(', ')
  if (typeof subjects === 'string') return subjects
  return '—'
}

function initials(name: string | null | undefined): string {
  if (!name) return '?'
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function StudentPhotoPrintPreview({
  institute,
  students,
  onClose,
}: {
  institute: Institute
  students: Student[]
  onClose: () => void
}) {
  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header - Print Friendly */}
      <div style={{ marginBottom: '2rem', textAlign: 'center', pageBreakAfter: 'avoid' }}>
        <h1 style={{ margin: '0 0 0.5rem', fontSize: '2rem', color: '#003087' }}>
          STUDENT PHOTO DIRECTORY
        </h1>
        <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.5rem', color: '#000' }}>
          {pick(institute, 'name') || 'Institute'}
        </h2>
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem', color: '#666' }}>
          {[
            pick(institute, 'institute_code') ? `Code: ${pick(institute, 'institute_code')}` : '',
            pick(institute, 'city') ? `City: ${pick(institute, 'city')}` : '',
            pick(institute, 'state') ? `State: ${pick(institute, 'state')}` : '',
          ]
            .filter(Boolean)
            .join(' • ')}
        </p>
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: '#999' }}>
          Total Students: {students.length} | Generated: {new Date().toLocaleDateString('en-IN')}
        </p>
      </div>

      {/* Close button */}
      <div style={{ marginBottom: '1.5rem', textAlign: 'right' }}>
        <button
          onClick={onClose}
          style={{
            padding: '0.5rem 1rem',
            background: '#003087',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.9rem',
          }}
        >
          Close Preview
        </button>
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: '#666' }}>
          💡 Press <strong>Cmd+P</strong> (Mac) or <strong>Ctrl+P</strong> (Windows) to print as PDF
        </p>
      </div>

      {/* Students Grid - Print Optimized */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '1.5rem',
          pageBreakInside: 'avoid',
        }}
      >
        {students.map((student) => {
          const name = pick(student, 'name', 'student_name', 'full_name') || '—'
          const roll = pick(student, 'sr_no', 'user_id', 'roll_no', 'roll_number', 'rollno') || '—'
          const cls = pick(student, 'class_name', 'class', 'grade') || '—'
          const subs = subjectsDisplay(student.subjects)

          return (
            <div
              key={student.id}
              style={{
                display: 'flex',
                gap: '1rem',
                padding: '1rem',
                border: '1px solid #ddd',
                borderRadius: '6px',
                background: '#f9f9f9',
                pageBreakInside: 'avoid',
              }}
            >
              {/* Photo */}
              <div
                style={{
                  width: '100px',
                  height: '100px',
                  flexShrink: 0,
                  borderRadius: '6px',
                  overflow: 'hidden',
                  background: '#e8eef7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px solid #ddd',
                }}
              >
                <StudentDisplayPhoto student={student} displayName={name} size="sm" />
                {!pick(student, 'face_photo_url', 'photo_url') && (
                  <span
                    style={{
                      fontSize: '1.8rem',
                      fontWeight: 'bold',
                      color: '#003087',
                      position: 'absolute',
                    }}
                  >
                    {initials(name)}
                  </span>
                )}
              </div>

              {/* Details */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ margin: '0 0 0.3rem', fontSize: '1rem', fontWeight: 'bold', color: '#003087' }}>
                  {name}
                </h3>
                <p style={{ margin: '0.2rem 0', fontSize: '0.85rem', color: '#666' }}>
                  <strong>Roll:</strong> {roll}
                </p>
                <p style={{ margin: '0.2rem 0', fontSize: '0.85rem', color: '#666' }}>
                  <strong>Class:</strong> {cls}
                </p>
                <p style={{ margin: '0.2rem 0', fontSize: '0.8rem', color: '#999', lineHeight: '1.3' }}>
                  <strong>Subjects:</strong> {subs}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body {
            margin: 0;
            padding: 0.5in;
          }
          button {
            display: none;
          }
          p:has(+ button) {
            display: none;
          }
          div {
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  )
}
