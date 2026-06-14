import { useState, useEffect, useCallback, useMemo } from 'react'
import { usePortalAccess } from '../context/portal-access-context'
import { fetchAllPaged } from '../lib/supabasePaged'
import { getSupabase } from '../lib/supabase'
import { sortByInstituteId } from '../lib/instituteSort'
import {
  filterInstitutesByPortalPrefixes,
  findPortalDistrictByKey,
  findPortalDistrictForPrefixes,
  instituteRowMatchesPrefixes,
} from '../lib/portalDistricts'
import { InstituteDistrictFilter } from './InstituteDistrictFilter'
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
  const [districtKey, setDistrictKey] = useState('')
  const [search, setSearch] = useState('')
  const [loadingInstitutes, setLoadingInstitutes] = useState(true)
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const portal = usePortalAccess()

  const lockedDistrict = useMemo(
    () => findPortalDistrictForPrefixes(portal.institutePrefixes),
    [portal.institutePrefixes],
  )

  const effectiveDistrictKey =
    portal.mode === 'district_viewer' && lockedDistrict ? lockedDistrict.key : districtKey

  const districtFilteredInstitutes = useMemo(() => {
    if (!effectiveDistrictKey) return institutes
    const district = findPortalDistrictByKey(effectiveDistrictKey)
    if (!district) return institutes
    return institutes.filter((institute) => instituteRowMatchesPrefixes(institute, district.prefixes))
  }, [institutes, effectiveDistrictKey])

  const visibleInstitutes = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return districtFilteredInstitutes
    return districtFilteredInstitutes.filter((institute) =>
      [institute.id, institute.name, institute.institute_code, institute.city, institute.state]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    )
  }, [districtFilteredInstitutes, search])

  // Load institutes on mount
  useEffect(() => {
    const loadInstitutes = async () => {
      setLoadingInstitutes(true)
      setError(null)
      try {
        const supabase = getSupabase()
        const raw = await fetchAllPaged<Institute>((rangeFrom, rangeTo) =>
          supabase
            .from('institutes')
            .select('id, name, institute_code, city, state')
            .order('id', { ascending: true })
            .range(rangeFrom, rangeTo),
        )
        const scoped =
          portal.mode === 'district_viewer' && portal.institutePrefixes.length > 0
            ? filterInstitutesByPortalPrefixes(raw, portal.institutePrefixes)
            : raw
        setInstitutes(sortByInstituteId(scoped))
      } catch (err) {
        console.error('Error loading institutes:', err)
        setInstitutes([])
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoadingInstitutes(false)
      }
    }

    void loadInstitutes()
  }, [portal.mode, portal.institutePrefixes])

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
      setLoadingStudents(true)
      setError(null)
      try {
        const supabase = getSupabase()
        const raw = await fetchAllPaged<Student>((rangeFrom, rangeTo) =>
          supabase
            .from('students')
            .select('*')
            .eq('institute_id', selectedInstitute.id)
            .order('id', { ascending: true })
            .range(rangeFrom, rangeTo),
        )
        setStudents(raw)
      } catch (err) {
        console.error('Error loading students:', err)
        setStudents([])
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoadingStudents(false)
      }
    }

    void loadStudents()
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
        Review registration photos and flag students whose photo appears to be captured from a phone or computer screen
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
        👇 <strong>Select an institute</strong> to review all student photos. Flagged students are saved in this browser and shown in the report.
      </div>

      <div className="card-elevated" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
        <InstituteDistrictFilter
          rows={institutes}
          districtKey={effectiveDistrictKey}
          onDistrictKeyChange={setDistrictKey}
          filteredCount={districtFilteredInstitutes.length}
          lockedDistrict={portal.mode === 'district_viewer' ? lockedDistrict : null}
          disabled={loadingInstitutes}
        />
        <div className="search-bar" style={{ marginTop: '1rem' }}>
          <span className="search-icon">🔍</span>
          <input
            type="search"
            className="search-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search institute id, code, name, city..."
          />
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {loadingInstitutes ? (
        <div style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>
          Loading institutes...
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
          {visibleInstitutes.map((institute) => (
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
                ID: <strong>{institute.id}</strong>
              </p>
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
      {selectedInstitute && loadingStudents ? null : null}
    </div>
  )
}
