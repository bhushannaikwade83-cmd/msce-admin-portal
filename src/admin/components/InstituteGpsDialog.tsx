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
  saveGpsSettingWithHistory,
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

function coordInputValue(n: number | null): string {
  return n == null ? '' : String(n)
}

function parseCoord(value: string): number | null {
  const s = value.trim()
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
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
  const [geoBusy, setGeoBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [historyErr, setHistoryErr] = useState<string | null>(null)
  const [isLocked, setIsLocked] = useState(line.is_locked === true)
  const [latitude, setLatitude] = useState(coordInputValue(line.latitude))
  const [longitude, setLongitude] = useState(coordInputValue(line.longitude))
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
        setIsLocked(row?.is_locked === true)
        setLatitude(coordInputValue(gpsLatitude(row)))
        setLongitude(coordInputValue(gpsLongitude(row)))
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

  const parsedLat = useMemo(() => parseCoord(latitude), [latitude])
  const parsedLng = useMemo(() => parseCoord(longitude), [longitude])
  const latValid = parsedLat == null || (parsedLat >= -90 && parsedLat <= 90)
  const lngValid = parsedLng == null || (parsedLng >= -180 && parsedLng <= 180)
  const canSaveCoords = parsedLat != null && parsedLng != null && latValid && lngValid

  async function useCurrentLocation() {
    if (!navigator.geolocation) {
      setErr('Browser geolocation is not available on this device.')
      return
    }
    setGeoBusy(true)
    setErr(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(String(pos.coords.latitude))
        setLongitude(String(pos.coords.longitude))
        setGeoBusy(false)
      },
      (geoErr) => {
        setErr(geoErr.message || 'Could not read current device location.')
        setGeoBusy(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  }

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
      setIsLocked(false)
      setLatitude('')
      setLongitude('')
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

  async function save() {
    setErr(null)
    if (!latValid || !lngValid) {
      setErr('Latitude must be between -90 and 90, and longitude between -180 and 180.')
      return
    }
    if (!isLocked && (parsedLat == null || parsedLng == null)) {
      setErr('Enter both latitude and longitude before saving an unlocked GPS.')
      return
    }
    setBusy(true)
    try {
      await saveGpsSettingWithHistory({
        instituteId: institute.id,
        adminId: line.adminId,
        isLocked,
        latitude: parsedLat,
        longitude: parsedLng,
        note,
      })
      await loadHistory()
      onSaved()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const currentPair = formatGpsPair(parsedLat, parsedLng)
  const previousSnapshot = useMemo(() => previousGpsFromHistory(history), [history])
  const currentSnapshot = useMemo(
    () => ({
      latitude: parsedLat,
      longitude: parsedLng,
      isLocked,
    }),
    [parsedLat, parsedLng, isLocked],
  )
  const canClearGps = parsedLat != null && parsedLng != null

  return (
    <ModalPortal>
      <div className="modal-overlay" role="dialog" aria-modal aria-labelledby="gps-dialog-title" onClick={onClose}>
        <div className="modal-panel modal-panel-gps card-elevated" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <h2 id="gps-dialog-title" style={{ margin: 0, fontSize: '1.05rem' }}>
              Manage GPS
            </h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>
              ✕
            </button>
          </div>

          <p className="modal-subtitle">
            Unlock, set, or clear GPS for this institute admin. <strong>Clear GPS</strong> saves the current location as
            previous (history) and sets coordinates to empty so the institute can set a new location from the mobile app.
            Previous and current locations are shown side by side (same layout as registration vs attendance photos).
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
              currentHint={
                confirmClear
                  ? 'Will be cleared — institute sets new location in app'
                  : 'Not set — institute can set from app (GPS tab)'
              }
            />
            <div className="muted small" style={{ marginTop: '0.65rem' }}>
              Last change: {fmtDateTime(currentChangedAt)}
              {currentPair ? (
                <>
                  {' '}
                  · Editing: <span className="mono">{currentPair}</span>
                </>
              ) : null}
            </div>
          </div>

          <div className="gps-form-grid">
            <div className="field field-checkbox span-2">
              <input
                id="gps-edit-locked"
                type="checkbox"
                checked={isLocked}
                onChange={(e) => setIsLocked(e.target.checked)}
                disabled={busy || loading}
              />
              <label htmlFor="gps-edit-locked">Keep GPS locked after save</label>
            </div>

            <div className="field">
              <label htmlFor="gps-edit-lat">Latitude</label>
              <input
                id="gps-edit-lat"
                type="number"
                inputMode="decimal"
                step="0.000001"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                disabled={busy || loading || isLocked}
                placeholder="18.520430"
              />
            </div>

            <div className="field">
              <label htmlFor="gps-edit-lng">Longitude</label>
              <input
                id="gps-edit-lng"
                type="number"
                inputMode="decimal"
                step="0.000001"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                disabled={busy || loading || isLocked}
                placeholder="73.856744"
              />
            </div>

            <div className="field span-2">
              <label htmlFor="gps-edit-note">Change note (optional)</label>
              <input
                id="gps-edit-note"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={busy || loading}
                placeholder="Why did you unlock or move this GPS?"
              />
            </div>
          </div>

          <div className="gps-modal-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void useCurrentLocation()}
              disabled={busy || loading || geoBusy || isLocked}
            >
              {geoBusy ? 'Reading GPS…' : 'Use current device location'}
            </button>
            {canClearGps && !confirmClear ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-gps-clear"
                disabled={busy || loading}
                onClick={() => setConfirmClear(true)}
              >
                Clear GPS (set to null)
              </button>
            ) : null}
            {confirmClear ? (
              <div className="gps-clear-confirm">
                <span className="small">
                  Save <strong>{currentPair}</strong> as previous and clear current GPS? Institute admin sets new
                  location in the app.
                </span>
                <div className="row" style={{ gap: '0.4rem', marginTop: '0.4rem' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy}
                    onClick={() => void clearGps()}
                  >
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
            ) : null}
            <span className="muted small">
              {!isLocked && !canSaveCoords ? 'Enter both coordinates to save an unlocked GPS.' : ' '}
            </span>
          </div>

          <div className="modal-form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy || loading}>
              {busy ? 'Saving…' : 'Save GPS'}
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
                        currentHint="Not set (cleared or pending)"
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
