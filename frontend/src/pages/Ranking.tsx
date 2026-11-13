import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, PILLAR_LABEL, type CustomRanking, type Facets, type Filters, type Ranking as RankingData } from '../api'
import { CompareToggle, ErrorBox, Explain, Loading, ModeBadge, Pillars } from '../components/bits'
import FilterPanel, { activeCount, filtersFromParams, filtersToParams } from '../components/FilterPanel'
import { useApp, usePageContext } from '../ctx'

const FOCI = ['prevention', 'detection', 'suppression'] as const
type Result = RankingData['results'][number]

/** The score as a ring: the number is the hero, the arc is how much of 100 it reaches. */
function Ring({ score, size = 64 }: { score: number; size?: number }) {
  const r = 27
  const c = 2 * Math.PI * r
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={`Score ${score} out of 100`}>
      <svg viewBox="0 0 64 64" style={{ width: size, height: size }}>
        <circle className="track" cx="32" cy="32" r={r} fill="none" strokeWidth="5" />
        <circle className="val" cx="32" cy="32" r={r} fill="none" strokeWidth="5" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, score) / 100)} />
      </svg>
      <b>{score}</b>
    </div>
  )
}

/** Where the score comes from: one segment per factor, widths in points out of 100. */
function Contribution({ r, colors }: { r: Result; colors: Record<string, string> }) {
  // the same factor order on every row, so the bars can be compared down the list
  const order = Object.keys(colors)
  const parts = r.breakdown.filter((b) => b.points > 0).sort((a, b) => order.indexOf(a.factor) - order.indexOf(b.factor))
  return (
    <div className="contrib" role="img" aria-label={r.breakdown.map((b) => `${b.label} ${b.points} points`).join(', ')}>
      {parts.map((b) => (
        <i key={b.factor} title={`${b.label}: ${b.points} of ${b.max_points} points`} style={{ width: `${b.points}%`, background: colors[b.factor] }} />
      ))}
    </div>
  )
}

function Breakdown({ r }: { r: Result }) {
  return (
    <div className="breakdown">
      {r.breakdown.map((b) => (
        <div key={b.factor} style={{ display: 'contents' }}>
          <span>{b.label}</span>
          <div className="bar" title={`factor value ${b.value} × weight ${b.weight}`}>
            <i style={{ width: `${b.value * 100}%` }} />
          </div>
          <b className="num">
            {b.points}
            <span className="faint" style={{ fontWeight: 400 }}>/{b.max_points}</span>
          </b>
          <span className="muted why">{b.why}</span>
        </div>
      ))}
    </div>
  )
}

export default function Ranking() {
  const { meta, env, setEnv } = useApp()
  const [sp, setSp] = useSearchParams()
  const filters = useMemo(() => filtersFromParams(sp), [sp])
  const [focus, setFocus] = useState<string | null>(sp.get('focus'))
  const [weights, setWeights] = useState<Record<string, number> | null>(null) // null = habitat defaults
  const [data, setData] = useState<RankingData | null>(null)
  const [facets, setFacets] = useState<Facets | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(activeCount(filters) > 0)

  const [mode, setMode] = useState<'factors' | 'custom'>('factors')
  const [criterion, setCriterion] = useState('')
  const [custom, setCustom] = useState<CustomRanking | null>(null)
  const [customBusy, setCustomBusy] = useState(false)
  const [customError, setCustomError] = useState<string | null>(null)

  const envParam = sp.get('env')
  useEffect(() => {
    if (envParam && meta?.environments.some((e) => e.id === envParam) && envParam !== env) setEnv(envParam)
  }, [envParam, meta, env, setEnv])

  useEffect(() => {
    api.search({}).then((r) => setFacets(r.facets)).catch(() => undefined)
  }, [])

  const key = JSON.stringify([env, focus, weights, filters])
  useEffect(() => {
    let live = true
    api
      .ranking({ environment: env, focus, weights: weights ?? undefined, filters })
      .then((r) => {
        if (!live) return
        setData(r)
        setError(null)
      })
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  usePageContext(
    'Experiment Ranking',
    (mode === 'custom' && custom ? custom.results : data?.results ?? []).slice(0, 4).map((r) => r.investigation.id),
    data
      ? `Habitat: ${data.environment.name}. Safety focus: ${focus ?? 'none'}. Weights: ${JSON.stringify(data.weights)}. Top scores: ${data.results.slice(0, 5).map((r) => `${r.investigation.short} ${r.score}/100 (${r.breakdown.slice().sort((a, b) => b.points - a.points).slice(0, 2).map((b) => `${b.label} ${b.points}`).join(', ')})`).join('; ')}. Method: ${data.method}`
      : '',
  )

  // one fixed colour per factor, in the order the server lists them (never by rank)
  const colors = useMemo(() => Object.fromEntries(Object.keys(data?.factors ?? {}).map((k, i) => [k, `var(--s${(i % 8) + 1})`])), [data?.factors])

  const pickEnv = (id: string) => {
    setEnv(id)
    setWeights(null)
    const next = new URLSearchParams(sp)
    next.set('env', id)
    setSp(next, { replace: true })
  }
  const setFilters = (f: Filters) => setSp(filtersToParams(f, sp), { replace: true })

  const runCustom = async () => {
    if (criterion.trim().length < 3) return
    setCustomBusy(true)
    setCustomError(null)
    setCustom(null)
    try {
      setCustom(await api.customRanking(criterion.trim(), filters))
    } catch (e) {
      setCustomError((e as Error).message)
    } finally {
      setCustomBusy(false)
    }
  }

  const results = data?.results ?? []
  const top = results.slice(0, 3)
  const rest = results.slice(3)
  const avg = results.length ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length) : 0

  return (
    <div className="page stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h1>Experiment Ranking</h1>
        <p>
          A 0–100 relevance score for every experiment, for the habitat you choose. The project’s own method, not an
          official NASA score.
        </p>
      </div>

      <section className="stack-sm">
        <h4>Score for this habitat</h4>
        <div className="env-tabs">
          {meta?.environments.map((e) => (
            <button key={e.id} className={`env-tab ${e.id === env ? 'active' : ''}`} onClick={() => pickEnv(e.id)}>
              <b>{e.name}</b>
              <span>{e.atmosphere_label}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="between">
        <div className="seg" role="tablist">
          <button className={mode === 'factors' ? 'on' : ''} onClick={() => setMode('factors')}>
            Score by factors
          </button>
          <button className={mode === 'custom' ? 'on' : ''} onClick={() => setMode('custom')}>
            ✦ Score by your own criterion
          </button>
        </div>
        <button className={`btn sm ${showFilters ? 'on' : ''}`} onClick={() => setShowFilters((s) => !s)}>
          Filters{activeCount(filters) ? ` (${activeCount(filters)})` : ''}
        </button>
      </div>

      {showFilters && <FilterPanel filters={filters} facets={facets} onChange={setFilters} />}

      {mode === 'factors' && (
        <>
          {error && <ErrorBox message={error} />}
          {!data && !error && <Loading label="Scoring" />}
          {data && (
            <div className="rank-layout">
              <div className="stack">
                {results.length === 0 && <div className="banner warn">No experiments match the current filters.</div>}

                {top.length > 0 && (
                  <section className="podium" aria-label="Top three scores">
                    {top.map((r, i) => (
                      <article key={r.investigation.id} className={`panel ${i === 0 ? 'first' : ''}`}>
                        <span className="place">#{r.rank} for {data.environment.name}</span>
                        <div className="big">
                          {r.score}
                          <small> / 100</small>
                        </div>
                        <Contribution r={r} colors={colors} />
                        <div>
                          <h3>
                            <Link to={`/explorer/${r.investigation.id}`}>{r.investigation.short}</Link>
                          </h3>
                          <p className="small muted clamp" style={{ WebkitLineClamp: 3, marginTop: 4 }}>{r.investigation.safety_note}</p>
                        </div>
                        <span className="tiny muted">
                          Most points from:{' '}
                          {r.breakdown.slice().sort((a, b) => b.points - a.points).slice(0, 2).map((b) => `${b.label.toLowerCase()} (+${b.points})`).join(', ')}
                        </span>
                      </article>
                    ))}
                  </section>
                )}

                <div className="between small muted">
                  <span>
                    {results.length} experiments scored · average {avg} / 100
                    {focus ? ` · focus: ${PILLAR_LABEL[focus]}` : ''}
                  </span>
                  <span className="legend">
                    {Object.entries(data.factors).map(([k, f]) => (
                      <span key={k} title={f.explain}>
                        <i style={{ background: colors[k] }} />
                        {f.label}
                      </span>
                    ))}
                  </span>
                </div>

                <div className="stack-sm">
                  {[...top, ...rest].map((r) => (
                    <article key={r.investigation.id} className="panel tight">
                      <div className="rank-row">
                        <div className="stack-sm" style={{ alignItems: 'center', gap: 2 }}>
                          <Ring score={r.score} />
                          <span className={`rank-n ${r.rank <= 3 ? 'top' : ''}`}>#{r.rank}</span>
                        </div>
                        <div className="stack-sm">
                          <div className="between">
                            <h3>
                              <Link to={`/explorer/${r.investigation.id}`}>{r.investigation.short}</Link>{' '}
                              <span className="tiny faint">{r.investigation.id}</span>
                            </h3>
                            <div className="row" style={{ gap: 6 }}>
                              <CompareToggle id={r.investigation.id} />
                              <button className="btn sm" onClick={() => setOpen(open === r.investigation.id ? null : r.investigation.id)}>
                                {open === r.investigation.id ? 'Hide' : 'Why this score?'}
                              </button>
                            </div>
                          </div>
                          <Contribution r={r} colors={colors} />
                          <div className="row small" style={{ gap: 6 }}>
                            <Pillars pillars={r.investigation.pillars} />
                            {r.breakdown.slice().sort((a, b) => b.points - a.points).slice(0, 3).filter((b) => b.points > 0).map((b) => (
                              <span key={b.factor} className="pill" title={b.why}>
                                <i style={{ width: 8, height: 8, borderRadius: 2, background: colors[b.factor], display: 'inline-block' }} />
                                {b.label} +{b.points}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      {open === r.investigation.id && (
                        <>
                          <p className="small muted" style={{ marginTop: 10 }}>{r.investigation.safety_note}</p>
                          <Breakdown r={r} />
                        </>
                      )}
                    </article>
                  ))}
                </div>
              </div>

              <aside className="rank-side">
                <section className="panel stack">
                  <div className="between">
                    <h3>What should count?</h3>
                    {weights && (
                      <button className="btn sm ghost" onClick={() => setWeights(null)}>
                        Reset
                      </button>
                    )}
                  </div>
                  <div className="stack-sm">
                    <span className="tiny muted" style={{ fontWeight: 500 }}>Safety focus</span>
                    <div className="seg" style={{ alignSelf: 'flex-start' }}>
                      <button className={focus === null ? 'on' : ''} onClick={() => setFocus(null)}>All</button>
                      {FOCI.map((f) => (
                        <button key={f} className={focus === f ? 'on' : ''} onClick={() => setFocus(f)}>
                          {PILLAR_LABEL[f]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="weights">
                    {Object.entries(data.weights).map(([k, w]) => (
                      <label key={k} className="field" title={data.factors[k]?.explain}>
                        <span className="between" style={{ flexWrap: 'nowrap' }}>
                          <span className="row" style={{ gap: 7, color: 'var(--text)', flexWrap: 'nowrap' }}>
                            <i style={{ width: 9, height: 9, borderRadius: 2, background: colors[k], flex: 'none' }} />
                            {data.factors[k]?.label ?? k}
                          </span>
                          <b className="num" style={{ color: 'var(--text)' }}>{w}</b>
                        </span>
                        <input
                          type="range" min={0} max={10} step={1} value={w}
                          onChange={(e) => {
                            // build on the latest requested weights, not the last response, so two
                            // sliders moved in quick succession both count
                            const v = Number(e.target.value)
                            setWeights((prev) => ({ ...(prev ?? data.weights), [k]: v }))
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <Explain q={`Explain how the relevance score for ${data.environment.name} is calculated and what each factor means.`} label="Explain the scoring" />
                </section>
                <details className="src">
                  <summary>
                    <span className="small">How the score is calculated</span>
                    <span className="tiny faint">▾</span>
                  </summary>
                  <div className="body">
                    <div>{data.method}</div>
                    {Object.entries(data.factors).map(([k, f]) => (
                      <div key={k}>
                        <b className="tiny" style={{ color: 'var(--text)' }}>{f.label}</b>
                        <div>{f.explain}</div>
                      </div>
                    ))}
                    <div>
                      Target atmosphere for {data.environment.name}: oxygen {data.environment.oxygen[0]} to {data.environment.oxygen[1]}%,
                      pressure {data.environment.pressure[0].toFixed(2)} to {data.environment.pressure[1].toFixed(2)} atm. {data.environment.atmosphere_basis}
                      {data.environment.assumption ? ` ${data.environment.assumption}` : ''}
                    </div>
                  </div>
                </details>
              </aside>
            </div>
          )}
        </>
      )}

      {mode === 'custom' && (
        <section className="stack">
          <div className="panel stack">
            <h3>Describe what you are looking for</h3>
            <p className="small muted">The AI scores every experiment from 0 to 100 against it and explains each score.</p>
            <form
              className="row"
              style={{ flexWrap: 'nowrap' }}
              onSubmit={(e) => {
                e.preventDefault()
                void runCustom()
              }}
            >
              <input
                className="input" value={criterion} onChange={(e) => setCriterion(e.target.value)} maxLength={400}
                placeholder="Score experiments by…" aria-label="Your ranking criterion"
              />
              <button className="btn primary" disabled={customBusy || criterion.trim().length < 3}>
                ✦ Score
              </button>
            </form>
            <div className="chips">
              {['Most useful for choosing cabin fabrics for a lunar habitat', 'Best evidence on how well smoke detectors work in space'].map((c) => (
                <button key={c} className="chip" onClick={() => setCriterion(c)}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          {customBusy && <Loading label="Scoring every experiment against your criterion" />}
          {customError && (
            <div className="banner bad">
              <span>
                <b>Cannot score by this criterion. </b>
                {customError}
              </span>
            </div>
          )}
          {custom && (
            <>
              <div className="panel tight stack-sm">
                <div className="pills">
                  <ModeBadge mode={custom.mode} model={custom.model} />
                </div>
                {custom.notice && <div className="banner warn small">{custom.notice}</div>}
                <p className="small">
                  <b>How your criterion was read: </b>
                  {custom.interpretation}
                </p>
                <p className="tiny faint">{custom.method}</p>
              </div>
              <div className="stack-sm">
                {custom.results.map((r) => (
                  <article key={r.investigation.id} className="panel tight">
                    <div className="rank-row">
                      <div className="stack-sm" style={{ alignItems: 'center', gap: 2 }}>
                        <Ring score={r.score} />
                        <span className={`rank-n ${r.rank <= 3 ? 'top' : ''}`}>#{r.rank}</span>
                      </div>
                      <div className="stack-sm">
                        <div className="between">
                          <h3>
                            <Link to={`/explorer/${r.investigation.id}`}>{r.investigation.short}</Link>{' '}
                            <span className="tiny faint">{r.investigation.id}</span>
                          </h3>
                          <CompareToggle id={r.investigation.id} />
                        </div>
                        <p className="small">{r.why}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  )
}
