import { useState, useEffect } from 'react'
import { StudentDisplayPhoto } from './StudentDisplayPhoto'

type Student = Record<string, unknown> & {
  id: string
  name?: string | null
  roll_no?: string | null
  class_name?: string | null
  photo_url?: string | null
  face_photo_url?: string | null
  subjects?: string[] | string | null
}

type Institute = Record<string, unknown> & {
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

function initials(name: string | null | undefined): string {
  if (!name) return '?'
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function DevicesInPhotoReview({
  institute,
  students,
  onBack,
}: {
  institute: Institute
  students: Student[]
  onBack: () => void
}) {
  const [viewMode, setViewMode] = useState<'review' | 'report'>('review')
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(() => {
    const saved = localStorage.getItem(`flagged_devices_${pick(institute, 'id') || 'unknown'}`)
    return saved ? new Set(JSON.parse(saved)) : new Set()
  })

  useEffect(() => {
    localStorage.setItem(
      `flagged_devices_${pick(institute, 'id') || 'unknown'}`,
      JSON.stringify(Array.from(flaggedIds)),
    )
  }, [flaggedIds, institute])

  const toggleFlag = (id: string) => {
    setFlaggedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const flaggedStudents = students.filter((s) => flaggedIds.has(s.id))

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.8rem', color: '#003087' }}>
            📱 DEVICES IN PHOTO REVIEW
          </h1>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem', color: '#666' }}>
            {pick(institute, 'name') || 'Institute'} • {pick(institute, 'institute_code')} • {flaggedStudents.length} flagged
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setViewMode('review')}
            style={{
              padding: '0.5rem 1rem',
              background: viewMode === 'review' ? '#003087' : '#ddd',
              color: viewMode === 'review' ? 'white' : '#333',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: viewMode === 'review' ? 'bold' : 'normal',
            }}
          >
            📸 Review
          </button>
          <button
            onClick={() => setViewMode('report')}
            style={{
              padding: '0.5rem 1rem',
              background: viewMode === 'report' ? '#ff6600' : '#ddd',
              color: viewMode === 'report' ? 'white' : '#333',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: viewMode === 'report' ? 'bold' : 'normal',
            }}
          >
            ⚠️ Flagged Report ({flaggedStudents.length})
          </button>
          <button
            onClick={onBack}
            style={{
              padding: '0.5rem 1rem',
              background: '#ccc',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            ← Back
          </button>
        </div>
      </div>

      {viewMode === 'review' ? (
        <>
          {/* Instructions */}
          <div
            style={{
              background: '#fff3e8',
              border: '1px solid #ff9800',
              borderRadius: '6px',
              padding: '1rem',
              marginBottom: '2rem',
              fontSize: '0.9rem',
              color: '#e65100',
            }}
          >
            👆 <strong>Click photo to flag</strong> - Students who took photo with phone/computer visible
          </div>

          {/* Two Column Layout */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        {/* Left: Review Grid */}
        <div>
          <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem', color: '#333' }}>📸 All Students</h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '1rem',
            }}
          >
            {students.map((student) => {
              const name = pick(student, 'name', 'student_name', 'full_name') || '—'
              const isFlagged = flaggedIds.has(student.id)

              return (
                <div
                  key={student.id}
                  onClick={() => toggleFlag(student.id)}
                  style={{
                    padding: '1rem',
                    border: isFlagged ? '3px solid #ff6600' : '1px solid #ddd',
                    borderRadius: '8px',
                    background: isFlagged ? '#fff3e8' : '#f9f9f9',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {/* Photo */}
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '1',
                      borderRadius: '6px',
                      overflow: 'hidden',
                      background: '#e8eef7',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: '0.75rem',
                      border: '2px solid #ddd',
                      position: 'relative',
                    }}
                  >
                    <StudentDisplayPhoto student={student} displayName={name} size="sm" />
                    {!pick(student, 'face_photo_url', 'photo_url') && (
                      <span
                        style={{
                          fontSize: '2rem',
                          fontWeight: 'bold',
                          color: '#003087',
                        }}
                      >
                        {initials(name)}
                      </span>
                    )}
                    {isFlagged && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '0.5rem',
                          right: '0.5rem',
                          background: '#ff6600',
                          color: 'white',
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1.2rem',
                          fontWeight: 'bold',
                        }}
                      >
                        ✓
                      </div>
                    )}
                  </div>

                  {/* Name */}
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', fontWeight: 'bold', color: '#333' }}>
                    {name}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right: Flagged Students List */}
        <div>
          <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem', color: '#333' }}>⚠️ FLAGGED ({flaggedStudents.length})</h2>

          {flaggedStudents.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '2rem',
                background: '#f5f5f5',
                borderRadius: '6px',
                color: '#999',
              }}
            >
              No flagged students
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {flaggedStudents.map((student) => {
                const name = pick(student, 'name', 'student_name', 'full_name') || '—'
                const roll = pick(student, 'sr_no', 'user_id', 'roll_no', 'roll_number', 'rollno') || '—'
                const cls = pick(student, 'class_name', 'class', 'grade') || '—'

                return (
                  <div
                    key={student.id}
                    style={{
                      display: 'flex',
                      gap: '1rem',
                      padding: '1rem',
                      background: '#fff3e8',
                      border: '2px solid #ff6600',
                      borderRadius: '6px',
                    }}
                  >
                    {/* Photo */}
                    <div
                      style={{
                        width: '80px',
                        height: '80px',
                        borderRadius: '6px',
                        overflow: 'hidden',
                        background: '#e8eef7',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        border: '2px solid #ddd',
                        position: 'relative',
                      }}
                    >
                      <StudentDisplayPhoto student={student} displayName={name} size="sm" />
                      {!pick(student, 'face_photo_url', 'photo_url') && (
                        <span
                          style={{
                            fontSize: '1.5rem',
                            fontWeight: 'bold',
                            color: '#003087',
                          }}
                        >
                          {initials(name)}
                        </span>
                      )}
                    </div>

                    {/* Details */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ margin: '0 0 0.3rem', fontSize: '0.95rem', fontWeight: 'bold', color: '#e65100' }}>
                        {name}
                      </h3>
                      <p style={{ margin: '0.2rem 0', fontSize: '0.8rem', color: '#666' }}>
                        Roll: <strong>{roll}</strong> | Class: <strong>{cls}</strong>
                      </p>
                      <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: '#999' }}>
                        {pick(institute, 'name')} • {pick(institute, 'institute_code')}
                      </p>
                      <button
                        onClick={() => toggleFlag(student.id)}
                        style={{
                          marginTop: '0.5rem',
                          padding: '0.3rem 0.6rem',
                          background: '#ff6600',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          fontWeight: 'bold',
                        }}
                      >
                        ✓ UNFLAG
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
        </>
      ) : (
        /* FLAGGED REPORT VIEW */
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          {flaggedStudents.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '3rem 2rem',
                background: '#f5f5f5',
                borderRadius: '8px',
                color: '#999',
              }}
            >
              <p style={{ fontSize: '1.2rem', margin: '0' }}>✓ No flagged students</p>
              <p style={{ fontSize: '0.9rem', color: '#bbb', margin: '0.5rem 0 0' }}>
                All students have good photo quality!
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {flaggedStudents.map((student, idx) => {
                const name = pick(student, 'name', 'student_name', 'full_name') || '—'
                const roll = pick(student, 'sr_no', 'user_id', 'roll_no', 'roll_number', 'rollno') || '—'
                const cls = pick(student, 'class_name', 'class', 'grade') || '—'
                const subs = Array.isArray(student.subjects)
                  ? student.subjects.slice(0, 2).join(', ')
                  : typeof student.subjects === 'string'
                    ? student.subjects
                    : '—'

                return (
                  <div
                    key={student.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '120px 1fr',
                      gap: '1.5rem',
                      padding: '1.5rem',
                      background: '#fff3e8',
                      border: '3px solid #ff6600',
                      borderRadius: '8px',
                      alignItems: 'center',
                    }}
                  >
                    {/* Photo - Large */}
                    <div
                      style={{
                        width: '120px',
                        height: '120px',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        background: '#e8eef7',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '3px solid #ff6600',
                        position: 'relative',
                        gridRow: '1 / 3',
                      }}
                    >
                      <StudentDisplayPhoto student={student} displayName={name} size="sm" />
                      {!pick(student, 'face_photo_url', 'photo_url') && (
                        <span
                          style={{
                            fontSize: '2.5rem',
                            fontWeight: 'bold',
                            color: '#ff6600',
                          }}
                        >
                          {initials(name)}
                        </span>
                      )}
                      <span
                        style={{
                          position: 'absolute',
                          top: '0.5rem',
                          right: '0.5rem',
                          background: '#ff6600',
                          color: 'white',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '3px',
                          fontSize: '0.75rem',
                          fontWeight: 'bold',
                        }}
                      >
                        #{idx + 1}
                      </span>
                    </div>

                    {/* Details - Top */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.3rem', fontWeight: 'bold', color: '#e65100' }}>
                          {name}
                        </h2>
                        <p style={{ margin: '0.3rem 0', fontSize: '0.9rem', color: '#666' }}>
                          <strong>Roll:</strong> {roll} | <strong>Class:</strong> {cls}
                        </p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ margin: '0 0 0.3rem', fontSize: '0.85rem', fontWeight: 'bold', color: '#003087' }}>
                          {pick(institute, 'name')}
                        </p>
                        <p style={{ margin: '0', fontSize: '0.8rem', color: '#666' }}>
                          Code: <strong>{pick(institute, 'institute_code')}</strong>
                        </p>
                      </div>
                    </div>

                    {/* Details - Bottom */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                      <div>
                        <p style={{ margin: '0', fontSize: '0.8rem', color: '#999' }}>
                          <strong>Subjects:</strong> {subs}
                        </p>
                        {pick(institute, 'city') && (
                          <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#999' }}>
                            📍 {pick(institute, 'city')}
                            {pick(institute, 'state') ? `, ${pick(institute, 'state')}` : ''}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => toggleFlag(student.id)}
                        style={{
                          padding: '0.5rem 1rem',
                          background: '#ff6600',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                          fontWeight: 'bold',
                        }}
                      >
                        ✓ UNFLAG
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
