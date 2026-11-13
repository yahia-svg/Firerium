import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, missionPdfUrl, PILLAR_LABEL, type CoverStatus, type MissionReport } from '../api'
import { Cited, ErrorBox, Explain, Loading, ModeBadge, Pillars } from '../components/bits'
import { useApp, usePageContext } from '../ctx'

const FOCI = ['prevention', 'detection', 'suppression'] as const
const STATUS_WORD: Record<CoverStatus, string> = {
  none: 'Not represented', thin: 'Little data', covered: 'Represented', unreported: 'Not reported',
}
const TOC = [
  ['m-env', '1. Environment'], ['m-brief', '2. Briefing'], ['m-rank', '3. Experiments'], ['m-insights', '4. Insights'],
  ['m-gaps', '5. Gaps'], ['m-model', '6. Model estimate'], ['m-refs', 'References'],
] as const

export default function Mission() {
  const { meta, env, setEnv } = useApp()
  const [sp, setSp] = useSearchParams()
  const [focus, setFocus] = useState<string | null>(FOCI.find((f) => f === sp.get('focus')) ?? null)
  const [top, setTop] = useState(6)
  const [data, setData] = useState<MissionReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const envParam = sp.get('env')
  useEffect(() => {
    if (envParam && meta?.environments.some((e) => e.id === envParam) && envParam !== env) setEnv(envParam)
  }, [envParam, meta, env, setEnv])

  useEffect(() => {
    let live = true
    setBusy(true)
    api
      .mission(env, focus, top)
      .then((r) => {
        if (!live) return
        setData(r)
        setError(null)
      })
      .catch((e: Error) => live && setError(e.message))
      .finally(() => live && setBusy(false))
    return () => {
      live = false
    }
  }, [env, focus, top])

  usePageContext(
    'Mission Report',
    data ? data.ranking.results.slice(0, 4).map((r) => r.id) : [],
    data
      ? `Mission report for ${data.environment.name} (${data.environment.atmosphere_label}; ${data.environment.g_label}). Safety focus: ${data.focus ?? 'none'}. Top experiments: ${data.ranking.results.map((r) => `${r.short} ${r.score}`).join(', ')}. Gaps: ${data.gaps.headlines.map((h) => h.title).join('; ')}.`
      : '',
  )

  const pickEnv = (id: string) => {
    setEnv(id)
    const next = new URLSearchParams(sp)
    next.set('env', id)
    setSp(next, { replace: true })
  }
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="page stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h1>Mission Report</h1>
        <p>
          A fire-safety report for one crew environment, with references, as a PDF.
        </p>
      </div>

      <section className="stack-sm">
        <h4>1 · Choose the crew environment</h4>
        <div className="env-tabs">
          {meta?.environments.map((e) => (
            <button key={e.id} className={`env-tab ${e.id === env ? 'active' : ''}`} onClick={() => pickEnv(e.id)}>
              <b>{e.name}</b>
              <span>{e.atmosphere_label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel tight between">
        <div className="row">
          <h4>2 · Options</h4>
          <span className="small muted">Safety focus:</span>
          <button className={`btn sm ${focus === null ? 'on' : ''}`} onClick={() => setFocus(null)}>
            All areas
          </button>
          {FOCI.map((f) => (
            <button key={f} className={`btn sm ${focus === f ? 'on' : ''}`} onClick={() => setFocus(f)}>
              {PILLAR_LABEL[f]}
            </button>
          ))}
          <label className="row small muted" style={{ gap: 6 }}>
            Experiments listed
            <select className="select" style={{ width: 74 }} value={top} onChange={(e) => setTop(Number(e.target.value))}>
              {[4, 6, 8, 10].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>
        <a className="btn primary" href={missionPdfUrl(env, focus, top)} download>
          Download PDF with references
        </a>
      </section>

      {error && <ErrorBox message={error} />}
      {!data && !error && <Loading label="Building the report" />}
      {data && (
        <div className="report stack" style={{ opacity: busy ? 0.55 : 1 }}>
          <header className="stack-sm">
            <span className="tiny faint">
              PREVIEW · generated {data.generated} from {data.data.investigations} NASA PSI investigations (data collected {String(data.data.built_at).slice(0, 10)})
            </span>
            <h2 style={{ fontSize: '1.5rem' }}>{data.title}</h2>
            <div className="limits small">{data.disclaimer}</div>
            <nav className="row">
              {TOC.map(([id, label]) => (
                <button key={id} className="btn sm ghost" onClick={() => jump(id)}>
                  {label}
                </button>
              ))}
            </nav>
          </header>

          <section id="m-env" className="stack-sm rsec">
            <h3>1. The environment</h3>
            <dl className="kv">
              <dt>Cabin atmosphere</dt>
              <dd>{data.environment.atmosphere_label}</dd>
              <dt>Gravity</dt>
              <dd>{data.environment.g_label}</dd>
              <dt>Basis</dt>
              <dd>{data.environment.atmosphere_basis}</dd>
              {data.environment.assumption && (
                <>
                  <dt>Assumption</dt>
                  <dd style={{ color: 'var(--warn)' }}>{data.environment.assumption}</dd>
                </>
              )}
            </dl>
          </section>

          <section id="m-brief" className="stack-sm rsec">
            <div className="between">
              <h3>2. Fire-safety briefing</h3>
              <ModeBadge mode={data.briefing.mode} model={data.briefing.model} />
            </div>
            <div className="grid c3">
              {([
                ['What fire safety here requires', data.briefing.safety_needs],
                ['What the collected research tells us', data.briefing.insights],
                ['Research gaps', data.briefing.gaps],
              ] as const).map(([head, items]) => (
                <div key={head} className="stack-sm">
                  <h4>{head}</h4>
                  <ul className="dots small">
                    {items.map((t) => (
                      <li key={t}>
                        <Cited text={t} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section id="m-rank" className="stack-sm rsec">
            <div className="between">
              <h3>3. Most relevant experiments</h3>
              <Link className="small" to={`/ranking?env=${env}${focus ? `&focus=${focus}` : ''}`}>
                Change the weights in Experiment Ranking →
              </Link>
            </div>
            <p className="tiny muted">
              The project’s own 0–100 relevance score, not a NASA score{data.focus ? `; safety focus: ${data.focus}` : ''}.
            </p>
            {data.ranking.results.map((r) => (
              <div key={r.id} className="rrow">
                <div className={`rank-n ${r.rank <= 3 ? 'top' : ''}`}>{r.rank}</div>
                <div className="stack-sm">
                  <div className="between">
                    <b>
                      <Link to={`/explorer/${r.id}`}>{r.short}</Link> <span className="tiny faint">{r.id}</span>
                    </b>
                    <span className="row">
                      <Pillars pillars={r.pillars} />
                      <b className="num">{r.score}</b>
                      <span className="tiny faint">/ 100</span>
                    </span>
                  </div>
                  <p className="small">{r.summary}</p>
                  <p className="tiny muted">
                    O₂ {r.oxygen} · pressure {r.pressure} · airflow {r.airflow} · {r.gravity}
                    {' · '}Most points: {r.reasons.slice().sort((a, b) => b.points - a.points).slice(0, 2).map((w) => `${w.label.toLowerCase()} +${w.points}`).join(', ')}
                  </p>
                </div>
              </div>
            ))}
          </section>

          <section id="m-insights" className="stack-sm rsec">
            <div className="between">
              <h3>4. Fire-safety insights</h3>
              <Link className="small" to="/insights">Full insights with all NASA quotes →</Link>
            </div>
            {data.sections.map((s) => (
              <details key={s.id} className="src" open={s.id === (data.focus ?? 'prevention')}>
                <summary>
                  <span className={`pill ${s.id}`}>{s.title}</span>
                  <span className="small muted">{s.meaning}</span>
                </summary>
                <div className="body" style={{ fontSize: '0.88rem' }}>
                  {s.points.map((p) => (
                    <div key={p.title} className="stack-sm">
                      <div>
                        <b style={{ color: 'var(--text)' }}>{p.title}.</b> {p.text}{' '}
                        <Cited text={p.sources.map((i) => `[${i}]`).join(' ')} />
                      </div>
                      {p.limits && <div className="tiny muted">Limits: {p.limits}</div>}
                    </div>
                  ))}
                </div>
              </details>
            ))}
            {data.lessons && data.lessons.length > 0 && (
              <details className="src">
                <summary>
                  <span className="pill warn">Lessons from past accidents</span>
                  <span className="small muted">Apollo 1, Apollo 13 and Mir</span>
                </summary>
                <div className="body" style={{ fontSize: '0.88rem' }}>
                  {data.lessons.map((p) => (
                    <div key={p.title}>
                      <b style={{ color: 'var(--text)' }}>{p.title}</b> ({p.when}). {p.text}{' '}
                      <Cited text={p.sources.map((i) => `[${i}]`).join(' ')} />
                    </div>
                  ))}
                </div>
              </details>
            )}
          </section>

          <section id="m-gaps" className="stack-sm rsec">
            <div className="between">
              <h3>5. Research gaps for this environment</h3>
              <Link className="small" to={`/gaps?env=${env}`}>Explore the gaps →</Link>
            </div>
            {data.gaps.habitat.rows.map((r) => (
              <div key={r.label} className="fit-row">
                <span className={`dot ${r.status}`} title={STATUS_WORD[r.status]} />
                <span className="grow small">
                  <b>{r.label}</b>
                  {r.count === 0 ? (
                    <span className="cov-none"> · Not represented in this project collection</span>
                  ) : (
                    <span className="muted"> · {r.ids.map((i) => i.short).join(', ')}</span>
                  )}
                </span>
                <b className="num">{r.count}</b>
              </div>
            ))}
            <ul className="dots small" style={{ marginTop: 6 }}>
              {data.gaps.headlines.map((h) => (
                <li key={h.id}>
                  <b>{h.title}.</b> <Cited text={h.text} />
                </li>
              ))}
            </ul>
            <h4 style={{ marginTop: 6 }}>Questions for future experiments (project team’s)</h4>
            <ol className="dots small" style={{ paddingLeft: 20 }}>
              {data.gaps.questions.map((q) => (
                <li key={q.because}>{q.question}</li>
              ))}
            </ol>
          </section>

          <section id="m-model" className="stack-sm rsec">
            <div className="between">
              <h3>6. Model estimate</h3>
              <Link className="small" to="/whatif">Try your own scenario in What-If →</Link>
            </div>
            {data.model ? (
              <>
                <span className="pill ai" style={{ alignSelf: 'flex-start' }}>✦ {data.model.label}</span>
                <div className="scroll-x">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Fuel droplet</th>
                        <th>Atmosphere</th>
                        <th>Estimated burning rate</th>
                        <th>80% band</th>
                        <th>Same droplet in air, 1 atm</th>
                        <th>Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.model.rows.map((r) => (
                        <tr key={`${r.fuel}-${r.oxygen}`}>
                          <td>{r.fuel}</td>
                          <td>{r.oxygen}% O2, {r.pressure} atm</td>
                          <td className="num">
                            <b>{r.estimate.value.toFixed(2)}</b> {r.estimate.unit}
                            {r.support === 'weak' && <div className="tiny" style={{ color: 'var(--warn)' }}>weakly supported</div>}
                          </td>
                          <td className="num">{r.estimate.low.toFixed(2)} to {r.estimate.high.toFixed(2)}</td>
                          <td className="num">{r.air.value.toFixed(2)}</td>
                          <td className="num">{r.change_pct > 0 ? '+' : ''}{r.change_pct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {data.model.skipped.map((s) => (
                  <div key={s} className="tiny muted">No estimate: {s}</div>
                ))}
                <p className="small muted">{data.model.note}</p>
                <span className="tiny faint">
                  Model {data.model.version}, trained on the <Link to={`/explorer/${data.model.table.investigation.id}`}>{data.model.table.investigation.short}</Link> run table.
                </span>
              </>
            ) : (
              <p className="small muted">
                No model estimate is given for this environment: its atmosphere lies outside the data the model was trained
                on, or no model is available.
              </p>
            )}
          </section>

          <section id="m-refs" className="stack-sm rsec">
            <div className="between">
              <h3>References ({data.references.length})</h3>
              <Explain q={`Which of the sources in the ${data.environment.name} mission report matter most, and why?`} label="Ask about these sources" />
            </div>
            <ol className="refs small">
              {data.references.map((r) => (
                <li key={r.id}>
                  <b>[{r.id}]</b> {r.text}{' '}
                  {r.url && r.id.startsWith('RES-') && (
                    <>
                      <Link to={`/resources#${r.id}`}>About this resource</Link>
                      {' · '}
                      <a href={r.url} target="_blank" rel="noreferrer">NASA ↗</a>
                    </>
                  )}
                  {r.url && !r.id.startsWith('RES-') && (
                    <>
                      <Link to={`/explorer/${r.id}`}>Profile</Link>
                      {' · '}
                      <a href={r.url} target="_blank" rel="noreferrer">NASA PSI ↗</a>
                    </>
                  )}
                  {r.doi && (
                    <>
                      {' · '}
                      <a href={r.doi} target="_blank" rel="noreferrer">DOI ↗</a>
                    </>
                  )}
                </li>
              ))}
            </ol>
          </section>

          <a className="btn primary" href={missionPdfUrl(env, focus, top)} download style={{ alignSelf: 'flex-start' }}>
            Download this report as a PDF
          </a>
        </div>
      )}
    </div>
  )
}
