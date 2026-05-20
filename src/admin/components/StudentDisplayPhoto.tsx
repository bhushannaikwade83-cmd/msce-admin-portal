import { useEffect, useState } from 'react'
import { immediateImgSrc, resolveStudentPhotoUrl, studentPhotoDepsKey } from '../lib/photoUrl'

type Props = {
  student: Record<string, unknown>
  displayName: string
  size: 'sm' | 'lg'
}

const IMMEDIATE_KEYS = [
  'face_photo_url',
  'facePhotoUrl',
  'photo_url',
  'photoUrl',
  'registration_photo_url',
  'profile_photo',
  'avatar_url',
  'image_url',
  'face_image_url',
  'student_photo_url',
] as const

export function StudentDisplayPhoto({ student, displayName, size }: Props) {
  const row = student as Record<string, unknown>
  const [src, setSrc] = useState<string | null>(() => {
    for (const k of IMMEDIATE_KEYS) {
      const v = row[k]
      if (typeof v === 'string') {
        const im = immediateImgSrc(v)
        if (im) return im
      }
    }
    return null
  })

  const photoDeps = studentPhotoDepsKey(student)

  useEffect(() => {
    let cancelled = false
    void resolveStudentPhotoUrl(student as Record<string, unknown>).then((u) => {
      if (!cancelled) setSrc(u)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- photoDeps captures all photo fields; parent may pass new object identity each render
  }, [photoDeps])

  const imgClass = size === 'lg' ? 'student-avatar-img-lg' : 'student-avatar-img'

  if (!src) return null

  return (
    <img
      src={src}
      alt={displayName}
      className={imgClass}
      onError={(e) => {
        ;(e.target as HTMLImageElement).style.display = 'none'
      }}
    />
  )
}
