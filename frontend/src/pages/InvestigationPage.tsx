import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, fmtRange, imageUrl, type Condition, type Investigation, type TableFull, type TableMeta } from '../api'
import { CompareToggle, ErrorBox, Explain, Loading, NotReported, Pillars } from '../components/bits'
import { useApp, useLoad, usePageContext } from '../ctx'

function ConditionBlock({ label, c, hint }: { label: string; c: Condition; hint: string }) {
  return (
    <div className="panel tight stack-sm">
      <div className="between">
        <h4>{label}</h4>
        <b className={c ? '' : 'nr'} style={{ fontSize: '1.05rem' }}>
          {fmtRange(c)}
        </b>
      </div>
      {!c && <p className="small muted">{hint}</p>}
      {c?.sources.map((s, i) => (
        <div key={i} className="small">
          <span className={`pill ${s.type === 'run_table' ? 'accent' : ''}`}>
            {s.type === 'run_table' ? 'From PSI run table' : 'Stated in PSI record'}
          </span>{' '}
          <span className="muted">
            {s.min === null ? `up to ${s.max}` : s.min === s.max ? s.max : `${s.min} to ${s.max}`} {s.unit}
            {s.column ? ` · column “${s.column}”` : ''}
          </span>
          {s.quote && <blockquote className="quote" style={{ marginTop: 6 }}>“{s.quote}”</blockquote>}
          {s.note && <div className="tiny faint" style={{ marginTop: 4 }}>{s.note}</div>}
        </div>
      ))}
    </div>
  )
}

function RunTable({ meta }: { meta: TableMeta }) {
  const [open, setOpen] = useState(false)
  const [limit, setLimit] = useState(25)
  const { data, error, loading } = useLoad<TableFull | null>(() => (open ? api.table(meta.id) : Promise.resolve(null)), [open, meta.id])
  return (
    <div className="panel tight stack-sm">
      <div className="between">
        <div>
          <h3>{meta.title}</h3>
          <div className="tiny muted">
            {meta.n_rows} rows · {meta.columns.filter((c) => !c.derived).length} columns · file “{meta.file_name}”
          </div>
        </div>
        <div className="row">
          <Link className="btn sm" to={`/charts?table=${encodeURIComponent(meta.id)}`}>
            Chart this table →
          </Link>
          <a className="btn sm" href={meta.source_url} target="_blank" rel="noreferrer" title="Download the original CSV from NASA PSI">
            Original CSV ↗
          </a>
          <button className="btn sm" onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide rows' : 'Show rows'}
          </button>
        </div>
      </div>
      <div className="pills">
        {meta.columns.map((c) => (
          <span key={c.key} className={`pill ${c.derived ? 'accent' : ''}`} title={c.derived ? c.formula : c.numeric ? `numeric, ${c.min} to ${c.max}` : `text, ${c.distinct} distinct values`}>
            {c.label}
            {c.derived ? ' (normalised)' : ''}
          </span>
        ))}
      </div>
      {meta.label_note && <div className="banner small">{meta.label_note}</div>}
      {meta.quality_notes.map((q) => (
        <div key={q} className="banner warn small">
          Data note: {q}
        </div>
      ))}
      {open && loading && <Loading label="Loading rows" />}
      {open && error && <ErrorBox message={error} />}
      {open && data && (
        <>
          <div className="scroll-x" style={{ maxHeight: 460, overflowY: 'auto' }}>
            <table className="data">
              <thead>
                <tr>
                  {data.columns.filter((c) => !c.derived).map((c) => (
                    <th key={c.key} style={{ position: 'sticky', top: 0 }}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.slice(0, limit).map((r, i) => (
                  <tr key={i}>
                    {data.columns.filter((c) => !c.derived).map((c) => (
                      <td key={c.key} className={c.numeric ? 'num' : ''}>
                        {r[c.key] || <span className="faint">–</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(data.footnotes ?? []).map((f) => (
            <div key={f} className="tiny muted">
              {f}
            </div>
          ))}
          {data.rows.length > limit && (
            <button className="btn sm" onClick={() => setLimit((l) => l + 100)}>
              Show more ({data.rows.length - limit} remaining)
            </button>
          )}
          <p className="tiny faint">Values are shown exactly as they appear in the NASA file. Empty cells are empty in the source.</p>
        </>
      )}
    </div>
  )
}

const TABS = ['Overview', 'Test conditions', 'Run data', 'Publications', 'Related'] as const
type Tab = (typeof TABS)[number]

function Body({ inv }: { inv: Investigation }) {
  const [tab, setTab] = useState<Tab>('Overview')
  const [imgOk, setImgOk] = useState(inv.has_image)
  const { shortName } = useApp()
  const count: Partial<Record<Tab, number>> = {
    'Run data': inv.table_details.length, Publications: inv.publications.length, Related: inv.related.length,
  }
  return (
    <div className="detail">
      <div className="stack">
        <section className="panel stack-sm">
          <div className="between">
            <h4>In plain words</h4>
            <span className="tiny faint">Written by the project team from the NASA record below</span>
          </div>
          <p style={{ fontSize: '1.03rem' }}>{inv.summary}</p>
          <p className="small muted">
            <b style={{ color: 'var(--text)' }}>Why it matters for fire safety: </b>
            {inv.safety_note}
          </p>
          <div className="row">
            <Explain q={`Explain what ${inv.short} studied and why it matters, in simple words.`} label="Explain this experiment" />
            <Explain q={`Which other experiments are related to ${inv.short}, and how do they differ?`} label="Find related experiments" />
          </div>
        </section>

        <div>
          <div className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                {t}
                {count[t] !== undefined ? ` (${count[t]})` : ''}
              </button>
            ))}
          </div>

          {tab === 'Overview' && (
            <div className="stack">
              <p className="tiny faint">
                The four sections below are NASA’s own words, copied from the PSI record without changes.
              </p>
              {(
                [
                  ['Objective', inv.text.objective], ['Approach', inv.text.approach],
                  ['Hypothesis', inv.text.hypothesis], ['Research impacts and Earth benefits', inv.text.impacts],
                ] as const
              ).map(([label, body]) => (
                <section key={label} className="stack-sm">
                  <h3>{label}</h3>
                  {body ? <div className="verbatim">{body}</div> : <NotReported />}
                </section>
              ))}
            </div>
          )}

          {tab === 'Test conditions' && (
            <div className="stack">
              <p className="small muted">
                Each value shows where it comes from: a PSI run table (computed from every row) or a sentence in the
                PSI record (quoted). If neither gives a value, it is “Not reported”; nothing is estimated.
              </p>
              <div className="grid c3">
                <ConditionBlock label="Oxygen" c={inv.conditions.oxygen} hint="No oxygen level in the PSI record text or run tables." />
                <ConditionBlock label="Pressure" c={inv.conditions.pressure} hint="No pressure in the PSI record text or run tables." />
                <ConditionBlock label="Forced airflow" c={inv.conditions.airflow} hint="No forced-airflow speed in the PSI record text or run tables." />
              </div>
              <dl className="kv panel tight">
                <dt>Gravity</dt>
                <dd>
                  {inv.gravity.label}
                  {inv.gravity.note && <div className="tiny muted">{inv.gravity.note}</div>}
                </dd>
                <dt>Fuel state</dt>
                <dd>
                  {inv.fuel_state.join(', ')}
                  {inv.emulates && <span className="muted"> (emulates {inv.emulates})</span>}
                </dd>
                <dt>Sample / burner</dt>
                <dd>{inv.geometry ?? <NotReported />}</dd>
                <dt>Materials and fuels</dt>
                <dd>{inv.materials.length ? inv.materials.join(', ') : <NotReported />}</dd>
                <dt>Suppressant / diluent</dt>
                <dd>{inv.suppressants.length ? inv.suppressants.join(', ') : <NotReported />}</dd>
                <dt>Other gases named</dt>
                <dd>{inv.gases.length ? inv.gases.join(', ') : <NotReported />}</dd>
                <dt>Sensors and diagnostics</dt>
                <dd>{inv.sensors.length ? inv.sensors.join(', ') : <NotReported />}</dd>
              </dl>
              <p className="tiny faint">
                Materials, gases and sensors are tagged when the term appears in this record’s objective, approach,
                keywords, hardware field or run tables.
              </p>
            </div>
          )}

          {tab === 'Run data' && (
            <div className="stack">
              {inv.table_details.length === 0 && (
                <div className="banner">
                  PSI provides no experimental run table for this investigation.
                  {inv.reuses.length > 0 && (
                    <>
                      {' '}
                      It re-analyses data from{' '}
                      {inv.reuses.map((r) => (
                        <Link key={r} className="cite" to={`/explorer/${r}`}>
                          {shortName(r)}
                        </Link>
                      ))}
                      .
                    </>
                  )}
                </div>
              )}
              {inv.table_details.map((t) => (
                <RunTable key={t.id} meta={t} />
              ))}
              {inv.archive_gb && (
                <p className="tiny faint">
                  The full PSI archive for this investigation (images, video, raw data) is about {inv.archive_gb} GB and is
                  available from the NASA PSI page. This site uses the experimental run tables.
                </p>
              )}
            </div>
          )}

          {tab === 'Publications' && (
            <div className="stack-sm">
              {inv.publications.length === 0 && <NotReported />}
              {inv.publications.map((p, i) => (
                <div key={i} className="panel tight">
                  <div>{p.url ? <a href={p.url} target="_blank" rel="noreferrer">{p.title} ↗</a> : p.title}</div>
                  {p.authors && <div className="tiny muted">{p.authors}</div>}
                </div>
              ))}
              <p className="tiny faint">Publication list as given in the PSI record.</p>
            </div>
          )}

          {tab === 'Related' && (
            <div className="stack-sm">
              <p className="small muted">Suggested from shared materials, topics, hardware and wording, plus links NASA lists in PSI. The reasons are shown so you can judge each suggestion.</p>
              {inv.related.map((r) => (
                <div key={r.investigation.id} className="panel tight stack-sm">
                  <div className="between">
                    <h3>
                      <Link to={`/explorer/${r.investigation.id}`}>{r.investigation.short}</Link>
                    </h3>
                    <div className="row">
                      <Link className="btn sm" to={`/compare?ids=${inv.id},${r.investigation.id}`}>
                        ⇄ Compare with {inv.short}
                      </Link>
                    </div>
                  </div>
                  <p className="small muted">{r.investigation.summary}</p>
                  <ul className="dots small">
                    {r.reasons.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <aside className="stack">
        {imgOk && (
          <figure style={{ margin: 0 }}>
            <img className="thumb" src={imageUrl(inv.id)} alt={`Representative image for ${inv.short} from NASA PSI`} onError={() => setImgOk(false)} />
            <figcaption className="tiny faint">Representative image from the NASA PSI record</figcaption>
          </figure>
        )}
        <section className="panel tight stack-sm">
          <h4>Sources</h4>
          <a className="btn" href={inv.links.psi} target="_blank" rel="noreferrer">
            NASA PSI record ↗
          </a>
          {inv.links.doi && (
            <a className="btn" href={inv.links.doi} target="_blank" rel="noreferrer">
              Dataset DOI ↗
            </a>
          )}
          {inv.hardware_links.map((u) => (
            <a key={u} className="small" href={u} target="_blank" rel="noreferrer" style={{ overflowWrap: 'anywhere' }}>
              Hardware page ↗ <span className="faint">{new URL(u).hostname}</span>
            </a>
          ))}
        </section>
        {inv.nasa_resources && inv.nasa_resources.length > 0 && (
          <section className="panel tight stack-sm">
            <h4>In NASA’s official resources</h4>
            <p className="tiny muted" style={{ margin: 0 }}>
              What the resources NASA listed for the challenge say about this experiment. NASA’s words, not the PSI
              record. <Link to="/resources">All resources →</Link>
            </p>
            {inv.nasa_resources.map((m, i) => (
              <blockquote key={i} className="quote" style={{ fontSize: '0.8rem' }}>
                {m.excerpt}
                {m.excerpt.length >= 520 ? '…' : ''}
                <footer>
                  <Link to={`/resources#${m.resource_id}`}>{m.resource}</Link>
                  {m.document.startsWith('Fact sheet') ? `, ${m.document}` : ''}
                  {m.page ? `, p. ${m.page}` : m.section.startsWith('transcript') ? `, ${m.section}` : ''}
                  {m.family ? ` (about the ${m.family} series as a whole)` : ''}
                  {' · '}
                  <a href={m.url} target="_blank" rel="noreferrer">
                    Open ↗
                  </a>
                </footer>
              </blockquote>
            ))}
          </section>
        )}
        <section className="panel tight">
          <dl className="kv" style={{ gridTemplateColumns: '104px minmax(0,1fr)' }}>
            <dt>PSI accession</dt>
            <dd>{inv.id}</dd>
            <dt>Type</dt>
            <dd>{inv.project_type}</dd>
            <dt>PSI sub-area</dt>
            <dd>{inv.sub_area ?? <NotReported />}</dd>
            <dt>Platform</dt>
            <dd>{inv.platform ?? <NotReported />}</dd>
            <dt>Facility</dt>
            <dd>{inv.facilities.length ? inv.facilities.join(', ') : <NotReported />}</dd>
            <dt>Hardware</dt>
            <dd>{inv.hardware ?? <NotReported />}</dd>
            <dt>Principal investigator</dt>
            <dd>{inv.pi ?? <span className="nr">None listed with that role</span>}</dd>
            <dt>Dates</dt>
            <dd>{inv.start_date || inv.end_date ? `${inv.start_date ?? '?'} to ${inv.end_date ?? '?'}` : <NotReported />}</dd>
            <dt>License</dt>
            <dd>{inv.license ?? <NotReported />}</dd>
          </dl>
        </section>
        {inv.team.length > 0 && (
          <section className="panel tight stack-sm">
            <h4>Team listed in PSI</h4>
            {inv.team.map((m) => (
              <div key={m.name + m.role} className="small">
                {m.name} <span className="muted">· {m.role || 'role not given'}</span>
              </div>
            ))}
          </section>
        )}
        {inv.reused_by.length > 0 && (
          <section className="panel tight stack-sm">
            <h4>Later studies that reuse this data</h4>
            {inv.reused_by.map((r) => (
              <Link key={r.id} to={`/explorer/${r.id}`} className="small">
                {r.name}
              </Link>
            ))}
          </section>
        )}
        {inv.keywords.length > 0 && (
          <section className="panel tight stack-sm">
            <h4>PSI keywords</h4>
            <div className="pills">
              {inv.keywords.map((k) => (
                <span key={k} className="pill">
                  {k}
                </span>
              ))}
            </div>
          </section>
        )}
      </aside>
    </div>
  )
}

export default function InvestigationPage() {
  const { id = '' } = useParams()
  const { data, error, loading } = useLoad(() => api.investigation(id), [id])
  usePageContext(data ? `Experiment profile: ${data.short}` : 'Experiment profile', id ? [id] : [])
  return (
    <div className="page stack">
      <div className="small">
        <Link to="/explorer">← Research Explorer</Link>
      </div>
      {loading && <Loading label="Loading the investigation" />}
      {error && <ErrorBox message={error} />}
      {data && (
        <>
          <div className="page-head" style={{ marginBottom: 0 }}>
            <div className="between" style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <h1>{data.name}</h1>
                <p>
                  {data.title} · {data.id}
                </p>
              </div>
              <CompareToggle id={data.id} />
            </div>
            <div className="pills" style={{ marginTop: 10 }}>
              <Pillars pillars={data.pillars} />
              <span className="pill">{data.gravity.label}</span>
              {data.fuel_state.map((f) => (
                <span key={f} className="pill">
                  {f}
                </span>
              ))}
              {data.topics.map((t) => (
                <span key={t} className="pill">
                  {t}
                </span>
              ))}
            </div>
          </div>
          <Body key={data.id} inv={data} />
        </>
      )}
    </div>
  )
}
