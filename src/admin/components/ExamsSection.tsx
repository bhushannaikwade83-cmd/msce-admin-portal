import { useEffect, useState } from 'react'
import { getSupabase } from '../lib/supabase'
import { STRINGS } from '../constants/strings'

interface Exam {
  id: string
  exam_code: string
  exam_name: string
  exam_date: string
  exam_time: string
  status: 'scheduled' | 'ongoing' | 'completed'
  total_centres: number
  total_students: number
  attended_students: number
  created_at: string
}

interface Centre {
  id: string
  code: string
  name: string
  address: string
  contact: string
}

interface ExamStudent {
  id: string
  exam_student_id: string
  student_name: string
  seat_no: string
  subject_name: string
  exam_date: string
  start_time: string
  centre_code: string
}

type Props = {
  embedded?: boolean
  readOnly?: boolean
}

type TabType = 'exams' | 'centres' | 'students'

export function ExamsSection({ readOnly = false }: Props) {
  const [exams, setExams] = useState<Exam[]>([])
  const [centres, setCentres] = useState<Centre[]>([])
  const [students, setStudents] = useState<ExamStudent[]>([])
  const [activeTab, setActiveTab] = useState<TabType>('exams')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [studentSearch, setStudentSearch] = useState('')
  const [centreSearch, setCentreSearch] = useState('')
  const [formData, setFormData] = useState({
    exam_code: '',
    exam_name: '',
    exam_date: '',
    exam_time: '',
  })

  useEffect(() => {
    loadExams()
    loadCentres()
    loadStudents()
  }, [])

  async function loadExams() {
    try {
      setLoading(true)
      setError(null)

      const sb = getSupabase()

      // ✅ Fetch exams from database
      const { data: examsData, error: fetchError } = await sb
        .from('exams')
        .select('*')
        .order('exam_date', { ascending: false })

      if (fetchError) throw fetchError

      // ✅ Fetch real attendance data from exam_students table
      const { data: attendanceData, error: attendanceError } = await sb
        .from('exam_students')
        .select('exam_id, entry_photo_url')

      if (attendanceError) {
        console.warn('Could not fetch attendance data:', attendanceError)
      }

      // ✅ Count attended students per exam
      const attendedByExam: Record<string, Set<string>> = {}
      if (attendanceData) {
        for (const row of attendanceData) {
          if (row.entry_photo_url) { // Entry marked
            if (!attendedByExam[row.exam_id]) {
              attendedByExam[row.exam_id] = new Set()
            }
            // Count unique students (could be multiple subjects per student)
            attendedByExam[row.exam_id].add(row.exam_id)
          }
        }
      }

      // Transform data
      const examList = (examsData || []).map((exam: any) => ({
        id: exam.id,
        exam_code: exam.exam_code,
        exam_name: exam.exam_name,
        exam_date: exam.exam_date,
        exam_time: exam.exam_time,
        status: exam.status || 'scheduled',
        total_centres: exam.total_centres || 0,
        total_students: exam.total_students || 0,
        attended_students: attendedByExam[exam.id]?.size || 0,  // ✅ Real attendance count
        created_at: exam.created_at,
      }))

      setExams(examList)
    } catch (err) {
      console.error('Error loading exams:', err)
      setError(err instanceof Error ? err.message : 'Failed to load exams')
    } finally {
      setLoading(false)
    }
  }

  async function loadCentres() {
    try {
      const sb = getSupabase()
      const { data, error: fetchError } = await sb
        .from('exam_centres')
        .select('*')
        .order('code', { ascending: true })

      if (fetchError) throw fetchError
      setCentres(data || [])
    } catch (err) {
      console.error('Error loading centres:', err)
    }
  }

  async function loadStudents() {
    try {
      const sb = getSupabase()
      const { data, error: fetchError } = await sb
        .from('exam_students')
        .select('*')
        .order('exam_date', { ascending: false })

      if (fetchError) throw fetchError
      setStudents(data || [])
    } catch (err) {
      console.error('Error loading students:', err)
    }
  }

  async function handleAddExam(e: React.FormEvent) {
    e.preventDefault()
    if (!formData.exam_code || !formData.exam_name) {
      setError('Please fill in all required fields')
      return
    }

    try {
      const sb = getSupabase()
      const { error: insertError } = await sb.from('exams').insert([
        {
          exam_code: formData.exam_code,
          exam_name: formData.exam_name,
          exam_date: formData.exam_date || null,
          exam_time: formData.exam_time || null,
          status: 'scheduled',
        },
      ])

      if (insertError) throw insertError

      setFormData({
        exam_code: '',
        exam_name: '',
        exam_date: '',
        exam_time: '',
      })
      setShowForm(false)
      await loadExams()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add exam')
    }
  }

  const attendanceRate = (attended: number, total: number) => {
    if (total === 0) return '0%'
    return `${Math.round((attended / total) * 100)}%`
  }

  const filteredStudents = students.filter(student =>
    student.student_name.toLowerCase().includes(studentSearch.toLowerCase()) ||
    student.seat_no.includes(studentSearch) ||
    student.subject_name.toLowerCase().includes(studentSearch.toLowerCase()) ||
    student.centre_code.includes(studentSearch) ||
    (student.exam_date && student.exam_date.includes(studentSearch))
  )

  const filteredCentres = centres.filter(centre =>
    centre.code.toLowerCase().includes(centreSearch.toLowerCase()) ||
    centre.name.toLowerCase().includes(centreSearch.toLowerCase()) ||
    centre.address.toLowerCase().includes(centreSearch.toLowerCase())
  )

  return (
    <div className="section-container">
      <div className="section-header">
        <h2>📝 Exam Management</h2>
      </div>

      {/* ✅ Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '2px solid #ddd', paddingBottom: '0' }}>
        <button
          type="button"
          onClick={() => setActiveTab('exams')}
          style={{
            padding: '12px 20px',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontWeight: activeTab === 'exams' ? '600' : '500',
            color: activeTab === 'exams' ? '#0066cc' : '#666',
            borderBottom: activeTab === 'exams' ? '3px solid #0066cc' : '3px solid transparent',
          }}
        >
          📋 Exams
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('centres')}
          style={{
            padding: '12px 20px',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontWeight: activeTab === 'centres' ? '600' : '500',
            color: activeTab === 'centres' ? '#0066cc' : '#666',
            borderBottom: activeTab === 'centres' ? '3px solid #0066cc' : '3px solid transparent',
          }}
        >
          📍 Centres
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('students')}
          style={{
            padding: '12px 20px',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontWeight: activeTab === 'students' ? '600' : '500',
            color: activeTab === 'students' ? '#0066cc' : '#666',
            borderBottom: activeTab === 'students' ? '3px solid #0066cc' : '3px solid transparent',
          }}
        >
          👥 Exam Students
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>⚠️ {error}</span>
          <button
            type="button"
            className="btn-dismiss"
            onClick={() => setError(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* ✅ EXAMS TAB */}
      {activeTab === 'exams' && (
        <>
          {!readOnly && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{ marginBottom: '20px' }}
              onClick={() => setShowForm(!showForm)}
            >
              {showForm ? '✕ Cancel' : '➕ New Exam'}
            </button>
          )}

          {showForm && !readOnly && (
        <div className="card card-elevated">
          <form onSubmit={handleAddExam}>
            <div className="form-grid">
              <label>
                Exam Code <span className="required">*</span>
                <input
                  type="text"
                  value={formData.exam_code}
                  onChange={(e) =>
                    setFormData({ ...formData, exam_code: e.target.value })
                  }
                  placeholder="e.g., HSC-2024"
                  required
                />
              </label>
              <label>
                Exam Name <span className="required">*</span>
                <input
                  type="text"
                  value={formData.exam_name}
                  onChange={(e) =>
                    setFormData({ ...formData, exam_name: e.target.value })
                  }
                  placeholder="e.g., Higher Secondary Certificate"
                  required
                />
              </label>
              <label>
                Exam Date
                <input
                  type="date"
                  value={formData.exam_date}
                  onChange={(e) =>
                    setFormData({ ...formData, exam_date: e.target.value })
                  }
                />
              </label>
              <label>
                Exam Time
                <input
                  type="time"
                  value={formData.exam_time}
                  onChange={(e) =>
                    setFormData({ ...formData, exam_time: e.target.value })
                  }
                />
              </label>
            </div>
            <button type="submit" className="btn btn-success">
              Save Exam
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="state-screen state-compact">
          <div className="loading-spinner" />
        </div>
      ) : exams.length === 0 ? (
        <div className="state-screen state-compact">
          <p>{STRINGS.noData}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Exam Code</th>
                <th>Exam Name</th>
                <th>Date</th>
                <th>Time</th>
                <th>Status</th>
                <th>Centres</th>
                <th>Students</th>
                <th>Attended</th>
                <th>Attendance</th>
              </tr>
            </thead>
            <tbody>
              {exams.map((exam) => (
                <tr key={exam.id}>
                  <td className="monospace">{exam.exam_code}</td>
                  <td>{exam.exam_name}</td>
                  <td>
                    {exam.exam_date
                      ? new Date(exam.exam_date).toLocaleDateString()
                      : '—'}
                  </td>
                  <td>{exam.exam_time || '—'}</td>
                  <td>
                    <span className={`badge badge-${exam.status}`}>
                      {exam.status.charAt(0).toUpperCase() +
                        exam.status.slice(1)}
                    </span>
                  </td>
                  <td className="text-center">{exam.total_centres}</td>
                  <td className="text-center">{exam.total_students}</td>
                  <td className="text-center">{exam.attended_students}</td>
                  <td className="text-center">
                    <strong>
                      {attendanceRate(
                        exam.attended_students,
                        exam.total_students
                      )}
                    </strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
        </>
      )}

      {/* ✅ CENTRES TAB */}
      {activeTab === 'centres' && (
        <div>
          <h3>Exam Centres</h3>
          <div style={{ marginBottom: '20px' }}>
            <input
              type="text"
              placeholder="Search by code, name, or address..."
              value={centreSearch}
              onChange={(e) => setCentreSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            />
            <small style={{ color: '#666', marginTop: '4px', display: 'block' }}>
              {filteredCentres.length} result{filteredCentres.length !== 1 ? 's' : ''}
            </small>
          </div>
          {loading ? (
            <div className="state-screen state-compact">
              <div className="loading-spinner" />
            </div>
          ) : filteredCentres.length === 0 ? (
            <div className="state-screen state-compact">
              <p>{STRINGS.noData}</p>
            </div>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Address</th>
                    <th>Contact</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCentres.map((centre) => (
                    <tr key={centre.id}>
                      <td className="monospace">{centre.code}</td>
                      <td>{centre.name}</td>
                      <td>{centre.address}</td>
                      <td>{centre.contact}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ✅ EXAM STUDENTS TAB */}
      {activeTab === 'students' && (
        <div>
          <h3>Exam Students</h3>
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input
                type="text"
                placeholder="Search by name, seat no, centre code, subject, or date..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                style={{
                  flex: 1,
                  padding: '10px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              />
              <button
                type="button"
                onClick={() => setStudentSearch('')}
                style={{
                  padding: '10px 16px',
                  backgroundColor: '#f0f0f0',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                ✕ Clear
              </button>
            </div>
            <small style={{ color: '#666', display: 'block' }}>
              {filteredStudents.length} result{filteredStudents.length !== 1 ? 's' : ''} found
            </small>
          </div>
          {loading ? (
            <div className="state-screen state-compact">
              <div className="loading-spinner" />
            </div>
          ) : students.length === 0 ? (
            <div className="state-screen state-compact">
              <p>{STRINGS.noData}</p>
            </div>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Student Name</th>
                    <th>Seat No</th>
                    <th>Subject</th>
                    <th>Exam Date</th>
                    <th>Start Time</th>
                    <th>Centre Code</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((student) => (
                    <tr key={student.id}>
                      <td>{student.student_name}</td>
                      <td className="monospace">{student.seat_no}</td>
                      <td>{student.subject_name}</td>
                      <td>
                        {student.exam_date
                          ? new Date(student.exam_date).toLocaleDateString()
                          : '—'}
                      </td>
                      <td>{student.start_time || '—'}</td>
                      <td className="monospace">{student.centre_code}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
