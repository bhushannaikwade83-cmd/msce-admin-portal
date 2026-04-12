import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabase } from '../lib/supabase'

export type AuthState = {
  session: Session | null
  user: User | null
  loading: boolean
  configError: string | null
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

/** Auth + config banner live here so children always see a valid context (HMR-safe). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [configError, setConfigError] = useState<string | null>(null)

  useEffect(() => {
    let client: ReturnType<typeof getSupabase> | null = null
    try {
      client = getSupabase()
      setConfigError(null)
    } catch (e) {
      setConfigError(e instanceof Error ? e.message : String(e))
      setLoading(false)
      return
    }

    client.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const client = getSupabase()
      const { error } = await client.auth.signInWithPassword({ email, password })
      return { error: error ? new Error(error.message) : null }
    } catch (e) {
      const raw = e instanceof Error ? e : new Error(String(e))
      const msg = raw.message
      if (msg === 'Failed to fetch' || msg.includes('Load failed') || msg.includes('NetworkError')) {
        return {
          error: new Error(
            'Could not reach Supabase (network). Try: disable ad blockers for localhost, turn off VPN briefly, confirm the project is running in the Supabase dashboard (not paused), then restart `npm run dev` after .env changes. In DevTools → Network, check the request to …supabase.co/auth/v1/token.',
          ),
        }
      }
      return { error: raw }
    }
  }, [])

  const signOut = useCallback(async () => {
    const client = getSupabase()
    // Global: revoke refresh token on Supabase (invalidates this session everywhere).
    const { error } = await client.auth.signOut({ scope: 'global' })
    if (error) {
      // Offline or server unreachable — still clear this browser’s session.
      await client.auth.signOut({ scope: 'local' })
    }
  }, [])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      configError,
      signIn,
      signOut,
    }),
    [session, loading, configError, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
