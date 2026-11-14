import { Link } from 'react-router-dom'
import { useApp, usePageContext } from '../ctx'
import { COMING, FEATURES, GROUPS, PATHS } from '../guide'

export default function Home() {
  const { meta, setGuideOpen, openAsk } = useApp()
  usePageContext('Start here')
  return (
    <div className="page stack">
      <section className="hero">
        <img src="/logo.png" alt="" width={56} height={56} style={{ position: 'relative', zIndex: 1, marginBottom: 18 }} />
        <h1>NASA’s fire-in-space research, organised for the people who use it</h1>
        <p>Search, chart, score and cite NASA’s combustion experiments, with an AI assistant that answers from NASA’s own sources.</p>
        <div className="row" style={{ marginTop: 28 }}>
          <Link className="btn primary lg" to="/explorer">
            Explore the experiments
          </Link>
          <button className="btn lg" onClick={() => openAsk()}>
            ✦ Ask the AI assistant
          </button>
          <button className="btn lg ghost" onClick={() => setGuideOpen(true)}>
            Guided walkthrough
          </button>
        </div>
      </section>

      <section className="grid c4">
        <div className="stat">
          <b>{meta?.combustion_investigations ?? '–'}</b>
          <span>NASA combustion investigations</span>
        </div>
        <div className="stat">
          <b>{meta ? Number(meta.runs).toLocaleString() : '–'}</b>
          <span>test rows from {meta?.run_tables ?? '–'} run tables</span>
        </div>
        <div className="stat">
          <b>{meta?.environments.length ?? '–'}</b>
          <span>crew environments</span>
        </div>
        <div className="stat">
          <b>0</b>
          <span>
            partial-gravity experiments: <Link to="/gaps">a research gap</Link>
          </span>
        </div>
      </section>

      <section className="stack">
        <div>
          <h2>Start at your level</h2>
          <p className="small muted" style={{ marginTop: 6 }}>Four guided paths, from first contact with the topic to expert use.</p>
        </div>
        <div className="grid c4">
          {[...PATHS].sort((a, b) => a.level - b.level).map((p) => (
            <div key={p.id} className="panel path">
              <div className="level" aria-label={`Level ${p.level} of 4: ${p.levelName}`}>
                <span className="meter" aria-hidden>
                  {[1, 2, 3, 4].map((i) => <i key={i} className={i <= p.level ? 'on' : ''} />)}
                </span>
                <span>Level {p.level} · <b>{p.levelName}</b></span>
              </div>
              <div>
                <h4>{p.who}</h4>
                <h3 style={{ marginTop: 6 }}>{p.title}</h3>
              </div>
              <ol>
                {p.steps.map((s) => (
                  <li key={s.text}>
                    <Link to={s.to}>{s.text}</Link>
                  </li>
                ))}
              </ol>
              <Link className="btn sm" to={p.steps[0].to} style={{ marginTop: 'auto', alignSelf: 'flex-start' }}>
                Start →
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="stack">
        <h2>Everything on the site</h2>
        {GROUPS.map((g) => (
          <div key={g.id} className="stack-sm">
            <h4>{g.label}</h4>
            <div className="grid c3">
              {FEATURES.filter((f) => f.group === g.id).map((f) => (
                <Link key={f.path} to={f.path} className="panel feature">
                  <h3>{f.name}</h3>
                  <span className="small muted">{f.what}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
        {COMING.length > 0 && <p className="small faint">Planned: {COMING.join(', ')}.</p>}
      </section>

      {meta?.data_use && meta.data_use.archive_bytes > 0 && (
        <details className="src" id="data">
          <summary>
            <span className="small">How the NASA data is used</span>
            <span className="tiny faint">▾</span>
          </summary>
          <div className="body">
            <p>
              Every PSI record and every row of NASA’s {meta.run_tables} run tables ({Number(meta.runs).toLocaleString()} tests) for
              the {meta.combustion_investigations} investigations
              {meta.data_use.documents ? `, plus ${meta.data_use.documents} NASA reports read page by page for the assistant` : ''}
              {meta.data_use.resources ? ` and the ${meta.data_use.resources} official NASA resources for the challenge` : ''}.
              The raw footage in NASA’s {(meta.data_use.archive_bytes / 2 ** 40).toFixed(1)} TB of archives is not
              downloaded. Nothing on the site is sample or generated data. <Link to="/resources">NASA resources →</Link>
            </p>
          </div>
        </details>
      )}

      <p className="tiny faint">
        Source: NASA Physical Sciences Informatics (psi.nasa.gov){meta ? `, collected ${meta.built_at.slice(0, 10)}` : ''}. A research
        aid, not a certified spacecraft safety system.
      </p>
    </div>
  )
}
