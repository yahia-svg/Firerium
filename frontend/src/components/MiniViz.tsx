import type { ReactNode } from 'react'
import { imageUrl, type SaffireRow } from '../api'

// Small, light charts for the insight pages: plain HTML and SVG, no chart library.
// Colour is used for data only (the validated categorical order); everything else is ink.

export type BarDatum = { label: string; value: number; tip?: string }

/** One measure per row: horizontal bars sharing one scale. */
export function MiniBars({ title, note, data, max, unit = '', color = 'var(--s1)' }: {
  title: string; note?: ReactNode; data: BarDatum[]; max?: number; unit?: string; color?: string
}) {
  const top = max ?? Math.max(1, ...data.map((d) => d.value))
  return (
    <figure className="mini" style={{ margin: 0 }}>
      <div className="mini-head">
        <b>{title}</b>
        {note && <span className="tiny muted">{note}</span>}
      </div>
      <div className="mini-bars" role="list">
        {data.map((d) => (
          <div key={d.label} className="mini-bar" role="listitem" data-tip={d.tip ?? `${d.label}: ${d.value}${unit}`}>
            <span className="lbl" title={d.label}>{d.label}</span>
            <span className="trk">
              <i style={{ width: `${(d.value / top) * 100}%`, background: color, borderRadius: d.value >= top ? 3 : '0 3px 3px 0' }} />
            </span>
            <span className="v">{d.value}{unit}</span>
          </div>
        ))}
      </div>
    </figure>
  )
}

/** Parts of a whole per row, with a legend (never colour alone: every segment has a tooltip and a total). */
export function StackedBars({ title, note, series, rows }: {
  title: string
  note?: ReactNode
  series: string[]
  rows: { label: string; values: number[] }[]
}) {
  const top = Math.max(1, ...rows.map((r) => r.values.reduce((a, b) => a + b, 0)))
  return (
    <figure className="mini" style={{ margin: 0 }}>
      <div className="mini-head">
        <b>{title}</b>
        {note && <span className="tiny muted">{note}</span>}
      </div>
      <div className="legend">
        {series.map((s, i) => (
          <span key={s}>
            <i style={{ background: `var(--s${i + 1})` }} />
            {s}
          </span>
        ))}
      </div>
      <div className="mini-bars" role="list">
        {rows.map((r) => {
          const total = r.values.reduce((a, b) => a + b, 0)
          return (
            <div
              key={r.label}
              className="mini-bar"
              role="listitem"
              data-tip={series.map((s, i) => `${s} ${r.values[i]}`).join(' · ')}
              style={{ gridTemplateColumns: 'minmax(120px, 1.1fr) minmax(0, 2fr) 40px' }}
            >
              <span className="lbl" title={r.label}>{r.label}</span>
              <span className="trk" style={{ background: 'transparent' }}>
                <span style={{ display: 'flex', gap: 2, width: `${(total / top) * 100}%`, height: '100%' }}>
                  {r.values.map((v, i) =>
                    v > 0 ? (
                      <i key={i} style={{ flex: v, background: `var(--s${i + 1})`, borderRadius: i === 0 ? '3px 0 0 3px' : 0 }} />
                    ) : null,
                  )}
                </span>
              </span>
              <span className="v">{total}</span>
            </div>
          )
        })}
      </div>
    </figure>
  )
}

/** "n of 24" tiles: how much of the collection reports something. */
export function Kpi({ value, of, label }: { value: number; of?: number; label: string }) {
  return (
    <div className="kpi">
      <b>
        {value}
        {of !== undefined && <span className="of"> / {of}</span>}
      </b>
      <span>{label}</span>
      {of !== undefined && (
        <span className="contrib" style={{ height: 6, marginTop: 6 }} aria-hidden>
          <i style={{ width: `${(value / of) * 100}%`, background: 'var(--ink)', borderRadius: 3 }} />
        </span>
      )}
    </div>
  )
}

/** The candle, drawn: a tall buoyant teardrop on Earth, a small sphere in free fall. */
export function FlameDiagram() {
  return (
    <div className="flame-diagram" role="img" aria-label="A candle flame on Earth is a tall teardrop drawn upward by rising hot gas; in microgravity it is a small sphere fed by diffusion.">
      <div>
        <svg viewBox="0 0 160 170" aria-hidden>
          <defs>
            <marker id="arr" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0 0 L8 4 L0 8 z" fill="#898781" />
            </marker>
          </defs>
          <path d="M80 18 C 96 52, 104 82, 100 104 C 97 120, 89 128, 80 128 C 71 128, 63 120, 60 104 C 56 82, 64 52, 80 18 Z" fill="#eda100" opacity="0.28" stroke="#0b0b0b" strokeWidth="1.5" />
          <path d="M80 62 C 88 82, 91 98, 88 110 C 86 118, 83 121, 80 121 C 77 121, 74 118, 72 110 C 69 98, 72 82, 80 62 Z" fill="#2a78d6" opacity="0.35" />
          <rect x="74" y="128" width="12" height="34" fill="#fcfcfb" stroke="#0b0b0b" strokeWidth="1.5" />
          <line x1="80" y1="124" x2="80" y2="132" stroke="#0b0b0b" strokeWidth="2" />
          <path d="M30 150 C 40 140, 50 130, 58 112" fill="none" stroke="#898781" strokeWidth="1.3" markerEnd="url(#arr)" />
          <path d="M130 150 C 120 140, 110 130, 102 112" fill="none" stroke="#898781" strokeWidth="1.3" markerEnd="url(#arr)" />
          <path d="M80 14 L 80 2" stroke="#898781" strokeWidth="1.3" markerEnd="url(#arr)" />
        </svg>
        <b>On Earth (1 g)</b>
        <span>Hot gas rises and pulls fresh air in at the base: a tall, flickering teardrop.</span>
      </div>
      <div>
        <svg viewBox="0 0 160 170" aria-hidden>
          <circle cx="80" cy="84" r="38" fill="#2a78d6" opacity="0.2" stroke="#0b0b0b" strokeWidth="1.5" />
          <circle cx="80" cy="84" r="22" fill="#2a78d6" opacity="0.2" />
          <rect x="74" y="122" width="12" height="40" fill="#fcfcfb" stroke="#0b0b0b" strokeWidth="1.5" />
          <line x1="80" y1="98" x2="80" y2="124" stroke="#0b0b0b" strokeWidth="2" />
          {[0, 60, 120, 180, 240, 300].map((a) => {
            const r = (a * Math.PI) / 180
            return (
              <line key={a} x1={80 + Math.cos(r) * 66} y1={84 + Math.sin(r) * 66} x2={80 + Math.cos(r) * 46} y2={84 + Math.sin(r) * 46}
                stroke="#898781" strokeWidth="1.3" strokeDasharray="3 3" markerEnd="url(#arr)" />
            )
          })}
        </svg>
        <b>In microgravity</b>
        <span>Nothing rises. A small blue sphere, fed only as fast as oxygen diffuses in, or as a fan blows it.</span>
      </div>
    </div>
  )
}

const outcome = (s: string): 'none' | 'part' | 'full' =>
  /complete/i.test(s) ? 'full' : /^~?\s*0\b/.test(s.trim()) ? 'none' : 'part'

function Mark({ kind }: { kind: 'none' | 'part' | 'full' }) {
  const label = kind === 'full' ? 'Burned completely' : kind === 'part' ? 'Burned part of the sample' : 'Did not spread (about 0)'
  return (
    <span title={label} aria-label={label} style={{ display: 'inline-grid', placeItems: 'center', width: 18, height: 18 }}>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
        {kind === 'full' && <circle cx="7" cy="7" r="6" fill="#0b0b0b" />}
        {kind === 'part' && (
          <>
            <circle cx="7" cy="7" r="5.5" fill="none" stroke="#0b0b0b" strokeWidth="1.5" />
            <path d="M7 1.5 A5.5 5.5 0 0 1 7 12.5 Z" fill="#0b0b0b" />
          </>
        )}
        {kind === 'none' && <circle cx="7" cy="7" r="5.5" fill="none" stroke="#898781" strokeWidth="1.5" />}
      </svg>
    </span>
  )
}

/** Saffire-II: the same samples burned in orbit and on Earth, read from NASA's own wording. */
export function GravityOutcomes({ rows }: { rows: SaffireRow[] }) {
  return (
    <figure className="mini" style={{ margin: 0 }}>
      <div className="mini-head">
        <b>Same sample, two gravities (Saffire-II)</b>
        <span className="tiny muted">read from the PSI sample table</span>
      </div>
      <div className="legend">
        <span><Mark kind="full" /> burned completely</span>
        <span><Mark kind="part" /> burned in part</span>
        <span><Mark kind="none" /> did not spread</span>
      </div>
      <div className="scroll-x">
        <table className="data" style={{ fontSize: '0.8rem' }}>
          <thead>
            <tr>
              <th>Sample</th>
              <th>Material</th>
              <th style={{ textAlign: 'center' }}>Microgravity</th>
              <th style={{ textAlign: 'center' }}>Earth (1 g)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sample}>
                <td className="num">{r.sample}</td>
                <td>{r.material}</td>
                <td style={{ textAlign: 'center' }} title={r.micro_burn}><Mark kind={outcome(r.micro_burn)} /> <span className="tiny muted">{r.micro_burn}</span></td>
                <td style={{ textAlign: 'center' }} title={r.earth_burn}><Mark kind={outcome(r.earth_burn)} /> <span className="tiny muted">{r.earth_burn}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}

/** A NASA photo: from an experiment's PSI record (`id`) or a NASA fact sheet saved in /img (`src`). */
export function Photo({ id, src, caption, wide = false, alt = '', contain = false }: {
  id?: string; src?: string; caption: ReactNode; wide?: boolean; alt?: string; contain?: boolean
}) {
  return (
    <figure className={`photo ${wide ? 'wide' : ''}`}>
      <img src={src ?? imageUrl(id ?? '')} alt={alt} loading="lazy" decoding="async" style={contain ? { objectFit: 'contain' } : undefined} />
      <figcaption>{caption}</figcaption>
    </figure>
  )
}

/** Tested ranges on one axis, with a target band shaded (e.g. which oxygen levels were burned vs. a Moon Base). */
export function RangeChart({ title, note, rows, band, max, unit }: {
  title: string
  note?: ReactNode
  rows: { label: string; min: number; max: number; tip?: string }[]
  band?: { from: number; to: number; label: string }
  max: number
  unit: string
}) {
  const pct = (v: number) => `${(Math.min(max, Math.max(0, v)) / max) * 100}%`
  const ticks = Array.from({ length: Math.floor(max / 10) + 1 }, (_, i) => i * 10)
  return (
    <figure className="mini" style={{ margin: 0 }}>
      <div className="mini-head">
        <b>{title}</b>
        {note && <span className="tiny muted">{note}</span>}
      </div>
      <div className="range">
        {band && (
          <div className="range-band" style={{ left: `calc(var(--rl) + (100% - var(--rl)) * ${band.from / max})`, width: `calc((100% - var(--rl)) * ${(band.to - band.from) / max})` }}>
            <span>{band.label}</span>
          </div>
        )}
        {rows.map((r) => (
          <div key={r.label} className="range-row" title={r.tip ?? `${r.label}: ${r.min} to ${r.max}${unit}`}>
            <span className="lbl">{r.label}</span>
            <span className="trk">
              <i style={{ left: pct(r.min), width: `calc(${pct(r.max)} - ${pct(r.min)})` }} />
            </span>
          </div>
        ))}
        <div className="range-row axis" aria-hidden>
          <span className="lbl" />
          <span className="trk">
            {ticks.map((t) => (
              <em key={t} style={{ left: pct(t) }}>{t}{t === max ? unit : ''}</em>
            ))}
          </span>
        </div>
      </div>
    </figure>
  )
}

/** The SAME hypothesis, drawn: in 1 g buoyant flow keeps smoke particles small and many;
    in microgravity they linger and grow into fewer, larger ones. A sketch of the stated hypothesis, not data. */
export function SmokeDiagram() {
  const small = [[14, 30], [30, 18], [46, 34], [22, 52], [40, 62], [58, 20], [64, 48], [16, 78], [34, 86], [52, 80], [70, 70], [76, 36], [28, 40], [60, 92], [44, 14]]
  const big = [[26, 34, 9], [58, 30, 11], [40, 68, 12], [72, 70, 8]]
  return (
    <figure className="mini smoke" style={{ margin: 0 }}>
      <div className="mini-head">
        <b>Smoke particles: the SAME hypothesis</b>
        <span className="tiny muted">sketch, not data</span>
      </div>
      <div className="flame-diagram">
        <div>
          <svg viewBox="0 0 90 100" aria-hidden>
            {small.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3" fill="#898781" />)}
            <path d="M84 92 L84 14" stroke="#898781" strokeWidth="1.2" fill="none" />
            <path d="M80 18 L84 8 L88 18 Z" fill="#898781" />
          </svg>
          <b>On Earth (1 g)</b>
          <span>Smoke rises and mixes; particles stay small and many.</span>
        </div>
        <div>
          <svg viewBox="0 0 90 100" aria-hidden>
            {big.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="#898781" />)}
          </svg>
          <b>In microgravity</b>
          <span>Smoke lingers; particles grow larger and fewer, which changes how a detector responds.</span>
        </div>
      </div>
    </figure>
  )
}
