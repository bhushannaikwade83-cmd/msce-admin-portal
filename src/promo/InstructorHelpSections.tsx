import { useEffect, useState } from 'react'
import {
  instructorTroubleshootingCards,
  STUDENT_REG_ATTENDANCE_VIDEO_URL,
  type TroubleshootingCard,
} from './instructorTroubleshooting'

function TroubleshootingCardBlock({ card }: { card: TroubleshootingCard }) {
  const [lang, setLang] = useState<'en' | 'mr'>('en')
  const steps = lang === 'mr' ? card.stepsMr : card.stepsEn
  const tips = lang === 'mr' ? card.tipsMr : card.tipsEn

  return (
    <article id={card.id} className="guide-section app-card card-3d troubleshoot-card">
      <div className="guide-section-head">
        <span className="guide-icon" aria-hidden>
          {card.icon}
        </span>
        <div>
          <h4>{lang === 'mr' ? card.titleMr : card.titleEn}</h4>
          <p className="guide-summary">{lang === 'mr' ? card.summaryMr : card.summaryEn}</p>
          <div className="troubleshoot-lang-toggle" role="group" aria-label="Language">
            <button
              type="button"
              className={`btn-3d btn-3d-sm ${lang === 'en' ? 'btn-3d-primary' : 'btn-3d-ghost'}`}
              onClick={() => setLang('en')}
            >
              English
            </button>
            <button
              type="button"
              className={`btn-3d btn-3d-sm ${lang === 'mr' ? 'btn-3d-primary' : 'btn-3d-ghost'}`}
              onClick={() => setLang('mr')}
            >
              मराठी
            </button>
            {card.relatedGuideId ? (
              <a href={`#${card.relatedGuideId}`} className="troubleshoot-related-link">
                ↑ Main guide steps
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <div className="troubleshoot-infographic-wrap">
        <img
          src={card.image}
          alt={card.imageAlt}
          className="troubleshoot-infographic"
          loading="lazy"
        />
      </div>

      <ol className="guide-steps">
        {steps.map((text, i) => (
          <li key={i} className="guide-step">
            <span className="guide-step-num">{i + 1}</span>
            <div>
              <p style={{ margin: 0 }}>{text}</p>
            </div>
          </li>
        ))}
      </ol>

      {tips && tips.length > 0 ? (
        <div className="guide-callout guide-callout-tip">
          <strong>{lang === 'mr' ? 'टीप' : 'Tip'}</strong>
          <ul>
            {tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  )
}

export function InstructorTroubleshootingSection() {
  return (
    <section id="troubleshooting" className="section">
      <div className="section-heading app-card section-heading-card card-3d">
        <p className="section-chip">Help for instructors</p>
        <h3>Common app errors &amp; how to fix them</h3>
        <p className="section-lead">
          Share this section with institute admins and instructors when they see USB debugging blocks, wrong
          student photos, or GPS setup questions. Each card matches the official MSCE posters — English and
          मराठी steps.
        </p>
      </div>

      <div className="guide-grid">
        {instructorTroubleshootingCards.map((card) => (
          <TroubleshootingCardBlock key={card.id} card={card} />
        ))}
      </div>
    </section>
  )
}

export function StudentRegAttendanceVideoSection() {
  const [videoOk, setVideoOk] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(STUDENT_REG_ATTENDANCE_VIDEO_URL, { method: 'HEAD' })
      .then((r) => {
        if (!cancelled) setVideoOk(r.ok)
      })
      .catch(() => {
        if (!cancelled) setVideoOk(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section id="video-tutorial" className="section">
      <div className="section-heading app-card section-heading-card card-3d">
        <p className="section-chip">Video tutorial</p>
        <h3>Student registration &amp; attendance marking</h3>
        <p className="section-lead section-lead-mr">
          विद्यार्थी नोंदणी आणि Entry / Exit उपस्थिती कशी मार्क करावी — पूर्ण व्हिडिओ मार्गदर्शक.
        </p>
        <p className="section-lead">
          Full walkthrough: register a student face, then mark Entry and Exit with live camera and GPS rules.
        </p>
      </div>

      <div className="guide-video-layout app-card card-3d">
        <div className="guide-video-stage">
          {videoOk === true ? (
            <video
              className="guide-video-player"
              controls
              playsInline
              preload="metadata"
            >
              <source src={STUDENT_REG_ATTENDANCE_VIDEO_URL} type="video/mp4" />
              Your browser does not support video playback.
            </video>
          ) : videoOk === false ? (
            <div className="guide-video-placeholder">
              <p className="guide-video-placeholder-title">Video coming soon</p>
              <p className="muted small">
                Upload <code>public/videos/student-registration-attendance.mp4</code>
              </p>
            </div>
          ) : (
            <p className="muted small guide-video-loading">Checking for video…</p>
          )}
        </div>

        <aside className="guide-video-side">
          <p className="guide-video-side-title">Steps in this video</p>
          <ul className="guide-video-checklist">
            <li>Install latest APK from this page</li>
            <li>Login → PIN → GPS lock at room centre (15 m)</li>
            <li>Add student → face registration (2 blinks)</li>
            <li>Mark Entry / Exit (1 blink, correct student selected)</li>
            <li>Stay inside GPS zone; turn off USB debugging if blocked</li>
          </ul>
          <p className="muted small">
            Related: <a href="#students">Register students</a> · <a href="#attendance">Mark attendance</a> ·{' '}
            <a href="#troubleshooting">Error help</a>
          </p>
        </aside>
      </div>
    </section>
  )
}
