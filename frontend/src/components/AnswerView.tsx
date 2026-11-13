import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Action, Answer, LedgerRow, Ref } from '../api'
import { useApp } from '../ctx'
import { Markdown, ModeBadge } from './bits'

/** Grounding says how the answer relates to NASA's research. It never reports the limits of this site. */
const GROUNDING: Record<Answer['grounding'], { label: string; cls: string; tip: string } | null> = {
  supported: { label: 'Grounded in NASA sources', cls: 'good', tip: 'Every claim is tied to a cited NASA source. See the statement check for what was verified.' },
  partial: { label: 'Grounded in NASA sources', cls: 'good', tip: 'The cited statements are tied to NASA sources. See the statement check for what was verified.' },
  not_in_collection: { label: 'Research gap', cls: 'ink', tip: 'NASA’s combustion investigations have not tested or reported this yet.' },
  off_topic: { label: 'Outside NASA fire research', cls: '', tip: 'This assistant covers NASA combustion and spacecraft fire-safety research.' },
}
const TASK_LABEL: Record<string, string> = {
  findings: 'Findings brief', compare: 'Evidence comparison', design: 'Design evidence review', explain: 'Term explained',
}
/** Colour by who wrote the source: NASA results, NASA descriptions, the project team, or nobody. */
const KIND_CLS: Record<string, string> = {
  report: 'good', analysed: 'good', record: 'accent', conditions: 'accent', index: 'accent', science_doc: 'accent',
  challenge: 'accent', resource: 'accent', project: 'warn', background: 'ai', none: '',
}
const STATUS: Record<LedgerRow['status'], { mark: string; cls: string; label: string }> = {
  verified: { mark: '✓', cls: 'good', label: 'Cited, and every number was found in the cited passage' },
  cited: { mark: '✓', cls: 'good', label: 'Cited to a source the model was given' },
  check: { mark: '!', cls: 'warn', label: 'Cited, but a number was not found as written in the cited passage. Open the source to check it (it may be a unit conversion).' },
  background: { mark: 'i', cls: 'ai', label: 'General background from the model, not from NASA' },
  uncited: { mark: '·', cls: '', label: 'The assistant’s own remark, with no source' },
}

/** The answer while the model is still writing it. Source tags ([S3]) are hidden until the checked
    answer arrives with its numbered references. */
export function Writing({ text }: { text: string }) {
  const clean = text.replace(/\s?\[S\d+(?:\s*,\s*S\d+)*\]/g, '').replace(/\s?\[PSI-\d+\]/g, '')
  return (
    <div className="writing" aria-live="polite">
      <Markdown text={clean} />
      <span className="caret" aria-hidden />
      <span className="tiny faint">Writing… then each citation is checked</span>
    </div>
  )
}

export function actionTarget(a: Action, env: string): string {
  switch (a.type) {
    case 'open':
      return `/explorer/${a.ids[0]}`
    case 'compare':
      return `/compare?ids=${a.ids.join(',')}`
    case 'rank':
      return `/ranking?env=${env}`
    case 'charts':
      return a.ids[0] ? `/charts?inv=${a.ids[0]}` : '/charts'
    case 'insights':
      return '/insights'
  }
}

const ICON: Record<Action['type'], string> = { open: '→', compare: '⇄', rank: '↕', charts: '∿', insights: '§' }

/** A reference list a researcher can paste into notes. */
function referenceText(a: Answer): string {
  return a.refs
    .map((r) => {
      const link = r.file_url ?? r.psi ?? ''
      if (r.kind === 'resource')
        return `[${r.n}] NASA, ${r.name}. ${r.document ? `${r.document}${r.page ? `, p. ${r.page}` : `, ${r.section}`}` : r.section}.${link ? ` ${link}` : ''}`
      return `[${r.n}] NASA Physical Sciences Informatics, ${r.id === 'CHALLENGE' ? 'NASA Space Apps challenge description' : `${r.id} ${r.name}`}. ${r.kind_label}: ${r.document ? `${r.document}${r.page ? `, p. ${r.page}` : ''}` : r.section}.${link ? ` ${link}` : ''}${r.doi ? ` Dataset: ${r.doi}` : ''}`
    })
    .join('\n')
}

function Verification({ a }: { a: Answer }) {
  const c = a.checks
  if (!c.statements) return null
  const numbersOk = c.numbers === c.numbers_found
  return (
    <div className="verify" title="Counted in code after the answer was written. Open “Statement check” for each line.">
      <div>
        <b>
          {c.nasa_cited}/{c.statements}
        </b>
        <span>statements cite NASA</span>
      </div>
      <div className={c.numbers ? (numbersOk ? 'ok' : 'warn') : ''}>
        <b>{c.numbers ? `${c.numbers_found}/${c.numbers}` : '–'}</b>
        <span>numbers found in the cited passage</span>
      </div>
      <div>
        <b>{a.refs.length}</b>
        <span>passages cited{a.refs.some((r) => r.page) ? ', with page numbers' : ''}</span>
      </div>
      <div className={c.removed_citations ? 'warn' : ''}>
        <b>{c.removed_citations}</b>
        <span>citations removed as unverifiable</span>
      </div>
    </div>
  )
}

function Evidence({ r, open, anchor, onNavigate }: { r: Ref; open: boolean; anchor: string; onNavigate?: () => void }) {
  const nav = useNavigate()
  const [more, setMore] = useState(false)
  const long = r.text.length > 560
  return (
    <div id={anchor} className={`evi ${open ? 'hit' : ''}`}>
      <div className="evi-head">
        <span className="refnum">{r.n}</span>
        <span className={`pill ${KIND_CLS[r.kind]}`}>{r.kind_label}</span>
        <b>{r.short}</b>
        <span className="muted tiny grow">
          {r.document ? `${r.document}${r.page ? ` · page ${r.page}` : ''}` : r.section}
        </span>
      </div>
      <div className="evi-text">
        {more || !long ? r.text : r.text.slice(0, 560) + '…'}{' '}
        {long && (
          <button className="linkish" onClick={() => setMore((m) => !m)}>
            {more ? 'less' : 'more'}
          </button>
        )}
      </div>
      <div className="row tiny">
        {r.file_url && (
          <a href={r.file_url} target="_blank" rel="noreferrer" title={r.kind === 'resource' ? 'Open the NASA page, PDF page or video time this passage was read from' : 'Download the NASA file this passage was read from'}>
            {r.kind === 'resource' ? 'Open the NASA source' : 'NASA file'}
            {r.page ? ` (go to p. ${r.page})` : ''} ↗
          </a>
        )}
        {r.psi && (
          <a href={r.psi} target="_blank" rel="noreferrer">
            NASA PSI page ↗
          </a>
        )}
        {r.doi && (
          <a href={r.doi} target="_blank" rel="noreferrer">
            Dataset DOI ↗
          </a>
        )}
        {r.id.startsWith('PSI-') && (
          <a
            href={`/explorer/${r.id}`}
            onClick={(e) => {
              e.preventDefault()
              onNavigate?.()
              nav(`/explorer/${r.id}`)
            }}
          >
            Experiment profile →
          </a>
        )}
        {r.id.startsWith('RES-') && (
          <a
            href={`/resources#${r.id}`}
            onClick={(e) => {
              e.preventDefault()
              onNavigate?.()
              nav(`/resources#${r.id}`)
            }}
          >
            About this NASA resource →
          </a>
        )}
      </div>
    </div>
  )
}

export default function AnswerView({
  answer, compact = false, onFollowUp, onNavigate,
}: {
  answer: Answer
  compact?: boolean
  onFollowUp: (q: string) => void
  onNavigate?: () => void
}) {
  const nav = useNavigate()
  const { env } = useApp()
  const uid = useId()
  const [tab, setTab] = useState<'evidence' | 'check' | 'trace' | null>(compact ? null : 'evidence')
  const [hit, setHit] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const g = GROUNDING[answer.grounding]
  const t = answer.trace
  const flagged = answer.ledger.filter((s) => s.status === 'check').length

  const showRef = (n: number) => {
    setTab('evidence')
    setHit(n)
    setTimeout(() => document.getElementById(`${uid}-ref-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
  }
  const copyRefs = async () => {
    try {
      await navigator.clipboard.writeText(referenceText(answer))
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard not available: the references are visible in the Evidence tab */
    }
  }

  return (
    <>
      <div className="pills">
        <ModeBadge mode={answer.mode} model={answer.model} />
        {g && (
          <span className={`pill ${g.cls}`} title={g.tip}>
            {g.label}
          </span>
        )}
        {TASK_LABEL[answer.task] && <span className="pill">{TASK_LABEL[answer.task]}</span>}
      </div>
      {answer.notice && <div className="banner warn small">{answer.notice}</div>}
      {!compact && <Verification a={answer} />}
      <Markdown text={answer.answer} refs={answer.refs} onRef={showRef} />
      {answer.research_gap && (
        <div className="limits gap small">
          <b>Research gap: </b>
          {answer.research_gap}
        </div>
      )}
      {answer.removed_citations.length > 0 && (
        <div className="banner warn tiny">
          {answer.removed_citations.length} citation(s) were removed because they did not point at a source the model was given.
        </div>
      )}

      {answer.refs.length > 0 && (
        <div className="stack-sm">
          <div className="tabs" style={{ marginBottom: 0 }}>
            <button className={`tab ${tab === 'evidence' ? 'active' : ''}`} onClick={() => setTab(tab === 'evidence' ? null : 'evidence')}>
              Evidence ({answer.refs.length})
            </button>
            <button className={`tab ${tab === 'check' ? 'active' : ''}`} onClick={() => setTab(tab === 'check' ? null : 'check')}>
              Statement check ({answer.ledger.length}){flagged ? ` · ${flagged} to look at` : ''}
            </button>
            {!compact && (
              <button className={`tab ${tab === 'trace' ? 'active' : ''}`} onClick={() => setTab(tab === 'trace' ? null : 'trace')}>
                How this was built
              </button>
            )}
            <span className="grow" />
            {!compact && (
              <button className="btn sm ghost" onClick={copyRefs} title="Copy the reference list with NASA links">
                {copied ? 'Copied' : 'Copy references'}
              </button>
            )}
          </div>

          {tab === 'evidence' && (
            <div className="stack-sm">
              {answer.refs.map((r) => (
                <Evidence key={r.n} r={r} open={hit === r.n} anchor={`${uid}-ref-${r.n}`} onNavigate={onNavigate} />
              ))}
            </div>
          )}

          {tab === 'check' && (
            <div className="ledger">
              <p className="tiny muted" style={{ margin: '0 0 6px' }}>
                Each statement of the answer, the kind of source behind it, and whether its numbers appear in the passage it
                cites. This is checked in code after the model writes; the model does not grade itself.
              </p>
              {answer.ledger.map((s, i) => (
                <div key={i} className="ledger-row">
                  <span className={`mark ${STATUS[s.status].cls}`} title={STATUS[s.status].label}>
                    {STATUS[s.status].mark}
                  </span>
                  <div className="grow">
                    <div className="small">{s.text}</div>
                    <div className="row tiny" style={{ gap: 6, marginTop: 4 }}>
                      <span className={`pill ${KIND_CLS[s.basis]}`}>{s.basis_label}</span>
                      {s.refs.map((n) => (
                        <button key={n} className="refchip" onClick={() => showRef(n)}>
                          {n}
                        </button>
                      ))}
                      {s.numbers.map((n, j) => (
                        <span key={j} className={`pill ${n.found ? 'good' : 'warn'}`} title={n.found ? 'This number is in the cited passage' : 'Not found as written in the cited passage'}>
                          {n.found ? '✓' : '!'} {n.text}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'trace' && (
            <div className="trace small">
              <div>
                <b>1. Search.</b> {t.searched.toLocaleString()} passages searched by {t.search_mode}
                {t.scope.ids.length || t.scope.kinds.length ? ' inside the scope you chose' : ''}:{' '}
                {Object.entries(t.searched_by_kind).map(([k, n]) => `${n.toLocaleString()} ${k}`).join(', ')}.
              </div>
              <div>
                <b>2. Given to the model.</b> {t.given.length} passages and the {t.index_lines}-line collection index.
                <ol className="tiny muted" style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                  {t.given.map((p) => (
                    <li key={p.sid}>
                      {p.short} · {p.kind_label} · {p.section}
                    </li>
                  ))}
                </ol>
              </div>
              <div>
                <b>3. Written{answer.mode === 'ai' ? ` by ${t.model ?? answer.model}` : ' without a model (passages quoted)'}.</b>{' '}
                {t.seconds} s in total.
              </div>
              <div>
                <b>4. Checked.</b> {answer.checks.cited} of {answer.checks.statements} statements carry a citation;{' '}
                {answer.checks.numbers_found} of {answer.checks.numbers} numbers with units were found in the cited passages;{' '}
                {answer.checks.removed_citations} citation(s) removed.
              </div>
            </div>
          )}
        </div>
      )}

      {answer.actions.length > 0 && (
        <div className="stack-sm">
          <h4>Continue in the dashboard</h4>
          <div className="chips">
            {answer.actions.map((a, i) => (
              <button
                key={i}
                className="chip"
                onClick={() => {
                  onNavigate?.()
                  nav(actionTarget(a, env))
                }}
              >
                {ICON[a.type]} {a.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {answer.follow_ups.length > 0 && (
        <div className="stack-sm">
          {!compact && <h4>You could ask next</h4>}
          <div className="chips">
            {answer.follow_ups.slice(0, compact ? 1 : 2).map((q) => (
              <button key={q} className="chip" onClick={() => onFollowUp(q)}>
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
