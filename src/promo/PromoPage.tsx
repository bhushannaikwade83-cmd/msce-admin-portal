import { useEffect, useState } from 'react'
import {
  guideNav,
  instituteGuideSections,
  photoDoList,
  photoDontList,
  type GuideSection,
} from './instituteGuide'
import { ScreenshotWalkthrough } from './ScreenshotWalkthrough'
import { PROMO_SITE_TITLE } from '../siteTitle'
import './index.css'
import './app-ui-theme.css'

const logo = '/images/msce_attendance_app_logo.png'
const heroScreen = '/images/app-screens/admin-home.png'
const apkUrl = '/downloads/msce-attendance.apk'

type Tilt = { x: number; y: number }

const highlights = [
  { label: 'Face + live blink', detail: 'Registration: 2 blinks · Attendance: 1 blink' },
  { label: 'GPS 15 m fence', detail: 'Attendance only inside locked zone' },
  { label: 'Entry + Exit', detail: 'Photo and time for each movement' },
]

function PhoneMock({
  image,
  alt,
  caption,
  tilt,
}: {
  image: string
  alt: string
  caption: string
  tilt: Tilt
}) {
  return (
    <div
      className="phone-shell"
      style={{ transform: `rotateX(${tilt.y * -1}deg) rotateY(${tilt.x}deg)` }}
    >
      <div className="phone-glow" />
      <div className="phone-bezel">
        <div className="phone-notch" />
        <img src={image} alt={alt} className="phone-screen" />
      </div>
      <p className="phone-caption">{caption}</p>
    </div>
  )
}

function GuideSectionBlock({ section }: { section: GuideSection }) {
  return (
    <article id={section.id} className="guide-section app-card card-3d">
      <div className="guide-section-head">
        <span className="guide-icon" aria-hidden>
          {section.icon}
        </span>
        <div>
          <h4>{section.title}</h4>
          <p className="guide-summary">{section.summary}</p>
        </div>
      </div>

      <ol className="guide-steps">
        {section.steps.map((step, i) => (
          <li key={step.title} className="guide-step">
            <span className="guide-step-num">{i + 1}</span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.body}</p>
              {step.bullets && (
                <ul>
                  {step.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ol>

      {section.tips && section.tips.length > 0 && (
        <div className="guide-callout guide-callout-tip">
          <strong>Tips</strong>
          <ul>
            {section.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      {section.warnings && section.warnings.length > 0 && (
        <div className="guide-callout guide-callout-warn">
          <strong>Important</strong>
          <ul>
            {section.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </article>
  )
}

export default function PromoPage() {
  const [tilt, setTilt] = useState<Tilt>({ x: 0, y: 0 })

  useEffect(() => {
    document.title = PROMO_SITE_TITLE
  }, [])

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      const x = (event.clientX / window.innerWidth - 0.5) * 10
      const y = (event.clientY / window.innerHeight - 0.5) * 10
      setTilt({ x, y })
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  return (
    <div className="app-ui">
      <div className="bg-3d-layer" aria-hidden>
        <div className="orb orb-one" />
        <div className="orb orb-two" />
        <div className="grid-haze" />
        <div className="mesh-3d" />
      </div>

      <header className="app-navbar">
        <div className="app-tricolor" aria-hidden />
        <div className="app-navbar-inner">
          <div className="app-navbar-brand">
            <img src={logo} alt="" className="app-navbar-logo" />
            <div className="app-navbar-titles">
              <h1>MSCE ATTENDANCE APP PORTAL | एमएससीई उपस्थिती ऐप पोर्टल</h1>
              <p>Institute guide &amp; APK download | संस्था मार्गदर्शक</p>
            </div>
            <span className="badge-official badge-official-3d">OFFICIAL</span>
          </div>
          <nav className="app-navbar-nav" aria-label="Site navigation">
            <a className="btn-3d btn-3d-ghost" href="#guide">
              Instructions
            </a>
            <a className="btn-3d btn-3d-ghost" href="#app-screens">
              Screenshots
            </a>
            <a className="btn-3d btn-3d-primary" href={apkUrl} download="MSCE-Attendance.apk">
              Download APK
            </a>
          </nav>
        </div>
      </header>

      <div className="page-shell">
      <main className="app-main">
        <section className="hero app-card card-3d">
          <div className="hero-copy">
            <p className="section-chip">For institutes & staff</p>
            <h2>How to register, set up GPS, and mark attendance with face verification</h2>
            <p className="hero-text">
              Same look and flow as the mobile app — registration, login with password and CAPTCHA,
              PIN, GPS lock, student face registration, and Entry / Exit marking.
            </p>

            <div className="hero-actions">
              <a className="btn btn-primary btn-3d btn-3d-primary" href={apkUrl} download="MSCE-Attendance.apk">
                Download APK
              </a>
              <a className="btn btn-secondary btn-3d btn-3d-outline" href="#guide">
                Read full instructions
              </a>
            </div>

            <div className="stat-row">
              {highlights.map((h) => (
                <div key={h.label} className="stat-card card-3d">
                  <strong>{h.label}</strong>
                  <span>{h.detail}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="hero-visual">
            <PhoneMock
              image={heroScreen}
              alt="MSCE Attendance admin home"
              caption="Admin dashboard — matches app UI"
              tilt={tilt}
            />
          </div>
        </section>

        <section id="guide" className="section">
          <div className="section-heading app-card section-heading-card card-3d">
            <p className="section-chip">Step-by-step</p>
            <h3>Complete institute instructions</h3>
            <p className="section-lead">
              Follow these sections in order the first time you set up a device at your institute.
            </p>
          </div>

          <nav className="guide-nav" aria-label="Instruction sections">
            {guideNav.map((item) => (
              <a key={item.id} href={`#${item.id}`} className="guide-nav-link btn-3d btn-3d-ghost btn-3d-sm">
                {item.label}
              </a>
            ))}
          </nav>

          <div className="guide-grid">
            {instituteGuideSections.map((section) => (
              <GuideSectionBlock key={section.id} section={section} />
            ))}
          </div>
        </section>

        <section id="photo-rules" className="section">
          <div className="section-heading app-card section-heading-card card-3d">
            <p className="section-chip">Camera rules</p>
            <h3>Face photo & attendance capture</h3>
            <p className="section-lead">Same rules shown on the Students screen in the app.</p>
          </div>
          <div className="photo-rules-grid">
            <div className="app-card card-3d photo-rules-card photo-rules-card-do">
              <h4>Do</h4>
              <ul className="check-list">
                {photoDoList.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="app-card card-3d photo-rules-card photo-rules-card-warn">
              <h4>Do not</h4>
              <ul className="cross-list">
                {photoDontList.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="photo-rules-note app-info-banner">
            <strong>Registration vs attendance:</strong> face registration asks for{' '}
            <strong>two blinks</strong> then a still capture. Marking Entry or Exit uses{' '}
            <strong>one blink</strong>, then the app matches the live face to the registered student
            you selected.
          </p>
        </section>

        <ScreenshotWalkthrough />

        <section className="section">
          <div className="download-card app-card card-3d">
            <div>
              <p className="section-chip">Download</p>
              <h3>Install MSCE Attendance on your institute phone</h3>
              <p>
                Download the APK, complete registration and GPS lock, register student faces, then
                start marking Entry and Exit from Student Management.
              </p>
            </div>
            <a className="btn btn-primary btn-large btn-3d btn-3d-primary" href={apkUrl} download="MSCE-Attendance.apk">
              Download APK
            </a>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <p>MSCE ATTENDANCE APP PORTAL — institute usage guide for registration, GPS, and attendance.</p>
      </footer>
      </div>

      <nav className="app-bottom-nav" aria-label="App navigation (same as mobile app)">
        <a href="#guide" className="app-nav-item">
          <span className="app-nav-icon">⌂</span>
          <span>Home</span>
        </a>
        <a href="#staff" className="app-nav-item">
          <span className="app-nav-icon">⊕</span>
          <span>Add user</span>
        </a>
        <a href="#students" className="app-nav-item app-nav-item-active">
          <span className="app-nav-icon">👥</span>
          <span>Students</span>
        </a>
        <a href="#gps" className="app-nav-item">
          <span className="app-nav-icon">📍</span>
          <span>GPS</span>
        </a>
        <a href="#app-screens" className="app-nav-item">
          <span className="app-nav-icon">📊</span>
          <span>Reports</span>
        </a>
        <a href={apkUrl} className="app-nav-item" download="MSCE-Attendance.apk">
          <span className="app-nav-icon">⬇</span>
          <span>APK</span>
        </a>
      </nav>
    </div>
  )
}
