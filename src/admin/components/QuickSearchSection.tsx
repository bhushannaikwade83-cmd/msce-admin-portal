import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { EditStudentModal } from './EditStudentModal'

type QuickStudent = Record<string, unknown> & {
  id: string
  institute_id?: string | null
  name?: string | null
  student_name?: string | null
  full_name?: string | null
  fname?: string | null
  mname?: string | null
  lname?: string | null
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
  status?: number | null
  face_photo_url?: string | null
  registration_photo_path?: string | null
  original_face_photo_url?: string | null
  original_registration_photo_path?: string | null
  face_photo_changed_once?: boolean | null
  mobno?: string | null
  pmobno?: string | null
  payid?: string | null
  identy_no?: string | null
}

function pick(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key]
    if (value != null && String(value).trim()) return String(value).trim()
  }
  return null
}

function studentName(student: QuickStudent): string {
  const fullName = pick(student, 'name', 'student_name', 'full_name')
  if (fullName) return fullName

  const fname = pick(student, 'fname') ?? ''
  const mname = pick(student, 'mname') ?? ''
  const lname = pick(student, 'lname') ?? ''
  const constructed = [fname, mname, lname].filter(Boolean).join(' ').trim()

  return constructed || student.id
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
  const resultsRef = useRef<HTMLDivElement | null>(null)
  const instituteOptionsRef = useRef<HTMLDivElement | null>(null)
  const lastSearchQueryRef = useRef<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [institutes, setInstitutes] = useState<InstituteRow[]>([])
  const [globalSearchResults, setGlobalSearchResults] = useState<(QuickStudent & { institute_name?: string | null })[]>([])
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editingStudent, setEditingStudent] = useState<QuickStudent | null>(null)
  const [editingStudentInstitute, setEditingStudentInstitute] = useState<InstituteRow | null>(null)

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

  const performGlobalSearch = useCallback(async (query: string) => {
    const trimmedQuery = query.trim()
    if (!trimmedQuery) {
      setGlobalSearchResults([])
      lastSearchQueryRef.current = ''
      return
    }

    // Don't re-search if it's the same query
    if (lastSearchQueryRef.current === trimmedQuery) {
      return
    }

    lastSearchQueryRef.current = trimmedQuery
    setGlobalSearchLoading(true)
    try {
      const sb = getSupabase()
      const q = `%${trimmedQuery}%`

      let students: QuickStudent[] = []
      try {
        students = await fetchAllPaged<QuickStudent>((rangeFrom, rangeTo) =>
          sb
            .from('students')
            .select('*')
            .ilike('student_name', q)
            .order('id', { ascending: true })
            .range(rangeFrom, rangeTo),
        )
      } catch (e) {
        const allStudents = await fetchAllPaged<QuickStudent>((rangeFrom, rangeTo) =>
          sb
            .from('students')
            .select('*')
            .order('id', { ascending: true })
            .range(rangeFrom, rangeTo),
        )
        students = allStudents.filter((student) =>
          [
            studentName(student),
            studentRoll(student),
            student.id,
            pick(student, 'mobno', 'payid', 'identy_no'),
          ]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(trimmedQuery.toLowerCase())),
        )
      }

      const instituteMap = new Map(institutes.map((i) => [i.id, i]))
      const resultsWithInstitutes = students.map((s) => ({
        ...s,
        institute_name: instituteMap.get(s.institute_id ?? '')?.name ?? instituteMap.get(s.institute_id ?? '')?.id ?? s.institute_id,
      }))

      setGlobalSearchResults(resultsWithInstitutes)
    } finally {
      setGlobalSearchLoading(false)
    }
  }, [institutes])

  const handleDeleteStudent = useCallback(async (student: QuickStudent) => {
    if (!confirm(`Delete student "${studentName(student)}"?`)) return

    try {
      const sb = getSupabase()
      const { error } = await sb.from('students').delete().eq('id', student.id)
      if (error) throw error

      setGlobalSearchResults((prev) => prev.filter((s) => s.id !== student.id))
      setStudents((prev) => prev.filter((s) => s.id !== student.id))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete student')
    }
  }, [])

  useEffect(() => {
    void loadInstitutes()
  }, [loadInstitutes])

  useEffect(() => {
    if (searchQuery.trim()) {
      void performGlobalSearch(searchQuery)
    }
  }, [searchQuery, performGlobalSearch])

  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ marginBottom: '0.5rem' }}>Quick Search</h2>
      <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>Search for students across all institutes</p>

      <div className="card-elevated" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search student by name, ID, roll number, phone..."
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
        </div>
      </div>

      {globalSearchLoading ? (
        <div className="loading-row">
          <div className="loading-spinner" />
          <span>Searching across all institutes...</span>
        </div>
      ) : null}

      {searchQuery && !globalSearchLoading && (
        <div style={{ padding: '1rem', color: '#64748b', marginBottom: '1rem' }}>
          <p>Found {globalSearchResults.length} student(s) matching "{searchQuery}"</p>
        </div>
      )}

          {globalSearchResults.length > 0 && (
            <div className="table-wrap institutes-table-wrap students-table-wrap quick-search-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Photo</th>
                    <th>Name</th>
                    <th>Institute</th>
                    <th>Institute ID</th>
                    <th>Roll</th>
                    <th>Class</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {globalSearchResults.map((student) => {
                    const name = studentName(student)
                    return (
                      <tr key={student.id}>
                        <td className="students-photo-cell">
                          {hasCurrentPhoto(student) ? (
                            <StudentDisplayPhoto student={student} displayName={name} size="sm" clickable />
                          ) : (
                            <span className="muted small">No photo</span>
                          )}
                        </td>
                        <td>
                          <strong>{name}</strong>
                          <div className="muted small"><code>{student.id}</code></div>
                        </td>
                        <td>
                          <span className="muted">{student.institute_name}</span>
                        </td>
                        <td>
                          <code className="tiny">{student.institute_id}</code>
                        </td>
                        <td>{studentRoll(student)}</td>
                        <td>{studentClass(student)}</td>
                        <td>
                          {student.is_active === false ? (
                            <span className="badge badge-muted">Inactive</span>
                          ) : (
                            <span className="badge badge-present">Active</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs"
                              onClick={() => {
                                setEditingStudent(student)
                                const inst = institutes.find((i) => i.id === student.institute_id)
                                setEditingStudentInstitute(inst || null)
                              }}
                              title="Edit student"
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs"
                              onClick={() => void handleDeleteStudent(student)}
                              title="Delete student"
                              style={{ color: 'var(--danger)' }}
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

      {searchQuery && !globalSearchLoading && globalSearchResults.length === 0 && (
        <div style={{ padding: '1rem', textAlign: 'center', color: '#64748b' }}>
          No students found matching your search.
        </div>
      )}

      {editingStudent && editingStudentInstitute ? (
        <EditStudentModal
          student={editingStudent}
          instituteLabel={editingStudentInstitute.name ?? editingStudentInstitute.institute_code ?? editingStudentInstitute.id}
          onClose={() => {
            setEditingStudent(null)
            setEditingStudentInstitute(null)
          }}
          onSaved={() => {
            setEditingStudent(null)
            setEditingStudentInstitute(null)
            if (globalSearchMode && searchQuery.trim()) {
              void performGlobalSearch(searchQuery)
            } else if (selectedInstituteId) {
              setStudents((prev) =>
                prev.map((s) => (s.id === editingStudent.id ? editingStudent : s))
              )
            }
          }}
        />
      ) : null}
    </div>
  )
}
