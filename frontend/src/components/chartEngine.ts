import type { Data, Layout } from 'plotly.js-dist-min'
import { MUTED, SERIES } from './Plot'

// One chart engine for every data source on the Charts page: NASA run tables, the reader's own
// CSV file, and the ready-made presets. Columns are described once; the engine turns a spec into
// Plotly traces and keeps the plotted rows for download.

export type ChartType = 'scatter' | 'line' | 'bar' | 'histogram' | 'box'
export type Col = { key: string; label: string; numeric: boolean; distinct?: number; derived?: boolean; formula?: string }
export type Row = Record<string, string>
export type Spec = { type: ChartType; x: string; y?: string; color?: string; agg?: 'mean' | 'sum' | 'count' }

export const TYPES: { id: ChartType; label: string; needs: string }[] = [
  { id: 'scatter', label: 'Scatter', needs: 'two measurements' },
  { id: 'line', label: 'Line', needs: 'a measurement over another' },
  { id: 'bar', label: 'Bar', needs: 'a measure per category' },
  { id: 'histogram', label: 'Histogram', needs: 'one measurement' },
  { id: 'box', label: 'Box plot', needs: 'spread per group' },
]

export const num = (s: string | undefined) => {
  if (s === undefined) return null
  const t = s.trim().replace(/,(?=\d{3}\b)/g, '')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

// "Yes" and "yes" are the same answer typed two ways in a source; group them.
export const groupLabel = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '(blank)')

/** Columns that make a sensible colour / group: few distinct values. */
export const groupable = (cols: Col[]) => cols.filter((c) => (c.distinct ?? 99) <= 12 && (c.distinct ?? 0) >= 2)

/** The valid choices for each slot of a chart type. */
export function slots(type: ChartType, cols: Col[]) {
  const numeric = cols.filter((c) => c.numeric)
  const groups = groupable(cols)
  switch (type) {
    case 'scatter':
    case 'line':
      return { x: numeric, y: numeric, color: groups }
    case 'histogram':
      return { x: numeric, y: [] as Col[], color: groups }
    case 'bar':
      return { x: groups.length ? groups : cols.filter((c) => !c.numeric), y: numeric, color: groups }
    case 'box':
      return { x: groups, y: numeric, color: [] as Col[] }
  }
}

/** A reasonable starting spec for a type, given the columns (normalised oxygen first when it exists). */
/** Bookkeeping columns (test numbers, days, dates) make poor default axes. */
const BOOKKEEPING = /\b(day|date|test|run|id|identifier|no\.?|number|index|sample|time stamp|#)\b/i

export function defaults(type: ChartType, cols: Col[], prefer?: Partial<Spec>): Spec {
  const s = slots(type, cols)
  const pick = (list: Col[], want?: string, not?: string) => {
    const ok = list.filter((c) => c.key !== not)
    return ok.find((c) => c.key === want)?.key ?? ok.find((c) => c.key === '_oxygen')?.key
      ?? ok.find((c) => !BOOKKEEPING.test(c.label) && !c.derived)?.key ?? ok.find((c) => !BOOKKEEPING.test(c.label))?.key
      ?? ok[0]?.key ?? ''
  }
  const x = pick(s.x, prefer?.x)
  const y = s.y.length ? pick(s.y, prefer?.y, type === 'scatter' || type === 'line' ? x : undefined) : undefined
  const color = s.color.length ? (s.color.find((c) => c.key === prefer?.color)?.key ?? (type === 'box' ? undefined : s.color.find((c) => c.key !== x)?.key)) : undefined
  return { type, x, y, color, agg: type === 'bar' ? (y ? 'mean' : 'count') : undefined }
}

export function ready(spec: Spec): string | null {
  if (!spec.x && spec.type !== 'box') return 'Choose what goes on the horizontal axis.'
  if ((spec.type === 'scatter' || spec.type === 'line') && (!spec.y || spec.y === spec.x)) return 'Choose two different measurements.'
  if (spec.type === 'box' && !spec.y) return 'Choose the measurement whose spread you want to see.'
  if (spec.type === 'bar' && spec.agg !== 'count' && !spec.y) return 'Choose a measurement, or count rows.'
  return null
}

const MAX_GROUPS = 8 // the validated palette has eight hues; more groups fold into "Other"

function fold<T>(entries: [string, T[]][]): [string, T[]][] {
  entries.sort((a, b) => b[1].length - a[1].length)
  if (entries.length <= MAX_GROUPS) return entries
  const rest = entries.slice(MAX_GROUPS - 1)
  return [...entries.slice(0, MAX_GROUPS - 1), [`Other (${rest.length} groups)`, rest.flatMap((e) => e[1])]]
}

const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / (a.length || 1)

export type Built = {
  data: Data[]
  layout: Partial<Layout>
  plotted: number
  skipped: number
  header: string[]
  out: (string | number)[][]
}

export function build(cols: Col[], rows: Row[], spec: Spec, idKey?: string): Built {
  const col = (k?: string) => cols.find((c) => c.key === k)
  const cx = col(spec.x)
  const cy = col(spec.y)
  const cc = col(spec.color)
  const idCol = col(idKey) ?? cols[0]
  const xl = cx?.label ?? spec.x
  const yl = cy?.label ?? spec.y ?? ''
  type P = { x: number | string; y: number; id: string }
  const groups = new Map<string, P[]>()
  let skipped = 0
  const needsXNum = spec.type === 'scatter' || spec.type === 'line' || spec.type === 'histogram'
  for (const r of rows) {
    const xv = needsXNum ? num(r[spec.x]) : groupLabel((r[spec.x] ?? '').trim())
    const yv = spec.type === 'histogram' || (spec.type === 'bar' && spec.agg === 'count') ? 0 : num(r[spec.y ?? ''])
    if (xv === null || yv === null) {
      skipped++
      continue
    }
    const g = spec.color ? groupLabel((r[spec.color] ?? '').trim()) : 'All rows'
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g)!.push({ x: spec.type === 'box' && !spec.x ? 'All rows' : xv, y: yv, id: r[idCol?.key ?? ''] ?? '' })
  }
  const entries = fold([...groups.entries()])
  const plotted = entries.reduce((s, e) => s + e[1].length, 0)
  const single = entries.length === 1
  const color = (i: number, name: string) => (name.startsWith('Other (') ? MUTED : SERIES[i % SERIES.length])
  const ring = { width: 1, color: '#fcfcfb' }

  let data: Data[] = []
  let ytitle = yl
  if (spec.type === 'scatter' || spec.type === 'line') {
    data = entries.map(([name, ps], i) => {
      const sorted = spec.type === 'line' ? [...ps].sort((a, b) => (a.x as number) - (b.x as number)) : ps
      return {
        type: 'scatter', mode: spec.type === 'line' ? 'lines+markers' : 'markers', name: single ? yl : `${name} (${ps.length})`,
        x: sorted.map((p) => p.x), y: sorted.map((p) => p.y), text: sorted.map((p) => `${idCol?.label ?? 'Row'}: ${p.id || '–'}`),
        marker: { size: 8, opacity: 0.85, color: color(i, name), line: ring },
        line: { width: 2, color: color(i, name) },
        hovertemplate: `%{text}<br>${xl}: %{x}<br>${yl}: %{y}<extra>${single ? '' : name}</extra>`,
      } as Data
    })
  } else if (spec.type === 'histogram') {
    ytitle = 'Number of rows'
    data = entries.map(([name, ps], i) => ({
      type: 'histogram', name: single ? xl : `${name} (${ps.length})`, x: ps.map((p) => p.x), opacity: 0.9,
      marker: { color: color(i, name), line: { width: 1, color: '#fcfcfb' } },
      hovertemplate: `${xl}: %{x}<br>Rows: %{y}<extra>${single ? '' : name}</extra>`,
    }) as Data)
  } else if (spec.type === 'bar') {
    const cats = [...new Set(entries.flatMap(([, ps]) => ps.map((p) => String(p.x))))]
    cats.sort((a, b) => {
      const na = Number(a), nb = Number(b)
      return Number.isFinite(na) && Number.isFinite(nb) ? na - nb : a.localeCompare(b)
    })
    const how = spec.agg ?? 'mean'
    ytitle = how === 'count' ? 'Number of rows' : `${how === 'mean' ? 'Average' : 'Total'} ${yl}`
    data = entries.map(([name, ps], i) => {
      const vals = cats.map((c) => {
        const ys = ps.filter((p) => String(p.x) === c).map((p) => p.y)
        if (!ys.length) return null
        return how === 'count' ? ys.length : how === 'sum' ? ys.reduce((s, v) => s + v, 0) : Number(mean(ys).toPrecision(4))
      })
      return {
        type: 'bar', name: single ? ytitle : name, x: cats, y: vals,
        marker: { color: color(i, name), line: { width: 0 } },
        hovertemplate: `${xl}: %{x}<br>${ytitle}: %{y}<extra>${single ? '' : name}</extra>`,
      } as Data
    })
  } else {
    // box: one box per x group, coloured by the same group when there are few
    const byX = new Map<string, number[]>()
    for (const [, ps] of entries) for (const p of ps) {
      const k = String(p.x)
      if (!byX.has(k)) byX.set(k, [])
      byX.get(k)!.push(p.y)
    }
    const xs = fold([...byX.entries()])
    data = xs.map(([name, ys], i) => ({
      type: 'box', name, y: ys, boxpoints: ys.length <= 60 ? 'all' : 'outliers', jitter: 0.35, pointpos: 0,
      marker: { color: color(i, name), size: 5, opacity: 0.7 }, line: { color: color(i, name), width: 1.5 },
      fillcolor: 'rgba(0,0,0,0)', hovertemplate: `${name}<br>${yl}: %{y}<extra></extra>`,
    }) as Data)
  }

  const layout: Partial<Layout> = {
    xaxis: { title: { text: spec.type === 'box' ? (cx?.label ?? '') : xl } },
    yaxis: { title: { text: ytitle } },
    barmode: spec.type === 'histogram' ? 'stack' : 'group',
    bargap: 0.18,
    showlegend: spec.type !== 'box' && !single,
  }

  const header = [idCol?.label ?? 'row', xl, ...(spec.type === 'histogram' || (spec.type === 'bar' && spec.agg === 'count') ? [] : [yl]), cc?.label ?? 'group']
  const out = entries.flatMap(([name, ps]) =>
    ps.map((p) => [p.id, p.x, ...(header.length === 4 ? [p.y] : []), name] as (string | number)[]))
  return { data, layout, plotted, skipped, header, out }
}

export function csvDownload(name: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const text = [header, ...rows].map((r) => r.map(esc).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** CSV / TSV / semicolon text to rows. Handles quoted fields, escaped quotes and CRLF. */
export function parseCsv(text: string): { cols: Col[]; rows: Row[]; delimiter: string } {
  const clean = text.replace(/^﻿/, '')
  const firstLine = clean.slice(0, clean.indexOf('\n') === -1 ? undefined : clean.indexOf('\n'))
  const delimiter = ['\t', ';', ','].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0]
  const table: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === delimiter) { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((c) => c.trim() !== '')) table.push(row)
      row = []
    } else field += ch
  }
  row.push(field)
  if (row.some((c) => c.trim() !== '')) table.push(row)
  if (table.length < 2) throw new Error('The file needs a header row and at least one data row.')

  const used = new Map<string, number>()
  const head = table[0].map((h, i) => {
    let label = h.trim() || `Column ${i + 1}`
    const n = used.get(label) ?? 0
    used.set(label, n + 1)
    if (n) label = `${label} (${n + 1})`
    return label
  })
  const rows: Row[] = table.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])))
  const cols: Col[] = head.map((h) => {
    const vals = rows.map((r) => r[h]).filter((v) => v !== '')
    const nums = vals.filter((v) => num(v) !== null).length
    return { key: h, label: h, numeric: vals.length > 0 && nums / vals.length >= 0.8, distinct: new Set(vals.map((v) => v.toLowerCase())).size }
  })
  return { cols, rows, delimiter }
}
