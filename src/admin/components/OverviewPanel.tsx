export function OverviewPanel() {
  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="overview">
      {/* ── Notice Bar ── */}
      <div className="overview-notice">
        <span>📢</span>
        <span>
          <strong>Official Use Only.</strong> This portal is intended for authorised MSCE
          staff and platform operators. All actions are logged and auditable.
        </span>
      </div>

      {/* ── Hero Banner ── */}
      <div className="overview-hero">
        <div className="overview-hero-top">
          <div className="overview-emblem" aria-hidden>🏛️</div>
          <div>
            <h2 className="overview-title">MSCE Admin Portal</h2>
            <div className="overview-auth-line">
              Maharashtra State Council of Examinations · Operations Console
            </div>
          </div>
        </div>
        <p className="overview-text">
          Welcome to the MSCE Administration Portal. Use the left navigation to manage
          institutes, track outstanding admin invites from the mobile app, add new institution
          records, and review storage assets — all connected to the same Supabase project as the
          mobile application.
        </p>
        <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)', marginTop: '0.75rem' }}>
          📅 {today}
        </p>
      </div>

      {/* ── Quick Action Tiles ── */}
      <div className="overview-grid">
        <div className="overview-tile card-elevated">
          <div className="overview-tile-icon" aria-hidden>🏫</div>
          <h3>Institute Directory</h3>
          <p>
            Browse all registered institutes, activate or review institution records, and view
            district, city, and pincode details.
          </p>
        </div>

        <div className="overview-tile card-elevated">
          <div className="overview-tile-icon" aria-hidden>✉️</div>
          <h3>Outstanding admin invites</h3>
          <p>
            Under <strong>Admins & Access</strong>, see which institutes still have an{' '}
            <code>admin_invites</code> row not yet claimed in the app — invited name, email,
            and phone — until the institute admin finishes password setup.
          </p>
        </div>

        <div className="overview-tile card-elevated">
          <div className="overview-tile-icon" aria-hidden>🔐</div>
          <h3>Admins & Access</h3>
          <p>
            Review each institute admin and onboarding state (invite claimed or waiting),
            adjust access status, or disable sign-in without exposing passwords.
          </p>
        </div>

        <div className="overview-tile card-elevated">
          <div className="overview-tile-icon" aria-hidden>➕</div>
          <h3>Add Institute</h3>
          <p>
            Register a new institution with auto-filled district and taluka data from the
            Maharashtra pincode directory.
          </p>
        </div>

        <div className="overview-tile card-elevated">
          <div className="overview-tile-icon" aria-hidden>📦</div>
          <h3>Storage</h3>
          <p>
            Inspect and manage files uploaded to Supabase storage buckets by institutes
            and administrators.
          </p>
        </div>

        <div className="overview-tile card-elevated">
          <div className="overview-tile-icon" aria-hidden>👨‍🎓</div>
          <h3>Students & Attendance</h3>
          <p>
            Search institutes, browse enrolled students, open subject folders and
            view daily in/out attendance photos — same view as the mobile app.
          </p>
        </div>

        <div className="overview-tile card-elevated">
          <div className="overview-tile-icon" aria-hidden>🔒</div>
          <h3>Row-Level Security</h3>
          <p>
            All queries respect Supabase RLS policies — only authorised roles
            (coder / super_admin) can perform write operations.
          </p>
        </div>

      </div>
    </div>
  )
}
