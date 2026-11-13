import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, type Card, type Environment, type Estimate, type Facets, type Filters } from '../api'
import { Cited, ErrorBox, Explain, InvCard, Loading, ModeBadge } from '../components/bits'
import FilterPanel, { activeCount, filtersFromParams, filtersToParams } from '../components/FilterPanel'
import { useApp, useLoad, usePageContext } from '../ctx'

function EnvBriefing({ env }: { env: Environment }) {
  const { data, error, loading } = useLoad(() => api.envSummary(env.id), [env.id])
  return (
    <section className="panel ai stack">
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <div>
          <h2>{env.name}</h2>
          <p className="small muted" style={{ marginTop: 4 }}>
            {env.atmosphere_label} · {env.g_label}
          </p>
        </div>
        <div className="row">
          {data && <ModeBadge mode={data.mode} model={data.model} />}
          <Explain q={`Summarise the fire-safety needs of a ${env.name} and which experiments in the collection address them.`} label="Ask AI" />
        </div>
      </div>
      {loading && <Loading label="Preparing the briefing" />}
      {error && <ErrorBox message={error} />}
      {data && (
        <>
          {data.notice && <div className="banner warn small">{data.notice}</div>}
          <div className="grid c3">
            {([
              ['Safety need', data.safety_needs],
              ['What the research shows', data.insights],
              ['Research gap', data.gaps],
            ] as const).map(([head, items]) => (
              <div key={head} className="stack-sm">
                <h4>{head}</h4>
                {items[0] && (
                  <p className="small">
                    <Cited text={items[0]} />
                  </p>
                )}
              </div>
            ))}
          </div>
          <details className="src">
            <summary>
              <span className="small">Full briefing</span>
              <span className="tiny faint">▾</span>
            </summary>
            <div className="body">
              {([
                ['Safety needs', data.safety_needs],
                ['What the research tells us', data.insights],
                ['Research gaps', data.gaps],
              ] as const).map(([head, items]) =>
                items.length > 1 ? (
                  <div key={head}>
                    <b className="tiny muted">{head}</b>
                    <ul className="dots small" style={{ marginTop: 4 }}>
                      {items.slice(1).map((t) => (
                        <li key={t}>
                          <Cited text={t} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null,
              )}
              <div>
                <b className="tiny muted">Atmosphere basis</b>
                <div>
                  {env.atmosphere_basis}
                  {env.assumption ? ` Assumption: ${env.assumption}` : ''}
                </div>
              </div>
              <div>
                Most relevant:{' '}
                {data.facts.top.map((t) => (
                  <Link key={t.id} to={`/explorer/${t.id}`} className="cite">
                    {t.short}
                  </Link>
                ))}{' '}
                <Link to={`/ranking?env=${env.id}`}>Full ranking →</Link>
              </div>
            </div>
          </details>
        </>
      )}
    </section>
  )
}

function NoMatch({ filters, onClear }: { filters: Filters; onClear: () => void }) {
  const [est, setEst] = useState<Estimate | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const key = JSON.stringify(filters)
  useEffect(() => {
    setEst(null)
    setError(null)
  }, [key])
  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      setEst(await api.estimate(filters))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="panel warn stack">
      <div>
        <h3>No experiment in the collection matches all of these conditions</h3>
        <p className="small muted" style={{ marginTop: 4 }}>
          That is a finding in itself: these conditions are not represented in this project collection. It does not
          prove that no such research exists elsewhere.
        </p>
      </div>
      <div className="row">
        <button className="btn ai" onClick={run} disabled={busy}>
          ✦ {est ? 'Refresh' : 'Show the closest experiments and an AI estimate'}
        </button>
        <button className="btn" onClick={onClear}>
          Clear filters
        </button>
        {busy && (
          <span className="loading small" style={{ padding: 0 }}>
            <span className="spinner" /> Working…
          </span>
        )}
      </div>
      {error && <ErrorBox message={error} />}
      {est && (
        <div className="stack">
          {est.estimate ? (
            <div className="panel tight ai stack-sm">
              <div className="pills">
                <span className="pill ai">✦ {est.label}</span>
                <span className="pill warn">Confidence: {est.confidence}</span>
              </div>
              <p>
                <Cited text={est.estimate} />
              </p>
              {est.reasoning && est.reasoning.length > 0 && (
                <ul className="dots small">
                  {est.reasoning.map((r) => (
                    <li key={r}>
                      <Cited text={r} />
                    </li>
                  ))}
                </ul>
              )}
              {est.caveats && est.caveats.length > 0 && (
                <div className="limits small">
                  <b>Why this could be wrong: </b>
                  {est.caveats.join(' ')}
                </div>
              )}
            </div>
          ) : (
            <div className="banner warn small">{est.message}</div>
          )}
          {est.nearest.length > 0 && (
            <div className="stack-sm">
              <h4>Closest experiments in the collection</h4>
              <div className="grid cards">
                {est.nearest.map((n) => (
                  <InvCard
                    key={n.investigation.id}
                    inv={n.investigation}
                    extra={
                      <div className="pills">
                        {n.meets.map((m) => (
                          <span key={m} className="pill good">
                            ✓ {m}
                          </span>
                        ))}
                        {n.misses.map((m) => (
                          <span key={m} className="pill bad">
                            ✕ {m}
                          </span>
                        ))}
                      </div>
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export default function Explorer() {
  const { meta, env, setEnv } = useApp()
  const [sp, setSp] = useSearchParams()
  const filters = useMemo(() => filtersFromParams(sp), [sp])
  const [results, setResults] = useState<Card[] | null>(null)
  const [facets, setFacets] = useState<Facets | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<'relevance' | 'name' | 'runs'>('relevance')
  const [ranked, setRanked] = useState<Record<string, number>>({})

  // ?env=moon in a link selects the habitat
  const envParam = sp.get('env')
  useEffect(() => {
    if (envParam && meta?.environments.some((e) => e.id === envParam) && envParam !== env) setEnv(envParam)
  }, [envParam, meta, env, setEnv])
  const current = meta?.environments.find((e) => e.id === env)

  const key = JSON.stringify(filters)
  useEffect(() => {
    let live = true
    const t = setTimeout(() => {
      api
        .search(filters)
        .then((r) => {
          if (!live) return
          setResults(r.results)
          setFacets(r.facets)
          setError(null)
        })
        .catch((e: Error) => live && setError(e.message))
    }, 180)
    return () => {
      live = false
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    let live = true
    api
      .ranking({ environment: env, filters: {} })
      .then((r) => live && setRanked(Object.fromEntries(r.results.map((x) => [x.investigation.id, x.score]))))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [env])

  const shown = useMemo(() => {
    if (!results) return []
    const list = [...results]
    if (sort === 'relevance') list.sort((a, b) => (ranked[b.id] ?? 0) - (ranked[a.id] ?? 0))
    if (sort === 'name') list.sort((a, b) => a.short.localeCompare(b.short))
    if (sort === 'runs') list.sort((a, b) => b.n_runs - a.n_runs)
    return list
  }, [results, sort, ranked])

  usePageContext(
    'Research Explorer',
    shown.slice(0, 4).map((r) => r.id),
    `Habitat selected: ${current?.name ?? env}. Active filters: ${JSON.stringify(filters)}. ${shown.length} experiments shown.`,
  )

  const setFilters = (f: Filters) => setSp(filtersToParams(f, sp), { replace: true })
  const pickEnv = (id: string) => {
    setEnv(id)
    const next = new URLSearchParams(sp)
    next.set('env', id)
    setSp(next, { replace: true })
  }

  return (
    <div className="page stack">
      <div className="page-head">
        <h1>Research Explorer</h1>
        <p>
          All {meta?.combustion_investigations ?? 24} NASA combustion investigations. Pick a habitat, then filter.
        </p>
      </div>

      <section className="stack-sm">
        <h4>Crew environment</h4>
        <div className="env-tabs" role="tablist">
          {meta?.environments.map((e) => (
            <button key={e.id} role="tab" aria-selected={e.id === env} className={`env-tab ${e.id === env ? 'active' : ''}`} onClick={() => pickEnv(e.id)}>
              <b>{e.name}</b>
              <span>{e.tagline}</span>
            </button>
          ))}
        </div>
      </section>

      {current && <EnvBriefing env={current} />}

      <section className="stack-sm">
        <h4>Experiments</h4>
        <div className="explorer">
          <FilterPanel filters={filters} facets={facets} onChange={setFilters} />
          <div className="stack">
            {error && <ErrorBox message={error} />}
            {!results && !error && <Loading label="Loading experiments" />}
            {results && (
              <div className="between">
                <span className="small muted">
                  <b style={{ color: 'var(--text)' }}>{results.length}</b> of {facets?.total ?? 24} experiments
                  {activeCount(filters) > 0 ? ` match ${activeCount(filters)} filter${activeCount(filters) > 1 ? 's' : ''}` : ''}
                </span>
                <label className="row small muted" style={{ gap: 6 }}>
                  Sort by
                  <select className="select" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                    <option value="relevance">Relevance to {current?.name ?? 'habitat'}</option>
                    <option value="name">Name</option>
                    <option value="runs">Amount of run data</option>
                  </select>
                </label>
              </div>
            )}
            {results && results.length === 0 && <NoMatch filters={filters} onClear={() => setFilters({})} />}
            <div className="grid cards">
              {shown.map((inv) => (
                <InvCard
                  key={inv.id}
                  inv={inv}
                  extra={
                    ranked[inv.id] !== undefined ? (
                      <div className="tiny muted" title="Project relevance score for the selected habitat. See Ranking for the breakdown.">
                        Relevance to {current?.name}: <b style={{ color: 'var(--accent)' }}>{ranked[inv.id]}</b>/100 ·{' '}
                        <Link to={`/ranking?env=${env}`}>why?</Link>
                      </div>
                    ) : undefined
                  }
                />
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
