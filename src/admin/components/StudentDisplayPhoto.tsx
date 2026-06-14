import { useState, type ReactNode } from 'react'
import { studentPhotoDepsKey, studentPhotoSources } from '../lib/photoUrl'
import { SecureNetworkImage } from './SecureNetworkImage'
import { ModalPortal } from './ModalPortal'

type Props = {
  student: Record<string, unknown>
  displayName: string
  size: 'sm' | 'lg'
  clickable?: boolean
}

export function StudentDisplayPhoto({ student, displayName, size, clickable = false }: Props) {
  const [showModal, setShowModal] = useState(false)
  const row = student as Record<string, unknown>
  const { photoUrl, storagePath, version, thumbnail } = studentPhotoSources(row)
  const photoDeps = studentPhotoDepsKey(student)
  const studentId = String(row.id ?? '').trim()
  const imgClass = size === 'lg' ? 'student-avatar-img-lg' : 'student-avatar-img'

  if (!photoUrl && !storagePath && !thumbnail) return null

  const wrapClass = size === 'lg' ? 'student-avatar-lg' : 'student-table-avatar'

  const content = (
    <SecureNetworkImage
      key={photoDeps}
      imageUrl={photoUrl}
      storagePath={storagePath}
      cacheKey={studentId ? `student_face_${studentId}` : null}
      version={version}
      alt={displayName}
      className={imgClass}
      placeholder={
        thumbnail ? (
          <img src={thumbnail} alt="" className={imgClass} aria-hidden />
        ) : null
      }
    />
  )

  const wrapper: ReactNode = clickable ? (
    <button
      type="button"
      className={`${wrapClass} photo-clickable`}
      onClick={() => setShowModal(true)}
      style={{ cursor: 'pointer', border: 'none', background: 'none', padding: 0 }}
      title="Click to view full photo"
      aria-label={`View ${displayName} photo`}
    >
      {content}
    </button>
  ) : (
    <div className={wrapClass}>
      {content}
    </div>
  )

  return (
    <>
      {wrapper}
      {showModal && clickable && (
        <ModalPortal onClose={() => setShowModal(false)}>
          <div className="photo-modal" style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            zIndex: 999,
            padding: '2rem',
          }}>
            <div style={{
              position: 'relative',
              maxWidth: '90vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem',
            }}>
              <button
                type="button"
                className="photo-modal-close"
                onClick={() => setShowModal(false)}
                style={{
                  position: 'absolute',
                  top: '-2rem',
                  right: 0,
                  background: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  width: '2.5rem',
                  height: '2.5rem',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1000,
                }}
                aria-label="Close photo"
              >
                ✕
              </button>
              <SecureNetworkImage
                key={photoDeps}
                imageUrl={photoUrl}
                storagePath={storagePath}
                cacheKey={studentId ? `student_face_${studentId}` : null}
                version={version}
                alt={displayName}
                className="photo-modal-img"
                placeholder={
                  thumbnail ? (
                    <img
                      src={thumbnail}
                      alt=""
                      className="photo-modal-img"
                      aria-hidden
                    />
                  ) : null
                }
              />
              <div style={{ color: 'white', fontSize: '0.9rem', textAlign: 'center' }}>
                {displayName}
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  )
}
