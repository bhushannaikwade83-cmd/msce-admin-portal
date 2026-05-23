import { useCallback, useEffect, useMemo, useState } from 'react'
import { sortByInstituteId } from '../lib/instituteSort'
import { discoverSchema } from '../lib/schemaDiscovery'
import { fetchAllPaged } from '../lib/supabasePaged'
import { getSupabase } from '../lib/supabase'
import type { InstituteRow } from './InstituteList'
import { IntegrityInstituteLoader } from './IntegrityInstituteLoader'

export function AttendanceIntegritySection({
  embedded = false,
  onOpenInstitute,
}: {
  embedded?: boolean
  onOpenInstitute?: (instituteId: string) => void
}) {
  const [institutes, setInstitutes] = useState<InstituteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [instituteId, setInstituteId] = useState('')
  const [attendanceTables, setAttendanceTables] = useState<string[]>([])
  const [schemaLoading, setSchemaLoading] = useState(true)

  const selected = useMemo(
    () => institutes.find((i) => i.id === instituteId) ?? null,
    [institutes, instituteId],
  )

  const loadInstitutes = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const sb = getSupabase()
      const raw = await fetchAllPaged<InstituteRow>((rangeFrom, rangeTo) =>
        sb.from('institutes').select('*').order('name').range(rangeFrom, rangeTo),
      )
      setInstitutes(sortByInstituteId(raw))
    } catch (e) {
      setInstitutes([])
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadInstitutes()
  }, [loadInstitutes])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setSchemaLoading(true)
      const cfg = await discoverSchema()
      if (!cancelled) {
        setAttendanceTables(cfg.attendanceTables)
        setSchemaLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const shell = embedded ? 'dash-section integrity-page' : 'card integrity-page'

  return (
    <div className={shell}>
      <div className="card-head institutes-page-head">
        <div>
          {embedded ? <span className="section-kicker">Cheat watch</span> : <h2>Cheat watch</h2>}
          <p className="muted small students-page-lead">
            Find students whose registration face does not match attendance captures. Select an institute, review
            flagged rows, or open the full roster in Students.
          </p>
        </div>
      </div>

      <div className="integrity-toolbar card-elevated">
        <label className="integrity-inst-pick">
          <span className="muted small">Institute</span>
          <select
            value={instituteId}
            onChange={(e) => setInstituteId(e.target.value)}
            disabled={loading || institutes.length === 0}
            aria-label="Select institute for integrity review"
          >
            <option value="">— Select institute —</option>
            {institutes.map((i) => (
              <option key={i.id} value={i.id}>
                {i.institute_code ? `${i.institute_code} — ` : ''}
                {i.name ?? i.id}
              </option>
            ))}
          </select>
        </label>
        {selected && onOpenInstitute ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => onOpenInstitute(selected.id)}
          >
            Open in Students →
          </button>
        ) : null}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void loadInstitutes()} disabled={loading}>
          {loading ? 'Loading…' : '↻ Refresh'}
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {schemaLoading ? (
        <p className="muted small">Detecting attendance tables…</p>
      ) : attendanceTables.length === 0 ? (
        <p className="muted small">
          No <code>attendance_in_out</code> or <code>teacher_attendance</code> table found. Daily photo comparison
          needs one of these.
        </p>
      ) : null}

      {!selected ? (
        <p className="muted small" style={{ marginTop: '1rem' }}>
          {loading ? 'Loading institutes…' : 'Select an institute above to load integrity review tables.'}
        </p>
      ) : (
        <IntegrityInstituteLoader
          institute={selected}
          attendanceTables={attendanceTables}
          onSelectStudent={() => onOpenInstitute?.(selected.id)}
        />
      )}
    </div>
  )
}
