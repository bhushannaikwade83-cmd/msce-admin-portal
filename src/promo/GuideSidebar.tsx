import type { ReactNode } from 'react'
import { guideNav } from './instituteGuide'
import { instructorTroubleshootingCards } from './instructorTroubleshooting'

const troubleshootJumpLinks = instructorTroubleshootingCards.map((c) => ({
  id: c.id,
  label:
    c.id === 'usb-debugging'
      ? 'USB / GPS spoof'
      : c.id === 'photo-edit-once'
        ? 'Photo edit'
        : 'GPS room',
}))

/** Horizontal jump links (replaces removed left sidebar). */
export function GuideJumpNav() {
  return (
    <nav className="guide-nav promo-guide-jump-nav" aria-label="Jump to section">
      {guideNav.map((item) => (
        <a key={item.id} href={`#${item.id}`} className="guide-nav-link btn-3d btn-3d-ghost btn-3d-sm">
          {item.label}
        </a>
      ))}
      {troubleshootJumpLinks.map((item) => (
        <a key={item.id} href={`#${item.id}`} className="guide-nav-link btn-3d btn-3d-ghost btn-3d-sm">
          {item.label}
        </a>
      ))}
    </nav>
  )
}

export function PromoGuideLayout({ children }: { children: ReactNode }) {
  return <div className="promo-guide-main-only">{children}</div>
}
