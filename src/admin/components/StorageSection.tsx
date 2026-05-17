import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { getSupabase, storageBucketName } from '../lib/supabase'

type Bucket = { id: string; name: string; public: boolean }
type FileRow = { name: string; id: string | null }

type Props = { embedded?: boolean }

export function StorageSection({ embedded = false }: Props) {
  const { user } = useAuth()
  const [buckets, setBuckets] = useState<Bucket[]>([])
  const [bucketError, setBucketError] = useState<string | null>(null)
  const [files, setFiles] = useState<FileRow[]>([])
  const [filesError, setFilesError] = useState<string | null>(null)
  const [prefix, setPrefix] = useState('')
  const [loading, setLoading] = useState(false)

  const configuredBucket = storageBucketName()

  const loadBuckets = useCallback(async () => {
    if (!user) {
      setBuckets([])
      return
    }
    setBucketError(null)
    try {
      const sb = getSupabase()
      const { data, error } = await sb.storage.listBuckets()
      if (error) throw error
      setBuckets((data ?? []) as Bucket[])
    } catch (e) {
      setBuckets([])
      setBucketError(e instanceof Error ? e.message : String(e))
    }
  }, [user])

  const loadFiles = useCallback(async () => {
    if (!user || !configuredBucket) {
      setFiles([])
      return
    }
    setFilesError(null)
    setLoading(true)
    try {
      const sb = getSupabase()
      const { data, error } = await sb.storage.from(configuredBucket).list(prefix || '', {
        limit: 100,
        sortBy: { column: 'name', order: 'asc' },
      })
      if (error) throw error
      setFiles((data ?? []) as FileRow[])
    } catch (e) {
      setFiles([])
      setFilesError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [user, configuredBucket, prefix])

  useEffect(() => {
    void loadBuckets()
  }, [loadBuckets])

  useEffect(() => {
    void loadFiles()
  }, [loadFiles])

  if (!user) {
    return (
      <div className="card muted">
        <h2>Supabase Storage</h2>
        <p className="small">Sign in to call Storage with your JWT (same project as the app). Policies decide read/list access.</p>
      </div>
    )
  }

  const shell = embedded ? 'dash-section card-elevated' : 'card'

  return (
    <div className={shell}>
      {!embedded ? <h2>Supabase Storage</h2> : <p className="section-kicker">Object storage</p>}
      <p className="muted small">
        Same Supabase project and <strong>authenticated session</strong> as database calls. Grant access with Storage policies in the dashboard (or SQL). Attendance photos in the mobile app may use Backblaze (
        <code>B2B_*</code> in <code>.env</code>) instead — use this section when you store files in Supabase buckets.
      </p>

      <h3 className="h3">Buckets</h3>
      <button type="button" className="btn btn-ghost" onClick={() => void loadBuckets()}>
        Refresh buckets
      </button>
      {bucketError ? (
        <p className="error small">
          {bucketError} — listing buckets often requires owner/service role or a custom policy; you can still list a bucket below if{' '}
          <code>storage.objects</code> allows your role.
        </p>
      ) : null}
      <ul className="list">
        {buckets.map((b) => (
          <li key={b.id}>
            <code>{b.name}</code> {b.public ? <span className="muted">(public)</span> : <span className="muted">(private)</span>}
          </li>
        ))}
        {!buckets.length && !bucketError ? <li className="muted">No buckets returned.</li> : null}
      </ul>

      <h3 className="h3">List objects</h3>
      {configuredBucket ? (
        <>
          <p className="muted small">
            Bucket from <code>VITE_STORAGE_BUCKET</code>: <strong>{configuredBucket}</strong>
          </p>
          <label className="inline">
            Prefix / folder
            <input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="e.g. institute_id/" />
          </label>
          <div className="row">
            <button type="button" className="btn btn-ghost" onClick={() => void loadFiles()} disabled={loading}>
              {loading ? 'Loading…' : 'List files'}
            </button>
          </div>
          {filesError ? <p className="error">{filesError}</p> : null}
          <ul className="list mono">
            {files.map((f) => (
              <li key={f.name}>{f.name}</li>
            ))}
            {!files.length && !filesError && !loading ? <li className="muted">Empty or no access.</li> : null}
          </ul>
        </>
      ) : (
        <p className="muted small">
          Set <code>VITE_STORAGE_BUCKET</code> in <code>.env.local</code> to browse a bucket. Add Storage RLS so your coder / super_admin role can <code>select</code> on{' '}
          <code>storage.objects</code>.
        </p>
      )}
    </div>
  )
}
