import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fmtRange, PILLAR_LABEL, type Card, type Conditions, type Evidence, type Ref } from '../api'
import { useApp } from '../ctx'

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" /> {label}…
    </div>
  )
}

export function ErrorBox({ message }: { message: string }) {
  return <div className="banner bad">{message}</div>
}

export const NotReported = () => <span className="nr">Not reported</span>

export function Pillars({ pillars }: { pillars: string[] }) {
  return (
    <>
      {pillars.map((p) => (
        <span key={p} className={`pill ${p}`}>
          {PILLAR_LABEL[p] ?? p}
        </span>
      ))}
    </>
  )
}

export function CondGrid({ c }: { c: Conditions }) {
  const item = (label: string, v: Conditions['oxygen']) => (
    <div title={v ? v.sources.map((s) => (s.type === 'run_table' ? 'PSI run table' : 'PSI record text')).join(', ') : 'Not reported in the PSI record or run table'}>
      <span>{label}</span>
      <b className={v ? '' : 'nr'}>{fmtRange(v)}</b>
    </div>
  )
  return (
    <div className="cond">
      {item('Oxygen', c.oxygen)}
      {item('Pressure', c.pressure)}
      {item('Airflow', c.airflow)}
    </div>
  )
}

/** Citation chip: links an in-text [PSI-25] to that experiment's profile, and [RES-5] to that NASA resource. */
export function Cite({ id }: { id: string }) {
  const { shortName } = useApp()
  if (id === 'CHALLENGE')
    return (
      <span className="cite plain" title="NASA Space Apps challenge description">
        NASA challenge
      </span>
    )
  if (id.startsWith('RES-'))
    return (
      <Link className="cite res" to={`/resources#${id}`} title="Official NASA resource for the challenge. Open it on the NASA Resources page.">
        {shortName(id)}
      </Link>
    )
  return (
    <Link className="cite" to={`/explorer/${id}`} title={`Open ${id} in the Research Explorer`}>
      {shortName(id)}
    </Link>
  )
}

const CITE_RE = /\[(PSI-\d+|RES-\d+|CHALLENGE)\]/g

/** "BASS-II [PSI-25]" would render the name twice (text + chip); keep only the chip. */
function dedupe(text: string, shortName: (id: string) => string): string {
  let out = ''
  let last = 0
  for (const m of text.matchAll(/\[(PSI-\d+)\]/g)) {
    let head = text.slice(last, m.index)
    const name = shortName(m[1])
    const trimmed = head.replace(/[\s(]+$/, '')
    if (name && trimmed.toLowerCase().endsWith(name.toLowerCase())) {
      head = trimmed.slice(0, trimmed.length - name.length)
    }
    out += head + m[0]
    last = m.index + m[0].length
  }
  return out + text.slice(last)
}

/** Plain text with [PSI-n] tags turned into citation chips. */
export function Cited({ text: raw }: { text: string }) {
  const { shortName } = useApp()
  const text = dedupe(raw, shortName)
  const parts: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(CITE_RE)) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    parts.push(<Cite key={`${m.index}`} id={m[1]} />)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

/** Markdown answer with citation chips. Numbered citations ([#3]) open their passage through `onRef`. */
export function Markdown({ text, refs, onRef }: { text: string; refs?: Ref[]; onRef?: (n: number) => void }) {
  const { shortName } = useApp()
  const prepared = dedupe(text, shortName)
    .replace(CITE_RE, (_, id: string) => `[${id}](#cite-${id})`)
    .replace(/\[#(\d+)\]/g, (_, n: string) => `[${n}](#ref-${n})`)
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children }) {
            if (href?.startsWith('#cite-')) return <Cite id={href.slice(6)} />
            if (href?.startsWith('#ref-')) {
              const n = Number(href.slice(5))
              const r = refs?.find((x) => x.n === n)
              return (
                <button
                  className="refchip"
                  onClick={() => onRef?.(n)}
                  title={r ? `${r.short} · ${r.kind_label}: ${r.document ? `${r.document}${r.page ? `, p. ${r.page}` : ''}` : r.section}` : undefined}
                >
                  {n}
                </button>
              )
            }
            return (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            )
          },
        }}
      >
        {prepared}
      </ReactMarkdown>
    </div>
  )
}

export function Quote({ e }: { e: Evidence }) {
  return (
    <blockquote className="quote">
      “{e.quote}”
      <footer>
        {e.source === 'CHALLENGE' ? (
          <>NASA challenge description, “{e.label}”</>
        ) : e.source.startsWith('RES-') ? (
          <>
            <Link to={`/resources#${e.source}`}>{e.short}</Link>, official NASA resource
            {e.label && e.label !== e.title ? `: ${e.label}` : ''}
            {e.url && (
              <>
                {' · '}
                <a href={e.url} target="_blank" rel="noreferrer">
                  Open the NASA source ↗
                </a>
              </>
            )}
          </>
        ) : (
          <>
            <Link to={`/explorer/${e.source}`}>{e.short}</Link> ({e.source}), PSI record: {e.label}
            {e.url && (
              <>
                {' · '}
                <a href={e.url} target="_blank" rel="noreferrer">
                  NASA PSI page ↗
                </a>
              </>
            )}
          </>
        )}
      </footer>
    </blockquote>
  )
}

/** "Explain this" button: opens the inline AI panel with a ready question. */
export function Explain({ q, label = 'Explain this' }: { q: string; label?: string }) {
  const { openAsk } = useApp()
  return (
    <button className="explain-btn" onClick={() => openAsk(q)} title="Ask the AI assistant about this">
      ✦ {label}
    </button>
  )
}

export function CompareToggle({ id }: { id: string }) {
  const { compare, toggleCompare } = useApp()
  const on = compare.includes(id)
  const full = !on && compare.length >= 4
  return (
    <button
      className={`btn sm ${on ? 'on' : ''}`}
      onClick={() => toggleCompare(id)}
      disabled={full}
      title={full ? 'You can compare up to four investigations' : on ? 'Remove from comparison' : 'Add to comparison'}
    >
      {on ? '✓ In comparison' : '+ Compare'}
    </button>
  )
}

export function InvCard({ inv, extra }: { inv: Card; extra?: ReactNode }) {
  return (
    <article className="panel tight inv-card">
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <h3>
            <Link to={`/explorer/${inv.id}`}>{inv.short}</Link>
          </h3>
          <div className="sub">
            {inv.id} · {inv.gravity.label}
            {inv.platform ? ` · ${inv.platform}` : ''}
          </div>
        </div>
        <CompareToggle id={inv.id} />
      </div>
      <p className="small">{inv.summary}</p>
      <div className="pills">
        <Pillars pillars={inv.pillars} />
        {inv.fuel_state.map((f) => (
          <span key={f} className="pill">
            {f}
          </span>
        ))}
        {inv.materials.slice(0, 4).map((m) => (
          <span key={m} className="pill">
            {m}
          </span>
        ))}
        {inv.materials.length > 4 && <span className="pill">+{inv.materials.length - 4}</span>}
      </div>
      <CondGrid c={inv.conditions} />
      <div className="between tiny muted">
        <span>{inv.n_runs ? `${inv.n_runs} test rows in PSI run tables` : 'No run table in PSI'}</span>
        <span className="row" style={{ gap: 12 }}>
          <a href={inv.links.psi} target="_blank" rel="noreferrer">
            NASA PSI ↗
          </a>
          <Link to={`/explorer/${inv.id}`}>Details →</Link>
        </span>
      </div>
      {extra}
    </article>
  )
}

export function ModeBadge({ mode, model }: { mode: string; model?: string | null }) {
  if (mode === 'ai')
    return (
      <span className="pill ai" title={model ? `Written by ${model} from the NASA sources shown` : undefined}>
        ✦ AI-written from NASA sources
      </span>
    )
  if (mode === 'computed') return <span className="pill accent">Computed from the database</span>
  return (
    <span className="pill warn" title="No AI model is connected. Passages are quoted, not interpreted.">
      Retrieval only · no AI model connected
    </span>
  )
}
