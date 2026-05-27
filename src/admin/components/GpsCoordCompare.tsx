import { formatGpsPair, googleMapsUrl, hasGpsCoordinates } from '../lib/instituteGpsPortal'

export type GpsCoordSnapshot = {
  latitude: number | null
  longitude: number | null
  isLocked?: boolean | null
}

export function GpsCoordCompare({
  previous,
  current,
  previousLabel = 'Previous GPS',
  currentLabel = 'Current GPS',
  currentHint,
}: {
  previous: GpsCoordSnapshot | null
  current: GpsCoordSnapshot | null
  previousLabel?: string
  currentLabel?: string
  currentHint?: string | null
}) {
  return (
    <div className="student-registration-photos-dual gps-coords-dual">
      <GpsCoordBlock label={previousLabel} snapshot={previous} emptyText="No prior GPS on record" />
      <GpsCoordBlock
        label={currentLabel}
        snapshot={current}
        emptyText={currentHint ?? 'Not set — institute can set from app'}
      />
    </div>
  )
}

function GpsCoordBlock({
  label,
  snapshot,
  emptyText,
}: {
  label: string
  snapshot: GpsCoordSnapshot | null
  emptyText: string
}) {
  const lat = snapshot?.latitude ?? null
  const lng = snapshot?.longitude ?? null
  const pair = formatGpsPair(lat, lng)
  const maps = googleMapsUrl(lat, lng)
  const locked = snapshot?.isLocked

  return (
    <div className="student-registration-photo-block gps-coord-block">
      <div className="student-registration-photo-label">{label}</div>
      <div className={`gps-coord-panel ${pair ? 'gps-coord-panel-set' : 'gps-coord-panel-empty'}`}>
        {pair ? (
          <>
            <div className="gps-coord-value mono">{pair}</div>
            {locked != null ? (
              <span className={`gps-badge ${locked ? 'gps-locked' : 'gps-unlocked'}`}>
                {locked ? '🔒 Locked' : '🔓 Unlocked'}
              </span>
            ) : null}
            {maps ? (
              <a className="gps-coord-maps-link" href={maps} target="_blank" rel="noopener noreferrer">
                Open in Maps
              </a>
            ) : null}
          </>
        ) : (
          <p className="gps-coord-empty muted small">{emptyText}</p>
        )}
      </div>
    </div>
  )
}

export function previousGpsFromHistory(
  history: { old_latitude: number | null; old_longitude: number | null; old_is_locked: boolean | null }[],
): GpsCoordSnapshot | null {
  for (const row of history) {
    if (hasGpsCoordinates(row.old_latitude, row.old_longitude)) {
      return {
        latitude: row.old_latitude,
        longitude: row.old_longitude,
        isLocked: row.old_is_locked,
      }
    }
  }
  return null
}

export function historyItemToCompare(item: {
  old_latitude: number | null
  old_longitude: number | null
  old_is_locked: boolean | null
  new_latitude: number | null
  new_longitude: number | null
  new_is_locked: boolean | null
}) {
  return {
    previous: hasGpsCoordinates(item.old_latitude, item.old_longitude)
      ? {
          latitude: item.old_latitude,
          longitude: item.old_longitude,
          isLocked: item.old_is_locked,
        }
      : null,
    current: hasGpsCoordinates(item.new_latitude, item.new_longitude)
      ? {
          latitude: item.new_latitude,
          longitude: item.new_longitude,
          isLocked: item.new_is_locked,
        }
      : null,
  }
}
