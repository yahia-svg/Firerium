import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, plainCitations, type Answer, type AskScope, type ChatMessage, type Library, type SourceKind, type TaskId } from '../api'
import AnswerView, { Writing } from '../components/AnswerView'
import { ErrorBox } from '../components/bits'
import { useApp, usePageContext } from '../ctx'

const STARTERS = [
  { title: 'Moon Base oxygen', q: 'Which experiments tested oxygen levels a Moon Base would use, and on what kind of fuel?' },
  { title: 'Partial gravity', q: 'Is there any partial-gravity combustion data? What is the closest thing?' },
]

// The five things the assistant can do. The text box stays the same; only what it asks for changes.
const TASKS: { id: TaskId; name: string; hint: string; placeholder: string }[] = [
  { id: 'ask', name: 'Ask', hint: 'Any question, cited to the NASA library', placeholder: 'Ask anything about fire in space…' },
  { id: 'findings', name: 'Findings brief', hint: 'What one experiment tested and found', placeholder: 'Focus (optional)' },
  { id: 'compare', name: 'Compare', hint: 'Two to four experiments, side by side', placeholder: 'Compare them on… (optional)' },
  { id: 'design', name: 'Design review', hint: 'What the evidence says for a habitat', placeholder: 'Design topic, e.g. cabin fabrics' },
  { id: 'explain', name: 'Explain a term', hint: 'A definition in NASA’s own words', placeholder: 'A term, e.g. cool flame' },
]

const KINDS: { kind: SourceKind; label: string; tip: string }[] = [
  { kind: 'report', label: 'NASA reports', tip: 'Final and post-flight reports and theses: measured results and conclusions' },
  { kind: 'analysed', label: 'Analysed data', tip: 'Summary sheets of individual tests with measured values' },
  { kind: 'science_doc', label: 'Science documents', tip: 'Science requirements, test matrices, manuals: what was planned' },
  { kind: 'record', label: 'PSI records', tip: 'NASA’s description of each investigation' },
  { kind: 'conditions', label: 'Run tables', tip: 'Test conditions computed from NASA’s experimental run tables' },
  { kind: 'resource', label: 'NASA resources', tip: 'The official NASA resources for the challenge' },
  { kind: 'challenge', label: 'Challenge text', tip: 'The NASA Space Apps challenge description' },
  { kind: 'project', label: 'Project summaries', tip: 'Plain-language summaries written by this project, not by NASA' },
]

function load(): ChatMessage[] {
  try {
    const saved = JSON.parse(sessionStorage.getItem('fif.chat') ?? '[]') as ChatMessage[]
    // answers saved by an earlier version of the site have no evidence list
    return saved.every((m) => m.role === 'user' || m.answer?.refs) ? saved : []
  } catch {
    return []
  }
}

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const SendIcon = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
  </svg>
)
const ScopeIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
    <path d="M2 4h12M4.5 8h7M7 12h2" />
  </svg>
)

export default function Assistant() {
  const { meta } = useApp()
  const [sp, setSp] = useSearchParams()
  const [messages, setMessages] = useState<ChatMessage[]>(load)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  // the answer being written: `target` is what has arrived, `shown` how much of it is on screen
  const [target, setTarget] = useState('')
  const [shown, setShown] = useState(0)
  const [pending, setPending] = useState<Answer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [audience, setAudience] = useState<'student' | 'researcher'>('researcher')
  const [task, setTask] = useState<TaskId>('ask')
  const [lib, setLib] = useState<Library | null>(null)
  const [kindsOff, setKindsOff] = useState<SourceKind[]>([])
  const [only, setOnly] = useState<string[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [one, setOne] = useState('')
  const [habitat, setHabitat] = useState('moon')
  const [pdfBusy, setPdfBusy] = useState(false)
  const [scopeOpen, setScopeOpen] = useState(false)
  const [showDocs, setShowDocs] = useState(false)
  const [below, setBelow] = useState(false) // more of the conversation is below the text box
  const endRef = useRef<HTMLDivElement>(null)
  const lastUserRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLTextAreaElement>(null)
  const scopeRef = useRef<HTMLDivElement>(null)
  const streamed = useRef('')
  const sentParam = useRef<string | null>(null)
  const empty = messages.length === 0 && !busy

  usePageContext('AI Research Assistant')

  useEffect(() => {
    api.library().then(setLib).catch(() => undefined)
  }, [])
  useEffect(() => {
    try {
      sessionStorage.setItem('fif.chat', JSON.stringify(messages))
    } catch {
      /* storage can be blocked; the chat still works */
    }
  }, [messages])

  // When a question is sent, bring it to the top of the screen and let the answer write below it.
  // The page never jumps to the bottom on its own.
  useEffect(() => {
    if (messages[messages.length - 1]?.role !== 'user') return
    requestAnimationFrame(() => {
      const el = lastUserRef.current
      if (!el) return
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 118, behavior: reduceMotion() ? 'auto' : 'smooth' })
    })
  }, [messages.length])

  // Writing: reveal the text a few characters per frame, faster when more is waiting, so bursts
  // from the network still read as steady writing.
  useEffect(() => {
    if (shown >= target.length) return
    // no animation for reduced motion or a hidden tab (it would only delay the answer)
    if (reduceMotion() || document.hidden) {
      setShown(target.length)
      return
    }
    const id = window.setTimeout(
      () => setShown((s) => Math.min(target.length, s + Math.max(2, Math.ceil((target.length - s) / 45)))),
      16,
    )
    return () => window.clearTimeout(id)
  }, [shown, target])

  // Once the checked answer is in and the writing has caught up, swap in the full answer.
  useEffect(() => {
    if (!pending || shown < target.length) return
    const answer = pending
    setMessages((m) => [...m, { role: 'assistant', content: plainCitations(answer), mode: answer.mode, answer }])
    setPending(null)
    setTarget('')
    setShown(0)
    setBusy(false)
  }, [pending, shown, target])

  // the ↓ button: shown while the end of the conversation is hidden behind the text box
  useEffect(() => {
    const el = endRef.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setBelow(!e.isIntersecting), { rootMargin: '0px 0px -170px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [empty])

  // the text box grows with what is typed, up to a limit
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [text])
  useEffect(() => {
    boxRef.current?.focus()
  }, [task])
  // close the scope pop-up on an outside click or Escape
  useEffect(() => {
    if (!scopeOpen) return
    const click = (e: MouseEvent) => !scopeRef.current?.contains(e.target as Node) && setScopeOpen(false)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setScopeOpen(false)
    document.addEventListener('mousedown', click)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', click)
      document.removeEventListener('keydown', key)
    }
  }, [scopeOpen])

  const invs = meta?.investigations ?? []
  const name = (id: string) => invs.find((i) => i.id === id)?.short ?? id
  const kinds = lib?.kinds ?? []
  const scopeKinds = kindsOff.length ? kinds.map((k) => k.kind).filter((k) => !kindsOff.includes(k)) : []
  const scoped = kindsOff.length > 0 || only.length > 0
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const current = TASKS.find((t) => t.id === task) ?? TASKS[0]

  const send = async (question: string, as: TaskId = 'ask', scope?: AskScope) => {
    const q = question.trim()
    if (!q || busy) return
    const history = messages
    setMessages([...history, { role: 'user', content: q, task: as }])
    setText('')
    setBusy(true)
    setError(null)
    setTarget('')
    setShown(0)
    setPending(null)
    streamed.current = ''
    try {
      const answer = await api.askStream({
        question: q, history, audience, task: as,
        scope: scope ?? { ids: only, kinds: scopeKinds },
      }, (soFar) => {
        streamed.current = soFar
        setTarget(soFar)
      })
      // no stream (retrieval-only, or the fallback route): write the final text out instead
      if (!streamed.current) setTarget(answer.answer)
      setPending(answer)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
      setTarget('')
    }
  }

  // /assistant?q=... (links from the guide and other pages) asks the question once
  const qParam = sp.get('q')
  useEffect(() => {
    if (qParam && sentParam.current !== qParam) {
      sentParam.current = qParam
      setSp({}, { replace: true })
      void send(qParam)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qParam])

  const t = text.trim()
  const ready =
    task === 'ask' || task === 'design' || task === 'explain' ? !!t : task === 'findings' ? !!one : picked.length >= 2

  const submit = () => {
    if (!ready || busy) return
    setScopeOpen(false)
    if (task === 'findings') {
      void send(`Findings brief for ${name(one)} (${one}): what was tested, under which conditions, and what was found.${t ? ` Focus on: ${t}.` : ''}`, 'findings',
        { ids: [one], kinds: scopeKinds })
    } else if (task === 'compare') {
      void send(`Compare ${picked.map((id) => `${name(id)} (${id})`).join(', ')}${t ? ` on: ${t}` : ''}.`, 'compare', { ids: picked, kinds: scopeKinds })
    } else if (task === 'design') {
      const env = meta?.environments.find((e) => e.id === habitat)
      if (env) void send(`For a ${env.name} (${env.atmosphere_label}; ${env.g_label}): what does NASA's evidence say about ${t}?`, 'design')
    } else if (task === 'explain') {
      void send(`Explain the term "${t}".`, 'explain')
    } else {
      void send(t)
    }
  }

  const download = async () => {
    setPdfBusy(true)
    setError(null)
    try {
      const blob = await api.report(messages)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'flame-in-freefall-report.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPdfBusy(false)
    }
  }

  const hasAnswer = messages.some((m) => m.role === 'assistant')
  const lastUser = messages.map((m) => m.role).lastIndexOf('user')
  const scopeLabel = scoped
    ? [only.length ? only.map(name).join(', ') : null, kindsOff.length ? `${kinds.length - kindsOff.length} of ${kinds.length} sources` : null].filter(Boolean).join(' · ')
    : 'All sources'

  const renderMsg = (m: ChatMessage, i: number) =>
    m.role === 'user' ? (
      <div key={i} className="ac-msg user" ref={i === lastUser ? lastUserRef : undefined}>
        <div className="bubble">{m.content}</div>
      </div>
    ) : (
      <div key={i} className="ac-msg bot">
        <img className="avatar" src="/logo.png" alt="" width={28} height={28} />
        <div className="body">{m.answer && <AnswerView answer={m.answer} onFollowUp={(q) => void send(q)} />}</div>
      </div>
    )

  return (
    <div className="ac-page">
      {messages.length > 0 && (
        <div className="ac-head">
          <button className="btn sm ghost" onClick={download} disabled={!hasAnswer || pdfBusy}>
            {pdfBusy ? 'Building PDF…' : 'Export PDF'}
          </button>
          <button className="btn sm" onClick={() => { setMessages([]); setError(null) }} disabled={busy}>
            + New chat
          </button>
        </div>
      )}

      {meta && !meta.llm.available && (
        <div className="banner warn small">
          {meta.llm.configured ? <b>The AI key was not accepted. </b> : <b>No AI model is connected. </b>}
          Answers are the most relevant NASA passages, quoted with their sources. Add a working key to{' '}
          <code>backend/.env</code> and restart the backend.
        </div>
      )}

      <div className={`ac-thread ${empty ? 'is-empty' : ''}`}>
        {empty ? (
          <div className="ac-hello">
            <img src="/logo.png" alt="" width={44} height={44} />
            <h1>What do you want to know about fire in space?</h1>
            <p>
              Answers from {lib?.documents.length ?? 'the'} NASA documents{lib ? ` and ${lib.passages.toLocaleString()} passages` : ''}, with every
              statement cited to its document and page.
            </p>
            <div className="ac-starters">
              {STARTERS.map((s) => (
                <button key={s.q} onClick={() => void send(s.q)}>
                  <b>{s.title}</b>
                  <span>{s.q}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.slice(0, Math.max(0, lastUser)).map((m, i) => renderMsg(m, i))}
            {/* the latest turn keeps a screen of room, so the question can sit at the top while the answer is written */}
            <div className="ac-turn">
              {messages.slice(Math.max(0, lastUser)).map((m, i) => renderMsg(m, i + Math.max(0, lastUser)))}
              {busy && (
                <div className="ac-msg bot">
                  <img className="avatar" src="/logo.png" alt="" width={28} height={28} />
                  <div className="body">
                    {target ? (
                      <Writing text={target.slice(0, shown)} />
                    ) : (
                      <span className="ac-thinking">Searching NASA passages<i /><i /><i /></span>
                    )}
                  </div>
                </div>
              )}
              {error && <ErrorBox message={error} />}
              {/* marks the end of the written content (not of the empty room below it) */}
              <div ref={endRef} />
            </div>
          </>
        )}
      </div>

      <div className="ac-dock">
        {below && !empty && (
          <button
            className="ac-down" aria-label="Scroll to the end"
            onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })}
          >
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M8 3v10M3.5 8.5 8 13l4.5-4.5" />
            </svg>
          </button>
        )}

        <div className="ac-composer" ref={scopeRef}>
          {scopeOpen && (
            <div className="ac-pop" role="dialog" aria-label="Options">
              <div className="between">
                <b className="small">Wording</b>
                <div className="ac-seg" role="group" aria-label="Wording">
                  <button className={audience === 'researcher' ? 'on' : ''} onClick={() => setAudience('researcher')}>Researcher</button>
                  <button className={audience === 'student' ? 'on' : ''} onClick={() => setAudience('student')}>Student</button>
                </div>
              </div>
              <div className="between">
                <b className="small">Where to search</b>
                {scoped && <button className="btn sm ghost" onClick={() => { setKindsOff([]); setOnly([]) }}>Reset</button>}
              </div>
              <div className="chips">
                {KINDS.filter((k) => kinds.some((x) => x.kind === k.kind)).map((k) => {
                  const on = !kindsOff.includes(k.kind)
                  return (
                    <button
                      key={k.kind} title={k.tip} className={`chip ${on ? 'on' : ''}`} aria-pressed={on}
                      onClick={() => setKindsOff(on ? (kindsOff.length < kinds.length - 1 ? [...kindsOff, k.kind] : kindsOff) : kindsOff.filter((x) => x !== k.kind))}
                    >
                      {k.label}
                    </button>
                  )
                })}
              </div>
              {(task === 'ask' || task === 'design' || task === 'explain') && (
                <div className="row" style={{ gap: 6 }}>
                  <select className="select sm" value="" onChange={(e) => e.target.value && setOnly(toggle(only, e.target.value))} aria-label="Only these experiments">
                    <option value="">{only.length ? '+ Another experiment' : 'All experiments'}</option>
                    {invs.filter((i) => !only.includes(i.id)).map((i) => (
                      <option key={i.id} value={i.id}>{i.short}</option>
                    ))}
                  </select>
                  {only.map((id) => (
                    <button key={id} className="ac-tag" onClick={() => setOnly(only.filter((x) => x !== id))}>
                      {name(id)} <span aria-hidden>✕</span>
                    </button>
                  ))}
                </div>
              )}
              {lib && (
                <p className="tiny muted" style={{ margin: 0 }}>
                  {lib.passages.toLocaleString()} passages from {lib.documents.length} NASA documents, plus PSI records, run tables
                  and the <Link to="/resources">official NASA resources</Link>.{' '}
                  <button className="linkish" onClick={() => setShowDocs((s) => !s)}>{showDocs ? 'Hide documents' : 'List the documents'}</button>
                </p>
              )}
              {lib && showDocs && (
                <div className="doclist tiny">
                  {lib.documents.filter((d) => d.kind !== 'analysed').map((d) => (
                    <a key={d.id} href={d.url} target="_blank" rel="noreferrer" title={`${d.kind_label} · ${d.pages} pages`}>
                      <b>{d.short}</b> {d.title} <span className="faint">· {d.pages} p.</span>
                    </a>
                  ))}
                  {(lib.resources ?? []).flatMap((r) =>
                    r.documents.map((d) => (
                      <a key={r.id + d.title} href={d.url} target="_blank" rel="noreferrer">
                        <b>{r.short}</b> {d.title}
                      </a>
                    )),
                  )}
                  <span className="faint">plus {lib.documents.filter((d) => d.kind === 'analysed').length} one-page test summary sheets (CFI).</span>
                </div>
              )}
            </div>
          )}

          <div className="ac-card" onClick={(e) => e.target === e.currentTarget && boxRef.current?.focus()}>
            {(task === 'findings' || task === 'compare' || task === 'design') && (
              <div className="ac-ctx">
                {task === 'findings' && (
                  <select className="select sm" value={one} onChange={(e) => setOne(e.target.value)} aria-label="Experiment">
                    <option value="">Choose an experiment…</option>
                    {invs.map((i) => {
                      const n = lib?.documents.filter((d) => d.investigation_id === i.id).length ?? 0
                      return (
                        <option key={i.id} value={i.id}>
                          {i.short} {n ? `· ${n} NASA document${n === 1 ? '' : 's'}` : '· PSI record only'}
                        </option>
                      )
                    })}
                  </select>
                )}
                {task === 'compare' && (
                  <>
                    {picked.map((id) => (
                      <button key={id} className="ac-tag" onClick={() => setPicked(picked.filter((x) => x !== id))} title="Remove">
                        {name(id)} <span aria-hidden>✕</span>
                      </button>
                    ))}
                    {picked.length < 4 && (
                      <select className="select sm" value="" onChange={(e) => e.target.value && setPicked([...picked, e.target.value])} aria-label="Add an experiment">
                        <option value="">{picked.length ? '+ Add another' : '+ Add experiments (2 to 4)'}</option>
                        {invs.filter((i) => !picked.includes(i.id)).map((i) => (
                          <option key={i.id} value={i.id}>{i.short}</option>
                        ))}
                      </select>
                    )}
                  </>
                )}
                {task === 'design' && (
                  <select className="select sm" value={habitat} onChange={(e) => setHabitat(e.target.value)} aria-label="Habitat">
                    {meta?.environments.map((e) => (
                      <option key={e.id} value={e.id}>{e.name} · {e.atmosphere_label}</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div className="ac-row">
              <button
                className={`ac-opt ${scopeOpen ? 'on' : ''}`} onClick={() => setScopeOpen((s) => !s)} aria-expanded={scopeOpen}
                aria-label={`Options: ${scopeLabel}, ${audience} wording`} title={`${scopeLabel} · ${audience === 'student' ? 'Student' : 'Researcher'} wording`}
              >
                <ScopeIcon />
                {(scoped || audience === 'student') && <i className="ac-dot" aria-hidden />}
              </button>
              <textarea
                ref={boxRef} rows={1} value={text} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    submit()
                  }
                }}
                placeholder={current.placeholder} aria-label="Message"
              />
              <button className="ac-send" onClick={submit} disabled={!ready || busy} aria-label="Send" title="Send (Enter)">
                {busy ? <span className="spinner" /> : <SendIcon />}
              </button>
            </div>
          </div>

          <div className="ac-ext" role="tablist" aria-label="What the assistant should do">
            {TASKS.map((x) => (
              <button key={x.id} role="tab" aria-selected={task === x.id} className={task === x.id ? 'on' : ''} onClick={() => setTask(x.id)} title={x.hint}>
                {x.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
