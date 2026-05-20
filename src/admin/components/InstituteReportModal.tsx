import { useCallback, useEffect, useState } from 'react'
import type { InstituteRow } from './InstituteList'
import {
  downloadInstituteReportPdf,
  fetchInstituteReport,
  type InstituteReportResult,
} from '../lib/instituteReport'
import { InstituteReportTable } from './InstituteReportTable'
import { ModalPortal } from './ModalPortal'

function toInputDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseInputDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

type Props = {
  institute: InstituteRow
  onClose: () => void
}

export function InstituteReportModal({ institute, onClose }: Props) {
  const today = new Date()
  const defaultEnd = today
  const defaultStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7)

  const [startStr, setStartStr] = useState(toInputDate(defaultStart))
  const [endStr, setEndStr] = useState(toInputDate(defaultEnd))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<InstituteReportResult | null>(null)

  const loadReport = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const start = parseInputDate(startStr)
      const end = parseInputDate(endStr)
      if (end.getTime() < start.getTime()) {
        setError('End date must be on or after start date.')
        setReport(null)
        return
      }
      const data = await fetchInstituteReport(
        {
          id: institute.id,
          institute_code: institute.institute_code,
          name: institute.name,
        },
        start,
        end,
      )
      setReport(data)
    } catch (e) {
      setReport(null)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [institute, startStr, endStr])

  useEffect(() => {
    void loadReport()
  }, [loadReport])

  return (
    <ModalPortal>
      <div
        className="modal-overlay"
        role="dialog"
        aria-modal
        aria-labelledby="inst-report-title"
        onClick={onClose}
      >
      <div className="modal-panel modal-panel-wide card-elevated" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 id="inst-report-title" style={{ margin: 0, fontSize: '1.05rem' }}>
            Institute report — {institute.name ?? institute.institute_code ?? institute.id}
          </h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            ✕
          </button>
        </div>

        <p className="muted small" style={{ margin: '0.5rem 0 0.75rem' }}>
          Tabular attendance for all students (same logic as the MSCE app). Working days exclude today; end date is
          capped at yesterday.
        </p>

        <div className="inst-report-controls">
          <label>
            From
            <input type="date" value={startStr} onChange={(e) => setStartStr(e.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={endStr} onChange={(e) => setEndStr(e.target.value)} />
          </label>
          <button type="button" className="btn btn-primary btn-sm" disabled={loading} onClick={() => void loadReport()}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={loading || !report || report.studentRecords.length === 0}
            onClick={() => report && downloadInstituteReportPdf(report)}
          >
            📄 Export PDF
          </button>
        </div>

        {error ? <p className="error">{error}</p> : null}

        {loading && !report ? (
          <p className="muted" style={{ padding: '2rem 0', textAlign: 'center' }}>
            Loading report…
          </p>
        ) : report ? (
          <InstituteReportTable report={report} />
        ) : !error ? (
          <p className="muted" style={{ padding: '2rem 0', textAlign: 'center' }}>
            No data for the selected range.
          </p>
        ) : null}
      </div>
    </div>
    </ModalPortal>
  )
}
