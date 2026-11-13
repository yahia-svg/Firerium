import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, type AskContext, type Meta } from './api'

// App-wide state shared by every feature: the dataset summary, the chosen
// habitat, the compare selection, and the inline AI panel / guide drawer.

type Ctx = {
  meta: Meta | null
  metaError: string | null
  env: string
  setEnv: (id: string) => void
  compare: string[]
  toggleCompare: (id: string) => void
  setCompare: (ids: string[]) => void
  shortName: (id: string) => string
  askOpen: boolean
  /** A question to send at once, and/or a passage the reader selected on the page to ask about. */
  askSeed: AskSeed | null
  openAsk: (question?: string, quote?: string) => void
  toggleAsk: () => void
  closeAsk: () => void
  askContext: AskContext
  setAskContext: (c: AskContext) => void
  guideOpen: boolean
  setGuideOpen: (open: boolean) => void
  theme: Theme
  toggleTheme: () => void
}

export type Theme = 'light' | 'dark'

/** index.html sets data-theme before the first paint (saved choice, else the system setting). */
const initialTheme = (): Theme => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')

function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0e0e0d' : '#ffffff')
}

export type AskSeed = { question?: string; quote?: string; nonce: number }

const AppCtx = createContext<Ctx | null>(null)

function stored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<Meta | null>(null)
  const [metaError, setMetaError] = useState<string | null>(null)
  const [env, setEnvState] = useState<string>(() => stored('fif.env', 'moon'))
  const [compare, setCompareState] = useState<string[]>(() => stored('fif.compare', []))
  const [askOpen, setAskOpen] = useState<boolean>(() => stored('fif.askOpen', false))
  const [askSeed, setAskSeed] = useState<AskSeed | null>(null)
  const [askContext, setAskContext] = useState<AskContext>({ page: 'Home' })
  const [guideOpen, setGuideOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>(initialTheme)

  useEffect(() => {
    api.meta().then(setMeta).catch((e: Error) => setMetaError(e.message))
  }, [])

  // follow the system setting until the reader picks a theme themselves
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      let saved: string | null = null
      try {
        saved = localStorage.getItem('fif.theme')
      } catch {
        /* no storage: keep following the system */
      }
      if (saved === 'light' || saved === 'dark') return
      const t: Theme = mq.matches ? 'dark' : 'light'
      applyTheme(t)
      setTheme(t)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((cur) => {
      const next: Theme = cur === 'dark' ? 'light' : 'dark'
      applyTheme(next)
      try {
        localStorage.setItem('fif.theme', next)
      } catch {
        /* the choice lasts for this visit only */
      }
      return next
    })
  }, [])

  const setEnv = useCallback((id: string) => {
    setEnvState(id)
    localStorage.setItem('fif.env', JSON.stringify(id))
  }, [])
  const setCompare = useCallback((ids: string[]) => {
    const next = ids.slice(0, 4)
    setCompareState(next)
    localStorage.setItem('fif.compare', JSON.stringify(next))
  }, [])
  const toggleCompare = useCallback(
    (id: string) => {
      setCompareState((cur) => {
        const next = cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 4 ? cur : [...cur, id]
        localStorage.setItem('fif.compare', JSON.stringify(next))
        return next
      })
    },
    [],
  )
  const remember = (open: boolean) => {
    try {
      localStorage.setItem('fif.askOpen', JSON.stringify(open))
    } catch {
      /* storage unavailable: the panel just does not reopen by itself */
    }
  }
  const openAsk = useCallback((question?: string, quote?: string) => {
    setAskOpen(true)
    remember(true)
    if (question || quote) setAskSeed({ question, quote, nonce: Date.now() })
  }, [])
  const closeAsk = useCallback(() => {
    setAskOpen(false)
    remember(false)
  }, [])
  const toggleAsk = useCallback(() => {
    setAskOpen((o) => {
      remember(!o)
      return !o
    })
  }, [])
  const shortName = useCallback(
    (id: string) =>
      (id.startsWith('RES-') ? meta?.resources?.find((r) => r.id === id)?.short : meta?.investigations.find((i) => i.id === id)?.short) ?? id,
    [meta],
  )

  const value = useMemo<Ctx>(
    () => ({
      meta, metaError, env, setEnv, compare, toggleCompare, setCompare, shortName,
      askOpen, askSeed, openAsk, closeAsk, toggleAsk, askContext, setAskContext, guideOpen, setGuideOpen,
      theme, toggleTheme,
    }),
    [meta, metaError, env, setEnv, compare, toggleCompare, setCompare, shortName, askOpen, askSeed, openAsk,
      closeAsk, toggleAsk, askContext, guideOpen, theme, toggleTheme],
  )
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export function useApp(): Ctx {
  const c = useContext(AppCtx)
  if (!c) throw new Error('useApp must be used inside AppProvider')
  return c
}

/** Tell the inline AI panel what the reader is looking at on this page. */
export function usePageContext(page: string, ids: string[] = [], note = '') {
  const { setAskContext } = useApp()
  const key = `${page}|${ids.join(',')}|${note}`
  useEffect(() => {
    setAskContext({ page, ids, note })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setAskContext])
}

/** Small async-state helper: loading / error / data. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null; loading: boolean } {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null, error: null, loading: true,
  })
  useEffect(() => {
    let live = true
    setState((s) => ({ ...s, loading: true, error: null }))
    fn()
      .then((data) => live && setState({ data, error: null, loading: false }))
      .catch((e: Error) => live && setState({ data: null, error: e.message, loading: false }))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}
