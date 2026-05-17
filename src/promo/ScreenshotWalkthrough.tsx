import { appScreenshots } from './appScreenshots'

export function ScreenshotWalkthrough() {
  return (
    <section id="app-screens" className="section">
      <div className="section-heading">
        <p className="eyebrow">Visual guide</p>
        <h3>App screens with step-by-step labels</h3>
        <p className="section-lead">
          Screenshots from the real MSCE Attendance app. Numbers match the callouts beside each image.
        </p>
      </div>

      <div className="screenshot-list">
        {appScreenshots.map((screen) => (
          <article key={screen.id} className="screenshot-card app-card card-3d">
            <div className="screenshot-card-head">
              <h4>{screen.title}</h4>
              <p>{screen.subtitle}</p>
              {screen.relatedSection && (
                <a href={`#${screen.relatedSection}`} className="screenshot-back-link">
                  ↑ Jump to written steps
                </a>
              )}
            </div>

            <div className="screenshot-layout">
              <div className="screenshot-frame">
                <img src={screen.image} alt={screen.title} loading="lazy" />
              </div>

              <ol className="screenshot-callouts">
                {screen.callouts.map((c) => (
                  <li key={c.marker}>
                    <span className="callout-marker">{c.marker}</span>
                    <div>
                      <strong>{c.title}</strong>
                      <p>{c.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
