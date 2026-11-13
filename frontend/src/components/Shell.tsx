import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../ctx'
import { COMING, FEATURES, featureFor, GROUPS, PATHS, TOUR } from '../guide'
import AskPanel from './AskPanel'
import SelectionAsk from './SelectionAsk'

function GuideDrawer() {
  const { guideOpen, setGuideOpen } = useApp()
  const loc = useLocation()
  const here = featureFor(loc.pathname)
  const [done, setDone] = useState<number[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('fif.tour') ?? '[]') as number[]
    } catch {
      return []
    }
  })
  const toggle = (i: number) => {
    const next = done.includes(i) ? done.filter((x) => x !== i) : [...done, i]
    setDone(next)
    try {
      localStorage.setItem('fif.tour', JSON.stringify(next))
    } catch {
      /* progress is not remembered */
    }
  }
  useEffect(() => {
    if (!guideOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setGuideOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [guideOpen, setGuideOpen])
  if (!guideOpen) return null
  const close = () => setGuideOpen(false)
  return (
    <>
      <div className="drawer-back" onClick={close} />
      <aside className="drawer" role="dialog" aria-label="Site guide">
        <div className="between">
          <h2>Guide</h2>
          <button className="btn sm" onClick={close}>
            Close
          </button>
        </div>

        {here && (
          <section className="panel tight flat stack-sm">
            <h4>You are here</h4>
            <h3>{here.name}</h3>
            <p className="small muted">{here.what}</p>
            <ul className="dots small">
              {here.tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="stack-sm">
          <h4>Pick a path</h4>
          {PATHS.map((p) => (
            <div key={p.id} className="panel tight stack-sm">
              <div className="tiny muted">{p.who}</div>
              <b>{p.title}</b>
              <ol className="dots small" style={{ paddingLeft: 20 }}>
                {p.steps.map((s) => (
                  <li key={s.text}>
                    <Link to={s.to} onClick={close}>
                      {s.text}
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>

        <section className="stack-sm">
          <h4>Guided walkthrough: fire safety for a Moon Base</h4>
          <p className="small muted">
            Ten steps that use every part of the site ({done.filter((i) => i < TOUR.length).length}/{TOUR.length} done).
          </p>
          {TOUR.map((s, i) => (
            <div key={s.text} className={`step ${done.includes(i) ? 'done' : ''}`}>
              <input type="checkbox" checked={done.includes(i)} onChange={() => toggle(i)} aria-label={`Step ${i + 1} done`} />
              <div>
                <b className="small">
                  {i + 1}. {s.text}
                </b>
                <div>
                  <Link
                    className="tiny"
                    to={s.to}
                    onClick={() => {
                      if (!done.includes(i)) toggle(i)
                      close()
                    }}
                  >
                    Take me there →
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="stack-sm">
          <h4>All sections</h4>
          {FEATURES.map((f) => (
            <Link key={f.path} to={f.path} onClick={close} className="panel tight feature">
              <b>{f.name}</b>
              <span className="small muted">{f.what}</span>
            </Link>
          ))}
          {COMING.length > 0 && <p className="tiny faint">Coming in the next stage: {COMING.join(', ')}.</p>}
        </section>
      </aside>
    </>
  )
}

function CompareTray() {
  const { compare, toggleCompare, setCompare, shortName } = useApp()
  const loc = useLocation()
  const nav = useNavigate()
  // hidden where it would cover the page's own controls
  if (compare.length === 0 || loc.pathname.startsWith('/compare') || loc.pathname.startsWith('/assistant')) return null
  return (
    <div className="tray" role="region" aria-label="Comparison selection">
      <span className="small muted nowrap">Compare:</span>
      <div className="pills" style={{ flexWrap: 'nowrap', overflow: 'hidden' }}>
        {compare.map((id) => (
          <button key={id} className="pill accent" style={{ cursor: 'pointer' }} onClick={() => toggleCompare(id)} title="Remove">
            {shortName(id)} ✕
          </button>
        ))}
      </div>
      <button
        className="btn sm primary"
        disabled={compare.length < 2}
        onClick={() => nav(`/compare?ids=${compare.join(',')}`)}
        title={compare.length < 2 ? 'Add at least one more experiment' : 'Open the comparison'}
      >
        Compare {compare.length}
      </button>
      <button className="btn sm ghost" onClick={() => setCompare([])}>
        Clear
      </button>
    </div>
  )
}

export default function Shell({ children }: { children: ReactNode }) {
  const { metaError, setGuideOpen, askOpen, toggleAsk, theme, toggleTheme } = useApp()
  const loc = useLocation()
  const [menu, setMenu] = useState(false)
  const here = featureFor(loc.pathname)
  // the full workbench page has its own assistant; the side panel would repeat it
  const onWorkbench = loc.pathname.startsWith('/assistant')
  const panel = askOpen && !onWorkbench

  useEffect(() => {
    setMenu(false)
    if (!loc.hash) window.scrollTo(0, 0)
  }, [loc.pathname, loc.hash])

  // "/" focuses nothing here; Ctrl/⌘ + J toggles the assistant (no animation delay on the shortcut)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j' && !onWorkbench) {
        e.preventDefault()
        toggleAsk()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleAsk, onWorkbench])

  return (
    <div className={`shell ${panel ? 'ai-open' : ''}`}>
      <aside className={`side ${menu ? 'open' : ''}`}>
        <Link to="/" className="brand">
          <img className="brand-mark" src="/logo.png" alt="" width={34} height={34} />
          <span>
            <b>Flame in Freefall</b>
            <span>NASA fire research</span>
          </span>
        </Link>
        <nav className="nav">
          <NavLink to="/" end>
            Start here
          </NavLink>
          {GROUPS.map((g) => (
            <div key={g.id} style={{ display: 'contents' }}>
              <div className="nav-label">{g.label}</div>
              {FEATURES.filter((f) => f.group === g.id).map((f) => (
                <NavLink key={f.path} to={f.path}>
                  {f.short ?? f.name}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="btn sm menu-btn" onClick={() => setMenu((m) => !m)} aria-label="Menu">
            ☰
          </button>
          <span className="crumb grow">
            {here ? (
              <>
                {here.group === 'discover' ? 'Discover' : here.group === 'analyse' ? 'Analyse' : 'Report & sources'} / <b>{here.name}</b>
              </>
            ) : (
              <b>Start here</b>
            )}
          </span>
          <button
            className="theme-switch" onClick={toggleTheme} role="switch" aria-checked={theme === 'dark'}
            aria-label="Dark mode" title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <svg className="sun" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
              <circle cx="8" cy="8" r="3" />
              <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" />
            </svg>
            <svg className="moon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden>
              <path d="M13.5 9.8A5.5 5.5 0 0 1 6.2 2.5a5.5 5.5 0 1 0 7.3 7.3Z" />
            </svg>
          </button>
          <button className="btn sm ghost" onClick={() => setGuideOpen(true)}>
            Guide
          </button>
          {!onWorkbench && (
            <button className={`btn sm ${panel ? 'on' : 'primary'}`} onClick={toggleAsk} title="Open the research assistant beside this page (Ctrl+J)" aria-pressed={panel}>
              ✦ Ask AI <kbd style={{ background: 'transparent', color: 'inherit', borderColor: 'var(--on-ink-line)' }}>Ctrl J</kbd>
            </button>
          )}
        </header>
        {metaError && (
          <div className="page" style={{ paddingBottom: 0 }}>
            <div className="banner bad">
              {metaError} Start it with <code>start.bat</code> (see README), then reload.
            </div>
          </div>
        )}
        {children}
      </div>

      <GuideDrawer />
      <CompareTray />
      {panel && <AskPanel />}
      {!onWorkbench && <SelectionAsk />}
    </div>
  )
}
