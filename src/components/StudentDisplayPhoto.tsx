import { useEffect, useState } from 'react'
import { immediateImgSrc, resolveStudentPhotoUrl } from '../lib/photoUrl'

type Props = {
  student: Record<string, unknown>
  displayName: string
  size: 'sm' | 'lg'
}

function depKey(student: Record<string, unknown>): string {
  return [
    student.id,
    student.face_photo_url,
    student.photo_url,
    student.registration_photo_path,
    student.photo_path,
    student.profile_photo,
    student.avatar_url,
    student.image_url,
  ]
    .map((v) => (v == null ? '' : String(v)))
    .join('|')
}

export function StudentDisplayPhoto({ student, displayName, size }: Props) {
  const row = student as Record<string, unknown>
  const [src, setSrc] = useState<string | null>(() => {
    const keys = [
      'face_photo_url',
      'photo_url',
      'photoUrl',
      'profile_photo',
      'avatar_url',
      'image_url',
    ] as const
    for (const k of keys) {
      const v = row[k]
      if (typeof v === 'string') {
        const im = immediateImgSrc(v)
        if (im) return im
      }
    }
    return null
  })

  const photoDeps = depKey(student)

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
