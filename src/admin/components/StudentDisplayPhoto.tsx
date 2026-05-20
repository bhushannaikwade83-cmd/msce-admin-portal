import { studentPhotoDepsKey, studentPhotoSources } from '../lib/photoUrl'
import { SecureNetworkImage } from './SecureNetworkImage'

type Props = {
  student: Record<string, unknown>
  displayName: string
  size: 'sm' | 'lg'
}

export function StudentDisplayPhoto({ student, displayName, size }: Props) {
  const row = student as Record<string, unknown>
  const { photoUrl, storagePath, version, thumbnail } = studentPhotoSources(row)
  const photoDeps = studentPhotoDepsKey(student)
  const studentId = String(row.id ?? '').trim()
  const imgClass = size === 'lg' ? 'student-avatar-img-lg' : 'student-avatar-img'

  if (!photoUrl && !storagePath && !thumbnail) return null

  return (
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
}
