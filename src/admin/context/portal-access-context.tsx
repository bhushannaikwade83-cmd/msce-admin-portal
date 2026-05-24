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

const DISTRICT_TABS: DashboardTab[] = ['institutes', 'students', 'reports']

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
      allowedTabs: ALL_TABS,
      message: info.message ?? null,
    }
  }

  if (mode === 'district_viewer' || info.is_portal_district_viewer) {
    const prefixes = Array.isArray(info.institute_prefixes)
      ? info.institute_prefixes.map(String)
      : []
    return {
      mode: 'district_viewer',
      readOnly: true,
      districtName: info.district_name ?? null,
      institutePrefixes: prefixes,
      allowedTabs: DISTRICT_TABS,
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

export function PortalAccessProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [access, setAccess] = useState<PortalAccess>({
    mode: 'loading',
    readOnly: true,
    districtName: null,
    institutePrefixes: [],
    allowedTabs: [],
    message: null,
  })

  const reload = useCallback(async () => {
    if (!user) {
      setAccess({
        mode: 'unauthorized',
        readOnly: true,
        districtName: null,
        institutePrefixes: [],
        allowedTabs: [],
        message: null,
      })
      return
    }
    setAccess((prev) => ({ ...prev, mode: 'loading', message: null }))
    const info = await fetchPortalSessionInfo()
    setAccess(resolvePortalAccess(info))
  }, [user])

  useEffect(() => {
    if (authLoading) return
    void reload()
  }, [authLoading, reload])

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
