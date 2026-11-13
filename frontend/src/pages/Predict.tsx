import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Data, Layout } from 'plotly.js-dist-min'
import { api, type BatchResult, type Place, type PredictCatalog, type PredictInput, type PredictModel, type Prediction } from '../api'
import { Cited, ErrorBox, Explain, Loading } from '../components/bits'
import { csvDownload, parseCsv, type Row } from '../components/chartEngine'
import Plot, { SERIES } from '../components/Plot'
import { useLoad, usePageContext } from '../ctx'

// Predictions: pick a question (one NASA experiment each), pick a place (a habitat atmosphere),
// adjust the conditions, read the answer. Or upload a CSV of scenarios and get them all at once.

const SHOW_CONFIDENCE = 60 // below this the number says little; the answer is labelled a rough estimate instead

// short URL names for the inputs, so a scenario can be shared as a link
const PARAM: Record<string, string> = { oxygen: 'o2', co2: 'co2', helium: 'he', pressure: 'p', diameter: 'd', xf: 'xf', mhc: 'm' }
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const fmt = (v: number, d: number) => Number(v.toFixed(Math.max(d, 0))).toLocaleString(undefined, { maximumFractionDigits: Math.max(d, 2) })

/** The highest a gas slider may go: what is left of 100% after the other gases. */
function gasMax(m: PredictModel, key: string, values: Record<string, number>) {
  if (!m.gases?.includes(key)) return Infinity
  return 100 - (m.gases ?? []).filter((g) => g !== key).reduce((s, g) => s + (values[g] ?? 0), 0)
}

function Slider({ spec, group, value, max, onChange }: { spec: PredictInput; group: string; value: number; max: number; onChange: (v: number) => void }) {
  const [lo, hi] = spec.ranges[group] ?? spec.form
  const fmin = spec.form[0]
  const fmax = Math.max(fmin + spec.step, Math.min(spec.form[1], max))
  const pct = (v: number) => `${((Math.min(fmax, Math.max(fmin, v)) - fmin) / (fmax - fmin)) * 100}%`
  const tol = 0.5 * 10 ** -spec.decimals
  const outside = value < lo - tol || value > hi + tol
  const unit = spec.unit === '%' ? '%' : ` ${spec.unit}`
  return (
    <div className="pslider">
      <div className="between" style={{ flexWrap: 'nowrap' }}>
        <label htmlFor={`p-${spec.key}`} className="small">{spec.label}</label>
        <span className={`pval ${outside ? 'out' : ''}`}>
          <input
            className="input" type="number" inputMode="decimal" step={spec.step} min={fmin} max={fmax} value={value}
            aria-label={`${spec.label} value`}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (e.target.value !== '' && Number.isFinite(v)) onChange(Math.min(fmax, Math.max(fmin, v)))
            }}
          />
          <span className="tiny muted">{spec.unit === '%' ? '%' : spec.unit}</span>
        </span>
      </div>
      <div className="wi-slider">
        <span className="wi-tested" style={{ left: pct(lo), width: `calc(${pct(Math.min(hi, fmax))} - ${pct(lo)})` }} title="Tested by NASA" />
        <input id={`p-${spec.key}`} type="range" min={fmin} max={fmax} step={spec.step} value={Math.min(fmax, Math.max(fmin, value))}
          onChange={(e) => onChange(Number(e.target.value))} />
      </div>
      <span className={`tiny ${outside ? 'wi-out' : 'faint'}`}>
        Tested {fmt(lo, spec.decimals)}–{fmt(hi, spec.decimals)}{unit}{outside ? ' · beyond the tests' : ''}
      </span>
    </div>
  )
}

function Answer({ m, r }: { m: PredictModel; r: Prediction }) {
  if (r.status !== 'ok' || !r.estimate) {
    return (
      <div className="panel stack-sm" style={{ borderColor: 'var(--bad-line)' }}>
        <span className="pill bad" style={{ alignSelf: 'flex-start' }}>{r.status === 'invalid' ? 'Not a possible atmosphere' : 'No model'}</span>
        <p>{r.message}</p>
      </div>
    )
  }
  const e = r.estimate
  const conf = r.confidence ?? 0
  const sure = conf >= SHOW_CONFIDENCE
  const value = m.kind === 'class' ? `${Math.round(e.value)}` : fmt(e.value, m.decimals)
  const sentence = m.kind === 'class'
    ? `${Math.round(e.value)}% chance that the flame goes out before the ${r.group?.toLowerCase()} droplet is used up.`
    : `${m.target_label} for ${r.group?.toLowerCase()}: about ${value} ${m.unit}.`
  return (
    <div className="answer">
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <span className="tiny muted">{m.target_label} · model prediction, not a NASA measurement</span>
        {sure ? (
          <span className="pill good" title={`How close this is to real NASA tests: ${conf}%`}>{conf}% confidence</span>
        ) : (
          <span className="pill warn" title="Further from NASA’s tests than they are from each other">Rough estimate</span>
        )}
      </div>
      <div className="answer-num">
        <b>{value}</b>
        <span>{m.unit}</span>
      </div>
      {m.kind === 'class' && (
        <div className="prob" aria-hidden>
          <i style={{ width: `${e.value}%` }} />
        </div>
      )}
      <p className="small">{sentence}</p>
      {e.low !== null && e.high !== null && (
        <p className="tiny muted">Likely range {fmt(e.low, m.decimals)}–{fmt(e.high, m.decimals)} {m.unit}{!sure ? ', wider because no real test is close' : ''}.</p>
      )}
      {r.warnings && r.warnings.length > 0 && (
        <ul className="dots tiny muted" style={{ margin: 0 }}>
          {r.warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}
      {r.effects && r.effects.length > 0 && (
        <div className="stack-sm" style={{ gap: 6 }}>
          <span className="tiny muted">Compared with the starting conditions:</span>
          {r.effects.filter((x) => Math.abs(x.delta) >= (m.kind === 'class' ? 0.5 : 10 ** -m.decimals)).map((x) => (
            <div key={x.key} className="effect">
              <span className="tiny">{x.label} {fmt(x.from, 2)} → {fmt(x.to, 2)}</span>
              <span className="effect-bar"><i className={x.delta > 0 ? 'up' : 'down'} style={{ width: `${Math.min(100, (Math.abs(x.delta) / Math.max(1e-9, Math.abs(r.reference?.value ?? 1))) * 100)}%` }} /></span>
              <b className="num tiny">{x.delta > 0 ? '+' : ''}{fmt(x.delta, m.kind === 'class' ? 0 : m.decimals)}</b>
            </div>
          ))}
        </div>
      )}
      <Explain q={`The ${m.title} model predicts ${sentence} for ${JSON.stringify(r.inputs)}. Explain what this means for fire safety and what it does not tell us.`} label="Explain this result" />
    </div>
  )
}

function Chart({ m, r }: { m: PredictModel; r: Prediction }) {
  const built = useMemo(() => {
    if (r.status !== 'ok' || !r.curve || !r.estimate) return null
    const scale = 1
    const backed = r.curve.backed
    const data: Data[] = [
      {
        x: r.measured?.map((p) => p.x) ?? [], y: r.measured?.map((p) => (m.kind === 'class' ? p.y + (Math.random() - 0.5) * 6 : p.y)) ?? [],
        text: r.measured?.map((p) => p.id), mode: 'markers', type: 'scatter', name: `NASA tests (${r.group})`,
        marker: { color: SERIES[0], opacity: 0.4, size: 7 },
        hovertemplate: m.kind === 'class' ? '%{text}<extra>NASA test</extra>' : `%{text}: %{y:.${m.decimals}f} ${m.unit}<extra>NASA test</extra>`,
      },
      { x: r.curve.x, y: r.curve.y.map((v) => v * scale), mode: 'lines', type: 'scatter', name: 'Model, beyond the tests', line: { color: '#0b0b0b', width: 1.5, dash: 'dot' }, hoverinfo: 'skip' },
      { x: r.curve.x, y: r.curve.y.map((v, i) => (backed[i] ? v : null)), mode: 'lines', type: 'scatter', name: 'Model', line: { color: '#0b0b0b', width: 2.5 }, hovertemplate: `%{y:.${m.kind === 'class' ? 0 : m.decimals}f}${m.kind === 'class' ? '%' : ' ' + m.unit} at %{x}% O2<extra></extra>` },
      {
        x: [r.inputs?.oxygen ?? 0], y: [r.estimate.value], mode: 'markers', type: 'scatter', name: 'Your scenario',
        marker: { color: SERIES[1], size: 15, symbol: 'diamond', line: { color: '#fcfcfb', width: 2 } }, hoverinfo: 'skip',
      },
    ]
    const layout: Partial<Layout> = {
      xaxis: { title: { text: 'Oxygen (%)' } },
      yaxis: { title: { text: m.kind === 'class' ? 'Chance the flame goes out (%)' : `${m.target_label} (${m.unit})` }, rangemode: 'tozero', ...(m.kind === 'class' ? { range: [-8, 108] } : {}) },
      legend: { orientation: 'h', y: -0.28 }, margin: { l: 64, r: 16, t: 10, b: 96 },
    }
    return { data, layout }
  }, [m, r])
  if (!built) return null
  return <Plot data={built.data} layout={built.layout} height={360} name={`prediction-${m.id}`} />
}

// ---------------------------------------------------------------- CSV: many scenarios at once
function Batch({ m }: { m: PredictModel }) {
  const [file, setFile] = useState<{ name: string; rows: Row[]; map: Record<string, string>; group?: string } | null>(null)
  const [results, setResults] = useState<BatchResult[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const inputs = m.inputs ?? []

  const template = () => csvDownload(`${m.id}-scenarios.csv`, [...(m.groups ? [m.group_label ?? 'group'] : []), ...inputs.map((i) => `${i.key}`)],
    [[...(m.groups ? [m.groups[0]] : []), ...inputs.map((i) => i.default)]])

  const read = async (f: File) => {
    setError(null)
    setResults(null)
    try {
      if (f.size > 2 * 2 ** 20) throw new Error('Keep the file under 2 MB (up to 2,000 rows).')
      const { cols, rows } = parseCsv(await f.text())
      if (rows.length > 2000) throw new Error(`The file has ${rows.length} rows; the limit is 2,000.`)
      // match columns to inputs by key or by words in the label ("Oxygen (%)" -> oxygen)
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
      const map: Record<string, string> = {}
      for (const i of inputs) {
        const hit = cols.find((c) => norm(c.label) === norm(i.key) || norm(c.label) === norm(PARAM[i.key] ?? '') || norm(c.label).startsWith(norm(i.label)))
        if (hit) map[i.key] = hit.key
      }
      if (!Object.keys(map).length) throw new Error(`No column matches the inputs (${inputs.map((i) => i.key).join(', ')}). Download the template to see the format.`)
      const g = cols.find((c) => ['fuel', 'group', norm(m.group_label ?? '')].includes(norm(c.label)))
      setFile({ name: f.name, rows, map, group: g?.key })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const run = async () => {
    if (!file) return
    setBusy(true)
    try {
      const rows = file.rows.map((r) => ({
        group: file.group ? (m.groups ?? []).find((g) => g.toLowerCase() === (r[file.group!] ?? '').trim().toLowerCase()) : undefined,
        values: Object.fromEntries(Object.entries(file.map).map(([k, col]) => [k, r[col]])),
      }))
      setResults((await api.predictBatch(m.id, rows)).results)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const download = () => {
    if (!file || !results) return
    const head = Object.keys(file.rows[0] ?? {})
    csvDownload(`${file.name.replace(/\.\w+$/, '')}-predictions.csv`, [...head, `${m.target_label} (${m.unit})`, 'low', 'high', 'confidence %', 'note'],
      file.rows.map((r, i) => {
        const x = results[i]
        return [...head.map((h) => r[h] ?? ''), x?.value ?? '', x?.low ?? '', x?.high ?? '', x?.confidence ?? '',
          x?.status !== 'ok' ? (x?.message ?? '') : x.extrapolated ? 'beyond the tests' : '']
      }))
  }

  return (
    <div className="panel stack">
      <div className="between">
        <div>
          <h3>Predict many scenarios from a CSV</h3>
          <p className="tiny muted" style={{ marginTop: 4 }}>One row per scenario. Columns: {[...(m.groups ? [m.group_label?.toLowerCase()] : []), ...inputs.map((i) => i.key)].join(', ')}.</p>
        </div>
        <button className="btn sm" onClick={template}>Download template</button>
      </div>
      {!file && (
        <div className="drop" role="button" tabIndex={0} style={{ padding: 22 }}
          onClick={() => input.current?.click()} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void read(f) }}>
          <b className="small">Drop a CSV here, or click to choose</b>
          <input ref={input} type="file" accept=".csv,.tsv,.txt,text/csv" hidden onChange={(e) => e.target.files?.[0] && void read(e.target.files[0])} />
        </div>
      )}
      {error && <ErrorBox message={error} />}
      {file && (
        <div className="stack-sm">
          <div className="row small">
            <b>{file.name}</b>
            <span className="muted">{file.rows.length} rows · matched {Object.keys(file.map).join(', ')}{file.group ? `, ${m.group_label?.toLowerCase()}` : ''}</span>
            <span className="grow" />
            <button className="btn sm ghost" onClick={() => { setFile(null); setResults(null) }}>Remove</button>
            {!results && <button className="btn sm primary" onClick={() => void run()} disabled={busy}>{busy ? 'Predicting…' : `Predict ${file.rows.length} rows`}</button>}
            {results && <button className="btn sm primary" onClick={download}>Download results</button>}
          </div>
          {results && (
            <div className="scroll-x">
              <table className="data">
                <thead>
                  <tr>
                    {m.groups && <th>{m.group_label}</th>}
                    {Object.keys(file.map).map((k) => <th key={k} className="num">{k}</th>)}
                    <th className="num">{m.target_label} ({m.unit})</th>
                    <th>Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {results.slice(0, 12).map((x, i) => (
                    <tr key={i}>
                      {m.groups && <td>{x.group ?? '—'}</td>}
                      {Object.values(file.map).map((col) => <td key={col} className="num">{file.rows[i][col]}</td>)}
                      <td className="num"><b>{x.status === 'ok' ? fmt(x.value ?? 0, m.decimals) : '—'}</b></td>
                      <td className="tiny">{x.status !== 'ok' ? x.message : (x.confidence ?? 0) >= SHOW_CONFIDENCE ? `${x.confidence}%` : 'Rough estimate'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {results.length > 12 && <p className="tiny muted" style={{ marginTop: 6 }}>Showing 12 of {results.length}. Download for all rows.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- page
export default function Predict() {
  const { data: cat, error, loading } = useLoad<PredictCatalog>(() => api.predictModels(), [])
  const [sp, setSp] = useSearchParams()
  const models = useMemo(() => (cat?.models ?? []).filter((m) => m.available && m.inputs), [cat])
  const [mid, setMid] = useState(sp.get('model') ?? 'flex-rate')
  const m = models.find((x) => x.id === mid) ?? models[0]
  const [group, setGroup] = useState<string>(sp.get('fuel') ?? '')
  const [values, setValues] = useState<Record<string, number> | null>(null)
  const [, setPlace] = useState<string | null>(null)
  const [res, setRes] = useState<Prediction | null>(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'one' | 'csv'>('one')

  const g = m?.groups?.includes(group) ? group : m?.groups?.[0] ?? ''
  // a place is active whenever the conditions match its atmosphere (also when opened from a link)
  const here = cat?.places.find((p) => values && Math.abs(values.oxygen - p.oxygen) < 0.01 && Math.abs(values.pressure - p.pressure) < 0.005)?.id ?? null

  // start from the link (shared scenario) or the model's defaults; reset when the model changes
  useEffect(() => {
    if (!m?.inputs) return
    const start: Record<string, number> = {}
    for (const i of m.inputs) {
      const raw = sp.get(PARAM[i.key] ?? i.key)
      start[i.key] = raw !== null && raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : i.defaults[g] ?? i.default
    }
    setValues(start)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m?.id])

  const key = JSON.stringify([m?.id, g, values])
  useEffect(() => {
    if (!m || !values) return
    let live = true
    setBusy(true)
    const t = setTimeout(() => {
      api.predict(m.id, g, values).then((r) => live && setRes(r)).catch(() => undefined).finally(() => live && setBusy(false))
      const next = new URLSearchParams({ model: m.id, ...(g ? { fuel: g } : {}) })
      for (const [k, v] of Object.entries(values)) next.set(PARAM[k] ?? k, String(v))
      setSp(next, { replace: true })
    }, 180)
    return () => {
      live = false
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  usePageContext('Predictions', m ? [m.table.investigation.id] : [],
    m && res?.status === 'ok' && res.estimate
      ? `Model "${m.title}" (${m.question}), trained on ${m.table.investigation.short}. ${m.group_label}: ${g}. Inputs: ${JSON.stringify(values)}. Prediction: ${res.estimate.value} ${m.unit}, confidence ${res.confidence}%${res.extrapolated ? ', beyond the tested range' : ''}. A model prediction, not a NASA measurement.`
      : 'The Predictions page.')

  const set = (k: string, v: number) => {
    setPlace(null)
    setValues((cur) => (cur ? { ...cur, [k]: v } : cur))
  }
  const pickPlace = (p: Place | null) => {
    if (!m?.inputs || !values) return
    setPlace(p?.id ?? null)
    if (!p) return
    const next: Record<string, number> = { ...values, oxygen: p.oxygen, pressure: p.pressure }
    for (const gas of m.gases ?? []) if (gas !== 'oxygen') next[gas] = 0 // cabin air carries no added CO2 or helium
    setValues(next)
  }
  const pickGroup = (x: string) => {
    setGroup(x)
    if (!m?.inputs || !values) return
    const next = { ...values }
    for (const i of m.inputs) if (!['oxygen', 'pressure', 'co2', 'helium'].includes(i.key)) next[i.key] = i.defaults[x] ?? i.default
    setValues(next)
  }
  const reset = () => {
    if (!m?.inputs) return
    setPlace(null)
    setValues(Object.fromEntries(m.inputs.map((i) => [i.key, i.defaults[g] ?? i.default])))
  }

  return (
    <div className="page stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h1>Predictions</h1>
        <p>Ask what a fire would do in a habitat’s atmosphere, from models trained on NASA experiments.</p>
      </div>

      {loading && <Loading label="Loading the models" />}
      {error && <ErrorBox message={error} />}
      {cat && m && values && (
        <>
          <section className="stack-sm">
            <h4>1 · What do you want to know?</h4>
            <div className="pick">
              {models.map((x) => (
                <button key={x.id} className={`pick-card ${x.id === m.id ? 'on' : ''}`} onClick={() => { setMid(x.id); setPlace(null); setRes(null) }}>
                  <b>{x.title}</b>
                  <span>{x.short}</span>
                  <span className="tiny faint">{x.table.investigation.short} · {x.rows} NASA tests</span>
                </button>
              ))}
            </div>
          </section>

          <section className="stack-sm">
            <h4>2 · Where?</h4>
            <div className="chips">
              {cat.places.map((p) => (
                <button key={p.id} className={`chip ${here === p.id ? 'on' : ''}`} title={p.label} onClick={() => pickPlace(p)}>
                  {p.name} <span className="faint">· {p.oxygen}% O₂, {p.pressure} atm</span>
                </button>
              ))}
              <button className={`chip ${here === null ? 'on' : ''}`} onClick={() => setPlace(null)}>Custom</button>
            </div>
          </section>

          <div className="seg" style={{ alignSelf: 'flex-start' }}>
            <button className={tab === 'one' ? 'on' : ''} onClick={() => setTab('one')}>One scenario</button>
            <button className={tab === 'csv' ? 'on' : ''} onClick={() => setTab('csv')}>Many scenarios (CSV)</button>
          </div>

          {tab === 'one' ? (
            <div className="predict">
              <section className="panel stack">
                <div className="between">
                  <h4>3 · Conditions</h4>
                  <button className="btn sm ghost" onClick={reset}>Reset</button>
                </div>
                {m.groups && m.groups.length > 1 && (
                  <div className="stack-sm">
                    <span className="small">{m.group_label}</span>
                    <div className="seg" style={{ flexWrap: 'wrap' }}>
                      {m.groups.map((x) => (
                        <button key={x} className={x === g ? 'on' : ''} onClick={() => pickGroup(x)}>{cap(x)}</button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="psliders">
                  {m.inputs!.map((i) => (
                    <Slider key={i.key} spec={i} group={g} value={values[i.key]} max={gasMax(m, i.key, values)} onChange={(v) => set(i.key, v)} />
                  ))}
                </div>
                {(m.gases?.length ?? 0) > 1 && (
                  <span className="tiny faint">
                    Nitrogen fills the rest: {Math.max(0, 100 - (m.gases ?? []).reduce((s, k) => s + (values[k] ?? 0), 0)).toFixed(0)}%. Gas sliders stop where the mixture would pass 100%.
                  </span>
                )}
              </section>

              <section className="stack">
                <div className="panel" style={{ opacity: busy && !res ? 0.6 : 1 }}>
                  {res ? <Answer m={m} r={res} /> : <Loading label="Predicting" />}
                </div>
                {res && res.status === 'ok' && (
                  <div className="panel tight">
                    <Chart m={m} r={res} />
                  </div>
                )}
              </section>
            </div>
          ) : (
            <Batch m={m} />
          )}

          {res?.status === 'ok' && res.nearest && res.nearest.length > 0 && tab === 'one' && (
            <details className="src">
              <summary>
                <span className="small">The 5 closest NASA tests</span>
                <span className="tiny faint">▾</span>
              </summary>
              <div className="body">
                <div className="scroll-x">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Test</th>
                        {m.inputs!.map((i) => <th key={i.key} className="num">{i.label}</th>)}
                        <th>Measured</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {res.nearest.map((n) => (
                        <tr key={n.id}>
                          <td>{n.id}</td>
                          {m.inputs!.map((i) => <td key={i.key} className="num">{fmt(n.values[i.key], i.decimals)}</td>)}
                          <td><b>{typeof n.measured === 'number' ? `${fmt(n.measured, m.decimals)} ${m.unit}` : n.measured}</b></td>
                          <td><button className="btn sm" onClick={() => { setPlace(null); setValues({ ...n.values }) }}>Use</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <span className="tiny muted">
                  Source: <a href={m.table.source_url} target="_blank" rel="noreferrer">{m.table.title} ↗</a> · <Link to={`/explorer/${m.table.investigation.id}`}>{m.table.investigation.short}</Link>
                </span>
              </div>
            </details>
          )}

          <details className="src">
            <summary>
              <span className="small">How good is this model?</span>
              <span className="tiny faint">▾</span>
            </summary>
            <div className="body stack-sm">
              <p><b>{m.question}.</b> {m.higher}</p>
              {m.metrics && (
                <p>
                  Tested on NASA test days it never saw: {m.metrics.error_name.toLowerCase()} {m.metrics.error}
                  {m.kind === 'reg' ? ` ${m.unit}` : ''} against {m.metrics.baseline_error} for {m.metrics.baseline_name.toLowerCase()},{' '}
                  <b>{m.metrics.improvement_pct}% better</b>
                  {m.metrics.r2 !== undefined ? `, R² ${m.metrics.r2}` : ''}{m.metrics.auc !== undefined ? `, AUC ${m.metrics.auc}` : ''}.
                  Trained on {m.rows} tests from <Link to={`/explorer/${m.table.investigation.id}`}>{m.table.investigation.short}</Link>.
                </p>
              )}
              <p>
                Confidence comes from how close your scenario is to real NASA tests and how well the model did on held-out
                days. Below {SHOW_CONFIDENCE}% it is shown as a rough estimate.
              </p>
              <ul className="dots">
                {m.limits.map((l) => <li key={l}>{l}</li>)}
              </ul>
              {res?.evidence && res.evidence.length > 0 && (
                <p>
                  Other experiments tested near {values.oxygen}% oxygen: <Cited text={res.evidence.map((x) => `[${x.id}]`).join(' ')} />
                </p>
              )}
            </div>
          </details>
        </>
      )}
    </div>
  )
}
