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
          institutes, approve pending admin registrations, add new institution records, and
          review storage assets — all connected to the same Supabase project as the mobile
          application.
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
            Browse all registered institutes. Approve inactive institutions and view their
            district, city, and pincode details.
          </p>
        </div>

        <div className="overview-tile card-elevated">
          <div className="overview-tile-icon" aria-hidden>✅</div>
          <h3>Pending Approvals</h3>
          <p>
            Activate institute admin accounts that have registered through the mobile app
            with <code>pending</code> status.
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

        <div className="overview-tile card-elevated">
          <div className="overview-tile-icon" aria-hidden>🛡️</div>
          <h3>Secure Session</h3>
          <p>
            Sessions are persisted via Supabase Auth with auto-refresh. Sign out
            from the sidebar footer when your work is complete.
          </p>
        </div>
      </div>
    </div>
  )
}
