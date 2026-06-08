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
  'integrity',
  'reports',
]

const DISTRICT_TABS: DashboardTab[] = ['institutes', 'instructors', 'students', 'reports']

const VALID_TABS = new Set<DashboardTab>(ALL_TABS)

function parseAllowedTabs(
  raw: string[] | null | undefined,
  fallback: DashboardTab[],
): DashboardTab[] {
  if (!Array.isArray(raw) || raw.length === 0) return fallback
  const parsed = raw.filter((t): t is DashboardTab => VALID_TABS.has(t as DashboardTab))
  return parsed.length > 0 ? parsed : fallback
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

function getCachedPortalAccess(): PortalAccess | null {
  try {
    const cached = localStorage.getItem(PORTAL_CACHE_KEY)
    return cached ? JSON.parse(cached) : null
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

    const info = await fetchPortalSessionInfo()
    const resolved = resolvePortalAccess(info)
    setAccess(resolved)
    setCachedPortalAccess(resolved)
  }, [user])

  useEffect(() => {
    if (authLoading) return
    // Only reload if user exists and we don't have valid cached data
    if (user && access.mode !== 'super_admin' && access.mode !== 'district_viewer') {
      void reload()
    }
  }, [authLoading, user])

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
