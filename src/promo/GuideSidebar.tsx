import type { ReactNode } from 'react'
import { guideNav } from './instituteGuide'
import { instructorTroubleshootingCards } from './instructorTroubleshooting'

const sidebarGroups = [
  {
    title: 'Instructions',
    items: guideNav.filter((i) =>
      ['start', 'register-login', 'pin', 'gps', 'home', 'students', 'attendance', 'staff'].includes(i.id),
    ),
  },
  {
    title: 'Help & media',
    items: [
      ...guideNav.filter((i) => ['troubleshooting', 'video-tutorial', 'app-screens'].includes(i.id)),
      ...instructorTroubleshootingCards.map((c) => ({
        id: c.id,
        label:
          c.id === 'usb-debugging'
            ? 'USB / GPS spoof'
            : c.id === 'photo-edit-once'
              ? 'Photo edit'
              : 'GPS room',
      })),
    ],
  },
] as const

export function GuideSidebar() {
  return (
    <aside className="promo-guide-sidebar" aria-label="Page sections">
      {sidebarGroups.map((group) => (
        <div key={group.title} className="promo-guide-sidebar-group">
          <p className="promo-guide-sidebar-group-label">{group.title}</p>
          <ul className="promo-guide-sidebar-list">
            {group.items.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`} className="promo-guide-sidebar-link">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <a className="btn btn-primary btn-3d btn-3d-primary promo-guide-sidebar-apk" href="/downloads/msce-attendance.apk" download="MSCE-Attendance.apk">
        Download APK
      </a>
    </aside>
  )
}

export function PromoGuideLayout({ children }: { children: ReactNode }) {
  return (
    <div className="promo-guide-layout">
      <GuideSidebar />
      <div className="promo-guide-main">{children}</div>
    </div>
  )
}
