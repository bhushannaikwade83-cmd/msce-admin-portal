import { useState, useEffect, useCallback } from 'react'
import { getSupabase } from '../lib/supabase'
import { DevicesInPhotoReview } from './DevicesInPhotoReview'

type Institute = Record<string, unknown> & {
  id: string
  name?: string | null
  institute_code?: string | null
  city?: string | null
  state?: string | null
}

type Student = Record<string, unknown> & {
  id: string
  name?: string | null
  roll_no?: string | null
  class_name?: string | null
  photo_url?: string | null
  face_photo_url?: string | null
}

export function DevicesInPhotoTab({
  embedded: _embedded,
  jumpToInstituteId,
  onJumpToInstituteHandled,
}: {
  embedded?: boolean
  jumpToInstituteId?: string | null
  onJumpToInstituteHandled?: () => void
}) {
  const [institutes, setInstitutes] = useState<Institute[]>([])
  const [selectedInstitute, setSelectedInstitute] = useState<Institute | null>(null)
  const [students, setStudents] = useState<Student[]>([])

  // Load institutes on mount
  useEffect(() => {
    const loadInstitutes = async () => {
      try {
        const supabase = getSupabase()
        const { data, error } = await supabase
          .from('institutions')
          .select('id, name, institute_code, city, state')
          .order('name')

        if (!error && data) {
          setInstitutes(data as Institute[])
        }
      } catch (err) {
        console.error('Error loading institutes:', err)
      }
    }

    loadInstitutes()
  }, [])

  // If jumpToInstituteId is provided, select that institute
  useEffect(() => {
    if (jumpToInstituteId) {
      const institute = institutes.find((i) => i.id === jumpToInstituteId)
      if (institute) {
        setSelectedInstitute(institute)
        onJumpToInstituteHandled?.()
      }
    }
  }, [jumpToInstituteId, institutes, onJumpToInstituteHandled])

  // Load students when institute is selected
  useEffect(() => {
    const loadStudents = async () => {
      if (!selectedInstitute) return
      try {
        const supabase = getSupabase()
        const { data, error } = await supabase
          .from('students')
          .select('id, name, roll_no, class_name, photo_url, face_photo_url')
          .eq('institution_id', selectedInstitute.id)
          .order('name')

        if (!error && data) {
          setStudents(data as Student[])
        }
      } catch (err) {
        console.error('Error loading students:', err)
      }
    }

    loadStudents()
  }, [selectedInstitute])

  const handleBack = useCallback(() => {
    setSelectedInstitute(null)
    setStudents([])
  }, [])

  // If an institute is selected, show the review component
  if (selectedInstitute) {
    return (
      <DevicesInPhotoReview
        institute={selectedInstitute}
        students={students}
        onBack={handleBack}
      />
    )
  }

  // Otherwise, show institute selector
  return (
    <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '0.5rem', fontSize: '1.8rem', color: '#003087' }}>
        📱 DEVICES IN PHOTO REVIEW
      </h1>
      <p style={{ margin: '0.5rem 0 1.5rem', fontSize: '0.9rem', color: '#666' }}>
        Flag students who took photos while holding phones or computers
      </p>

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
        👇 <strong>Select an institute</strong> to start reviewing student photos
      </div>

      {institutes.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>
          Loading institutes...
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
          {institutes.map((institute) => (
            <button
              key={institute.id}
              onClick={() => setSelectedInstitute(institute)}
              style={{
                padding: '1.5rem',
                background: 'white',
                border: '2px solid #ddd',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                textAlign: 'left',
                fontSize: '0.95rem',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#003087'
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 48, 135, 0.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#ddd'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 'bold', color: '#003087' }}>
                {institute.name || 'Institute'}
              </h3>
              <p style={{ margin: '0.3rem 0', fontSize: '0.8rem', color: '#666' }}>
                Code: <strong>{institute.institute_code || '—'}</strong>
              </p>
              {institute.city && (
                <p style={{ margin: '0.3rem 0', fontSize: '0.8rem', color: '#999' }}>
                  {institute.city}
                  {institute.state ? `, ${institute.state}` : ''}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
