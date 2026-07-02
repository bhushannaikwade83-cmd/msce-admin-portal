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

type Props = {
  embedded?: boolean
  readOnly?: boolean
}

export function ExamsSection({ embedded = false, readOnly = false }: Props) {
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    exam_code: '',
    exam_name: '',
    exam_date: '',
    exam_time: '',
  })

  useEffect(() => {
    loadExams()
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

  return (
    <div className="section-container">
      <div className="section-header">
        <h2>📝 Exam Management</h2>
        {!readOnly && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? '✕ Cancel' : '➕ New Exam'}
          </button>
        )}
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
    </div>
  )
}
