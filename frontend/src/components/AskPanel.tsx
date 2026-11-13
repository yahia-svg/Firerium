import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, plainCitations, type ChatMessage } from '../api'
import { useApp } from '../ctx'
import AnswerView, { Writing } from './AnswerView'

// The research assistant as a docked side panel: part of the layout, not a chat bubble.
// It always knows the page the reader is on (page, experiments on screen, chart or comparison
// details), and the reader can select any text on the page to ask about it.

function load(): ChatMessage[] {
  try {
    const saved = JSON.parse(sessionStorage.getItem('fif.side') ?? '[]') as ChatMessage[]
    return saved.every((m) => m.role === 'user' || m.answer?.refs) ? saved : []
  } catch {
    return []
  }
}

const withQuote = (q: string, quote: string | undefined, page: string) =>
  quote ? `About this passage from the "${page}" page:\n"${quote}"\n\n${q}` : q

export default function AskPanel() {
  const { askContext, askSeed, closeAsk, shortName } = useApp()
  const [messages, setMessages] = useState<ChatMessage[]>(load)
  const [text, setText] = useState('')
  const [quote, setQuote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [live, setLive] = useState('') // the answer while it is being written
  const [error, setError] = useState<string | null>(null)
  const [audience, setAudience] = useState<'student' | 'researcher'>(() => {
    try {
      return (localStorage.getItem('fif.audience') as 'student' | 'researcher') || 'researcher'
    } catch {
      return 'researcher'
    }
  })
  const bodyRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const seenSeed = useRef(0)

  useEffect(() => {
    try {
      sessionStorage.setItem('fif.side', JSON.stringify(messages.slice(-20)))
    } catch {
      /* storage full or blocked: the conversation simply is not kept */
    }
  }, [messages])

  const send = async (question: string, q?: string | null) => {
    const asked = question.trim()
    if (!asked || busy) return
    const passage = (q ?? quote ?? undefined) || undefined
    const history = messages
    setMessages([...history, { role: 'user', content: asked, quote: passage }])
    setText('')
    setQuote(null)
    setBusy(true)
    setError(null)
    setLive('')
    try {
      const answer = await api.askStream({
        question: withQuote(asked, passage, askContext.page),
        history: history.map((m) => ({ role: m.role, content: m.role === 'user' ? withQuote(m.content, m.quote, askContext.page) : m.content })),
        context: askContext, audience,
      }, setLive)
      setMessages((m) => [...m, { role: 'assistant', content: plainCitations(answer), mode: answer.mode, answer }])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
      setLive('')
    }
  }

  useEffect(() => {
    if (!askSeed || askSeed.nonce === seenSeed.current) return
    seenSeed.current = askSeed.nonce
    if (askSeed.question) void send(askSeed.question, askSeed.quote)
    else if (askSeed.quote) {
      setQuote(askSeed.quote)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askSeed])

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, busy])

  // grow the input with its text, up to the CSS max-height
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && document.activeElement && bodyRef.current?.closest('.ai-panel')?.contains(document.activeElement)) closeAsk()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeAsk])

  const pickAudience = (a: 'student' | 'researcher') => {
    setAudience(a)
    try {
      localStorage.setItem('fif.audience', a)
    } catch {
      /* not remembered */
    }
  }

  const ids = askContext.ids ?? []
  const starters = ids.length
    ? [`Summarise what ${shortName(ids[0])} tested and found`, 'How strong is the evidence on this page?']
    : ['What am I looking at on this page?', 'Why do flames behave differently in microgravity?']

  return (
    <aside className="ai-panel" aria-label="AI research assistant">
      <div className="ai-head">
        <div className="between" style={{ flexWrap: 'nowrap' }}>
          <div className="ai-title">
            <span className="glyph" aria-hidden>✦</span>
            <div>
              <b>Research assistant</b>
            </div>
          </div>
          <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
            {messages.length > 0 && (
              <button className="btn sm ghost" onClick={() => setMessages([])} title="Start a new conversation">
                New
              </button>
            )}
            <button className="btn sm ghost icon" onClick={closeAsk} aria-label="Close the assistant" title="Close (Esc)">
              ✕
            </button>
          </div>
        </div>
        <div className="between" style={{ flexWrap: 'nowrap' }}>
          <div className="ai-ctx grow">
            <span>Reading:</span>
            <span className="pill accent">{askContext.page}</span>
            {ids.slice(0, 2).map((i) => (
              <span key={i} className="pill">{shortName(i)}</span>
            ))}
            {ids.length > 2 && <span className="faint">+{ids.length - 2}</span>}
          </div>
          <div className="seg" role="radiogroup" aria-label="Answer level">
            <button className={audience === 'student' ? 'on' : ''} onClick={() => pickAudience('student')} title="Plain words, terms defined">
              Student
            </button>
            <button className={audience === 'researcher' ? 'on' : ''} onClick={() => pickAudience('researcher')} title="Precise terms, exact conditions and units">
              Expert
            </button>
          </div>
        </div>
      </div>

      <div className="ai-body" ref={bodyRef}>
        {messages.length === 0 && (
          <div className="ai-empty">
            <div className="stack-sm">
              <h4>Start from this page</h4>
              <div className="chips">
                {starters.map((s) => (
                  <button key={s} className="chip" onClick={() => void send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="tip"><i>Aa</i><span>Tip: select any text on the page to ask about it.</span></div>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="ai-q">
              {m.quote && <div className="ai-quote">“{m.quote}”</div>}
              <span>{m.content}</span>
            </div>
          ) : (
            <div key={i} className="msg-ai">
              {m.answer && <AnswerView answer={m.answer} compact onFollowUp={(q) => void send(q)} />}
            </div>
          ),
        )}
        {busy && live && (
          <div className="msg-ai">
            <Writing text={live} />
          </div>
        )}
        {busy && !live && (
          <div className="ai-thinking" role="status">
            <span className="dots"><i /><i /><i /></span> Reading the NASA sources
          </div>
        )}
        {error && <div className="banner bad small">{error}</div>}
      </div>

      <form
        className="ai-foot"
        onSubmit={(e) => {
          e.preventDefault()
          void send(text)
        }}
      >
        {quote && (
          <div className="ai-attached">
            <div className="ai-quote">“{quote}”</div>
            <button type="button" className="btn sm ghost icon" style={{ width: 22, height: 22, padding: 0 }} onClick={() => setQuote(null)} aria-label="Remove the selected passage">
              ✕
            </button>
          </div>
        )}
        <div className="ai-input">
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send(text)
              }
            }}
            placeholder={quote ? 'Ask about the selected passage…' : 'Ask about this page…'}
            aria-label="Your question"
          />
          <div className="bar-row">
            <Link to="/assistant" className="tiny muted" style={{ textDecoration: 'none' }} title="Research tasks, search scope, PDF report">
              Open the full workbench →
            </Link>
            <button className="btn sm primary" disabled={busy || !text.trim()}>
              Ask
            </button>
          </div>
        </div>
      </form>
    </aside>
  )
}
