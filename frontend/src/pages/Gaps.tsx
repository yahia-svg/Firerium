import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, type CoverStatus, type Facets, type Filters, type GapDimension, type Gaps as GapsData, type IdShort } from '../api'
import { Cited, ErrorBox, Explain, Loading, Quote } from '../components/bits'
import FilterPanel, { activeCount, filtersFromParams, filtersToParams } from '../components/FilterPanel'
import { useApp, usePageContext } from '../ctx'

const STATUS_WORD: Record<CoverStatus, string> = {
  none: 'Not represented', thin: 'Little data', covered: 'Represented', unreported: 'Not reported',
}
const KIND_PILL: Record<string, string> = { none: 'bad', thin: 'warn', unreported: 'warn' }

function Chips({ ids }: { ids: IdShort[] }) {
  return (
    <span className="pills">
      {ids.map((i) => (
        <Link key={i.id} className="cite" to={`/explorer/${i.id}`}>
          {i.short}
        </Link>
      ))}
    </span>
  )
}

function Dimension({ d, noneLabel }: { d: GapDimension; noneLabel: string }) {
  const [open, setOpen] = useState<string | null>(null)
  const max = Math.max(1, ...d.cells.map((c) => c.count))
  return (
    <article className="panel tight stack-sm">
      <div>
        <h3>{d.title}</h3>
        <p className="tiny muted">{d.explain}</p>
      </div>
      {d.cells.length === 0 && <span className="small nr">Nothing in the selected experiments.</span>}
      {d.cells.map((c) => (
        <div key={c.label}>
          <button
            className={`cov ${c.status}`} onClick={() => setOpen(open === c.label ? null : c.label)}
            title={c.hint ?? (c.count ? 'Show the experiments' : noneLabel)} aria-expanded={open === c.label}
          >
            <span className="cov-label">{c.label}</span>
            <span className="cov-bar">
              <i style={{ width: `${(c.count / max) * 100}%` }} />
            </span>
            <span className="cov-n num">{c.count}</span>
          </button>
          {c.count === 0 && <div className="tiny cov-none">{noneLabel}</div>}
          {open === c.label && c.count > 0 && (
            <div className="cov-open stack-sm">
              {c.hint && <span className="tiny muted">{c.hint}</span>}
              <Chips ids={c.ids} />
              {c.runs !== undefined && (
                <span className="tiny muted">
                  {c.runs > 0
                    ? `${c.runs.toLocaleString()} test rows in this band.`
                    : 'Range from the PSI record text; no test rows.'}
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </article>
  )
}

function Matrix({ data }: { data: GapsData }) {
  const dims = data.dimensions.filter((d) => d.fixed)
  const [rowId, setRowId] = useState('fuel')
  const [colId, setColId] = useState('oxygen')
  const [picked, setPicked] = useState<{ r: string; c: string } | null>(null)
  const row = dims.find((d) => d.id === rowId) ?? dims[0]
  const col = dims.find((d) => d.id === colId) ?? dims[1]
  const members = (r: string, c: string) =>
    data.items.filter((it) => it.dims[row.id].includes(r) && it.dims[col.id].includes(c))
  const sel = picked ? members(picked.r, picked.c) : []
  return (
    <article className="panel stack">
      <div className="between">
        <div>
          <h3>Coverage map: two conditions at once</h3>
          <p className="small muted">
            Experiments in both groups. Click a cell to see them.
          </p>
        </div>
        <Explain q={`In the research-gap coverage map of ${row.title} against ${col.title}, which combinations have no NASA PSI experiments and why does that matter for fire safety?`} label="Explain this map" />
      </div>
      <div className="row">
        <label className="field" style={{ minWidth: 190 }}>
          Rows
          <select className="select" value={row.id} onChange={(e) => { setRowId(e.target.value); setPicked(null) }}>
            {dims.filter((d) => d.id !== col.id).map((d) => (
              <option key={d.id} value={d.id}>{d.title}</option>
            ))}
          </select>
        </label>
        <label className="field" style={{ minWidth: 190 }}>
          Columns
          <select className="select" value={col.id} onChange={(e) => { setColId(e.target.value); setPicked(null) }}>
            {dims.filter((d) => d.id !== row.id).map((d) => (
              <option key={d.id} value={d.id}>{d.title}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="scroll-x">
        <table className="matrix">
          <thead>
            <tr>
              <th />
              {col.cells.map((c) => (
                <th key={c.label}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {row.cells.map((r) => (
              <tr key={r.label}>
                <th>{r.label}</th>
                {col.cells.map((c) => {
                  const n = members(r.label, c.label).length
                  const unknown = c.status === 'unreported' || r.status === 'unreported'
                  const cls = unknown ? 'unreported' : n === 0 ? 'none' : n <= 2 ? 'thin' : 'covered'
                  const on = picked?.r === r.label && picked?.c === c.label
                  return (
                    <td key={c.label}>
                      <button
                        className={`mcell ${cls} ${on ? 'on' : ''}`} disabled={n === 0}
                        onClick={() => setPicked(on ? null : { r: r.label, c: c.label })}
                        title={n === 0 ? data.none_label : `${n} experiment${n === 1 ? '' : 's'}`}
                      >
                        {n === 0 ? '–' : n}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Legend legend={data.legend} />
      {picked && (
        <div className="panel tight stack-sm" style={{ background: 'var(--paper)' }}>
          <b className="small">
            {picked.r} × {picked.c}
          </b>
          <Chips ids={sel} />
        </div>
      )}
    </article>
  )
}

function Legend({ legend }: { legend: GapsData['legend'] }) {
  return (
    <div className="row tiny muted">
      {(['none', 'thin', 'covered', 'unreported'] as CoverStatus[]).map((s) => (
        <span key={s} className="row" style={{ gap: 6 }}>
          <span className={`dot ${s}`} /> {legend[s]}
        </span>
      ))}
    </div>
  )
}

export default function Gaps() {
  const { meta, env, setEnv } = useApp()
  const [sp, setSp] = useSearchParams()
  const filters = useMemo(() => filtersFromParams(sp), [sp])
  const [data, setData] = useState<GapsData | null>(null)
  const [facets, setFacets] = useState<Facets | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(activeCount(filters) > 0)

  const envParam = sp.get('env')
  useEffect(() => {
    if (envParam && meta?.environments.some((e) => e.id === envParam) && envParam !== env) setEnv(envParam)
  }, [envParam, meta, env, setEnv])
  useEffect(() => {
    api.search({}).then((r) => setFacets(r.facets)).catch(() => undefined)
  }, [])

  const key = JSON.stringify([filters, env])
  useEffect(() => {
    let live = true
    api
      .gaps(filters, env)
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
    'Research Gaps',
    data ? [...new Set(data.headlines.flatMap((h) => h.ids))].slice(0, 4) : [],
    data
      ? `Based on ${data.basis.selected} of ${data.basis.total} investigations (filters: ${data.basis.filters.join('; ') || 'none'}). Gaps found: ${data.headlines.map((h) => h.title).join('; ')}. ${data.disclaimer}`
      : '',
  )

  const setFilters = (f: Filters) => setSp(filtersToParams(f, sp), { replace: true })
  const pickEnv = (id: string) => {
    setEnv(id)
    const next = new URLSearchParams(sp)
    next.set('env', id)
    setSp(next, { replace: true })
  }

  return (
    <div className="page stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h1>Research Gaps</h1>
        <p>
          What NASA’s combustion experiments have covered, and what they have not.
        </p>
      </div>

      {error && <ErrorBox message={error} />}
      {!data && !error && <Loading label="Counting coverage" />}
      {data && (
        <>
          <div className="basis">
            <div className="grow">
              <b>Based on {data.basis.selected} of {data.basis.total} investigations</b>
              <span className="muted"> · {data.basis.runs.toLocaleString()} test rows · {data.basis.source}, collected {data.basis.built_at.slice(0, 10)}</span>
              <div className="pills" style={{ marginTop: 6 }}>
                {data.basis.filters.length === 0 && <span className="pill">No filters: the whole collection</span>}
                {data.basis.filters.map((f) => (
                  <span key={f} className="pill accent">{f}</span>
                ))}
              </div>
            </div>
            <button className={`btn sm ${showFilters ? 'on' : ''}`} onClick={() => setShowFilters((s) => !s)}>
              {showFilters ? 'Hide filters' : 'Change filters'}
              {activeCount(filters) ? ` (${activeCount(filters)})` : ''}
            </button>
          </div>
          {showFilters && <FilterPanel filters={filters} facets={facets} onChange={setFilters} />}

          <div className="banner info small">
            <span>
              <b>How to read a gap.</b> {data.disclaimer}
            </span>
          </div>

          {data.basis.selected === 0 && (
            <div className="banner warn">No experiments match these filters, so there is nothing to count. Clear a filter to continue.</div>
          )}

          {data.headlines.length > 0 && (
            <section className="stack">
              <div className="between">
                <h2>The main gaps</h2>
                <Explain q="Summarise the main research gaps in the NASA PSI combustion collection and why each one matters for a Moon Base." label="Explain these gaps" />
              </div>
              <div className="grid c2">
                {data.headlines.map((h) => (
                  <article key={h.id} className="panel stack-sm">
                    <span className={`pill ${KIND_PILL[h.kind]}`} style={{ alignSelf: 'flex-start' }}>
                      {h.kind === 'none' ? data.none_label : h.kind === 'thin' ? 'Little data' : 'Not reported in PSI'}
                    </span>
                    <h3>{h.title}</h3>
                    <p className="small">
                      <Cited text={h.text} />
                    </p>
                    {h.table && (
                      <div className="scroll-x">
                        <table className="data">
                          <thead>
                            <tr>
                              <th>Agent</th>
                              <th>Tested on</th>
                              <th>In</th>
                            </tr>
                          </thead>
                          <tbody>
                            {h.table.map((r) => (
                              <tr key={r.agent}>
                                <td>{r.agent}</td>
                                <td>{r.fuel_types.length ? r.fuel_types.join(', ') : <span className="nr">{data.none_label}</span>}</td>
                                <td>
                                  <Cited text={r.ids.map((i) => `[${i}]`).join(' ')} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {h.evidence.length > 0 && (
                      <details className="src">
                        <summary>
                          <span className="small">NASA text behind this ({h.evidence.length})</span>
                          <span className="tiny faint">▾</span>
                        </summary>
                        <div className="body">
                          {h.evidence.map((e, i) => (
                            <Quote key={i} e={e} />
                          ))}
                        </div>
                      </details>
                    )}
                    <Link className="small" to={h.to} style={{ marginTop: 'auto' }}>
                      {h.link} →
                    </Link>
                  </article>
                ))}
              </div>
            </section>
          )}

          {data.habitat && (
            <section className="stack">
              <div>
                <h2>How well is your habitat covered?</h2>
                <p className="muted small">Pick a crew environment to count the selected experiments against its cabin atmosphere and gravity.</p>
              </div>
              <div className="env-tabs">
                {meta?.environments.map((e) => (
                  <button key={e.id} className={`env-tab ${e.id === env ? 'active' : ''}`} onClick={() => pickEnv(e.id)}>
                    <b>{e.name}</b>
                    <span>{e.atmosphere_label}</span>
                  </button>
                ))}
              </div>
              <article className="panel stack-sm">
                {data.habitat.rows.map((r) => (
                  <div key={r.label} className="fit-row">
                    <span className={`dot ${r.status}`} title={STATUS_WORD[r.status]} />
                    <span className="grow">
                      <b className="small">{r.label}</b>
                      <div style={{ marginTop: 4 }}>
                        {r.count ? <Chips ids={r.ids} /> : <span className="small cov-none">{data.none_label}</span>}
                      </div>
                    </span>
                    <b className="num">{r.count}</b>
                  </div>
                ))}
                {data.habitat.environment.assumption && (
                  <div className="limits small">
                    <b>Assumption: </b>
                    {data.habitat.environment.assumption}
                  </div>
                )}
                <div className="row small">
                  <Link to={`/ranking?env=${env}`}>Rank the experiments for {data.habitat.environment.name} →</Link>
                  <Link to={`/mission?env=${env}`}>Build its mission report →</Link>
                </div>
              </article>
            </section>
          )}

          {data.basis.selected > 0 && (
            <>
              <section className="stack">
                <h2>What has been studied, group by group</h2>
                <Matrix data={data} />
                <div className="grid c2" style={{ alignItems: 'start' }}>
                  {data.dimensions.map((d) => (
                    <Dimension key={d.id} d={d} noneLabel={data.none_label} />
                  ))}
                </div>
              </section>

              <section className="stack">
                <div>
                  <h2>Possible questions for future experiments</h2>
                  <p className="muted small">{data.questions_note}</p>
                </div>
                {data.questions.map((q, i) => (
                  <article key={q.because} className="panel tight stack-sm">
                    <div className="between" style={{ alignItems: 'flex-start' }}>
                      <b>
                        {i + 1}. {q.question}
                      </b>
                      <Explain q={`What do the NASA PSI experiments already tell us about this open question, and what is missing? "${q.question}"`} label="What do we know so far?" />
                    </div>
                    <div className="row small muted">
                      Closest existing experiments:
                      <Cited text={q.closest.map((c) => `[${c}]`).join(' ')} />
                    </div>
                    <span className="tiny faint">
                      Follows from: {data.headlines.find((h) => h.id === q.because)?.title}
                    </span>
                  </article>
                ))}
              </section>

              <section className="stack">
                <div>
                  <h2>Where Earth and microgravity results cannot be compared directly</h2>
                  <p className="muted small">{data.not_comparable.text}</p>
                </div>
                <div className="vs">
                  <div className="h">Aspect</div>
                  <div className="h">On Earth (1 g)</div>
                  <div className="h">In microgravity</div>
                  {data.not_comparable.points.map((p) => (
                    <div key={p.aspect} style={{ display: 'contents' }}>
                      <div>
                        <b>{p.aspect}</b>
                      </div>
                      <div className="muted">{p.earth}</div>
                      <div>
                        {p.micro}
                        <div className="stack-sm" style={{ marginTop: 8 }}>
                          {p.evidence.map((e, i) => (
                            <Quote key={i} e={e} />
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="small muted">
                  {data.not_comparable.with_1g_values.length > 0 ? (
                    <>
                      Only <Chips ids={data.not_comparable.with_1g_values} /> lists Earth-gravity values next to the
                      microgravity ones in its PSI run table.{' '}
                    </>
                  ) : (
                    <>None of the selected experiments lists Earth-gravity values next to microgravity ones in its PSI run table. </>
                  )}
                  <Link to="/lessons#gravity">See the side-by-side Saffire-II table and the candle example →</Link>
                </p>
              </section>
            </>
          )}
        </>
      )}
    </div>
  )
}
