import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Data, Layout, Shape } from 'plotly.js-dist-min'
import { api, type Envelope, type Preset, type TableFull, type TableListItem } from '../api'
import { ErrorBox, Explain, Loading } from '../components/bits'
import {
  build, csvDownload, defaults, parseCsv, ready, slots, TYPES,
  type ChartType, type Col, type Row, type Spec,
} from '../components/chartEngine'
import Plot, { INK, MUTED, SERIES } from '../components/Plot'
import { useApp, useLoad, usePageContext } from '../ctx'

type View = 'build' | 'upload' | 'preset' | 'envelope'

// ---------------------------------------------------------------- icons
const ICONS: Record<ChartType | 'upload' | 'map' | 'star', ReactNode> = {
  scatter: <><circle cx="5" cy="13" r="1.6" /><circle cx="9" cy="8" r="1.6" /><circle cx="13" cy="10" r="1.6" /><circle cx="15" cy="4" r="1.6" /></>,
  line: <path d="M2 15 L7 9 L11 12 L18 4" fill="none" strokeWidth="1.8" />,
  bar: <><rect x="3" y="9" width="3" height="8" /><rect x="8.5" y="4" width="3" height="13" /><rect x="14" y="11" width="3" height="6" /></>,
  histogram: <><rect x="2" y="11" width="4" height="6" /><rect x="6" y="5" width="4" height="12" /><rect x="10" y="8" width="4" height="9" /><rect x="14" y="13" width="4" height="4" /></>,
  box: <><line x1="10" y1="2" x2="10" y2="18" strokeWidth="1.5" /><rect x="6" y="6" width="8" height="8" fill="#fff" strokeWidth="1.5" /><line x1="6" y1="10" x2="14" y2="10" strokeWidth="1.5" /></>,
  upload: <><path d="M10 13 V3 M6 7 L10 3 L14 7" fill="none" strokeWidth="1.7" /><path d="M3 13 V17 H17 V13" fill="none" strokeWidth="1.7" /></>,
  map: <><rect x="3" y="3" width="14" height="14" fill="none" strokeWidth="1.5" /><rect x="9" y="5" width="6" height="5" strokeWidth="0" opacity="0.35" /><circle cx="6" cy="13" r="1.3" /><circle cx="11" cy="8" r="1.3" /><circle cx="13" cy="12" r="1.3" /></>,
  star: <path d="M10 2 L12.3 7.2 L18 7.6 L13.6 11.3 L15 17 L10 14 L5 17 L6.4 11.3 L2 7.6 L7.7 7.2 Z" fill="none" strokeWidth="1.5" />,
}
const Icon = ({ k }: { k: keyof typeof ICONS }) => (
  <svg viewBox="0 0 20 20" fill="currentColor" stroke="currentColor" strokeWidth="0" aria-hidden>{ICONS[k]}</svg>
)

// ---------------------------------------------------------------- shared chart controls + render
function Controls({ cols, spec, onChange }: { cols: Col[]; spec: Spec; onChange: (s: Spec) => void }) {
  const s = slots(spec.type, cols)
  const set = (patch: Partial<Spec>) => onChange({ ...spec, ...patch })
  const typeOk = (t: ChartType) => {
    const o = slots(t, cols)
    if (t === 'scatter' || t === 'line') return o.x.length >= 2
    if (t === 'box') return o.y.length >= 1
    if (t === 'bar') return o.x.length >= 1
    return o.x.length >= 1
  }
  return (
    <div className="stack">
      <div className="stack-sm">
        <span className="tiny muted" style={{ fontWeight: 500 }}>Chart type</span>
        <div className="ctype" role="radiogroup" aria-label="Chart type">
          {TYPES.map((t) => (
            <button
              key={t.id} className={spec.type === t.id ? 'on' : ''} disabled={!typeOk(t.id)} role="radio" aria-checked={spec.type === t.id}
              title={typeOk(t.id) ? `${t.label}: ${t.needs}` : `This data has no columns suitable for a ${t.label.toLowerCase()}`}
              onClick={() => onChange(defaults(t.id, cols, spec))}
            >
              <Icon k={t.id} /> {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="builder-grid">
        {spec.type !== 'box' && (
          <label className="field">
            {spec.type === 'histogram' ? 'Measurement' : spec.type === 'bar' ? 'Categories (horizontal)' : 'Horizontal axis'}
            <select className="select" value={spec.x} onChange={(e) => set({ x: e.target.value })}>
              {s.x.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </label>
        )}
        {spec.type === 'box' && (
          <label className="field">
            Group by
            <select className="select" value={spec.x} onChange={(e) => set({ x: e.target.value })}>
              <option value="">Nothing (one box)</option>
              {s.x.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </label>
        )}
        {spec.type === 'bar' && (
          <label className="field">
            Bar height
            <select className="select" value={spec.agg ?? 'mean'} onChange={(e) => set({ agg: e.target.value as Spec['agg'], y: e.target.value === 'count' ? spec.y : spec.y || s.y[0]?.key })}>
              <option value="count">Number of rows</option>
              <option value="mean" disabled={!s.y.length}>Average of a measurement</option>
              <option value="sum" disabled={!s.y.length}>Total of a measurement</option>
            </select>
          </label>
        )}
        {(spec.type === 'scatter' || spec.type === 'line' || spec.type === 'box' || (spec.type === 'bar' && spec.agg !== 'count')) && (
          <label className="field">
            {spec.type === 'bar' ? 'Measurement' : 'Vertical axis'}
            <select className="select" value={spec.y ?? ''} onChange={(e) => set({ y: e.target.value })}>
              {s.y.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </label>
        )}
        {spec.type !== 'box' && (
          <label className="field">
            Colour by
            <select className="select" value={spec.color ?? ''} onChange={(e) => set({ color: e.target.value || undefined })}>
              <option value="">Nothing</option>
              {s.color.filter((c) => c.key !== spec.x || spec.type !== 'bar').map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  )
}

function Rendered({ cols, rows, spec, name, idKey, footer }: {
  cols: Col[]; rows: Row[]; spec: Spec; name: string; idKey?: string; footer?: ReactNode
}) {
  const problem = ready(spec)
  const built = useMemo(() => (problem ? null : build(cols, rows, spec, idKey)), [cols, rows, spec, idKey, problem])
  if (problem) return <div className="banner">{problem}</div>
  if (!built || built.plotted === 0) return <div className="banner warn">No numeric values to plot for this selection.</div>
  return (
    <div className="stack-sm">
      <Plot data={built.data} layout={built.layout} name={name} />
      <div className="between small muted">
        <span>
          {built.plotted.toLocaleString()} rows plotted
          {built.skipped > 0 && `, ${built.skipped.toLocaleString()} left out because a cell is empty or not a number`}
        </span>
        <span className="row">
          <button className="btn sm" onClick={() => csvDownload(`${name}-data.csv`, built.header, built.out)}>
            Download plotted data (CSV)
          </button>
          {footer}
        </span>
      </div>
    </div>
  )
}

const tableCols = (t: TableFull): Col[] => t.columns.map((c) => ({ key: c.key, label: c.label, numeric: c.numeric, distinct: c.distinct, derived: c.derived, formula: c.formula }))
const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()

// ---------------------------------------------------------------- 1. build from a NASA table
function NasaBuilder({ tables, presets, initial }: { tables: TableListItem[]; presets: Preset[]; initial?: string }) {
  const usable = useMemo(() => tables.filter((t) => t.numeric_columns >= 1 && t.n_rows >= 5), [tables])
  const [tableId, setTableId] = useState(
    initial && usable.some((t) => t.id === initial) ? initial : (usable.find((t) => t.id === 'PSI-69:1') ?? usable[0])?.id,
  )
  const { data: table, error, loading } = useLoad(() => api.table(tableId ?? ''), [tableId])
  const cols = useMemo(() => (table ? tableCols(table) : []), [table])
  const [spec, setSpec] = useState<Spec | null>(null)

  useEffect(() => {
    if (!table) return
    // start from the curated chart for this table when there is one: it picks the measurement that matters
    const curated = presets.find((p) => p.table_id === table.id)
    if (curated) return setSpec({ type: curated.type, x: curated.x, y: curated.y, color: curated.color })
    const numeric = cols.filter((c) => c.numeric)
    setSpec(defaults(numeric.length >= 2 ? 'scatter' : 'histogram', cols))
  }, [table, cols, presets])

  const label = (k?: string) => cols.find((c) => c.key === k)?.label ?? k ?? ''
  const title = !table || !spec ? '' :
    spec.type === 'histogram' ? `${table.investigation.short}: distribution of ${label(spec.x)}`
      : spec.type === 'bar' ? `${table.investigation.short}: ${spec.agg === 'count' ? 'rows' : `${spec.agg === 'sum' ? 'total' : 'average'} ${label(spec.y)}`} by ${label(spec.x)}`
        : spec.type === 'box' ? `${table.investigation.short}: spread of ${label(spec.y)}${spec.x ? ` by ${label(spec.x)}` : ''}`
          : `${table.investigation.short}: ${label(spec.y)} against ${label(spec.x)}`

  usePageContext('Charts', table ? [table.investigation.id] : [],
    table && spec ? `Chart built by the reader: "${title}". Type ${spec.type}. Source: PSI run table "${table.title}" of ${table.investigation.short}, ${table.n_rows} rows. Columns available: ${cols.map((c) => c.label).join(', ')}.` : '')

  return (
    <section className="panel builder">
      <aside className="builder-side">
        <h3>Build a chart</h3>
        <label className="field">
          NASA run table
          <select className="select" value={tableId} onChange={(e) => setTableId(e.target.value)}>
            {usable.map((u) => (
              <option key={u.id} value={u.id}>
                {u.investigation}: {u.title} ({u.n_rows})
              </option>
            ))}
          </select>
        </label>
        {table && spec && <Controls cols={cols} spec={spec} onChange={setSpec} />}
      </aside>
      <div className="builder-main">
        {loading && <Loading label="Loading the NASA table" />}
        {error && <ErrorBox message={error} />}
        {table && spec && (
          <>
            <div className="between" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
              <div>
                <h3>{title}</h3>
                <span className="tiny muted">
                  Measured · <Link to={`/explorer/${table.investigation.id}`}>{table.investigation.short}</Link> · “{table.title}”
                </span>
              </div>
              <Explain q={`Explain what this chart shows and how to read it: "${title}".`} label="Explain" />
            </div>
            <Rendered
              cols={cols} rows={table.rows} spec={spec} name={slug(title)} idKey={table.columns[0].key}
              footer={<a className="btn sm" href={table.source_url} target="_blank" rel="noreferrer">NASA file ↗</a>}
            />
            {(cols.some((c) => c.derived && [spec.x, spec.y, spec.color].includes(c.key)) || table.label_note) && (
              <details className="src">
                <summary>
                  <span className="tiny">Notes on these columns</span>
                  <span className="tiny faint">▾</span>
                </summary>
                <div className="body tiny">
                  {cols.filter((c) => c.derived && [spec.x, spec.y, spec.color].includes(c.key)).map((c) => (
                    <div key={c.key}>“{c.label}”: {c.formula}</div>
                  ))}
                  {table.label_note && <div>{table.label_note}</div>}
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- 2. upload your own CSV
const MAX_BYTES = 10 * 2 ** 20
const MAX_ROWS = 100_000

function Upload() {
  const [file, setFile] = useState<{ name: string; cols: Col[]; rows: Row[]; note?: string } | null>(null)
  const [spec, setSpec] = useState<Spec | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const [loadingSample, setLoadingSample] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const accept = (name: string, cols: Col[], rows: Row[], note?: string) => {
    if (!cols.some((c) => c.numeric)) throw new Error('No column in this file holds numbers, so there is nothing to plot.')
    setFile({ name, cols, rows, note })
    setSpec(defaults(cols.filter((c) => c.numeric).length >= 2 ? 'scatter' : 'histogram', cols))
    setError(null)
  }
  const read = async (f: File) => {
    try {
      if (f.size > MAX_BYTES) throw new Error(`The file is ${(f.size / 2 ** 20).toFixed(1)} MB; the limit is 10 MB.`)
      if (!/\.(csv|tsv|txt)$/i.test(f.name) && f.type && !/csv|text/.test(f.type)) throw new Error('Choose a .csv, .tsv or .txt file.')
      const parsed = parseCsv(await f.text())
      if (parsed.rows.length > MAX_ROWS) throw new Error(`The file has ${parsed.rows.length.toLocaleString()} rows; the limit is ${MAX_ROWS.toLocaleString()}.`)
      accept(f.name, parsed.cols, parsed.rows,
        `${parsed.rows.length.toLocaleString()} rows, ${parsed.cols.length} columns, separated by ${parsed.delimiter === '\t' ? 'tabs' : parsed.delimiter === ';' ? 'semicolons' : 'commas'}`)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const sample = async () => {
    setLoadingSample(true)
    try {
      const t = await api.table('PSI-69:1')
      accept(`NASA FLEX run log (${t.investigation.short}).csv`, tableCols(t), t.rows, 'Example: the FLEX droplet run log from NASA PSI, loaded as if it were your file')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoadingSample(false)
    }
  }

  const label = (k?: string) => file?.cols.find((c) => c.key === k)?.label ?? k ?? ''
  const title = file && spec ? (spec.type === 'histogram' ? `Distribution of ${label(spec.x)}` : spec.type === 'bar' ? `${spec.agg === 'count' ? 'Rows' : label(spec.y)} by ${label(spec.x)}` : spec.type === 'box' ? `Spread of ${label(spec.y)}` : `${label(spec.y)} against ${label(spec.x)}`) : ''
  const numeric = file?.cols.filter((c) => c.numeric) ?? []
  usePageContext('Charts', [],
    file && spec ? `The reader uploaded their own CSV "${file.name}" (${file.rows.length} rows; not NASA data unless they say so). Chart: "${title}", type ${spec.type}. Numeric columns: ${numeric.map((c) => c.label).join(', ')}. Other columns: ${file.cols.filter((c) => !c.numeric).map((c) => c.label).join(', ') || 'none'}.` : 'The reader is on the CSV upload view of the Charts page.')

  if (file && spec)
    return (
      <section className="panel builder">
        <aside className="builder-side">
          <h3>Your data</h3>
          <div className="stack-sm" style={{ gap: 4 }}>
            <b className="small" style={{ overflowWrap: 'anywhere' }}>{file.name}</b>
            <span className="tiny muted">{file.note}</span>
          </div>
          <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => { setFile(null); setSpec(null) }}>
            Choose another file
          </button>
          <Controls cols={file.cols} spec={spec} onChange={setSpec} />
        </aside>
        <div className="builder-main">
          <div className="between" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
            <div>
              <h3>{title}</h3>
              <span className="tiny muted">Your file · read in your browser, not sent to the server</span>
            </div>
            <Explain q={`I uploaded my own data and charted "${title}". Explain how to read this kind of chart and how my data could be compared with NASA's run tables.`} label="Explain" />
          </div>
          <Rendered cols={file.cols} rows={file.rows} spec={spec} name={slug(file.name.replace(/\.\w+$/, '') + '-' + title)} />
        </div>
      </section>
    )

  return (
    <section className="panel stack">
      <div>
        <h3>Upload your own CSV</h3>
        <p className="small muted" style={{ marginTop: 6 }}>Your file stays in your browser.</p>
      </div>
      <div
        className={`drop ${over ? 'over' : ''}`} role="button" tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          const f = e.dataTransfer.files[0]
          if (f) void read(f)
        }}
      >
        <span className="ic"><svg viewBox="0 0 20 20" width="20" height="20" stroke="currentColor" fill="none" aria-hidden>{ICONS.upload}</svg></span>
        <b>Drop a CSV file here, or click to choose one</b>
        <span className="small muted">First row = column names · up to 10 MB</span>
        <input ref={input} type="file" accept=".csv,.tsv,.txt,text/csv" hidden onChange={(e) => e.target.files?.[0] && void read(e.target.files[0])} />
      </div>
      <div className="row small muted">
        No file to hand?
        <button className="btn sm" onClick={() => void sample()} disabled={loadingSample}>
          {loadingSample ? 'Loading…' : 'Try NASA’s FLEX run log'}
        </button>
      </div>
      {error && <ErrorBox message={error} />}
    </section>
  )
}

// ---------------------------------------------------------------- 3. ready-made charts
function PresetChart({ preset }: { preset: Preset }) {
  const { data: table, error, loading } = useLoad(() => api.table(preset.table_id), [preset.table_id])
  const cols = useMemo(() => (table ? tableCols(table) : []), [table])
  const spec: Spec = { type: preset.type, x: preset.x, y: preset.y, color: preset.color }
  usePageContext('Charts', table ? [table.investigation.id] : [],
    table ? `Chart: "${preset.title}". Type: ${preset.type}. Source: PSI run table "${table.title}" of ${table.investigation.short}, ${table.n_rows} rows. ${preset.what}` : '')
  return (
    <section className="panel stack">
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <div>
          <h2>{preset.title}</h2>
          {table && (
            <p className="small muted" style={{ marginTop: 4 }}>
              Measured data from <Link to={`/explorer/${table.investigation.id}`}>{table.investigation.short}</Link> · PSI run table “{table.title}” · {table.n_rows} tests
            </p>
          )}
        </div>
        <Explain q={`Explain what this chart shows and how to read it: "${preset.title}".`} label="Explain this chart" />
      </div>
      <div className="grid c2">
        <div className="small">
          <h4>What this shows</h4>
          <p style={{ marginTop: 4 }}>{preset.what}</p>
        </div>
        <div className="small">
          <h4>How to read it</h4>
          <p style={{ marginTop: 4 }}>{preset.read}</p>
        </div>
      </div>
      {loading && <Loading label="Loading the NASA table" />}
      {error && <ErrorBox message={error} />}
      {table && (
        <Rendered cols={cols} rows={table.rows} spec={spec} name={preset.id} idKey={table.columns[0].key}
          footer={<a className="btn sm" href={table.source_url} target="_blank" rel="noreferrer">Original NASA file ↗</a>} />
      )}
      {table?.label_note && <div className="tiny faint">{table.label_note}</div>}
      <Link className="small" to={`/charts?view=build&table=${encodeURIComponent(preset.table_id)}`}>Change this chart in the builder →</Link>
    </section>
  )
}

// ---------------------------------------------------------------- 4. where has NASA tested?
function EnvelopeView() {
  const { env } = useApp()
  const { data, error, loading } = useLoad<Envelope>(() => api.envelope(), [])
  usePageContext('Charts', [], 'Chart: "Where has NASA tested?" Every PSI run that reports oxygen and pressure, plotted against the cabin atmospheres of the habitats (Moon Base: 30% O2 or more at 10.2 psia or less).')

  const built = useMemo(() => {
    if (!data) return null
    // eight hues at most: the largest investigations get a colour, the rest fold into "Other"
    const count = new Map<string, number>()
    for (const p of [...data.points, ...data.oxygen_only]) count.set(p.short, (count.get(p.short) ?? 0) + 1)
    const ranked = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n)
    const colorOf = (n: string) => {
      const i = ranked.indexOf(n)
      return i >= 0 && i < SERIES.length - 1 ? SERIES[i] : MUTED
    }
    const by = new Map<string, typeof data.points>()
    for (const p of data.points) {
      if (!by.has(p.short)) by.set(p.short, [])
      by.get(p.short)!.push(p)
    }
    const traces: Data[] = [...by.entries()].sort((a, b) => ranked.indexOf(a[0]) - ranked.indexOf(b[0])).map(([name, pts]) => ({
      type: 'scatter', mode: 'markers', name: `${name} (${pts.length})`,
      x: pts.map((p) => p.oxygen), y: pts.map((p) => p.pressure),
      text: pts.map((p) => `${p.material ?? 'fuel not listed'} · ${p.fuel_state}`),
      marker: { size: 8, opacity: 0.8, color: colorOf(name), line: { width: 1, color: '#fcfcfb' } },
      hovertemplate: `%{text}<br>O₂: %{x:.1f}%<br>Pressure: %{y:.2f} atm<extra>${name}</extra>`,
    }))
    const seen = new Set<string>()
    const shapes: Partial<Shape>[] = []
    const annotations: NonNullable<Layout['annotations']> = []
    for (const e of data.environments) {
      const key = `${e.oxygen.join()}|${e.pressure.join()}`
      const active = e.id === env
      if (seen.has(key) && !active) continue
      seen.add(key)
      shapes.push({
        type: 'rect', x0: e.oxygen[0], x1: e.oxygen[1], y0: e.pressure[0], y1: e.pressure[1], layer: 'below',
        fillcolor: active ? 'rgba(11,11,11,0.08)' : 'rgba(137,135,129,0.06)',
        line: { color: active ? INK : '#c3c2b7', width: active ? 2 : 1, dash: active ? 'solid' : 'dot' },
      })
      if (active)
        annotations.push({
          x: e.oxygen[1], y: e.pressure[0], xanchor: 'left', yanchor: 'top', showarrow: true, ax: 46, ay: 34,
          arrowcolor: INK, text: `<b>${e.name}</b>`, font: { size: 12, color: INK },
        })
    }
    const layout: Partial<Layout> = {
      xaxis: { title: { text: 'Oxygen (% by volume)' }, range: [8, 90] },
      yaxis: { title: { text: 'Pressure (atm)' }, range: [0.2, 3.4] },
      shapes, annotations, showlegend: true,
    }
    const names = [...new Set(data.oxygen_only.map((p) => p.short))]
    const strip: Data[] = names.map((n) => {
      const pts = data.oxygen_only.filter((p) => p.short === n)
      return {
        type: 'scatter', mode: 'markers', name: `${n} (${pts.length})`, x: pts.map((p) => p.oxygen), y: pts.map(() => n),
        text: pts.map((p) => p.material ?? ''), marker: { size: 10, opacity: 0.7, symbol: 'line-ns-open', color: colorOf(n), line: { width: 2, color: colorOf(n) } },
        hovertemplate: `%{text}<br>O₂: %{x:.1f}%<extra>${n}</extra>`,
      }
    })
    const cur = data.environments.find((e) => e.id === env)
    const stripLayout: Partial<Layout> = {
      xaxis: { title: { text: 'Oxygen (% by volume)' }, range: [8, 90] },
      yaxis: { title: { text: '' } }, showlegend: false, margin: { l: 110, r: 20, t: 10, b: 50 },
      shapes: cur ? [{ type: 'rect', xref: 'x', yref: 'paper', x0: cur.oxygen[0], x1: cur.oxygen[1], y0: 0, y1: 1, layer: 'below', fillcolor: 'rgba(11,11,11,0.07)', line: { width: 0 } }] : [],
    }
    const solidHit = !!cur && [...data.points, ...data.oxygen_only].some(
      (p) => p.fuel_state === 'solid' && p.oxygen >= cur.oxygen[0] && p.oxygen <= cur.oxygen[1],
    )
    return { traces, layout, strip, stripLayout, cur, solidHit }
  }, [data, env])

  return (
    <section className="panel stack">
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <div>
          <h2>Where has NASA tested?</h2>
          <p className="small muted" style={{ marginTop: 4 }}>
            Every test in the PSI run tables that reports an oxygen level, set against the cabin atmospheres of the habitats.
          </p>
        </div>
        <Explain q="Explain the 'Where has NASA tested?' chart: how far do the microgravity tests reach toward a Moon Base atmosphere, and for which kinds of fuel?" label="Explain this chart" />
      </div>
      {loading && <Loading label="Collecting every test" />}
      {error && <ErrorBox message={error} />}
      {data && built && (
        <>
          <div className="grid c2">
            <div className="small">
              <h4>What this shows</h4>
              <p style={{ marginTop: 4 }}>{data.explain}</p>
            </div>
            <div className="small">
              <h4>How to read it</h4>
              <p style={{ marginTop: 4 }}>
                The solid black box is the atmosphere of the habitat you selected ({built.cur?.name}). Points inside or near
                it are tests at relevant conditions. Hover a point to see the fuel: many of the oxygen-rich points are gas
                flames and liquid droplets rather than solid cabin materials.
              </p>
            </div>
          </div>
          <Plot data={built.traces} layout={built.layout} height={520} name="where-has-nasa-tested" />
          <p className="small muted">
            {data.points.length} tests report both oxygen and pressure. Dotted boxes are the other habitats:
          </p>
          <div className="pills">
            {data.environments.map((e) => (
              <span key={e.id} className={`pill ${e.id === env ? 'ink' : ''}`} title={e.atmosphere_basis}>
                {e.name}: {e.oxygen[0]} to {e.oxygen[1]}% O₂, {e.pressure[0].toFixed(2)} to {e.pressure[1].toFixed(2)} atm
              </span>
            ))}
          </div>
          {data.notes.map((n) => (
            <div key={n} className="banner warn small">
              Note: {n}
            </div>
          ))}
          <h3>Tests that report oxygen but no pressure</h3>
          <p className="small muted">
            {data.oxygen_only.length} tests, mostly solid materials (BASS-II, Saffire). The shaded band is the oxygen range
            of {built.cur?.name}.{' '}
            {built.solidHit ? 'Some solid-material tests fall inside it.' : 'No solid-material test in the collection falls inside it: a research gap.'}
          </p>
          <Plot data={built.strip} layout={built.stripLayout} height={Math.max(200, 70 + 34 * built.strip.length)} name="oxygen-only-tests" />
          <div className="row">
            <button
              className="btn sm"
              onClick={() =>
                csvDownload('psi-test-envelope.csv', ['investigation', 'accession', 'run table', 'oxygen_pct', 'pressure_atm', 'fuel_or_material', 'fuel_state'],
                  [...data.points, ...data.oxygen_only].map((p) => [p.short, p.id, p.table_id, p.oxygen, p.pressure ?? '', p.material ?? '', p.fuel_state]))
              }
            >
              Download all plotted tests (CSV)
            </button>
            <Link className="btn sm" to="/explorer?o2_min=30">
              Experiments tested at 30% oxygen or more →
            </Link>
          </div>
        </>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- page
export default function Charts() {
  const [sp, setSp] = useSearchParams()
  const { data, error, loading } = useLoad(() => api.tables(), [])
  const view: View =
    sp.get('view') === 'envelope' ? 'envelope'
      : sp.get('view') === 'upload' ? 'upload'
        : sp.get('preset') ? 'preset'
          : 'build'
  const preset: Preset | undefined = data?.presets.find((p) => p.id === sp.get('preset')) ?? data?.presets[0]
  const initialTable = sp.get('table') ?? data?.tables.find((t) => t.investigation_id === sp.get('inv') && t.numeric_columns > 0)?.id
  const nTables = data?.tables.filter((t) => t.numeric_columns >= 1 && t.n_rows >= 5).length

  const actions: { id: View; icon: keyof typeof ICONS; title: string; text: string; tag?: string; go: () => void }[] = [
    { id: 'build', icon: 'scatter', title: 'Build your own chart', text: `${nTables ?? '…'} NASA run tables`, go: () => setSp({ view: 'build' }) },
    { id: 'upload', icon: 'upload', title: 'Upload your CSV', text: 'Your own data', go: () => setSp({ view: 'upload' }) },
    { id: 'preset', icon: 'star', title: 'Ready-made charts', text: `${data?.presets.length ?? '…'} key results`, go: () => setSp({ preset: preset?.id ?? '' }) },
    { id: 'envelope', icon: 'map', title: 'Where has NASA tested?', text: 'Every test vs. habitats', go: () => setSp({ view: 'envelope' }) },
  ]

  return (
    <div className="page stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h1>Charts</h1>
        <p>
          Chart NASA’s measured test data, or your own.
        </p>
      </div>

      <div className="chart-actions" role="tablist" aria-label="Chart tools">
        {actions.map((a) => (
          <button key={a.id} role="tab" aria-selected={view === a.id} className={`chart-action ${view === a.id ? 'on' : ''}`} onClick={a.go}>
            <span className="ic"><Icon k={a.icon} /></span>
            <span className="txt">
              <b>{a.title}</b>
              <span>{a.text}</span>
            </span>
          </button>
        ))}
      </div>

      {loading && <Loading label="Loading the run tables" />}
      {error && <ErrorBox message={error} />}
      {data && (
        <>
          {view === 'build' && <NasaBuilder key={initialTable ?? 'default'} tables={data.tables} presets={data.presets} initial={initialTable} />}
          {view === 'upload' && <Upload />}
          {view === 'envelope' && <EnvelopeView />}
          {view === 'preset' && preset && (
            <div className="chart-wrap">
              <aside className="stack-sm">
                <h4>Ready-made charts</h4>
                {data.presets.map((p) => (
                  <button key={p.id} className={`preset ${preset.id === p.id ? 'active' : ''}`} onClick={() => setSp({ preset: p.id })}>
                    <b>{p.title}</b>
                    <span>{p.investigation}</span>
                  </button>
                ))}
              </aside>
              <PresetChart key={preset.id} preset={preset} />
            </div>
          )}
          <Link to="/whatif" className="panel tight feature" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <b>Predictions & What-If</b>
            <span aria-hidden>→</span>
          </Link>
        </>
      )}
    </div>
  )
}
