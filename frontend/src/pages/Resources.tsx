import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api, type NasaResource } from '../api'
import { ErrorBox, Explain, Loading, Quote } from '../components/bits'
import { useLoad, usePageContext } from '../ctx'

const GROUPS: { topic: NasaResource['topic']; title: string; what: string }[] = [
  { topic: 'data', title: 'The data', what: 'The repository every experiment, chart and count on this site comes from.' },
  { topic: 'science', title: 'The science, by NASA', what: 'NASA’s own overviews of the combustion research: a web page with experiment fact sheets, a short video and a 56-page review.' },
  { topic: 'lessons', title: 'Past accidents', what: 'Three real events and what NASA changed afterwards. They are history, not experiments.' },
  { topic: 'earth', title: 'From space to Earth', what: 'NASA Spinoff articles on fire-safety technology that reached firefighters and industry.' },
]

const DOC_TYPE: Record<string, string> = { page: 'Web page', pdf: 'PDF', captions: 'Caption file' }

/** The video loads from YouTube only when the reader asks for it. */
function Video({ r }: { r: NasaResource }) {
  const [play, setPlay] = useState(false)
  if (!r.video) return null
  return (
    <div className="stack-sm">
      {play ? (
        <div className="video">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${r.video.youtube_id}?autoplay=1&rel=0`}
            title={r.title}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <button className="video poster" onClick={() => setPlay(true)} aria-label={`Play the video: ${r.title}`}>
          <span className="play">▶</span>
          <span>
            <b>Play the video here</b>
            <span className="tiny muted">3.6 minutes · loads from YouTube when you press play</span>
          </span>
        </button>
      )}
      {r.transcript && r.transcript.length > 0 && (
        <details className="src">
          <summary>
            <span className="small">Transcript, from NASA’s own caption file ({r.transcript.length} passages)</span>
          </summary>
          <div className="body">
            {r.transcript.map((t) => (
              <div key={t.section}>
                <a href={t.url} target="_blank" rel="noreferrer" className="tiny">
                  {t.section.replace('transcript, ', '')} ↗
                </a>
                <div>{t.text}</div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

// Where on the site each resource is used: one column per part of the site.
const USES: { key: string; label: string; test: (r: NasaResource) => boolean }[] = [
  { key: 'ai', label: 'AI assistant', test: (r) => r.passages > 0 || !!r.psi }, // PSI is the assistant's main library
  { key: 'data', label: 'Data pages', test: (r) => r.used_in.some((u) => /^\/(explorer|charts|whatif)/.test(u.to)) },
  { key: 'profiles', label: 'Experiment pages', test: (r) => r.experiments.length > 0 || !!r.psi }, // every profile is a PSI record
  { key: 'insights', label: 'Insights', test: (r) => r.used_in.some((u) => u.to.startsWith('/insights')) },
  { key: 'lessons', label: 'Lessons', test: (r) => r.used_in.some((u) => u.to.startsWith('/lessons')) },
  { key: 'gaps', label: 'Research Gaps', test: (r) => r.used_in.some((u) => u.to.startsWith('/gaps')) },
]
const TOPIC: Record<NasaResource['topic'], string> = { data: 'Data', science: 'Science', lessons: 'History', earth: 'Spinoff' }

function UseMatrix({ list }: { list: NasaResource[] }) {
  // each resource's share of all the passages the site read, so the column sums to 100%
  const total = Math.max(1, list.filter((r) => !r.psi).reduce((s, r) => s + r.passages, 0))
  const share = (n: number) => (n / total) * 100
  const pct = (n: number) => {
    const p = share(n)
    return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`
  }
  const go = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    history.replaceState(null, '', `#${id}`)
  }
  return (
    <article className="panel tight">
      <div className="scroll-x">
        <table className="umatrix">
          <thead>
            <tr>
              <th className="lft">Resource</th>
              <th className="lft">Share of text read</th>
              {USES.map((u) => <th key={u.key}>{u.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} onClick={() => go(r.id)} title="Go to this resource">
                <td className="lft">
                  <b className="small">{r.short}</b>
                  <span className="tiny faint"> · {TOPIC[r.topic]}</span>
                </td>
                <td className="lft">
                  {r.psi ? (
                    <span className="tiny muted">the database: {r.psi.investigations} experiments</span>
                  ) : (
                    <span className="ubar">
                      <b><i style={{ width: `${share(r.passages)}%` }} /></b>
                      <em>{pct(r.passages)}</em>
                    </span>
                  )}
                </td>
                {USES.map((u) => (
                  <td key={u.key} aria-label={u.test(r) ? `used in ${u.label}` : `not used in ${u.label}`}>
                    <span className={`udot ${u.test(r) ? 'on' : ''}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  )
}

function ResourceCard({ r }: { r: NasaResource }) {
  return (
    <article id={r.id} className="panel tight stack-sm resource" style={{ scrollMarginTop: 80 }}>
      <div className="between" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <div>
          <span className="tiny muted">{TOPIC[r.topic]} · {r.kind_name}</span>
          <h3 style={{ marginTop: 2 }}>
            <a href={r.url} target="_blank" rel="noreferrer">{r.title} ↗</a>
          </h3>
        </div>
        {r.ask.length > 0 && <Explain q={r.ask[0]} label="Ask AI" />}
      </div>
      <p className="small" style={{ color: 'var(--text-2)' }}>{r.description}</p>
      <Video r={r} />
      {r.used_in.length > 0 && (
        <div className="chips">
          {r.used_in.slice(0, 4).map((u) => (
            <Link key={u.label} className="chip" to={u.to}>{u.label} →</Link>
          ))}
        </div>
      )}
      {(r.highlights.length > 0 || r.documents.length > 0 || r.experiments.length > 0) && (
        <details className="src">
          <summary>
            <span className="small">Quotes, documents and experiments named</span>
            <span className="tiny faint">▾</span>
          </summary>
          <div className="body">
            <p className="small"><b>How the site uses it: </b>{r.use}</p>
            {r.experiments.length > 0 && (
              <div className="row small" style={{ gap: 4 }}>
                Names:
                {r.experiments.slice(0, 12).map((e) => (
                  <Link key={e.id} className="cite" to={`/explorer/${e.id}`}>{e.short}</Link>
                ))}
              </div>
            )}
            {r.highlights.map((h, i) => <Quote key={i} e={h} />)}
            {r.documents.map((d) => (
              <div key={d.n} className="tiny">
                <a href={d.url} target="_blank" rel="noreferrer">{d.title} ↗</a>
                <span className="faint"> · {DOC_TYPE[d.type]}{d.pages ? `, ${d.pages} pages` : ''} · {d.passages} passages</span>
              </div>
            ))}
            {r.note && <div className="tiny muted">{r.note}</div>}
          </div>
        </details>
      )}
    </article>
  )
}

export default function Resources() {
  const { data, error, loading } = useLoad(() => api.resources(), [])
  const loc = useLocation()
  usePageContext('NASA Resources', [], 'The official NASA resources listed for the challenge: PSI, the NASA Combustion Science page and fact sheets, the ScienceCast video, the Researcher’s Guide, the Apollo 1, Apollo 13 and Mir pages, and three Spinoff articles.')

  useEffect(() => {
    if (data && loc.hash) document.getElementById(loc.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [data, loc.hash])

  return (
    <div className="page stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h1>NASA Resources</h1>
        <p>The ten official NASA resources for this challenge, and where the site uses each one.</p>
      </div>
      {loading && <Loading label="Loading the NASA resources" />}
      {error && <ErrorBox message={error} />}
      {data && data.resources.length === 0 && (
        <div className="banner warn">
          The resources have not been downloaded on this computer yet. Run <code>backend/ingest/fetch_resources.py</code>{' '}
          and <code>backend/ingest/build_resources.py</code>, then restart the backend.
        </div>
      )}
      {data && data.resources.length > 0 && (
        <>
          <p className="small muted">
            <b style={{ color: 'var(--text)' }}>{data.totals.read} of {data.totals.resources}</b> used ·{' '}
            {data.totals.documents} documents · {data.totals.passages} passages · {data.totals.words.toLocaleString()} words, every quote checked
          </p>
          <UseMatrix list={data.resources} />

          {GROUPS.map((g) => {
            const list = data.resources.filter((r) => r.topic === g.topic)
            if (!list.length) return null
            return (
              <section key={g.topic} className="stack">
                <h2>{g.title}</h2>
                <div className={list.length > 1 ? 'cards2' : 'stack'}>
                  {list.map((r) => <ResourceCard key={r.id} r={r} />)}
                </div>
              </section>
            )
          })}

          {(data.not_usable.length > 0 || data.not_read.length > 0) && (
            <details className="src">
              <summary>
                <span className="small">What could not be read</span>
                <span className="tiny faint">▾</span>
              </summary>
              <div className="body">
                <ul className="dots small">
                  {data.not_usable.map((p) => (
                    <li key={p.file}>
                      {data.resources.find((r) => r.id === p.id)?.short}: the full article could not be used ({p.why}); the Spinoff summary is read instead.
                    </li>
                  ))}
                  {data.not_read.map((t) => <li key={t}>{t}</li>)}
                </ul>
              </div>
            </details>
          )}
        </>
      )}
    </div>
  )
}
