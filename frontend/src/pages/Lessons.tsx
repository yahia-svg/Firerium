import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { api, type Card } from '../api'
import { Cite, ErrorBox, Loading, Quote } from '../components/bits'
import { DataTable, InsightBlock, LessonBlock } from '../components/InsightParts'
import { FlameDiagram, GravityOutcomes, Kpi, Photo } from '../components/MiniViz'
import Quiz, { bestScore, QUESTIONS_2 } from '../components/Quiz'
import { useLoad, usePageContext } from '../ctx'

// The second half of the Fire Safety Insights: what history, physics and engineering add to the
// prevention / detection / suppression evidence. Same data and quotes as before, with small charts
// and NASA photos so each section can be read at a glance.

const NAV = [
  ['lessons', 'Lessons from accidents'], ['gravity', 'Earth vs. microgravity'],
  ['nextgen', 'Next-generation equipment'], ['earth', 'Uses on Earth'],
] as const

const scrollTo = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  history.replaceState(null, '', `#${id}`)
}

const QUIZ2_KEY = 'fif.quiz2.best'

const YEAR = (when: string) => when.match(/\d{4}/)?.[0] ?? when

// Fire tests that can be run on the ground: a few seconds of free fall in a drop tower, and
// Moon or Mars gravity, the conditions with almost no data in PSI.
const DROP_TOWERS = [
  {
    where: 'NASA Glenn, Cleveland, USA',
    name: 'Reduced Gravity Drop Towers and Test Rigs',
    url: 'https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/reduced-gravity-drop-towers-and-test-rigs/',
    facts: [
      '5.18 s of free fall in the Zero Gravity Research Facility, 2.2 s in the smaller tower',
      'A combustion rig for flame and extinction tests',
      'A spinning chamber inside the falling package gives partial gravity',
    ],
  },
  {
    where: 'ZARM, University of Bremen, Germany',
    name: 'Bremen Drop Tower and GraviTower Bremen',
    url: 'https://www.zarm.uni-bremen.de/en/research/labs-and-test-facilities',
    facts: [
      '4.7 s of free fall, or 9.3 s when the capsule is shot up first',
      'The GraviTower controls the fall to give Moon or Mars gravity',
      'Up to 20 runs an hour, far more than flights to orbit',
    ],
  },
]

export default function Lessons() {
  const { data, error, loading } = useLoad(() => api.insights(), [])
  const { data: all } = useLoad(() => api.search({}), [])
  const loc = useLocation()
  const [lesson, setLesson] = useState(0)
  const [sp, setSp] = useSearchParams()
  const [quiz, setQuiz] = useState(sp.get('quiz') === '1')
  const [best, setBest] = useState(() => bestScore(QUIZ2_KEY))
  const closeQuiz = () => {
    setQuiz(false)
    setBest(bestScore(QUIZ2_KEY))
    if (sp.get('quiz')) {
      const next = new URLSearchParams(sp)
      next.delete('quiz')
      setSp(next, { replace: true })
    }
  }
  usePageContext('Lessons & Applications', ['PSI-98', 'PSI-25', 'PSI-102', 'PSI-69'],
    'Sections on this page: lessons from the Apollo 1, Apollo 13 and Mir accidents (NASA history pages); Earth vs. microgravity (candle example, Saffire-II same-sample comparison); research that informs next-generation fire safety equipment; uses on Earth (NASA Spinoff articles), and testing fire on Earth in drop towers (NASA Glenn: 5.18 s and 2.2 s of free fall, a combustion rig, a centrifuge for partial gravity; ZARM Bremen: 4.7 s, 9.3 s with the catapult, GraviTower for Moon or Mars gravity).')

  useEffect(() => {
    if (data && loc.hash) document.getElementById(loc.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [data, loc.hash])

  const invs: Card[] = all?.results ?? []
  const n = invs.length || 24
  const reports = {
    oxygen: invs.filter((i) => i.conditions.oxygen).length,
    pressure: invs.filter((i) => i.conditions.pressure).length,
    airflow: invs.filter((i) => i.conditions.airflow).length,
    partial: invs.filter((i) => (i.gravity.level as string) === 'partial').length,
  }
  const lessons = data?.lessons ?? []
  const decades = (data?.earth_applications ?? [])
    .map((c) => ({ c, d: c.title.match(/\((\d{4}s)\)/)?.[1] }))
    .filter((x): x is { c: (typeof x)['c']; d: string } => !!x.d)

  return (
    <div className="page stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div className="eyebrow">
          <Link to="/insights" style={{ textDecoration: 'none', color: 'inherit' }}>Fire Safety Insights</Link> / continued
        </div>
        <h1>Lessons & Applications</h1>
        <p>
          Past spacecraft fires, how flames change without gravity, and where the research is heading.
        </p>
      </div>

      <section className="quiz-call" aria-label="Quiz 2">
        <span className="mark-q" aria-hidden>2</span>
        <div>
          <b>Quiz 2: {QUESTIONS_2.length} questions on this page</b>
          <p>Accidents, flames without gravity, uses on Earth.{best !== null ? ` Best score: ${best} / ${QUESTIONS_2.length}.` : ''}</p>
        </div>
        <button className="btn lg" onClick={() => setQuiz(true)}>
          {best !== null ? 'Take it again' : 'Start quiz 2'}
        </button>
      </section>

      <section className="grid c3" aria-label="NASA photos">
        <Photo id="PSI-25" caption={<>Flame over a solid sample, <Link to="/explorer/PSI-25">BASS-II</Link>. NASA</>} />
        <Photo id="PSI-10" caption={<>Burner flame, <Link to="/explorer/PSI-10">Flame Design</Link>. NASA</>} />
        <Photo id="PSI-47" caption={<><Link to="/explorer/PSI-47">DAFT</Link> particle instruments on the ISS. NASA</>} />
      </section>

      {loading && <Loading label="Loading" />}
      {error && <ErrorBox message={error} />}
      {data && (
        <>
          <nav className="anchor-nav">
            {NAV.map(([id, label]) => (
              <a key={id} className="btn sm" href={`#${id}`} onClick={(e) => { e.preventDefault(); scrollTo(id) }}>
                {label}
              </a>
            ))}
          </nav>

          {lessons.length > 0 && (
            <section id="lessons" className="stack" style={{ scrollMarginTop: 110 }}>
              <div className="section-head">
                <span className="idx">01</span>
                <h2>Lessons from past spacecraft accidents</h2>
                <p className="muted">From NASA’s own history pages. Histories, not experiments.</p>
              </div>
              <div className="panel">
                <div className="timeline" role="tablist" aria-label="Accidents by year">
                  {lessons.map((l, i) => (
                    <button key={l.id} role="tab" aria-selected={lesson === i} className={lesson === i ? 'on' : ''} onClick={() => setLesson(i)}>
                      <span className="yr">{YEAR(l.when)}</span>
                      <span className="what">
                        <b style={{ color: 'var(--text)' }}>{l.title.split(':')[0]}</b> · {l.where}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              {lessons[lesson] && <LessonBlock key={lessons[lesson].id} c={lessons[lesson]} />}
            </section>
          )}

          <section id="gravity" className="stack" style={{ scrollMarginTop: 110 }}>
            <div className="section-head">
              <span className="idx">02</span>
              <h2>Earth vs. microgravity</h2>
              <p className="muted">Why Earth results cannot simply be carried over to space.</p>
            </div>
            <div className="grid c2" style={{ alignItems: 'stretch' }}>
              <article className="panel stack-sm">
                <h3>{data.earth_vs_micro.example.title}</h3>
                <p className="small">{data.earth_vs_micro.example.text}</p>
                <FlameDiagram />
              </article>
              <article className="panel">
                <GravityOutcomes rows={data.earth_vs_micro.data.kind === 'saffire2_gravity' ? data.earth_vs_micro.data.rows : []} />
              </article>
            </div>
            {data.earth_vs_micro.example.evidence[0] && <Quote e={data.earth_vs_micro.example.evidence[0]} />}
            <div className="vs">
              <div className="h">Aspect</div>
              <div className="h">On Earth (1 g)</div>
              <div className="h">In microgravity</div>
              {data.earth_vs_micro.points.map((p) => (
                <div key={p.aspect} style={{ display: 'contents' }}>
                  <div>
                    <b>{p.aspect}</b>
                  </div>
                  <div className="muted">{p.earth}</div>
                  <div>
                    {p.micro}{' '}
                    {[...new Set(p.evidence.map((e) => e.source))].map((s) => (
                      <Cite key={s} id={s} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <details className="src">
              <summary>
                <span className="small">The full Saffire-II sample table, as written in PSI</span>
                <span className="tiny faint">▾</span>
              </summary>
              <div className="body">
                <DataTable data={data.earth_vs_micro.data} />
              </div>
            </details>
          </section>

          <section id="nextgen" className="stack" style={{ scrollMarginTop: 110 }}>
            <div className="section-head">
              <span className="idx">03</span>
              <h2>Research that informs next-generation fire safety equipment</h2>
              <p className="muted">Where NASA’s records point to future detectors, suppression systems and material tests.</p>
            </div>
            <div className="grid c4">
              <Kpi value={reports.oxygen} of={n} label="investigations report an oxygen level" />
              <Kpi value={reports.pressure} of={n} label="report a pressure" />
              <Kpi value={reports.airflow} of={n} label="report an airflow speed" />
              <Kpi value={reports.partial} of={n} label="ran in partial gravity (Moon, Mars): a research gap" />
            </div>
            <div className="grid c2">
              {data.next_gen.map((c) => (
                <InsightBlock key={c.title} c={c} />
              ))}
            </div>
            <Link className="small" to="/gaps">See every research gap →</Link>
          </section>

          <section id="earth" className="stack" style={{ scrollMarginTop: 110 }}>
            <div className="section-head">
              <span className="idx">04</span>
              <h2>Uses on Earth</h2>
              <p className="muted">Spacecraft fire-safety technology already in use on Earth.</p>
            </div>
            {decades.length > 0 && (
              <div className="panel">
                <div className="timeline" style={{ gridTemplateColumns: `repeat(${decades.length}, minmax(0, 1fr))` }}>
                  {decades.map(({ c, d }) => (
                    <button key={c.title} onClick={() => document.getElementById(`earth-${c.title}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                      <span className="yr">{d}</span>
                      <span className="what">{c.title.replace(/\s*\(\d{4}s\)/, '')}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid c2">
              {data.earth_applications.map((c) => (
                <div key={c.title} id={`earth-${c.title}`} style={{ display: 'flex', flexDirection: 'column', scrollMarginTop: 120 }}>
                  <InsightBlock c={c} />
                </div>
              ))}
            </div>
            <div className="panel stack-sm">
              <h3>Testing fire on Earth: drop towers</h3>
              <p className="small muted">
                A falling package is weightless for a few seconds, enough to light a flame and watch it, and it costs
                far less than a test in orbit. The PSI records for BASS and ACME/Flame Design mention drop-tower
                tests. Some towers can also give Moon or Mars gravity,
                {reports.partial === 0 ? ' which none' : ` which only ${reports.partial}`} of the {n} investigations
                here ran in.
              </p>
              <div className="grid c2">
                {DROP_TOWERS.map((t) => (
                  <a key={t.url} className="panel feature" href={t.url} target="_blank" rel="noreferrer">
                    <span className="tiny muted">{t.where}</span>
                    <h3 style={{ marginTop: 2 }}>{t.name} ↗</h3>
                    <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                      {t.facts.map((f) => <li key={f}>{f}</li>)}
                    </ul>
                  </a>
                ))}
              </div>
            </div>
          </section>

          <Link to="/insights" className="panel feature" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="stack-sm">
              <span className="k">Fire Safety Insights</span>
              <h3>Back to prevention, detection and suppression (Quiz 1)</h3>
            </span>
            <span aria-hidden style={{ fontSize: '1.4rem' }}>→</span>
          </Link>
        </>
      )}
      {quiz && (
        <Quiz
          questions={QUESTIONS_2}
          storeKey={QUIZ2_KEY}
          title="Lessons & Applications · Quiz 2"
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

