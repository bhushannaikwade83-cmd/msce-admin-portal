import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { DashboardTab } from '../layouts/DashboardLayout'
import {
  fetchPortalSessionInfo,
  type PortalSessionInfo,
} from '../lib/adminOnboardingPortal'
import { useAuth } from '../hooks/useAuth'

export type PortalMode = 'super_admin' | 'district_viewer' | 'unauthorized' | 'loading'

export type PortalAccess = {
  mode: PortalMode
  readOnly: boolean
  districtName: string | null
  institutePrefixes: string[]
  allowedTabs: DashboardTab[]
  message: string | null
}

const ALL_TABS: DashboardTab[] = [
  'overview',
  'admins',
  'instructors',
  'institutes',
  'add',
  'students',
  'quicksearch',
  'integrity',
  'reports',
]

const DISTRICT_TABS: DashboardTab[] = ['institutes', 'instructors', 'students', 'quicksearch', 'integrity', 'reports']

const VALID_TABS = new Set<DashboardTab>(ALL_TABS)

function parseAllowedTabs(
  raw: string[] | null | undefined,
  fallback: DashboardTab[],
): DashboardTab[] {
  if (!Array.isArray(raw) || raw.length === 0) return fallback
  const parsed = raw.filter((t): t is DashboardTab => VALID_TABS.has(t as DashboardTab))
  if (parsed.length === 0) return fallback

  const merged = [...parsed]
  for (const tab of fallback) {
    if (!merged.includes(tab)) merged.push(tab)
  }
  return merged
}

const PortalAccessContext = createContext<PortalAccess | null>(null)

function resolvePortalAccess(info: PortalSessionInfo | null): PortalAccess {
  if (!info?.authenticated) {
    return {
      mode: 'unauthorized',
      readOnly: true,
      districtName: null,
      institutePrefixes: [],
      allowedTabs: [],
      message: info?.message ?? 'Not signed in',
    }
  }

  const mode = info.portal_mode
  if (mode === 'super_admin' || info.is_super_admin_fn) {
    return {
      mode: 'super_admin',
      readOnly: false,
      districtName: null,
      institutePrefixes: [],
      allowedTabs: parseAllowedTabs(
        Array.isArray(info.allowed_tabs) ? info.allowed_tabs.map(String) : null,
        ALL_TABS,
      ),
      message: info.message ?? null,
    }
  }

  if (mode === 'district_viewer' || info.is_portal_district_viewer) {
    const prefixes = Array.isArray(info.institute_prefixes)
      ? info.institute_prefixes.map(String)
      : []
    const readOnly = info.read_only !== false
    return {
      mode: 'district_viewer',
      readOnly,
      districtName: info.district_name ?? null,
      institutePrefixes: prefixes,
      allowedTabs: parseAllowedTabs(
        Array.isArray(info.allowed_tabs) ? info.allowed_tabs.map(String) : null,
        DISTRICT_TABS,
      ),
      message: info.message ?? null,
    }
  }

  return {
    mode: 'unauthorized',
    readOnly: true,
    districtName: null,
    institutePrefixes: [],
    allowedTabs: [],
    message:
      info.message ??
      'This account is not authorised for the MSCE admin portal. Use a super admin or district viewer login.',
  }
}

const PORTAL_CACHE_KEY = 'msce-admin-portal-access-cache'

function normalizePortalAccessTabs(access: PortalAccess): PortalAccess {
  const fallback = access.mode === 'district_viewer' ? DISTRICT_TABS : ALL_TABS
  return {
    ...access,
    allowedTabs: parseAllowedTabs(access.allowedTabs, fallback),
  }
}

function getCachedPortalAccess(): PortalAccess | null {
  try {
    const cached = localStorage.getItem(PORTAL_CACHE_KEY)
    return cached ? normalizePortalAccessTabs(JSON.parse(cached) as PortalAccess) : null
  } catch {
    return null
  }
}

function setCachedPortalAccess(access: PortalAccess): void {
  try {
    localStorage.setItem(PORTAL_CACHE_KEY, JSON.stringify(access))
  } catch {
    // Ignore cache write errors
  }
}

export function PortalAccessProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [access, setAccess] = useState<PortalAccess>(() => {
    // Try to use cached value first
    const cached = getCachedPortalAccess()
    return cached ?? {
      mode: 'loading',
      readOnly: true,
      districtName: null,
      institutePrefixes: [],
      allowedTabs: [],
      message: null,
    }
  })

  const reload = useCallback(async () => {
    if (!user) {
      const unauthorized = {
        mode: 'unauthorized' as const,
        readOnly: true,
        districtName: null,
        institutePrefixes: [],
        allowedTabs: [],
        message: null,
      }
      setAccess(unauthorized)
      localStorage.removeItem(PORTAL_CACHE_KEY)
      return
    }

    try {
      const info = await Promise.race([
        fetchPortalSessionInfo(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Portal session check timeout')), 10000),
        ),
      ])
      const resolved = resolvePortalAccess(info as any)
      setAccess(resolved)
      setCachedPortalAccess(resolved)
    } catch (err) {
      console.error('Portal access check failed:', err)
      // Use cached data if available, otherwise show unauthorized
      const cached = getCachedPortalAccess()
      if (cached) {
        setAccess(cached)
      } else {
        setAccess({
          mode: 'unauthorized',
          readOnly: true,
          districtName: null,
          institutePrefixes: [],
          allowedTabs: [],
          message: `Portal access check failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        })
      }
    }
  }, [user])

  useEffect(() => {
    if (authLoading) return
    // If we have cached data, use it immediately
    const cached = getCachedPortalAccess()
    if (cached) {
      setAccess(cached)
      // If we have a user, we're done (using cache).
      // If we DON'T have a user, we should still run reload() to clear the cache/state.
      if (user) return
    }
    // Run reload() to either fetch access info or set unauthorized state if !user
    void reload()
  }, [authLoading, user, reload])

  const value = useMemo(() => access, [access])

  return (
    <PortalAccessContext.Provider value={value}>{children}</PortalAccessContext.Provider>
  )
}

export function usePortalAccess(): PortalAccess {
  const ctx = useContext(PortalAccessContext)
  if (!ctx) {
    throw new Error('usePortalAccess must be used within PortalAccessProvider')
  }
  return ctx
}

export function usePortalReadOnly(): boolean {
  return usePortalAccess().readOnly
}
