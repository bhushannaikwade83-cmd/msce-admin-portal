import { useEffect, useState } from 'react'
import { b2ObjectPathFromPhotoUrl } from '../lib/photoUrl'
import { SecureNetworkImage } from './SecureNetworkImage'

function PhotoLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div className="lightbox-overlay" onClick={onClose} role="dialog" aria-modal aria-label={alt}>
      <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="lightbox-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <img src={src} alt={alt} className="lightbox-img" />
        <p className="lightbox-caption">{alt}</p>
      </div>
    </div>
  )
}

export function PhotoThumb({
  url,
  label,
  compact = false,
}: {
  url: string | null | undefined
  label: string
  compact?: boolean
}) {
  const [lb, setLb] = useState(false)
  const [resolved, setResolved] = useState<string | null>(null)
  const raw = url ? String(url).trim() : ''
  const storagePath = raw ? b2ObjectPathFromPhotoUrl(raw) : null

  if (!raw) {
    if (compact) {
      return (
        <div
          className="att-photo-slot att-photo-empty att-photo-slot--compact"
          title={`No ${label} photo`}
          aria-hidden
        >
          <span className="att-photo-dash">—</span>
        </div>
      )
    }
    return (
      <div className="att-photo-slot att-photo-empty">
        <span className="att-photo-empty-icon">📷</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{label}</span>
        <span className="att-photo-no-photo">No photo</span>
      </div>
    )
  }

  return (
    <>
      <div
        className={`att-photo-slot${!resolved && raw ? ' att-photo-loading' : ''}${compact ? ' att-photo-slot--compact' : ''}`}
        onClick={() => resolved && setLb(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && resolved && setLb(true)}
        title={`View ${label} photo`}
      >
        <div className="att-photo-label">
          {label === 'In' ? '🟢' : '🔴'} {label}
        </div>
        <SecureNetworkImage
          imageUrl={raw}
          storagePath={storagePath}
          alt={`${label} photo`}
          className="att-photo-img"
          placeholder={
            <div className="att-photo-err-msg" style={{ opacity: 0.75 }}>
              <span>⏳</span>
              <span>Loading…</span>
            </div>
          }
          errorWidget={
            <div className="att-photo-err-msg att-photo-error">
              <span>⚠️</span>
              <span>Failed to load</span>
            </div>
          }
          onResolved={setResolved}
        />
        {resolved && !compact ? <div className="att-photo-overlay">🔍 View</div> : null}
      </div>
      {lb && resolved ? (
        <PhotoLightbox src={resolved} alt={`${label} photo`} onClose={() => setLb(false)} />
      ) : null}
    </>
  )
}
