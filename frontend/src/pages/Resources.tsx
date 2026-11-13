import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api, type NasaResource } from '../api'
import { ErrorBox, Explain, Loading, Quote } from '../components/bits'
import { useLoad, usePageContext } from '../ctx'

const GROUPS: { topic: NasaResource['topic']; title: string; what: string }[] = [
  { topic: 'data', title: 'The data', what: 'The repository every experiment, chart and count on this site comes from.' },
  { topic: 'science', title: 'The science, explained by NASA', what: 'NASA’s own overviews of the combustion research: a web page with experiment fact sheets, a short video and a 56-page review.' },
  { topic: 'lessons', title: 'Lessons from past accidents', what: 'Three real events and what NASA changed afterwards. They are history, not experiments.' },
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

function ResourceCard({ r, n }: { r: NasaResource; n: number }) {
  return (
    <article id={r.id} className="panel stack-sm resource" style={{ scrollMarginTop: 70 }}>
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <div className="pills" style={{ marginBottom: 6 }}>
            <span className="pill accent">Resource {n} of 10</span>
            <span className="pill">{r.kind_name}</span>
            {r.passages > 0 && <span className="pill good">{r.passages} {r.passages === 1 ? 'passage' : 'passages'} read</span>}
          </div>
          <h3>
            <a href={r.url} target="_blank" rel="noreferrer">
              {r.title} ↗
            </a>
          </h3>
        </div>
      </div>

      <blockquote className="quote">
        {r.description}
        <footer>NASA’s description, from the official resource list for the challenge</footer>
      </blockquote>

      <div>
        <h4>How this site uses it</h4>
        <p className="small" style={{ margin: '4px 0 0' }}>{r.use}</p>
      </div>

      {r.psi && (
        <div className="lib">
          <div><span>Combustion investigations, every one in PSI</span><b>{r.psi.investigations}</b></div>
          <div><span>Experimental run tables</span><b>{r.psi.tables}</b></div>
          <div><span>Individual test rows</span><b>{r.psi.runs.toLocaleString()}</b></div>
          <div><span>PSI reports and science documents read page by page</span><b>{r.psi.documents}</b></div>
          <div className="total"><span>Passages from those documents</span><b>{r.psi.document_passages.toLocaleString()}</b></div>
        </div>
      )}

      <Video r={r} />

      {r.used_in.length > 0 && (
        <div className="stack-sm">
          <h4>Where you can see it on the site</h4>
          <div className="chips">
            {r.used_in.map((u) => (
              <Link key={u.label} className="chip" to={u.to}>
                {u.label} →
              </Link>
            ))}
          </div>
        </div>
      )}

      {r.highlights.length > 0 && (
        <details className="src">
          <summary>
            <span className="small">NASA’s words that the site quotes from it ({r.highlights.length})</span>
          </summary>
          <div className="body">
            {r.highlights.map((h, i) => (
              <Quote key={i} e={h} />
            ))}
          </div>
        </details>
      )}

      {r.documents.length > 0 && (
        <details className="src">
          <summary>
            <span className="small">
              What was read: {r.documents.length} {r.documents.length === 1 ? 'document' : 'documents'}, {r.words.toLocaleString()} words
            </span>
          </summary>
          <div className="body">
            {r.documents.map((d) => (
              <div key={d.n}>
                <a href={d.url} target="_blank" rel="noreferrer">
                  {d.title} ↗
                </a>
                <span className="faint">
                  {' '}
                  · {DOC_TYPE[d.type]}
                  {d.pages ? `, ${d.pages} pages` : ''} · {d.passages} passages · downloaded {d.fetched}
                </span>
              </div>
            ))}
            {r.note && <div className="limits small">{r.note}</div>}
          </div>
        </details>
      )}

      {r.experiments.length > 0 && (
        <div className="row small muted">
          PSI experiments it names:
          {r.experiments.slice(0, 12).map((e) => (
            <Link key={e.id} className="cite" to={`/explorer/${e.id}`} title={`Named in ${e.passages} passage(s). Open the experiment profile.`}>
              {e.short}
            </Link>
          ))}
        </div>
      )}

      {r.ask.length > 0 && (
        <div className="row">
          {r.ask.slice(0, 1).map((q) => (
            <Explain key={q} q={q} label={q} />
          ))}
        </div>
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

  const order = data?.resources.map((r) => r.id) ?? []
  return (
    <div className="page stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h1>NASA Resources</h1>
        <p>
          The ten official NASA resources for this challenge, and where the site uses each one.
        </p>
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
          <section className="grid c4">
            <div className="stat">
              <b>
                {data.totals.read} of {data.totals.resources}
              </b>
              <span>official NASA resources used on this site</span>
            </div>
            <div className="stat">
              <b>{data.totals.documents}</b>
              <span>web pages, PDFs and caption files read besides PSI</span>
            </div>
            <div className="stat">
              <b>{data.totals.passages}</b>
              <span>passages the AI assistant can search and cite from them</span>
            </div>
            <div className="stat">
              <b>{data.totals.words.toLocaleString()}</b>
              <span>words of NASA text, each quote checked against it</span>
            </div>
          </section>
          <div className="banner small">
            {data.note}
          </div>

          {GROUPS.map((g) => {
            const list = data.resources.filter((r) => r.topic === g.topic)
            if (!list.length) return null
            return (
              <section key={g.topic} className="stack">
                <div>
                  <h2>{g.title}</h2>
                  <p className="muted small" style={{ marginTop: 4, maxWidth: '78ch' }}>{g.what}</p>
                </div>
                {list.map((r) => (
                  <ResourceCard key={r.id} r={r} n={order.indexOf(r.id) + 1} />
                ))}
              </section>
            )
          })}

          <section className="panel warn stack-sm">
            <h3>What was not read, and why</h3>
            <ul className="dots small">
              {data.not_usable.map((p) => (
                <li key={p.file}>
                  {data.resources.find((r) => r.id === p.id)?.short}: the full article on NASA’s Technical Reports
                  Server could not be used ({p.why}). The summary on the Spinoff page is read instead.
                  {p.url && (
                    <>
                      {' '}
                      <a href={p.url} target="_blank" rel="noreferrer">
                        NASA file ↗
                      </a>
                    </>
                  )}
                </li>
              ))}
              {data.not_read.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <p className="tiny faint" style={{ margin: 0 }}>
              Left out while reading, and counted: {Object.entries(data.left_out).map(([k, n]) => `${n} × ${k}`).join(', ')}.
              {data.built_at ? ` Read on ${data.built_at.slice(0, 10)}.` : ''}
            </p>
          </section>
        </>
      )}
    </div>
  )
}
