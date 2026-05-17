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

/** No user input for this long → sign out (reduces risk from unattended unlocked screens). */
const IDLE_SIGN_OUT_MS = 30 * 60 * 1000

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

  const signOut = useCallback(async () => {
    const client = getSupabase()
    const { error } = await client.auth.signOut({ scope: 'global' })
    if (error) {
      await client.auth.signOut({ scope: 'local' })
    }
  }, [])

  /** Auto sign-out after idle (this tab only; pairs with per-tab session storage). */
  useEffect(() => {
    if (!session) return
    let lastActivity = Date.now()
    const touch = () => {
      lastActivity = Date.now()
    }
    const opts: AddEventListenerOptions = { capture: true, passive: true }
    const events: (keyof WindowEventMap)[] = [
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
      'click',
    ]
    for (const ev of events) {
      window.addEventListener(ev, touch, opts)
    }
    const tick = window.setInterval(() => {
      if (Date.now() - lastActivity >= IDLE_SIGN_OUT_MS) {
        void signOut()
      }
    }, 60_000)
    return () => {
      for (const ev of events) {
        window.removeEventListener(ev, touch, opts)
      }
      window.clearInterval(tick)
    }
  }, [session, signOut])

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
