import { useMemo } from 'react'
import {
  PORTAL_DISTRICTS,
  countInstitutesPerDistrict,
  formatDistrictPrefixHint,
  type PortalDistrict,
} from '../lib/portalDistricts'

type Props = {
  rows: readonly { id: string; institute_code?: string | null }[]
  districtKey: string
  onDistrictKeyChange: (key: string) => void
  filteredCount: number
  /** District viewers: fixed district, no “All districts” option. */
  lockedDistrict?: PortalDistrict | null
  disabled?: boolean
}

export function InstituteDistrictFilter({
  rows,
  districtKey,
  onDistrictKeyChange,
  filteredCount,
  lockedDistrict = null,
  disabled = false,
}: Props) {
  const counts = useMemo(() => countInstitutesPerDistrict(rows), [rows])
  const locked = lockedDistrict ?? null

  if (locked) {
    const n = counts[locked.key] ?? filteredCount
    return (
      <div className="institutes-district-filter institutes-district-filter--locked">
        <span className="institutes-district-filter-label">District</span>
        <span className="institutes-district-filter-value" title={`Codes: ${formatDistrictPrefixHint(locked.prefixes)}`}>
          {locked.name}
        </span>
        <span className="institutes-district-filter-count" aria-live="polite">
          <strong>{n.toLocaleString('en-IN')}</strong> institutes
        </span>
        <span className="muted small institutes-district-filter-hint">
          Prefixes {formatDistrictPrefixHint(locked.prefixes)}
        </span>
      </div>
    )
  }

  return (
    <div className="institutes-district-filter">
      <label className="institutes-district-filter-label" htmlFor="institutes-district-select">
        District
      </label>
      <select
        id="institutes-district-select"
        className="institutes-district-select"
        value={districtKey}
        disabled={disabled}
        onChange={(e) => onDistrictKeyChange(e.target.value)}
        aria-label="Filter institutes by district code prefix"
      >
        <option value="">
          All districts ({counts['']?.toLocaleString('en-IN') ?? rows.length})
        </option>
        {PORTAL_DISTRICTS.map((d) => (
          <option key={d.key} value={d.key}>
            {d.name} ({(counts[d.key] ?? 0).toLocaleString('en-IN')}) — {formatDistrictPrefixHint(d.prefixes)}
          </option>
        ))}
      </select>
      {districtKey ? (
        <span className="institutes-district-filter-count" aria-live="polite">
          Showing <strong>{filteredCount.toLocaleString('en-IN')}</strong>
          {filteredCount === 1 ? ' institute' : ' institutes'}
        </span>
      ) : null}
    </div>
  )
}
