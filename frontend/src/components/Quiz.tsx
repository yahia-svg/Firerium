import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Ten questions on the Fire Safety Insights page. Every answer is stated on that page,
// in the insight card named in `where`, and rests on the NASA quote shown there.

type Q = { q: string; options: string[]; answer: number; why: string; where: string }

export const QUESTIONS: Q[] = [
  {
    q: 'BASS and BASS-II were built around a hypothesis about NASA’s upward-burning ground test for materials. What was it?',
    options: [
      'Materials cannot burn at all in microgravity',
      'With ventilation, a material in microgravity could burn as well as, or better than, on Earth',
      'The ground test overstates flammability, so it is too strict',
      'Only liquids, not solids, behave differently in space',
    ],
    answer: 1,
    why: 'The ground test may not be the worst case: with airflow, a material in microgravity could burn as well as or better than on Earth.',
    where: 'prevention',
  },
  {
    q: 'What cabin atmosphere is a Moon Base expected to use, according to the challenge text?',
    options: ['21% oxygen at sea-level pressure', '100% oxygen, like Apollo 1', '30% oxygen or more, at reduced pressure', 'Below 15% oxygen to prevent fires'],
    answer: 2,
    why: 'Exploration habitats are expected to run at 30% oxygen or more at reduced pressure, which raises flammability.',
    where: 'prevention',
  },
  {
    q: 'In BRE, what happened to flames in elevated-oxygen atmospheres when there was no airflow at all?',
    options: ['They went out at once', 'They kept burning', 'They turned into cool flames', 'They could not be ignited'],
    answer: 1,
    why: 'Flames in elevated oxygen kept burning with no airflow, while flames in 21% oxygen went out on their own. Switching off ventilation is not always enough.',
    where: 'suppression',
  },
  {
    q: 'Why does airflow matter so much to a flame in microgravity?',
    options: [
      'It cools the flame and always puts it out',
      'Without buoyancy, ventilation is what brings the flame fresh oxygen',
      'It carries smoke to the ceiling detector',
      'It has no measurable effect in orbit',
    ],
    answer: 1,
    why: 'With no buoyant flow, airflow speed and direction decide whether a flame spreads or dies. BASS and BASS-II varied it up to 40 cm/s.',
    where: 'prevention',
  },
  {
    q: 'Where did the Saffire experiments burn samples up to about a metre long?',
    options: ['In the ISS cabin', 'In a drop tower on Earth', 'Inside an uncrewed Cygnus cargo ship', 'On the Moon'],
    answer: 2,
    why: 'A large fire inside an uncrewed Cygnus puts no crew at risk, so Saffire could test realistic fire sizes.',
    where: 'prevention',
  },
  {
    q: 'Up to what oxygen level do the solid-material tests in this collection (BASS-II, Saffire) report?',
    options: ['About 22%', 'About 30%', 'About 40%', 'About 85%'],
    answer: 0,
    why: 'They report oxygen at or below about 22%. No solid cabin material was burned at Moon Base oxygen levels: a research gap.',
    where: 'prevention',
  },
  {
    q: 'What do SAME and SAME-R expect to happen to smoke particles in microgravity?',
    options: ['They become smaller and more numerous', 'They become larger and fewer', 'They do not form at all', 'They rise faster than on Earth'],
    answer: 1,
    why: 'Without buoyant flow, smoke stays near its source longer and particles have more time to grow, which changes how a detector responds.',
    where: 'detection',
  },
  {
    q: 'Why did DAFT have to test a modified particle counter on the ISS before it was trusted?',
    options: [
      'The original was too heavy to launch',
      'It relied on gravity to recycle its working fluid (isopropyl alcohol)',
      'It could only measure dust on Earth’s surface',
      'Its battery did not work in space',
    ],
    answer: 1,
    why: 'The commercial P-Trak used gravity to recycle isopropyl alcohol, so it had to be re-qualified for microgravity.',
    where: 'detection',
  },
  {
    q: 'FLEX burned single fuel droplets while replacing part of the atmosphere with which gases?',
    options: ['Nitrogen and argon', 'Carbon dioxide or helium', 'Water mist and foam', 'Pure oxygen'],
    answer: 1,
    why: 'FLEX diluted the atmosphere with carbon dioxide or helium to find the lowest oxygen level that still supports a flame.',
    where: 'suppression',
  },
  {
    q: 'In December 2015 the first water-mist portable extinguishers went to the ISS. What did they replace?',
    options: ['Foam extinguishers', 'Carbon-dioxide units', 'Nitrogen bottles', 'Halon systems'],
    answer: 1,
    why: 'NASA’s Researcher’s Guide says the first two water-mist extinguishers went to the ISS in December 2015 to replace carbon-dioxide units.',
    where: 'suppression',
  },
]

/** Quiz 2, on the Lessons & Applications page. Every answer is stated in a card on that page. */
export const QUESTIONS_2: Q[] = [
  {
    q: 'What was the Apollo 1 cabin filled with during the 1967 launch-pad rehearsal?',
    options: ['Ordinary air (21% oxygen)', '100% oxygen', 'Nitrogen only', '30% oxygen at reduced pressure'],
    answer: 1,
    why: 'The sealed cabin was pressurized with 100% oxygen, so the fire spread through the Command Module within seconds.',
    where: 'lessons',
  },
  {
    q: 'Which change did NASA make after the Apollo 1 fire?',
    options: [
      'It moved all testing to orbit',
      'It restricted combustible materials and made spacesuits from fire-resistant materials',
      'It replaced every extinguisher with water mist',
      'It stopped using oxygen in spacecraft',
    ],
    answer: 1,
    why: 'NASA severely restricted the combustible materials in the cabin, redesigned the hatch and designed new spacesuits from fire-resistant materials.',
    where: 'lessons',
  },
  {
    q: 'What happened on Apollo 13 in April 1970?',
    options: [
      'A cabin fire forced an early landing',
      'An oxygen tank, damaged during a ground test, exploded in flight',
      'A smoke detector failed on the way to the Moon',
      'A fuel droplet experiment ignited',
    ],
    answer: 1,
    why: 'Heaters left on during a launch-pad test damaged the tank’s insulation; on the third day of the flight the tank blew up. The crew returned safely.',
    where: 'lessons',
  },
  {
    q: 'What started the 1997 fire aboard Mir?',
    options: ['Faulty wiring in a module', 'A solid-fuel oxygen generator canister', 'A cooking appliance', 'A burning cabin fabric'],
    answer: 1,
    why: 'A solid-fuel oxygen generator canister ignited and threw a flame across the module.',
    where: 'lessons',
  },
  {
    q: 'How did the Mir crew respond to the fire?',
    options: [
      'They shut off ventilation and waited for it to go out',
      'They put on oxygen masks and used foam extinguishers',
      'They vented the module to space',
      'They left the station at once',
    ],
    answer: 1,
    why: 'The crew put on oxygen masks and fought the flame with foam extinguishers; life support cleared the smoke over several hours.',
    where: 'lessons',
  },
  {
    q: 'According to NASA’s Researcher’s Guide, which three elements of the “fire triangle” must be present for a fire?',
    options: ['Fuel, oxygen and a source of ignition', 'Heat, pressure and gravity', 'Oxygen, nitrogen and carbon dioxide', 'Fuel, airflow and smoke'],
    answer: 0,
    why: 'Fuel, oxygen and a source of ignition. Crewed spacecraft, by necessity, contain all three.',
    where: 'lessons',
  },
  {
    q: 'What does a candle flame look like in free fall?',
    options: ['A tall, flickering teardrop', 'A small blue sphere', 'A flat orange disc', 'It cannot burn at all'],
    answer: 1,
    why: 'With nothing rising, the flame becomes a small blue sphere that gets oxygen only as fast as it can drift in.',
    where: 'gravity',
  },
  {
    q: 'In microgravity, how does oxygen reach a flame?',
    options: ['By buoyancy, as on Earth', 'By diffusion or by forced ventilation', 'Only through the fuel itself', 'It does not reach it'],
    answer: 1,
    why: 'There is no buoyant flow, so oxygen arrives by diffusion or by forced ventilation: a cabin fan can do the job buoyancy does on Earth.',
    where: 'gravity',
  },
  {
    q: 'How much partial-gravity (Moon, Mars) combustion data does PSI hold?',
    options: ['A full set of lunar tests', 'Only Mars tests', 'None yet: microgravity and Earth results can only bound it', 'More than for microgravity'],
    answer: 2,
    why: 'The challenge text says there is currently no partial-gravity combustion data in PSI. It is a research gap.',
    where: 'gravity',
  },
  {
    q: 'The fire detector first used in the space shuttle orbiters can tell combustion particles apart from what?',
    options: ['Dust', 'Water vapour', 'Carbon dioxide', 'Engine exhaust'],
    answer: 0,
    why: 'It samples the air for combustion particles and can tell them from dust, so it gives fewer false alarms.',
    where: 'earth',
  },
]

const KEYS = ['A', 'B', 'C', 'D']
const STORE = 'fif.quiz.best'

function best(key: string = STORE): number | null {
  try {
    const v = localStorage.getItem(key)
    return v === null ? null : Number(v)
  } catch {
    return null
  }
}

export function bestScore(key: string = STORE) {
  return best(key)
}

export default function Quiz({ onClose, onGo, questions = QUESTIONS, storeKey = STORE, title = 'Fire Safety Insights · Quiz 1' }: {
  onClose: () => void
  onGo: (section: string) => void
  questions?: Q[]
  storeKey?: string
  title?: string
}) {
  const QS = questions
  const [i, setI] = useState(0)
  const [picks, setPicks] = useState<(number | null)[]>(() => QS.map(() => null))
  const [done, setDone] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const q = QS[i]
  const picked = picks[i]
  const score = picks.filter((p, k) => p === QS[k].answer).length

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (done) return
      const n = KEYS.indexOf(e.key.toUpperCase())
      if (n >= 0 && picks[i] === null && n < QS[i].options.length) choose(n)
      if (e.key === 'Enter' && picks[i] !== null) next()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, picks, done])

  const choose = (n: number) => setPicks((p) => p.map((v, k) => (k === i ? n : v)))
  const next = () => {
    if (i < QS.length - 1) setI(i + 1)
    else {
      setDone(true)
      try {
        const b = best(storeKey)
        if (b === null || score > b) localStorage.setItem(storeKey, String(score))
      } catch {
        /* best score not kept */
      }
    }
  }
  const restart = () => {
    setPicks(QS.map(() => null))
    setI(0)
    setDone(false)
  }

  const verdict =
    score === 10 ? 'Perfect. You could brief a mission team on this.'
      : score >= 8 ? 'Strong. Review the one or two you missed below.'
        : score >= 5 ? 'A good start. The sections linked below hold the answers.'
          : 'Worth a second read: each answer is on this page, with its NASA source.'

  // rendered on <body>: the page area is a size container, and the popup must cover the whole window
  return createPortal(
    <>
      <div className="modal-back" onClick={onClose} />
      <div className="modal stack" role="dialog" aria-modal="true" aria-label="Fire safety quiz">
        <div className="between" style={{ flexWrap: 'nowrap' }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 2 }}>{title}</div>
            <b>{done ? 'Your result' : `Question ${i + 1} of ${QS.length}`}</b>
          </div>
          <button ref={closeRef} className="btn sm ghost icon" onClick={onClose} aria-label="Close the quiz">
            ✕
          </button>
        </div>
        <div className="q-progress" aria-hidden>
          {QS.map((qq, k) => (
            <i key={k} className={picks[k] === null ? (k === i && !done ? 'now' : '') : picks[k] === qq.answer ? 'done' : 'wrong'} />
          ))}
        </div>

        {!done ? (
          <>
            <p className="q-text">{q.q}</p>
            <div className="q-opts">
              {q.options.map((o, n) => {
                const state = picked === null ? '' : n === q.answer ? 'right' : n === picked ? 'wrong' : 'dim'
                return (
                  <button key={o} className={`q-opt ${state}`} disabled={picked !== null} onClick={() => choose(n)}>
                    <span className="k">{KEYS[n]}</span>
                    <span>{o}</span>
                    <span aria-hidden>{state === 'right' ? '✓' : state === 'wrong' ? '✕' : ''}</span>
                  </button>
                )
              })}
            </div>
            {picked !== null && (
              <div className="q-why" role="status">
                <b>{picked === q.answer ? 'Correct. ' : 'Not quite. '}</b>
                {q.why}{' '}
                <button className="linkish" onClick={() => onGo(q.where)}>
                  Read the evidence →
                </button>
              </div>
            )}
            <div className="between">
              <span className="tiny faint">Keys: A–D to answer, Enter for next, Esc to close</span>
              <button className="btn primary" disabled={picked === null} onClick={next}>
                {i < QS.length - 1 ? 'Next question' : 'See my score'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="q-score">
              <b>{score}</b>
              <span>/ {QS.length}</span>
            </div>
            <p>{verdict}</p>
            <div className="q-review">
              {QS.map((qq, k) => (
                <div key={k}>
                  <span aria-label={picks[k] === qq.answer ? 'correct' : 'incorrect'}>{picks[k] === qq.answer ? '✓' : '✕'}</span>
                  <span>
                    {qq.q}
                    {picks[k] !== qq.answer && (
                      <span className="muted"> Answer: {qq.options[qq.answer]}.</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={restart}>
                Try again
              </button>
              <button className="btn primary" onClick={onClose}>
                Back to the insights
              </button>
            </div>
          </>
        )}
      </div>
    </>,
    document.body,
  )
}
