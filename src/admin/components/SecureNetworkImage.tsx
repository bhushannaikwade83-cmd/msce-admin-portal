import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { getTemporaryPhotoUrl, immediateImgSrc } from '../lib/photoUrl'

type Props = {
  imageUrl?: string | null
  storagePath?: string | null
  /** Stable per-row key (e.g. student id) — bust cache when photo_version changes. */
  cacheKey?: string | null
  version?: string | number | null
  alt: string
  className?: string
  placeholder?: ReactNode
  errorWidget?: ReactNode
  onError?: () => void
  onResolved?: (url: string) => void
}

const MAX_RETRIES = 2

function withVersion(url: string, version: string | number | null | undefined): string {
  if (version == null || version === '') return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}v=${encodeURIComponent(String(version))}`
}

export function SecureNetworkImage({
  imageUrl,
  storagePath,
  cacheKey,
  version,
  alt,
  className,
  placeholder,
  errorWidget,
  onError,
  onResolved,
}: Props) {
  const [src, setSrc] = useState<string | null>(() => immediateImgSrc(imageUrl))
  const [loading, setLoading] = useState(() => {
    const raw = imageUrl?.trim() || storagePath?.trim()
    return !!raw && !immediateImgSrc(imageUrl)
  })
  const [failed, setFailed] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  const load = useCallback(async () => {
    const rawUrl = imageUrl?.trim() || ''
    const rawPath = storagePath?.trim() || ''
    if (!rawUrl && !rawPath) {
      setSrc(null)
      setLoading(false)
      setFailed(false)
      return
    }

    const fast = immediateImgSrc(rawUrl)
    if (fast) {
      const finalUrl = withVersion(fast, version)
      setSrc(finalUrl)
      onResolved?.(finalUrl)
      setLoading(false)
      setFailed(false)
      return
    }

    setLoading(true)
    setFailed(false)
    try {
      const url = await getTemporaryPhotoUrl({ photoUrl: rawUrl || null, storagePath: rawPath || null })
      if (url) {
        const finalUrl = withVersion(url, version)
        setSrc(finalUrl)
        onResolved?.(finalUrl)
        setFailed(false)
      } else {
        setSrc(null)
        setFailed(true)
      }
    } catch {
      setSrc(null)
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [imageUrl, storagePath, version, retryCount])

  useEffect(() => {
    void load()
  }, [load, cacheKey])

  if (loading) {
    return <>{placeholder ?? null}</>
  }

  if (failed || !src) {
    if (errorWidget) return <>{errorWidget}</>
    onError?.()
    return null
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => {
        if (retryCount < MAX_RETRIES) {
          setRetryCount((n) => n + 1)
          return
        }
        setFailed(true)
        setSrc(null)
        onError?.()
      }}
    />
  )
}
