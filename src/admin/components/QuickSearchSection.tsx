import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePortalAccess } from '../context/portal-access-context'
import { sortByInstituteId } from '../lib/instituteSort'
import {
  PORTAL_DISTRICTS,
  filterInstitutesByPortalPrefixes,
  formatDistrictPrefixHint,
  findPortalDistrictByKey,
  findPortalDistrictForPrefixes,
  instituteRowMatchesPrefixes,
} from '../lib/portalDistricts'
import { getSupabase } from '../lib/supabase'
import { fetchAllPaged } from '../lib/supabasePaged'
import { InstituteDistrictFilter } from './InstituteDistrictFilter'
import type { InstituteRow } from './InstituteList'
import { StudentDisplayPhoto } from './StudentDisplayPhoto'

type QuickStudent = Record<string, unknown> & {
  id: string
  institute_id?: string | null
  name?: string | null
  student_name?: string | null
  full_name?: string | null
  roll_no?: string | null
  roll_number?: string | null
  rollno?: string | null
  sr_no?: string | null
  user_id?: string | null
  class_name?: string | null
  class?: string | null
  grade?: string | null
  section?: string | null
  div?: string | null
  division?: string | null
  is_active?: boolean | null
  face_photo_url?: string | null
  registration_photo_path?: string | null
  original_face_photo_url?: string | null
  original_registration_photo_path?: string | null
  face_photo_changed_once?: boolean | null
}

function pick(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key]
    if (value != null && String(value).trim()) return String(value).trim()
  }
  return null
}

function studentName(student: QuickStudent): string {
  return pick(student, 'name', 'student_name', 'full_name') ?? student.id
}

function studentRoll(student: QuickStudent): string {
  return pick(student, 'sr_no', 'user_id', 'roll_no', 'roll_number', 'rollno', 'admission_no') ?? '-'
}

function studentClass(student: QuickStudent): string {
  const cls = pick(student, 'class_name', 'class', 'grade', 'standard', 'std')
  const section = pick(student, 'section', 'div', 'division')
  if (!cls) return '-'
  return `${cls}${section ? ` - ${section}` : ''}`
}

function hasCurrentPhoto(student: QuickStudent): boolean {
  return Boolean(
    pick(student, 'face_photo_url', 'registration_photo_path', 'photo_url', 'student_photo_url'),
  )
}

function hasOriginalPhoto(student: QuickStudent): boolean {
  return Boolean(pick(student, 'original_face_photo_url', 'original_registration_photo_path'))
}

function instituteCodeHead(row: InstituteRow): string {
  const raw = String(row.institute_code ?? row.id ?? '').trim().padStart(5, '0')
  return raw.slice(0, 2)
}

function sortStudents(rows: QuickStudent[]): QuickStudent[] {
  return [...rows].sort((a, b) => {
    const ar = Number(studentRoll(a))
    const br = Number(studentRoll(b))
    if (Number.isFinite(ar) && Number.isFinite(br) && ar !== br) return ar - br
    return studentName(a).localeCompare(studentName(b), undefined, { sensitivity: 'base' })
  })
}

export function QuickSearchSection({ embedded: _embedded = false }: { embedded?: boolean }) {
  const portal = usePortalAccess()
  const [searchQuery, setSearchQuery] = useState('')
  const [institutes, setInstitutes] = useState<InstituteRow[]>([])
  const [selectedPrefix, setSelectedPrefix] = useState('')
  const [selectedInstituteId, setSelectedInstituteId] = useState('')
  const [students, setStudents] = useState<QuickStudent[]>([])
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [studentsError, setStudentsError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [districtKey, setDistrictKey] = useState(() => {
    if (typeof window === 'undefined') return ''
    try {
      return localStorage.getItem('msce_quick_search_selected_district') || ''
    } catch {
      return ''
    }
  })

  const lockedDistrict = useMemo(
    () => findPortalDistrictForPrefixes(portal.institutePrefixes),
    [portal.institutePrefixes],
  )

  const loadInstitutes = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const sb = getSupabase()
      const raw = await fetchAllPaged<InstituteRow>((rangeFrom, rangeTo) =>
        sb
          .from('institutes')
          .select('*')
          .order('id', { ascending: true })
          .range(rangeFrom, rangeTo),
      )
      const scoped =
        portal.mode === 'district_viewer' && portal.institutePrefixes.length > 0
          ? filterInstitutesByPortalPrefixes(raw, portal.institutePrefixes)
          : raw
      setInstitutes(sortByInstituteId(scoped))
    } catch (e) {
      setInstitutes([])
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [portal.mode, portal.institutePrefixes])

  useEffect(() => {
    void loadInstitutes()
  }, [loadInstitutes])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem('msce_quick_search_selected_district', districtKey)
    } catch {
      // Ignore localStorage errors.
    }
  }, [districtKey])

  const effectiveDistrictKey =
    portal.mode === 'district_viewer' && lockedDistrict ? lockedDistrict.key : districtKey

  const districtFilteredInstitutes = useMemo(() => {
    if (!effectiveDistrictKey) return institutes
    const district = findPortalDistrictByKey(effectiveDistrictKey)
    if (!district) return institutes
    return institutes.filter((i) => instituteRowMatchesPrefixes(i, district.prefixes))
  }, [institutes, effectiveDistrictKey])

  const prefixOptions = useMemo(() => {
    if (effectiveDistrictKey) {
      return findPortalDistrictByKey(effectiveDistrictKey)?.prefixes ?? []
    }
    return [...new Set(PORTAL_DISTRICTS.flatMap((district) => district.prefixes))].sort()
  }, [effectiveDistrictKey])

  const prefixFilteredInstitutes = useMemo(() => {
    if (!selectedPrefix) return districtFilteredInstitutes
    return districtFilteredInstitutes.filter((institute) => instituteCodeHead(institute) === selectedPrefix)
  }, [districtFilteredInstitutes, selectedPrefix])

  const selectedInstitute = useMemo(
    () => institutes.find((institute) => institute.id === selectedInstituteId) ?? null,
    [institutes, selectedInstituteId],
  )

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return students
    return students.filter((student) =>
      [
        studentName(student),
        studentRoll(student),
        studentClass(student),
        student.id,
        pick(student, 'email', 'email_id', 'phone', 'mobile'),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    )
  }, [students, searchQuery])

  useEffect(() => {
    setSelectedPrefix('')
    setSelectedInstituteId('')
    setStudents([])
    setStudentsError(null)
  }, [effectiveDistrictKey])

  useEffect(() => {
    if (!selectedInstituteId) {
      setStudents([])
      setStudentsError(null)
      return
    }

    let cancelled = false
    async function loadStudents() {
      setStudentsLoading(true)
      setStudentsError(null)
      try {
        const sb = getSupabase()
        const raw = await fetchAllPaged<QuickStudent>((rangeFrom, rangeTo) =>
          sb
            .from('students')
            .select('*')
            .eq('institute_id', selectedInstituteId)
            .order('id', { ascending: true })
            .range(rangeFrom, rangeTo),
        )
        if (!cancelled) setStudents(sortStudents(raw))
      } catch (e) {
        if (!cancelled) {
          setStudents([])
          setStudentsError(e instanceof Error ? e.message : String(e))
        }
      } finally {
        if (!cancelled) setStudentsLoading(false)
      }
    }

    void loadStudents()
    return () => {
      cancelled = true
    }
  }, [selectedInstituteId])

  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ marginBottom: '0.5rem' }}>Quick Search</h2>
      <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>Search for students, institutes, or other data</p>

      <div className="card-elevated" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search by name, ID, institute code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              padding: '0.75rem',
              border: '1px solid #cbd5e1',
              borderRadius: '0.375rem',
              fontSize: '1rem',
            }}
          />
          <button className="btn btn-primary">Search</button>
        </div>

        <div style={{ marginTop: '1rem', display: 'grid', gap: '1rem' }}>
          <InstituteDistrictFilter
            rows={institutes}
            districtKey={effectiveDistrictKey}
            onDistrictKeyChange={setDistrictKey}
            filteredCount={districtFilteredInstitutes.length}
            lockedDistrict={portal.mode === 'district_viewer' ? lockedDistrict : null}
            disabled={loading}
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 260px) minmax(260px, 1fr)', gap: '0.75rem' }}>
            <label className="field">
              <span>Prefix</span>
              <select
                value={selectedPrefix}
                disabled={loading || prefixOptions.length === 0}
                onChange={(e) => {
                  setSelectedPrefix(e.target.value)
                  setSelectedInstituteId('')
                  setStudents([])
                }}
              >
                <option value="">
                  All prefixes ({formatDistrictPrefixHint(prefixOptions)})
                </option>
                {prefixOptions.map((prefix) => (
                  <option key={prefix} value={prefix}>
                    {prefix} ({districtFilteredInstitutes.filter((institute) => instituteCodeHead(institute) === prefix).length})
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Institute ID</span>
              <select
                value={selectedInstituteId}
                disabled={loading || prefixFilteredInstitutes.length === 0}
                onChange={(e) => setSelectedInstituteId(e.target.value)}
              >
                <option value="">
                  Select institute ({prefixFilteredInstitutes.length.toLocaleString('en-IN')})
                </option>
                {prefixFilteredInstitutes.map((institute) => (
                  <option key={institute.id} value={institute.id}>
                    {institute.id}
                    {institute.institute_code ? ` / ${institute.institute_code}` : ''}
                    {institute.name ? ` - ${institute.name}` : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      {error ? (
        <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
          Could not load district filter: {error}
        </div>
      ) : null}

      {searchQuery && (
        <div style={{ padding: '1rem', color: '#64748b' }}>
          <p>
            Showing search "{searchQuery}" in {selectedInstitute ? selectedInstitute.name ?? selectedInstitute.id : 'selected institute'}
          </p>
        </div>
      )}

      {selectedInstitute ? (
        <div className="card-elevated" style={{ padding: '1rem', marginBottom: '1rem' }}>
          <strong>{selectedInstitute.name ?? selectedInstitute.id}</strong>
          <div className="muted small">
            ID: <code>{selectedInstitute.id}</code>
            {selectedInstitute.institute_code ? <> · Code: <code>{selectedInstitute.institute_code}</code></> : null}
            {selectedInstitute.city ? <> · {selectedInstitute.city}</> : null}
          </div>
        </div>
      ) : null}

      {studentsError ? <p className="error">{studentsError}</p> : null}
      {studentsLoading ? (
        <div className="loading-row">
          <div className="loading-spinner" />
          <span>Loading students...</span>
        </div>
      ) : null}

      {selectedInstituteId ? (
        <div className="table-wrap institutes-table-wrap students-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Original photo</th>
                <th>Current photo</th>
                <th>Name</th>
                <th>Roll</th>
                <th>Class</th>
                <th>Student ID</th>
                <th>Photo status</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {!studentsLoading && filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="muted">
                    No students found for this institute.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student) => {
                  const name = studentName(student)
                  const originalStudent = {
                    ...student,
                    face_photo_url: student.original_face_photo_url,
                    registration_photo_path: student.original_registration_photo_path,
                  }
                  return (
                    <tr key={student.id}>
                      <td className="students-photo-cell">
                        {hasOriginalPhoto(student) ? (
                          <StudentDisplayPhoto
                            student={originalStudent}
                            displayName={`${name} original`}
                            size="sm"
                            clickable
                          />
                        ) : (
                          <span className="muted small">No old photo</span>
                        )}
                      </td>
                      <td className="students-photo-cell">
                        {hasCurrentPhoto(student) ? (
                          <StudentDisplayPhoto student={student} displayName={name} size="sm" clickable />
                        ) : (
                          <span className="muted small">No photo</span>
                        )}
                      </td>
                      <td>
                        <strong>{name}</strong>
                      </td>
                      <td>{studentRoll(student)}</td>
                      <td>{studentClass(student)}</td>
                      <td>
                        <code className="tiny">{student.id}</code>
                      </td>
                      <td>
                        {student.face_photo_changed_once === true || hasOriginalPhoto(student) ? (
                          <span className="badge badge-absent">Changed</span>
                        ) : (
                          <span className="badge badge-present">Same</span>
                        )}
                      </td>
                      <td>
                        {student.is_active === false ? (
                          <span className="badge badge-muted">Inactive</span>
                        ) : (
                          <span className="badge badge-present">Active</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
