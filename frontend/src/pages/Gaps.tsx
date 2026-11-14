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

function GapMap({ data }: { data: GapsData }) {
  const dims = data.dimensions.filter((d) => d.fixed)
  const [rowId, setRowId] = useState('fuel')
  const [colId, setColId] = useState('oxygen')
  const [picked, setPicked] = useState<{ r: string; c: string } | null>(null)
  const row = dims.find((d) => d.id === rowId) ?? dims[0]
  const col = dims.find((d) => d.id === colId) ?? dims[1]
  const members = (r: string, c: string) =>
    data.items.filter((it) => it.dims[row.id].includes(r) && it.dims[col.id].includes(c))
  const counts = row.cells.map((r) => col.cells.map((c) => members(r.label, c.label).length))
  const max = Math.max(1, ...counts.flat())
  const gaps = counts.flat().filter((n, i) => {
    const r = row.cells[Math.floor(i / col.cells.length)]
    const c = col.cells[i % col.cells.length]
    return n === 0 && r.status !== 'unreported' && c.status !== 'unreported'
  }).length
  const sel = picked ? members(picked.r, picked.c) : []
  // bubble size grows with the square root of the count, so area tracks the number of experiments
  const size = (n: number) => Math.round(16 + 30 * Math.sqrt(n / max))
  return (
    <article className="panel stack">
      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div className="row" style={{ gap: 12 }}>
          <label className="field" style={{ minWidth: 180 }}>
            Rows
            <select className="select" value={row.id} onChange={(e) => { setRowId(e.target.value); setPicked(null) }}>
              {dims.filter((d) => d.id !== col.id).map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
          </label>
          <label className="field" style={{ minWidth: 180 }}>
            Columns
            <select className="select" value={col.id} onChange={(e) => { setColId(e.target.value); setPicked(null) }}>
              {dims.filter((d) => d.id !== row.id).map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
          </label>
        </div>
        <span className="small"><b>{gaps}</b> <span className="muted">empty combinations</span></span>
      </div>

      <div className="scroll-x">
        <div className="gmap" style={{ gridTemplateColumns: `minmax(150px, 1.2fr) repeat(${col.cells.length}, minmax(64px, 1fr))` }} role="table">
          <div />
          {col.cells.map((c) => (
            <div key={c.label} className="gmap-col" role="columnheader">{c.label}</div>
          ))}
          {row.cells.map((r, ri) => (
            <div key={r.label} style={{ display: 'contents' }} role="row">
              <div className="gmap-row" role="rowheader">{r.label}</div>
              {col.cells.map((c, ci) => {
                const n = counts[ri][ci]
                const unknown = c.status === 'unreported' || r.status === 'unreported'
                const on = picked?.r === r.label && picked?.c === c.label
                const label = unknown ? 'not reported in PSI' : n === 0 ? 'research gap' : `${n} experiment${n === 1 ? '' : 's'}`
                return (
                  <button
                    key={c.label} className={`gcell ${on ? 'on' : ''}`} disabled={n === 0}
                    onClick={() => setPicked(on ? null : { r: r.label, c: c.label })}
                    title={`${r.label} × ${c.label}: ${label}`} aria-label={`${r.label} by ${c.label}: ${label}`}
                  >
                    {n > 0 ? (
                      <span className="bub" style={{ width: size(n), height: size(n), opacity: 0.35 + 0.65 * (n / max) }}>
                        {size(n) >= 24 ? n : ''}
                      </span>
                    ) : (
                      <span className={`bub ${unknown ? 'unk' : 'gap'}`}>{unknown ? '?' : ''}</span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="between tiny muted">
        <span className="row" style={{ gap: 14 }}>
          {[1, Math.max(2, Math.round(max / 2)), max].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
            <span key={v} className="row" style={{ gap: 6 }}>
              <span className="bub" style={{ width: size(v), height: size(v), opacity: 0.35 + 0.65 * (v / max), position: 'static' }} /> {v}
            </span>
          ))}
          <span className="row" style={{ gap: 6 }}><span className="bub gap" style={{ position: 'static' }} /> research gap</span>
          <span className="row" style={{ gap: 6 }}><span className="bub unk" style={{ position: 'static' }}>?</span> not reported</span>
        </span>
        <span>Gap = no PSI combustion experiment, not proof that none exists elsewhere.</span>
      </div>

      {picked && (
        <div className="panel tight stack-sm" style={{ background: 'var(--paper)' }}>
          <b className="small">{picked.r} × {picked.c}</b>
          <Chips ids={sel} />
        </div>
      )}
    </article>
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
        <p>Where NASA’s combustion experiments are dense, thin, or missing.</p>
      </div>

      {error && <ErrorBox message={error} />}
      {!data && !error && <Loading label="Counting coverage" />}
      {data && (
        <>
          <div className="between small">
            <span className="muted">
              <b style={{ color: 'var(--text)' }}>{data.basis.selected}</b> of {data.basis.total} experiments ·{' '}
              {data.basis.runs.toLocaleString()} test rows
              {data.basis.filters.length > 0 && ` · ${data.basis.filters.join(' · ')}`}
            </span>
            <button className={`btn sm ${showFilters ? 'on' : ''}`} onClick={() => setShowFilters((s) => !s)}>
              Filters{activeCount(filters) ? ` (${activeCount(filters)})` : ''}
            </button>
          </div>
          {showFilters && <FilterPanel filters={filters} facets={facets} onChange={setFilters} />}

          {data.basis.selected === 0 ? (
            <div className="banner warn">No experiments match these filters. Clear a filter to continue.</div>
          ) : (
            <section className="stack">
              <div className="between">
                <h2>Gap map</h2>
                <Explain q="In the research-gap map, which combinations have no NASA PSI experiments, and which of those matter most for a Moon Base?" label="Explain the map" />
              </div>
              <GapMap data={data} />
            </section>
          )}

          {data.headlines.length > 0 && (
            <section className="stack">
              <h2>The main gaps</h2>
              <div className="grid c2">
                {data.headlines.map((h) => (
                  <article key={h.id} className="panel tight stack-sm">
                    <span className={`pill ${KIND_PILL[h.kind]}`} style={{ alignSelf: 'flex-start' }}>
                      {h.kind === 'none' ? 'Gap' : h.kind === 'thin' ? 'Little data' : 'Not reported'}
                    </span>
                    <h3>{h.title}</h3>
                    <p className="small" style={{ color: 'var(--text-2)' }}>
                      <Cited text={h.text} />
                    </p>
                    {(h.table || h.evidence.length > 0) && (
                      <details className="src">
                        <summary>
                          <span className="small">Details and NASA text</span>
                          <span className="tiny faint">▾</span>
                        </summary>
                        <div className="body">
                          {h.table && (
                            <div className="scroll-x">
                              <table className="data">
                                <thead>
                                  <tr><th>Agent</th><th>Tested on</th><th>In</th></tr>
                                </thead>
                                <tbody>
                                  {h.table.map((r) => (
                                    <tr key={r.agent}>
                                      <td>{r.agent}</td>
                                      <td>{r.fuel_types.length ? r.fuel_types.join(', ') : <span className="nr">none</span>}</td>
                                      <td><Cited text={r.ids.map((i) => `[${i}]`).join(' ')} /></td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          {h.evidence.map((e, i) => <Quote key={i} e={e} />)}
                        </div>
                      </details>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}

          {data.habitat && (
            <section className="stack">
              <h2>Your habitat</h2>
              <div className="chips">
                {meta?.environments.map((e) => (
                  <button key={e.id} className={`chip ${e.id === env ? 'on' : ''}`} onClick={() => pickEnv(e.id)} title={e.atmosphere_label}>
                    {e.name}
                  </button>
                ))}
              </div>
              <article className="panel tight stack-sm">
                {data.habitat.rows.map((r) => (
                  <div key={r.label} className="fit-row">
                    <span className={`dot ${r.status}`} title={STATUS_WORD[r.status]} />
                    <span className="grow">
                      <b className="small">{r.label}</b>
                      <div style={{ marginTop: 4 }}>
                        {r.count ? <Chips ids={r.ids} /> : <span className="small cov-none">Research gap</span>}
                      </div>
                    </span>
                    <b className="num">{r.count}</b>
                  </div>
                ))}
                <div className="row small">
                  <Link to={`/ranking?env=${env}`}>Score experiments for {data.habitat.environment.name} →</Link>
                  <Link to={`/mission?env=${env}`}>Mission report →</Link>
                </div>
              </article>
            </section>
          )}

          {data.basis.selected > 0 && data.questions.length > 0 && (
            <section className="stack">
              <div>
                <h2>Open questions for future experiments</h2>
                <p className="tiny muted" style={{ marginTop: 4 }}>Derived from the gaps by the project team, not NASA’s plans.</p>
              </div>
              <ol className="qlist">
                {data.questions.map((q) => (
                  <li key={q.because}>
                    <b className="small">{q.question}</b>
                    <span className="row tiny muted" style={{ gap: 4 }}>
                      Closest so far: <Cited text={q.closest.map((c) => `[${c}]`).join(' ')} />
                      <Explain q={`What do the NASA PSI experiments already tell us about this open question? "${q.question}"`} label="What do we know?" />
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {data.basis.selected > 0 && (
            <details className="src">
              <summary>
                <span className="small">Every group, one by one</span>
                <span className="tiny faint">▾</span>
              </summary>
              <div className="body">
                <div className="grid c2" style={{ alignItems: 'start' }}>
                  {data.dimensions.map((d) => (
                    <Dimension key={d.id} d={d} noneLabel="Research gap" />
                  ))}
                </div>
              </div>
            </details>
          )}
        </>
      )}
    </div>
  )
}
