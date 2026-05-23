import { useEffect, useMemo, useState } from 'react'
import type { StudentCaptureMismatch } from '../lib/attendanceCaptureScan'
import { downloadCsv } from '../lib/reportCsv'
import { isFacePhotoUpdatedForAttendance } from '../lib/attendanceIntegrity'
import { attendanceCaptureDiffersFromRegistration, type DayInOutMerge } from '../lib/photoCompare'
import type { InstituteRow } from './InstituteList'
import { PhotoThumb } from './PhotoThumb'
import { StudentDisplayPhoto } from './StudentDisplayPhoto'

type Student = Record<string, unknown> & {
  id: string
  face_photo_changed_once?: boolean | null
  face_photo_changed_at?: string | null
  original_face_photo_url?: string | null
  original_registration_photo_path?: string | null
}

const PAGE_SIZE = 25

function pick(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k]
    if (v !== null && v !== undefined && v !== '') return String(v)
  }
  return null
}

function studentInstNo(s: Student): string | null {
  return pick(s, 'sr_no', 'user_id', 'roll_no', 'roll_number', 'rollno', 'admission_no')
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return String(iso)
  }
}

function fmtTime(val: string | null | undefined) {
  if (!val) return '—'
  try {
    if (String(val).includes('T')) {
      return new Date(String(val)).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    }
    const [h, m] = String(val).split(':')
    const hr = parseInt(h, 10)
    return `${((hr % 12) || 12).toString().padStart(2, '0')}:${m} ${hr >= 12 ? 'PM' : 'AM'}`
  } catch {
    return String(val)
  }
}

/** Entry/exit time + date for display (ISO or time-only on `dateYmd`). */
function fmtCaptureTimestamp(val: string | null | undefined, dateYmd: string) {
  if (!val) return '—'
  const s = String(val).trim()
  if (s.includes('T')) {
    try {
      const d = new Date(s)
      if (Number.isFinite(d.getTime())) {
        return d.toLocaleString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      }
    } catch {
      /* fall through */
    }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
    return `${fmtDate(dateYmd)} ${fmtTime(s)}`
  }
  return fmtTime(s)
}

function IntegrityPager({
  page,
  pageCount,
  total,
  onPrev,
  onNext,
}: {
  page: number
  pageCount: number
  total: number
  onPrev: () => void
  onNext: () => void
}) {
  if (total <= PAGE_SIZE) return null
  return (
    <div className="integrity-pager">
      <button type="button" className="btn btn-ghost btn-sm" disabled={page <= 0} onClick={onPrev}>
        Previous
      </button>
      <span className="muted small">
        Page {page + 1} of {pageCount} ({total.toLocaleString('en-IN')} rows)
      </span>
      <button type="button" className="btn btn-ghost btn-sm" disabled={page >= pageCount - 1} onClick={onNext}>
        Next
      </button>
    </div>
  )
}

export function InstituteIntegrityPanel({
  institute,
  students,
  loading,
  attDate,
  onAttDateChange,
  dayAtt,
  attLoading,
  attError,
  showDayAttendance,
  historyFrom = '',
  historyTo = '',
  onHistoryFromChange = () => {},
  onHistoryToChange = () => {},
  onReloadHistory,
  captureMismatches = [],
  historyLoading = false,
  historyError = null,
  capturesScanned = 0,
  enableFullHistoryScan = false,
  onSelectStudent,
}: {
  institute: InstituteRow
  students: Student[]
  loading: boolean
  attDate: string
  onAttDateChange: (ymd: string) => void
  dayAtt: Record<string, DayInOutMerge>
  attLoading: boolean
  attError: string | null
  showDayAttendance: boolean
  historyFrom?: string
  historyTo?: string
  onHistoryFromChange?: (ymd: string) => void
  onHistoryToChange?: (ymd: string) => void
  onReloadHistory?: () => void
  captureMismatches?: StudentCaptureMismatch[]
  historyLoading?: boolean
  historyError?: string | null
  capturesScanned?: number
  /** Cheat watch tab: scan all attendance in date range. Students tab omits this. */
  enableFullHistoryScan?: boolean
  onSelectStudent: (s: Student) => void
}) {
  const [pageChanged, setPageChanged] = useState(0)
  const [pageDaily, setPageDaily] = useState(0)
  const [pageHistory, setPageHistory] = useState(0)

  const instituteIdLabel = institute.institute_code?.trim() || institute.id

  const photoChangedRows = useMemo(
    () => students.filter(isFacePhotoUpdatedForAttendance),
    [students],
  )

  const historyFlagRows = useMemo(() => {
    const rows: { student: Student; flag: StudentCaptureMismatch['flags'][number] }[] = []
    for (const block of captureMismatches) {
      for (const flag of block.flags) {
        rows.push({ student: block.student as Student, flag })
      }
    }
    return rows
  }, [captureMismatches])

  const dailyMismatchRows = useMemo(() => {
    if (!showDayAttendance) return []
    const out: {
      student: Student
      day: DayInOutMerge
      entryDiff: boolean
      exitDiff: boolean
    }[] = []
    for (const s of students) {
      const day = dayAtt[s.id]
      if (!day?.entryPhoto && !day?.exitPhoto) continue
      const diff = attendanceCaptureDiffersFromRegistration(s, day)
      if (!diff.entryDiff && !diff.exitDiff) continue
      out.push({ student: s, day, ...diff })
    }
    out.sort((a, b) => {
      const ra = studentInstNo(a.student) ?? a.student.id
      const rb = studentInstNo(b.student) ?? b.student.id
      return ra.localeCompare(rb, undefined, { numeric: true })
    })
    return out
  }, [students, dayAtt, showDayAttendance])

  const changedPageCount = Math.max(1, Math.ceil(photoChangedRows.length / PAGE_SIZE))
  const dailyPageCount = Math.max(1, Math.ceil(dailyMismatchRows.length / PAGE_SIZE))
  const historyPageCount = Math.max(1, Math.ceil(historyFlagRows.length / PAGE_SIZE))
  const safeChangedPage = Math.min(pageChanged, changedPageCount - 1)
  const safeDailyPage = Math.min(pageDaily, dailyPageCount - 1)
  const safeHistoryPage = Math.min(pageHistory, historyPageCount - 1)

  const pagedChanged = photoChangedRows.slice(
    safeChangedPage * PAGE_SIZE,
    safeChangedPage * PAGE_SIZE + PAGE_SIZE,
  )
  const pagedDaily = dailyMismatchRows.slice(safeDailyPage * PAGE_SIZE, safeDailyPage * PAGE_SIZE + PAGE_SIZE)
  const pagedHistory = historyFlagRows.slice(
    safeHistoryPage * PAGE_SIZE,
    safeHistoryPage * PAGE_SIZE + PAGE_SIZE,
  )

  const totalHistoryFlags = historyFlagRows.length

  useEffect(() => {
    setPageChanged(0)
  }, [photoChangedRows.length, institute.id])

  useEffect(() => {
    setPageDaily(0)
  }, [dailyMismatchRows.length, attDate, institute.id])

  useEffect(() => {
    setPageHistory(0)
  }, [historyFlagRows.length, historyFrom, historyTo, institute.id])

  function exportHistoryMismatchCsv() {
    const header = [
      'institute_id',
      'institute_uuid',
      'student_uuid',
      'inst_no',
      'student_name',
      'attendance_date',
      'capture_type',
      'capture_time',
      'capture_photo_ref',
      'registration_photo_ref',
    ]
    const data = historyFlagRows.map(({ student: s, flag }) => [
      instituteIdLabel,
      institute.id,
      s.id,
      studentInstNo(s) ?? '',
      pick(s, 'name', 'student_name', 'full_name') ?? '',
      flag.date,
      flag.kind,
      flag.at ?? '',
      flag.photoUrl ?? '',
      pick(s, 'face_photo_url', 'registration_photo_path', 'photo_url') ?? '',
    ])
    downloadCsv(
      `integrity_all_mismatch_${instituteIdLabel}_${historyFrom}_${historyTo}.csv`,
      header,
      data,
    )
  }

  function exportPhotoChangedCsv() {
    const header = [
      'institute_id',
      'institute_uuid',
      'student_uuid',
      'inst_no',
      'student_name',
      'face_photo_changed_at',
      'original_photo_ref',
      'current_photo_ref',
    ]
    const data = photoChangedRows.map((s) => {
      const name = pick(s, 'name', 'student_name', 'full_name') ?? ''
      const changedAt = s.face_photo_changed_at != null ? String(s.face_photo_changed_at) : ''
      return [
        instituteIdLabel,
        institute.id,
        s.id,
        studentInstNo(s) ?? '',
        name,
        changedAt,
        pick(s, 'original_face_photo_url', 'original_registration_photo_path') ?? '',
        pick(s, 'face_photo_url', 'registration_photo_path', 'photo_url') ?? '',
      ]
    })
    downloadCsv(
      `integrity_photo_changed_${instituteIdLabel}_${new Date().toISOString().slice(0, 10)}.csv`,
      header,
      data,
    )
  }

  function exportDailyMismatchCsv() {
    const header = [
      'institute_id',
      'institute_uuid',
      'attendance_date',
      'student_uuid',
      'inst_no',
      'student_name',
      'entry_differs',
      'entry_timestamp',
      'entry_photo_ref',
      'exit_differs',
      'exit_timestamp',
      'exit_photo_ref',
      'registration_photo_ref',
    ]
    const data = dailyMismatchRows.map(({ student: s, day, entryDiff, exitDiff }) => [
      instituteIdLabel,
      institute.id,
      attDate,
      s.id,
      studentInstNo(s) ?? '',
      pick(s, 'name', 'student_name', 'full_name') ?? '',
      entryDiff ? 'yes' : 'no',
      day.entryAt ?? '',
      day.entryPhoto ?? '',
      exitDiff ? 'yes' : 'no',
      day.exitAt ?? '',
      day.exitPhoto ?? '',
      pick(s, 'face_photo_url', 'registration_photo_path', 'photo_url') ?? '',
    ])
    downloadCsv(
      `integrity_daily_mismatch_${instituteIdLabel}_${attDate}.csv`,
      header,
      data,
    )
  }

  if (loading) {
    return (
      <section className="students-integrity-section card-elevated" aria-labelledby="integrity-heading">
        <h3 id="integrity-heading" className="section-heading">
          Attendance integrity review
        </h3>
        <p className="muted small">Loading students…</p>
      </section>
    )
  }

  return (
    <section className="students-integrity-section card-elevated" aria-labelledby="integrity-heading">
      <div className="section-title-row">
        <h3 id="integrity-heading" className="section-heading">
          Attendance integrity review
        </h3>
        <span className="section-count muted small">
          Institute ID <strong>{instituteIdLabel}</strong>
        </span>
      </div>
      <p className="muted small students-integrity-desc">
        Review students whose registration face does not match attendance captures. Use this list to investigate
        possible proxy attendance before scrolling the full roster.
      </p>

      {/* ── 1. Photo changed once ── */}
      <div className="integrity-block" aria-labelledby="integrity-changed-heading">
        <div className="integrity-block-head">
          <h4 id="integrity-changed-heading" className="integrity-subheading">
            1 — Registration photo replaced after attendance
          </h4>
          <span className="section-count">
            {photoChangedRows.length.toLocaleString('en-IN')} student
            {photoChangedRows.length !== 1 ? 's' : ''}
          </span>
          {photoChangedRows.length > 0 ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={exportPhotoChangedCsv}>
              📥 CSV
            </button>
          ) : null}
        </div>
        <p className="muted small integrity-block-desc">
          Original registration photo is kept; the app saved a new face for future checks (
          <code>face_photo_changed_once</code>).
        </p>

        {photoChangedRows.length === 0 ? (
          <p className="muted small integrity-empty">No students with a one-time attendance photo update.</p>
        ) : (
          <>
            <div className="table-wrap institutes-table-wrap students-integrity-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Institute ID</th>
                    <th>Inst. No.</th>
                    <th>Student</th>
                    <th>Original registration</th>
                    <th>Current (attendance)</th>
                    <th>Changed at</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pagedChanged.map((s) => {
                    const name = pick(s, 'name', 'student_name', 'full_name') ?? '—'
                    const instNo = studentInstNo(s) ?? '—'
                    const changedAt = s.face_photo_changed_at
                    return (
                      <tr key={s.id}>
                        <td>
                          <strong>{instituteIdLabel}</strong>
                          <div className="muted tiny">
                            <code>{institute.id.slice(0, 8)}…</code>
                          </div>
                        </td>
                        <td>
                          <strong>{instNo}</strong>
                        </td>
                        <td className="student-name-cell">
                          <strong>{name}</strong>
                          <div className="muted tiny">
                            <code>{s.id}</code>
                          </div>
                        </td>
                        <td className="students-photo-cell">
                          <StudentDisplayPhoto
                            student={{
                              ...s,
                              face_photo_url: s.original_face_photo_url,
                              registration_photo_path: s.original_registration_photo_path,
                              photo_thumbnail: null,
                            }}
                            displayName={`${name} (original)`}
                            size="sm"
                          />
                        </td>
                        <td className="students-photo-cell">
                          <StudentDisplayPhoto student={s} displayName={name} size="sm" />
                        </td>
                        <td className="integrity-ts-cell">{fmtCaptureTimestamp(changedAt != null ? String(changedAt) : null, attDate)}</td>
                        <td className="actions-cell">
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => onSelectStudent(s)}
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <IntegrityPager
              page={safeChangedPage}
              pageCount={changedPageCount}
              total={photoChangedRows.length}
              onPrev={() => setPageChanged((p) => Math.max(0, p - 1))}
              onNext={() => setPageChanged((p) => Math.min(changedPageCount - 1, p + 1))}
            />
          </>
        )}
      </div>

      {enableFullHistoryScan ? (
      <div className="integrity-block integrity-block--daily" aria-labelledby="integrity-history-heading">
        <div className="integrity-block-head">
          <h4 id="integrity-history-heading" className="integrity-subheading">
            2 — All entry/exit photos ≠ registration (full scan)
          </h4>
          <label className="integrity-date-field">
            <span className="muted small">From</span>
            <input
              type="date"
              value={historyFrom}
              onChange={(e) => onHistoryFromChange(e.target.value)}
              disabled={!showDayAttendance || historyLoading}
              aria-label="Scan attendance from date"
            />
          </label>
          <label className="integrity-date-field">
            <span className="muted small">To</span>
            <input
              type="date"
              value={historyTo}
              onChange={(e) => onHistoryToChange(e.target.value)}
              disabled={!showDayAttendance || historyLoading}
              aria-label="Scan attendance to date"
            />
          </label>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onReloadHistory?.()}
            disabled={!showDayAttendance || historyLoading}
          >
            {historyLoading ? 'Scanning…' : '↻ Rescan'}
          </button>
          <span className="section-count">
            {historyLoading
              ? '…'
              : `${captureMismatches.length.toLocaleString('en-IN')} students · ${totalHistoryFlags.toLocaleString('en-IN')} captures`}
          </span>
          {totalHistoryFlags > 0 ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={exportHistoryMismatchCsv}>
              📥 CSV
            </button>
          ) : null}
        </div>
        <p className="muted small integrity-block-desc">
          Loads <strong>every</strong> entry and exit attendance photo for this institute in the date range,
          compares each file path to the student&apos;s current registration face, and flags any mismatch
          (possible proxy / wrong person). Visual review still required.
          {!historyLoading && capturesScanned > 0 ? (
            <>
              {' '}
              Scanned {capturesScanned.toLocaleString('en-IN')} capture
              {capturesScanned === 1 ? '' : 's'} with photos.
            </>
          ) : null}
        </p>

        {historyError ? <p className="error">{historyError}</p> : null}
        {attError ? <p className="error">{attError}</p> : null}
        {!showDayAttendance ? (
          <p className="muted small integrity-empty">
            Needs <code>attendance_in_out</code> or <code>teacher_attendance</code> in the database.
          </p>
        ) : historyLoading ? (
          <p className="muted small integrity-empty">
            Scanning all attendance from {fmtDate(historyFrom)} to {fmtDate(historyTo)}…
          </p>
        ) : totalHistoryFlags === 0 ? (
          <p className="muted small integrity-empty">
            No entry/exit captures in this range differ from registration (or no photos stored).
          </p>
        ) : (
          <>
            <div className="table-wrap institutes-table-wrap students-integrity-table-wrap students-integrity-table-wrap--wide">
              <table>
                <thead>
                  <tr>
                    <th>Inst. No.</th>
                    <th>Student</th>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Registration</th>
                    <th>Attendance capture</th>
                    <th>Time</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pagedHistory.map(({ student: s, flag }) => {
                    const name = pick(s, 'name', 'student_name', 'full_name') ?? '—'
                    const instNo = studentInstNo(s) ?? '—'
                    const rowKey = `${s.id}-${flag.date}-${flag.kind}-${flag.photoUrl ?? ''}`
                    return (
                      <tr key={rowKey} className="integrity-row-flagged">
                        <td>
                          <strong>{instNo}</strong>
                        </td>
                        <td className="student-name-cell">
                          <strong>{name}</strong>
                        </td>
                        <td>{fmtDate(flag.date)}</td>
                        <td>
                          <span className={`badge ${flag.kind === 'entry' ? 'badge-present' : 'badge-half'}`}>
                            {flag.kind === 'entry' ? 'Entry' : 'Exit'}
                          </span>
                        </td>
                        <td className="students-photo-cell">
                          <StudentDisplayPhoto student={s} displayName={name} size="sm" />
                        </td>
                        <td className="students-photo-cell">
                          <PhotoThumb
                            url={flag.photoUrl}
                            label={flag.kind === 'entry' ? 'In' : 'Out'}
                            compact
                          />
                          <span className="badge badge-late integrity-diff-badge">≠ reg</span>
                        </td>
                        <td className="integrity-ts-cell">
                          {fmtCaptureTimestamp(flag.at, flag.date)}
                        </td>
                        <td className="actions-cell">
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => onSelectStudent(s)}
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <IntegrityPager
              page={safeHistoryPage}
              pageCount={historyPageCount}
              total={totalHistoryFlags}
              onPrev={() => setPageHistory((p) => Math.max(0, p - 1))}
              onNext={() => setPageHistory((p) => Math.min(historyPageCount - 1, p + 1))}
            />
          </>
        )}
      </div>
      ) : null}

      {/* ── Single-day / daily quick check ── */}
      <div className="integrity-block integrity-block--daily" aria-labelledby="integrity-daily-heading">
        <div className="integrity-block-head">
          <h4 id="integrity-daily-heading" className="integrity-subheading">
            {enableFullHistoryScan ? '3 — Quick check for one day' : '2 — Entry/exit photo ≠ registration (selected date)'}
          </h4>
          <label className="integrity-date-field">
            <span className="muted small">Date</span>
            <input
              type="date"
              value={attDate}
              onChange={(e) => onAttDateChange(e.target.value)}
              disabled={!showDayAttendance}
              aria-label="Date for attendance vs registration comparison"
            />
          </label>
          <span className="section-count">
            {attLoading ? '…' : dailyMismatchRows.length.toLocaleString('en-IN')} flagged
          </span>
          {dailyMismatchRows.length > 0 ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={exportDailyMismatchCsv}>
              📥 CSV
            </button>
          ) : null}
        </div>
        <p className="muted small integrity-block-desc">
          Same rule as section 2, but only for <strong>{fmtDate(attDate)}</strong>.
        </p>

        {!showDayAttendance ? (
          <p className="muted small integrity-empty">Attendance tables not detected.</p>
        ) : attLoading ? (
          <p className="muted small integrity-empty">Loading…</p>
        ) : dailyMismatchRows.length === 0 ? (
          <p className="muted small integrity-empty">No mismatches on this date.</p>
        ) : (
          <>
            <div className="table-wrap institutes-table-wrap students-integrity-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Inst. No.</th>
                    <th>Student</th>
                    <th>Registration</th>
                    <th>Entry</th>
                    <th>Exit</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pagedDaily.map(({ student: s, day, entryDiff, exitDiff }) => {
                    const name = pick(s, 'name', 'student_name', 'full_name') ?? '—'
                    const instNo = studentInstNo(s) ?? '—'
                    return (
                      <tr key={s.id} className="integrity-row-flagged">
                        <td>
                          <strong>{instNo}</strong>
                        </td>
                        <td className="student-name-cell">
                          <strong>{name}</strong>
                        </td>
                        <td className="students-photo-cell">
                          <StudentDisplayPhoto student={s} displayName={name} size="sm" />
                        </td>
                        <td className="students-photo-cell">
                          {entryDiff ? (
                            <PhotoThumb url={day.entryPhoto} label="In" compact />
                          ) : (
                            <span className="muted small">—</span>
                          )}
                        </td>
                        <td className="students-photo-cell">
                          {exitDiff ? (
                            <PhotoThumb url={day.exitPhoto} label="Out" compact />
                          ) : (
                            <span className="muted small">—</span>
                          )}
                        </td>
                        <td className="actions-cell">
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => onSelectStudent(s)}
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <IntegrityPager
              page={safeDailyPage}
              pageCount={dailyPageCount}
              total={dailyMismatchRows.length}
              onPrev={() => setPageDaily((p) => Math.max(0, p - 1))}
              onNext={() => setPageDaily((p) => Math.min(dailyPageCount - 1, p + 1))}
            />
          </>
        )}
      </div>
    </section>
  )
}
