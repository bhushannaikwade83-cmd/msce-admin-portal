import { useEffect, useMemo, useState } from 'react'
import type { InstituteRow } from './InstituteList'
import {
  GpsCoordCompare,
  historyItemToCompare,
  previousGpsFromHistory,
} from './GpsCoordCompare'
import { ModalPortal } from './ModalPortal'
import {
  clearGpsSettingWithHistory,
  fetchGpsHistoryRows,
  fetchGpsSettingRow,
  formatGpsPair,
  gpsLatitude,
  gpsLongitude,
  gpsUpdatedAt,
  hasGpsCoordinates,
  type PortalGpsAdminLine,
  type PortalGpsHistoryRow,
} from '../lib/instituteGpsPortal'

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return String(iso)
  }
}

export function InstituteGpsDialog({
  institute,
  line,
  onClose,
  onSaved,
}: {
  institute: InstituteRow
  line: PortalGpsAdminLine
  onClose: () => void
  onSaved: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [historyBusy, setHistoryBusy] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [historyErr, setHistoryErr] = useState<string | null>(null)
  const [latitude, setLatitude] = useState<number | null>(line.latitude)
  const [longitude, setLongitude] = useState<number | null>(line.longitude)
  const [note, setNote] = useState('')
  const [currentChangedAt, setCurrentChangedAt] = useState<string | null>(line.updated_at)
  const [history, setHistory] = useState<PortalGpsHistoryRow[]>([])
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setErr(null)
      try {
        const row = await fetchGpsSettingRow(institute.id, line.adminId)
        if (cancelled) return
        setLatitude(gpsLatitude(row))
        setLongitude(gpsLongitude(row))
        setCurrentChangedAt(gpsUpdatedAt(row))
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [institute.id, line.adminId])

  async function loadHistory() {
    setHistoryBusy(true)
    setHistoryErr(null)
    try {
      const rows = await fetchGpsHistoryRows(institute.id, line.adminId)
      setHistory(rows)
    } catch (e) {
      setHistory([])
      setHistoryErr(e instanceof Error ? e.message : String(e))
    } finally {
      setHistoryBusy(false)
    }
  }

  useEffect(() => {
    void loadHistory()
  }, [institute.id, line.adminId])

  async function clearGps() {
    setErr(null)
    setBusy(true)
    try {
      await clearGpsSettingWithHistory({
        instituteId: institute.id,
        adminId: line.adminId,
        note: note.trim() || undefined,
      })
      const row = await fetchGpsSettingRow(institute.id, line.adminId)
      setLatitude(gpsLatitude(row))
      setLongitude(gpsLongitude(row))
      setCurrentChangedAt(gpsUpdatedAt(row))
      await loadHistory()
      setConfirmClear(false)
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const currentPair = formatGpsPair(latitude, longitude)
  const previousSnapshot = useMemo(() => previousGpsFromHistory(history), [history])
  const currentSnapshot = useMemo(
    () => ({
      latitude,
      longitude,
    }),
    [latitude, longitude],
  )
  const canClearGps = hasGpsCoordinates(latitude, longitude)

  return (
    <ModalPortal>
      <div className="modal-overlay" role="dialog" aria-modal aria-labelledby="gps-dialog-title" onClick={onClose}>
        <div className="modal-panel modal-panel-gps card-elevated" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <h2 id="gps-dialog-title" style={{ margin: 0, fontSize: '1.05rem' }}>
              Clear institute GPS
            </h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>
              ✕
            </button>
          </div>

          <p className="modal-subtitle">
            Website action: save the <strong>current</strong> coordinates as previous (history), set latitude and
            longitude to <strong>null</strong> in the database. The institute admin sets the new location in the mobile
            app (current device location → save). The app locks GPS after that — lock/unlock is not done on this website.
          </p>

          <div className="gps-modal-meta">
            <span className="modal-institute-id-badge">
              Institute ID <code>{institute.id}</code>
            </span>
            <span className="modal-institute-id-badge">
              Admin <strong>{line.label}</strong>
            </span>
          </div>

          {err ? <p className="error" style={{ marginTop: '0.75rem' }}>{err}</p> : null}
          {loading ? <p className="muted small">Loading current GPS…</p> : null}

          <div className="gps-compare-card">
            <div className="gps-current-label">Previous vs current location</div>
            <GpsCoordCompare
              previous={previousSnapshot}
              current={currentSnapshot}
              previousLabel="Previous GPS (saved)"
              currentLabel="Current GPS"
              currentHint="Not set — institute admin sets new location in app, then app locks GPS"
            />
            <div className="muted small" style={{ marginTop: '0.65rem' }}>
              Last change: {fmtDateTime(currentChangedAt)}
              {currentPair ? (
                <>
                  {' '}
                  · Current: <span className="mono">{currentPair}</span>
                </>
              ) : null}
            </div>
          </div>

          {canClearGps ? (
            <div className="field" style={{ marginTop: '1rem' }}>
              <label htmlFor="gps-clear-note">Note (optional)</label>
              <input
                id="gps-clear-note"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={busy || loading}
                placeholder="Reason for clearing GPS (portal audit)"
              />
            </div>
          ) : null}

          <div className="gps-modal-actions">
            {!canClearGps ? (
              <p className="muted small">
                No GPS coordinates to clear. Institute admin can set location in the app when ready.
              </p>
            ) : !confirmClear ? (
              <button
                type="button"
                className="btn btn-primary btn-sm btn-gps-clear"
                disabled={busy || loading}
                onClick={() => setConfirmClear(true)}
              >
                Clear GPS (set coordinates to null)
              </button>
            ) : (
              <div className="gps-clear-confirm">
                <span className="small">
                  Save <strong>{currentPair}</strong> as previous and set current GPS to null? Institute admin will add
                  the new location from the app.
                </span>
                <div className="row" style={{ gap: '0.4rem', marginTop: '0.4rem' }}>
                  <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void clearGps()}>
                    {busy ? 'Clearing…' : 'Yes, clear GPS'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() => setConfirmClear(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="modal-form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
              Close
            </button>
          </div>

          <div className="gps-history-card">
            <div className="section-title-row">
              <h3 style={{ margin: 0, fontSize: '0.95rem' }}>GPS history</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void loadHistory()} disabled={historyBusy}>
                {historyBusy ? 'Loading…' : 'Refresh'}
              </button>
            </div>
            {historyErr ? <p className="error" style={{ marginTop: '0.75rem' }}>{historyErr}</p> : null}
            {historyBusy ? (
              <p className="muted small">Loading history…</p>
            ) : history.length === 0 ? (
              <p className="muted small">No GPS history recorded yet for this admin.</p>
            ) : (
              <div className="gps-history-list">
                {history.map((item) => {
                  const { previous, current } = historyItemToCompare(item)
                  return (
                    <article key={item.id} className="gps-history-item">
                      <div className="gps-history-head">
                        <strong>{item.action ?? 'update'}</strong>
                        <span className="muted small">{fmtDateTime(item.changed_at)}</span>
                      </div>
                      <GpsCoordCompare
                        previous={previous}
                        current={current}
                        previousLabel="Previous"
                        currentLabel="New"
                        currentHint="Not set — set from app"
                      />
                      <div className="muted small" style={{ marginTop: '0.5rem' }}>
                        By {item.changed_by_email ?? item.changed_by_user_id ?? 'unknown user'}
                        {item.note ? ` · ${item.note}` : ''}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
