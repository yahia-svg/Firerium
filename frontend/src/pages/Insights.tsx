import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { api, type InsightCard, type InsightData } from '../api'
import { ErrorBox, Loading } from '../components/bits'
import { InsightBlock } from '../components/InsightParts'
import { MiniBars, Photo, RangeChart, SmokeDiagram, StackedBars } from '../components/MiniViz'
import Quiz, { bestScore, QUESTIONS } from '../components/Quiz'
import { useApp, useLoad, usePageContext } from '../ctx'

const NAV = [['prevention', 'Prevention'], ['detection', 'Detection'], ['suppression', 'Suppression']] as const

/** One line per section; the full definitions are in each card's evidence. */
const SHORT: Record<string, string> = {
  prevention: 'Stop a fire starting or spreading, mainly through the choice of materials.',
  detection: 'Notice a fire early, when smoke does not rise to a detector.',
  suppression: 'Put a fire out when no buoyancy carries the agent to the flame.',
}

/** Oxygen ranges actually tested by the experiments behind a section's cards (one row per experiment). */
function o2Rows(cards: InsightCard[]) {
  const seen = new Map<string, { label: string; min: number; max: number; tip: string }>()
  for (const c of cards)
    for (const t of c.tested ?? []) {
      const o = t.conditions.oxygen
      if (!o || seen.has(t.id)) continue
      seen.set(t.id, { label: t.short, min: o.min ?? o.max, max: o.max, tip: `${t.short}: ${o.min ?? ''}${o.min != null ? ' to ' : 'up to '}${o.max}% oxygen · ${t.materials.slice(0, 3).join(', ') || 'materials not listed'}` })
    }
  return [...seen.values()].sort((a, b) => b.max - a.max)
}

const scrollTo = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  history.replaceState(null, '', `#${id}`)
}

export default function Insights() {
  const { data, error, loading } = useLoad(() => api.insights(), [])
  const { meta } = useApp()
  const moon = meta?.environments.find((e) => e.id === 'moon')
  const band = moon ? { from: moon.oxygen[0], to: Math.min(40, moon.oxygen[1]), label: moon.name } : undefined
  const loc = useLocation()
  const [sp, setSp] = useSearchParams()
  const [quiz, setQuiz] = useState(sp.get('quiz') === '1')
  const [best, setBest] = useState(bestScore)
  usePageContext('Fire Safety Insights', ['PSI-25', 'PSI-102', 'PSI-69', 'PSI-20'],
    'Sections on this page: fire prevention, fire detection, fire suppression. Lessons from accidents, Earth vs. microgravity, next-generation equipment and uses on Earth are on the Lessons & Applications page.')

  useEffect(() => {
    if (data && loc.hash) document.getElementById(loc.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [data, loc.hash])

  const flex = useMemo(() => {
    const card = data?.sections.flatMap((s) => s.cards).find((c) => c.data?.kind === 'flex_suppression')
    return card?.data as Extract<InsightData, { kind: 'flex_suppression' }> | undefined
  }, [data])

  const closeQuiz = () => {
    setQuiz(false)
    setBest(bestScore())
    if (sp.get('quiz')) {
      const next = new URLSearchParams(sp)
      next.delete('quiz')
      setSp(next, { replace: true })
    }
  }

  return (
    <div className="page stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h1>Fire Safety Insights</h1>
        <p>
          Preventing, detecting and putting out fires in space, from NASA’s evidence.
        </p>
      </div>

      <section className="quiz-call" aria-label="Quiz">
        <span className="mark-q" aria-hidden>1</span>
        <div>
          <b>Quiz 1: {QUESTIONS.length} questions on this page</b>
          <p>About three minutes.{best !== null ? ` Best score: ${best} / ${QUESTIONS.length}.` : ''}</p>
        </div>
        <button className="btn lg" onClick={() => setQuiz(true)}>
          {best !== null ? 'Take it again' : 'Start the quiz'}
        </button>
      </section>

      {loading && <Loading label="Loading insights" />}
      {error && <ErrorBox message={error} />}
      {data && (
        <>
          <nav className="anchor-nav">
            {NAV.map(([id, label], i) => (
              <a key={id} className="btn sm" href={`#${id}`} onClick={(e) => { e.preventDefault(); scrollTo(id) }}>
                <span className="faint num">{String(i + 1).padStart(2, '0')}</span> {label}
              </a>
            ))}
            <span className="grow" />
            <Link className="btn sm primary" to="/lessons">
              Lessons & Applications →
            </Link>
          </nav>

          <section className="section-media" aria-label="At a glance">
            <article className="panel tight">
              <MiniBars
                title="Experiments per safety area"
                note="of 24 in PSI"
                data={data.sections.map((s) => ({ label: s.title.replace(/^Fire (\w)/, (_, c: string) => c.toUpperCase()), value: s.investigations.length, tip: `${s.investigations.length} investigations: ${s.investigations.map((i) => i.short).join(', ')}` }))}
                max={24}
              />
            </article>
            <Photo src="/img/acme-iss.jpg" alt="A crew member beside the ACME hardware on the ISS" caption={<>Where the experiments run: ACME hardware on the ISS. NASA</>} />
            <Photo contain src="/img/cld-flames.jpg" alt="Four blue flames burning in microgravity" caption={<>Flames in microgravity, ACME CLD Flame. NASA</>} />
          </section>

          {data.sections.map((s, si) => (
            <section key={s.id} id={s.id} className="stack" style={{ scrollMarginTop: 110 }}>
              <div className="section-head">
                <span className="idx">{String(si + 1).padStart(2, '0')}</span>
                <h2>{s.title}</h2>
                <p className="muted">{SHORT[s.id] ?? s.meaning}</p>
              </div>

              {s.id === 'prevention' && (
                <div className="section-media">
                  <article className="panel tight" style={{ gridColumn: 'span 2' }}>
                    <RangeChart
                      title="Oxygen levels these experiments burned at"
                      note={band ? `shaded: ${band.label}` : undefined}
                      rows={o2Rows(s.cards)}
                      band={band}
                      max={40}
                      unit="%"
                    />
                    {band && (
                      <p className="tiny muted" style={{ marginTop: 10 }}>
                        {(() => {
                          const reach = o2Rows(s.cards).filter((r) => r.max >= band.from).map((r) => r.label)
                          return reach.length
                            ? `Reaching the ${band.label} band: ${reach.join(', ')}. Solid-material tests stop near 22%.`
                            : `None reaches the ${band.label} band: a research gap.`
                        })()}
                      </p>
                    )}
                  </article>
                  <Photo id="PSI-25" alt="A flame spreading over a solid sample" caption={<>Flame over a solid sample, <Link to="/explorer/PSI-25">BASS-II</Link>. NASA</>} />
                </div>
              )}
              {s.id === 'detection' && (
                <div className="section-media">
                  <article className="panel tight">
                    <SmokeDiagram />
                  </article>
                  <Photo src="/img/acme-insert.jpg" alt="Diagram of the ACME chamber insert and its sensors" caption={<>How a flame is watched: cameras, radiometers and light sensors in the ACME chamber. NASA</>} />
                  <Photo id="PSI-47" alt="A crew member with particle instruments on the ISS" caption={<><Link to="/explorer/PSI-47">DAFT</Link> particle instruments on the ISS. NASA</>} />
                </div>
              )}
              {s.id === 'suppression' && flex && (
                <div className="section-media">
                  <article className="panel tight" style={{ gridColumn: 'span 2' }}>
                    <StackedBars
                      title="How the FLEX tests ended"
                      note={<>{flex.rows.reduce((a, r) => a + r.runs, 0)} tests · <a href={flex.source_url} target="_blank" rel="noreferrer">NASA run log ↗</a></>}
                      series={['Flame went out', 'Droplet burned away', 'Ended another way']}
                      rows={flex.rows.map((r) => ({ label: `${r.fuel} · ${r.agent.startsWith('None') ? 'no added gas' : r.agent}`, values: [r.extinction, r.completion, r.disruption] }))}
                    />
                  </article>
                  <Photo src="/img/dim-flame.jpg" alt="A dim blue flame in microgravity" caption={<>A weak blue flame in microgravity, ACME. NASA</>} />
                </div>
              )}

              <div className="cards2">
                {s.cards.map((c, i) => (
                  <InsightBlock key={c.title} c={c} n={i + 1} compact />
                ))}
              </div>

              {s.id === 'prevention' && (
                <article className="panel tight stack-sm">
                  <MiniBars
                    title="Solid materials burned in microgravity"
                    note="experiments per material"
                    data={data.material_coverage.map((m) => ({ label: m.material, value: m.investigations.length, tip: m.investigations.map((i) => i.short).join(', ') }))}
                  />
                  <Link className="small" to="/explorer?fuel_state=solid">Open these experiments →</Link>
                </article>
              )}
              <div className="srcline">
                In this area:
                {s.investigations.map((i) => (
                  <Link key={i.id} className="cite" to={`/explorer/${i.id}`}>
                    {i.short}
                  </Link>
                ))}
                <Link to={`/ranking?focus=${s.id}`} style={{ marginLeft: 6 }}>Score them →</Link>
              </div>
            </section>
          ))}

          <Link to="/lessons" className="panel feature" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="stack-sm">
              <span className="k">Continue</span>
              <h3>Lessons & Applications</h3>
              <span className="small muted">Past accidents, Earth vs. microgravity, new equipment, uses on Earth</span>
            </span>
            <span aria-hidden style={{ fontSize: '1.4rem' }}>→</span>
          </Link>
        </>
      )}

      {quiz && (
        <Quiz
          onClose={closeQuiz}
          onGo={(id) => {
            closeQuiz()
            setTimeout(() => scrollTo(id), 50)
          }}
        />
      )}
    </div>
  )
}
