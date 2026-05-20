import { useLayoutEffect, type RefObject } from 'react'

const TRICOLOR_PX = 4

/** Sync measured header + nav heights so fixed chrome and content padding fit every screen. */
export function syncDashChrome(header: HTMLElement, nav: HTMLElement): void {
  const root = document.documentElement
  const headerH = header.getBoundingClientRect().height
  const navH = nav.getBoundingClientRect().height
  root.style.setProperty('--dash-header-h', `${headerH}px`)
  root.style.setProperty('--dash-topnav-h', `${navH}px`)
  root.style.setProperty('--dash-chrome-top', `${TRICOLOR_PX + headerH + navH}px`)
}

export function clearDashChromeVars(): void {
  const root = document.documentElement
  root.style.removeProperty('--dash-header-h')
  root.style.removeProperty('--dash-topnav-h')
  root.style.removeProperty('--dash-chrome-top')
}

export function useDashChromeSync(
  headerRef: RefObject<HTMLElement | null>,
  navRef: RefObject<HTMLElement | null>,
): void {
  useLayoutEffect(() => {
    const header = headerRef.current
    const nav = navRef.current
    if (!header || !nav) return

    const sync = () => syncDashChrome(header, nav)
    sync()

    const observer = new ResizeObserver(sync)
    observer.observe(header)
    observer.observe(nav)

    window.addEventListener('resize', sync)
    window.addEventListener('orientationchange', sync)
    window.visualViewport?.addEventListener('resize', sync)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', sync)
      window.removeEventListener('orientationchange', sync)
      window.visualViewport?.removeEventListener('resize', sync)
      clearDashChromeVars()
    }
  }, [headerRef, navRef])
}
