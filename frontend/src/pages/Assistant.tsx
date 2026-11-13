import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, plainCitations, type AskScope, type ChatMessage, type Library, type SourceKind, type TaskId } from '../api'
import AnswerView, { Writing } from '../components/AnswerView'
import { ErrorBox } from '../components/bits'
import { useApp, usePageContext } from '../ctx'

const STARTERS = [
  'Which experiments tested oxygen levels a Moon Base would use, and on what kind of fuel?',
  'Is there any partial-gravity combustion data? What is the closest thing?',
]

const TASKS: { id: TaskId; name: string; what: string }[] = [
  { id: 'ask', name: 'Ask', what: 'Any question, answered from the NASA library with a citation on every statement.' },
  { id: 'findings', name: 'Findings brief', what: 'What one experiment tested and found, from its NASA report, in a fixed five-part layout.' },
  { id: 'compare', name: 'Compare evidence', what: 'Two to four experiments on one topic, in a table, with what the comparison cannot show.' },
  { id: 'design', name: 'Design evidence review', what: 'For a habitat and a topic: what NASA’s evidence supports, cautions against, and does not cover.' },
  { id: 'explain', name: 'Explain a term', what: 'A term defined, preferring NASA’s own wording, with the experiments that involve it.' },
]

const KINDS: { kind: SourceKind; label: string; tip: string }[] = [
  { kind: 'report', label: 'NASA reports', tip: 'Final and post-flight reports and theses: measured results and conclusions' },
  { kind: 'analysed', label: 'Analysed data', tip: 'Summary sheets of individual tests with measured values' },
  { kind: 'science_doc', label: 'Science documents', tip: 'Science requirements, test matrices, manuals: what was planned' },
  { kind: 'record', label: 'PSI records', tip: 'NASA’s description of each investigation: objective, approach, hypothesis, publications' },
  { kind: 'conditions', label: 'Run-table conditions', tip: 'Test conditions computed from NASA’s experimental run tables' },
  { kind: 'resource', label: 'NASA resources', tip: 'The official NASA resources for the challenge: the Researcher’s Guide, the Combustion Science page and fact sheets, the Apollo 1, Apollo 13 and Mir pages, the Spinoff articles and the ScienceCast transcript' },
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

export default function Assistant() {
  const { meta } = useApp()
  const [sp, setSp] = useSearchParams()
  const [messages, setMessages] = useState<ChatMessage[]>(load)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [live, setLive] = useState('') // the answer while it is being written
  const [error, setError] = useState<string | null>(null)
  const [audience, setAudience] = useState<'student' | 'researcher'>('researcher')
  const [task, setTask] = useState<TaskId>('ask')
  const [lib, setLib] = useState<Library | null>(null)
  const [kindsOff, setKindsOff] = useState<SourceKind[]>([])
  const [only, setOnly] = useState<string[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [one, setOne] = useState('')
  const [topic, setTopic] = useState('')
  const [habitat, setHabitat] = useState('moon')
  const [pdfBusy, setPdfBusy] = useState(false)
  const [showDocs, setShowDocs] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const sentParam = useRef<string | null>(null)

  usePageContext('AI Research Assistant')

  useEffect(() => {
    api.library().then(setLib).catch(() => undefined)
  }, [messages.length])
  useEffect(() => {
    sessionStorage.setItem('fif.chat', JSON.stringify(messages))
  }, [messages])
  useEffect(() => {
    if (messages.length || busy) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, busy])

  const invs = meta?.investigations ?? []
  const name = (id: string) => invs.find((i) => i.id === id)?.short ?? id
  const kinds = lib?.kinds ?? []
  const scopeKinds = kindsOff.length ? kinds.map((k) => k.kind).filter((k) => !kindsOff.includes(k)) : []
  const inScope = useMemo(() => {
    if (!lib) return null
    if (!kindsOff.length && !only.length) return lib.passages
    return null // counted by the server per answer; shown there
  }, [lib, kindsOff, only])

  const send = async (question: string, as: TaskId = 'ask', scope?: AskScope) => {
    const q = question.trim()
    if (!q || busy) return
    const history = messages
    setMessages([...history, { role: 'user', content: q, task: as }])
    setText('')
    setBusy(true)
    setError(null)
    setLive('')
    try {
      const answer = await api.askStream({
        question: q, history, audience, task: as,
        scope: scope ?? { ids: only, kinds: scopeKinds },
      }, setLive)
      setMessages((m) => [...m, { role: 'assistant', content: plainCitations(answer), mode: answer.mode, answer }])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
      setLive('')
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

  const runTask = () => {
    if (task === 'findings' && one) {
      void send(`Findings brief for ${name(one)} (${one}): what was tested, under which conditions, and what was found.`, 'findings',
        { ids: [one], kinds: scopeKinds })
    } else if (task === 'compare' && picked.length >= 2) {
      void send(`Compare ${picked.map((id) => `${name(id)} (${id})`).join(', ')}${topic.trim() ? ` on: ${topic.trim()}` : ''}.`, 'compare',
        { ids: picked, kinds: scopeKinds })
    } else if (task === 'design' && topic.trim()) {
      const env = meta?.environments.find((e) => e.id === habitat)
      if (env) void send(`For a ${env.name} (${env.atmosphere_label}; ${env.g_label}): what does NASA's evidence say about ${topic.trim()}?`, 'design')
    } else if (task === 'explain' && topic.trim()) {
      void send(`Explain the term "${topic.trim()}".`, 'explain')
    } else if (task === 'ask') {
      void send(text)
    }
  }
  const ready =
    task === 'ask' ? !!text.trim() : task === 'findings' ? !!one : task === 'compare' ? picked.length >= 2 : !!topic.trim()

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
  const docKinds = kinds.filter((k) => ['report', 'analysed', 'science_doc'].includes(k.kind))
  const docPassages = docKinds.reduce((n, k) => n + k.passages, 0)
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  return (
    <div className="page">
      <div className="page-head">
        <h1>AI Research Assistant</h1>
        <p>
          Answers from NASA’s records, reports and test data, with the document and page behind every statement.
        </p>
      </div>
      {meta && !meta.llm.available && (
        <div className="banner warn" style={{ marginBottom: 16 }}>
          {meta.llm.configured ? (
            <span>
              <b>The AI key was not accepted.</b> {meta.llm.last_error} Until it is fixed you will get retrieval-only
              answers: the most relevant NASA passages, quoted with their sources. Correct the key in{' '}
              <code>backend/.env</code> and restart the backend.
            </span>
          ) : (
            <span>
              <b>No AI model is connected.</b> You will get retrieval-only answers: the most relevant NASA passages,
              quoted with their sources, without a written explanation. Add an AI key to <code>backend/.env</code> and
              restart the backend (see the README).
            </span>
          )}
        </div>
      )}

      <section className="panel tight facts" aria-label="What the assistant works from">
        <div>
          <b>{lib ? lib.documents.length : '–'}</b>
          <span>NASA documents, read page by page</span>
        </div>
        <div>
          <b>{lib ? docPassages.toLocaleString() : '–'}</b>
          <span>passages searched</span>
        </div>
        <div>
          <b>Cited</b>
          <span>every statement, to its document and page</span>
        </div>
        <div>
          <b>Checked</b>
          <span>citations and numbers, in code</span>
        </div>
      </section>

      <div className="chat">
        <div>
          <section className="panel tight stack-sm workbench">
            <div className="tabs" style={{ marginBottom: 0 }}>
              {TASKS.map((t) => (
                <button key={t.id} className={`tab ${task === t.id ? 'active' : ''}`} onClick={() => setTask(t.id)} title={t.what}>
                  {t.name}
                </button>
              ))}
            </div>
            <p className="small muted" style={{ margin: 0 }}>{TASKS.find((t) => t.id === task)?.what}</p>

            {task === 'findings' && (
              <label className="field">
                Experiment
                <select className="select" value={one} onChange={(e) => setOne(e.target.value)}>
                  <option value="">Choose an experiment…</option>
                  {invs.map((i) => {
                    const n = lib?.documents.filter((d) => d.investigation_id === i.id).length ?? 0
                    return (
                      <option key={i.id} value={i.id}>
                        {i.short} {n ? `· ${n} NASA document${n === 1 ? '' : 's'} indexed` : '· PSI record only'}
                      </option>
                    )
                  })}
                </select>
              </label>
            )}
            {task === 'compare' && (
              <div className="stack-sm">
                <div className="field">Experiments (two to four)</div>
                <div className="chips">
                  {invs.map((i) => (
                    <button
                      key={i.id}
                      className={`chip ${picked.includes(i.id) ? 'on' : ''}`}
                      disabled={!picked.includes(i.id) && picked.length >= 4}
                      onClick={() => setPicked(toggle(picked, i.id))}
                    >
                      {i.short}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {task === 'design' && (
              <label className="field">
                Habitat
                <select className="select" value={habitat} onChange={(e) => setHabitat(e.target.value)}>
                  {meta?.environments.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} · {e.atmosphere_label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {(task === 'compare' || task === 'design' || task === 'explain') && (
              <label className="field">
                {task === 'compare' ? 'Topic (optional)' : task === 'design' ? 'Design topic' : 'Term'}
                <input
                  className="input" value={topic} onChange={(e) => setTopic(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && ready && !busy && runTask()}
                  placeholder={task === 'compare' ? 'e.g. how airflow changes flame spread' : task === 'design' ? 'e.g. choosing cabin fabrics, smoke detector placement' : 'e.g. cool flame, limiting oxygen index'}
                />
              </label>
            )}
            {task === 'ask' && (
              <textarea
                className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    runTask()
                  }
                }}
                placeholder="Ask a question about NASA fire and combustion research…" aria-label="Your question"
              />
            )}

            <details className="scope" open={kindsOff.length > 0 || only.length > 0}>
              <summary className="small">
                <b>Search scope:</b>{' '}
                {kindsOff.length || only.length
                  ? `${only.length ? only.map(name).join(', ') : 'all experiments'} · ${kinds.length - kindsOff.length} of ${kinds.length} kinds of source`
                  : `everything${inScope ? ` (${inScope.toLocaleString()} passages)` : ''}`}
              </summary>
              <div className="stack-sm" style={{ marginTop: 8 }}>
                <div className="chips">
                  {KINDS.filter((k) => kinds.some((x) => x.kind === k.kind)).map((k) => (
                    <button
                      key={k.kind} title={k.tip}
                      className={`chip ${kindsOff.includes(k.kind) ? '' : 'on'}`}
                      onClick={() => setKindsOff(kindsOff.includes(k.kind) ? kindsOff.filter((x) => x !== k.kind) : kindsOff.length < kinds.length - 1 ? [...kindsOff, k.kind] : kindsOff)}
                    >
                      {kindsOff.includes(k.kind) ? '○' : '●'} {k.label} · {kinds.find((x) => x.kind === k.kind)?.passages.toLocaleString()}
                    </button>
                  ))}
                </div>
                {(task === 'ask' || task === 'design' || task === 'explain') && (
                  <label className="field">
                    Only these experiments
                    <select className="select" value="" onChange={(e) => e.target.value && setOnly(toggle(only, e.target.value))}>
                      <option value="">{only.length ? 'Add another…' : 'All experiments'}</option>
                      {invs.filter((i) => !only.includes(i.id)).map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.short}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {only.length > 0 && (
                  <div className="chips">
                    {only.map((id) => (
                      <button key={id} className="chip on" onClick={() => setOnly(only.filter((x) => x !== id))}>
                        {name(id)} ✕
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </details>

            <div className="between">
              <div className="row" style={{ gap: 6 }}>
                <span className="tiny muted">Wording:</span>
                <button className={`btn sm ${audience === 'researcher' ? 'on' : ''}`} onClick={() => setAudience('researcher')}>
                  Researcher
                </button>
                <button className={`btn sm ${audience === 'student' ? 'on' : ''}`} onClick={() => setAudience('student')}>
                  Student
                </button>
              </div>
              <button className="btn primary" disabled={busy || !ready} onClick={runTask}>
                {task === 'ask' ? 'Ask' : task === 'findings' ? 'Write the brief' : task === 'compare' ? 'Compare' : task === 'design' ? 'Review the evidence' : 'Explain'}
              </button>
            </div>
          </section>

          <div className="thread" style={{ marginTop: 16 }}>
            {messages.length === 0 && (
              <div className="panel stack-sm">
                <h4>Questions that show what it can do</h4>
                <div className="chips">
                  {STARTERS.map((s) => (
                    <button key={s} className="chip" onClick={() => void send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="msg-user">
                  {m.content}
                </div>
              ) : (
                <div key={i} className="msg-ai">
                  {m.answer && <AnswerView answer={m.answer} onFollowUp={(q) => void send(q)} />}
                </div>
              ),
            )}
            {busy && live && (
              <div className="msg-ai">
                <Writing text={live} />
              </div>
            )}
            {busy && !live && (
              <div className="loading">
                <span className="spinner" /> Searching {lib ? lib.passages.toLocaleString() : ''} NASA passages, writing, then checking each citation…
              </div>
            )}
            {error && <ErrorBox message={error} />}
            <div ref={endRef} />
          </div>
        </div>

        <aside className="stack">
          <section className="panel tight stack-sm">
            <h4>Report</h4>
            <button className="btn" onClick={download} disabled={!hasAnswer || pdfBusy}>
              {pdfBusy ? 'Building the PDF…' : 'Download this session (PDF)'}
            </button>
            <p className="tiny faint" style={{ margin: 0 }}>
              Every question and answer with a reference list of the NASA sources cited.
            </p>
            {messages.length > 0 && (
              <button className="btn sm ghost" onClick={() => setMessages([])}>
                Start a new session
              </button>
            )}
            <p className="tiny faint" style={{ margin: 0 }}>A research aid, not a certified safety tool.</p>
          </section>
        </aside>
      </div>

      <details className="src" style={{ marginTop: 8 }}>
        <summary>
          <span className="small">The library the assistant reads</span>
          <span className="tiny faint">▾</span>
        </summary>
        <div className="body" style={{ maxWidth: 640 }}>
              {lib ? (
                <>
                  <div className="lib">
                    {lib.kinds.map((k) => (
                      <div key={k.kind}>
                        <span>{k.label}</span>
                        <b>{k.passages.toLocaleString()}</b>
                      </div>
                    ))}
                    <div className="total">
                      <span>Passages in total</span>
                      <b>{lib.passages.toLocaleString()}</b>
                    </div>
                  </div>
                  <p className="tiny muted" style={{ margin: 0 }}>
                    Searched by {lib.search_mode}. {lib.documents.length} NASA documents for {lib.experiments_with_documents} of {meta?.combustion_investigations} experiments;
                    the other {lib.experiments_without.length} have their PSI record and run tables only.
                    {lib.resources && lib.resources.length > 0 && (
                      <>
                        {' '}
                        Also read: the other {lib.resources.length} official NASA resources for the challenge (
                        {lib.resources.reduce((n, r) => n + r.documents.length, 0)} documents).{' '}
                        <Link to="/resources">See them →</Link>
                      </>
                    )}
                  </p>
                  <button className="btn sm" onClick={() => setShowDocs((s) => !s)}>
                    {showDocs ? 'Hide the document list' : 'Show the NASA documents'}
                  </button>
                  {showDocs && (
                    <div className="doclist tiny">
                      {lib.documents.filter((d) => d.kind !== 'analysed').map((d) => (
                        <a key={d.id} href={d.url} target="_blank" rel="noreferrer" title={`${d.kind_label} · ${d.pages} pages, ${d.pages_used} with readable text`}>
                          <b>{d.short}</b> {d.title} <span className="faint">· {d.pages} p.</span>
                        </a>
                      ))}
                      {(lib.resources ?? []).flatMap((r) =>
                        r.documents.map((d) => (
                          <a key={r.id + d.title} href={d.url} target="_blank" rel="noreferrer" title={`Official NASA resource · ${d.passages} passages`}>
                            <b>{r.short}</b> {d.title} {d.pages ? <span className="faint">· {d.pages} p.</span> : null}
                          </a>
                        )),
                      )}
                      <span className="faint">
                        plus {lib.documents.filter((d) => d.kind === 'analysed').length} one-page test summary sheets (CFI).
                        {lib.not_usable.length > 0 && ` Not readable or not downloadable: ${lib.not_usable.length} files.`}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <p className="tiny muted">Loading…</p>
              )}
        </div>
      </details>
    </div>
  )
}
