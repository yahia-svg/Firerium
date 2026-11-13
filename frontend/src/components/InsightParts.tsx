import { Link } from 'react-router-dom'
import { fmtRange, type InsightCard, type InsightData, type Lesson, type Tested } from '../api'
import { Cite, Explain, Quote } from './bits'

// The building blocks shared by the Fire Safety Insights and Lessons & Applications pages.

export function TestedConditions({ tested }: { tested: Tested[] }) {
  return (
    <div className="stack-sm">
      <h4>Conditions actually tested</h4>
      <div className="tested">
        {tested.map((t) => (
          <div key={t.id}>
            <Link to={`/explorer/${t.id}`}>
              <b>{t.short}</b>
            </Link>
            <div className="muted">
              O₂: <span className={t.conditions.oxygen ? '' : 'nr'}>{fmtRange(t.conditions.oxygen)}</span>
            </div>
            <div className="muted">
              Pressure: <span className={t.conditions.pressure ? '' : 'nr'}>{fmtRange(t.conditions.pressure)}</span>
            </div>
            <div className="muted">
              Airflow: <span className={t.conditions.airflow ? '' : 'nr'}>{fmtRange(t.conditions.airflow)}</span>
            </div>
            <div className="muted">{t.gravity}</div>
            {t.materials.length > 0 && <div className="faint tiny">{t.materials.slice(0, 5).join(', ')}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

export function DataTable({ data }: { data: InsightData }) {
  if (data.kind === 'flex_suppression')
    return (
      <div className="stack-sm">
        <div className="between">
          <h4>From the FLEX run log: agent, concentration, fuel, pressure, oxygen and outcome</h4>
          <Link className="btn sm" to="/charts?preset=flex-burn-co2">
            See the chart →
          </Link>
        </div>
        <div className="scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>Fuel</th>
                <th>Agent added</th>
                <th>Agent in atmosphere</th>
                <th>Oxygen</th>
                <th>Pressure</th>
                <th>Tests</th>
                <th title="Flame went out before the droplet was consumed">Extinction</th>
                <th title="Droplet burned away completely">Completion</th>
                <th title="Test ended for another reason">Disruption</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.fuel + r.agent}>
                  <td>{r.fuel}</td>
                  <td>{r.agent}</td>
                  <td className="num">{r.agent_pct ? `${r.agent_pct[0]} to ${r.agent_pct[1]}%` : '–'}</td>
                  <td className="num">
                    {r.oxygen_pct[0]} to {r.oxygen_pct[1]}%
                  </td>
                  <td className="num">
                    {r.pressure_atm[0]} to {r.pressure_atm[1]} atm
                  </td>
                  <td className="num">{r.runs}</td>
                  <td className="num">{r.extinction}</td>
                  <td className="num">{r.completion}</td>
                  <td className="num">{r.disruption}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tiny faint">
          {data.note}{' '}
          <a href={data.source_url} target="_blank" rel="noreferrer">
            Original NASA file ↗
          </a>
        </p>
      </div>
    )
  return (
    <div className="stack-sm">
      <h4>The same materials, burned in microgravity and on Earth (Saffire-II sample table)</h4>
      <div className="scroll-x">
        <table className="data">
          <thead>
            <tr>
              <th>Sample</th>
              <th>Material</th>
              <th>Thickness</th>
              <th>Airflow</th>
              <th>Microgravity: burn length</th>
              <th>Microgravity: spread</th>
              <th>Earth (1 g): burn length</th>
              <th>Earth (1 g): spread</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.sample}>
                <td>{r.sample}</td>
                <td>
                  {r.material}
                  {r.material_carried && (
                    <span className="faint tiny" title="The PSI table leaves this cell empty; the material of the row above is shown">
                      {' '}
                      (from row above)
                    </span>
                  )}
                </td>
                <td>{r.thickness}</td>
                <td>{r.flow}</td>
                <td>{r.micro_burn}</td>
                <td>{r.micro_spread}</td>
                <td>{r.earth_burn}</td>
                <td>{r.earth_spread}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.footnotes.map((f) => (
        <div key={f} className="tiny muted">
          {f}
        </div>
      ))}
      <p className="tiny faint">
        {data.note}{' '}
        <a href={data.source_url} target="_blank" rel="noreferrer">
          Original NASA file ↗
        </a>
      </p>
    </div>
  )
}

/** Short form: the point and its sources; every quote, limit, table and tested condition one click away. */
function CompactInsight({ c, n }: { c: InsightCard; n?: number }) {
  const sources = [...new Set(c.evidence.map((e) => e.source))]
  return (
    <article className="panel insight" style={{ gap: 12 }}>
      <div className="between" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <h3>
          {n !== undefined && <span className="faint">{n}. </span>}
          {c.title}
        </h3>
        <Explain q={`Explain this fire-safety insight in simple words and say how strong the evidence is: "${c.title}".`} />
      </div>
      <p className="small" style={{ color: 'var(--text-2)' }}>{c.text}</p>
      <div className="srcline">
        Sources:
        {sources.map((s) => (
          <Cite key={s} id={s} />
        ))}
      </div>
      <details className="src">
        <summary>
          <span className="small">NASA evidence & limits</span>
          <span className="tiny faint">▾</span>
        </summary>
        <div className="body">
          {c.evidence.map((e, i) => (
            <Quote key={i} e={e} />
          ))}
          {c.limits && (
            <div className="limits small">
              <b>Limits: </b>
              {c.limits}
            </div>
          )}
          {c.limit_evidence?.map((e, i) => (
            <Quote key={`l${i}`} e={e} />
          ))}
          {c.data && <DataTable data={c.data} />}
          {c.tested && <TestedConditions tested={c.tested} />}
        </div>
      </details>
    </article>
  )
}

export function InsightBlock({ c, n, compact = false }: { c: InsightCard; n?: number; compact?: boolean }) {
  if (compact) return <CompactInsight c={c} n={n} />
  const extra = c.evidence.slice(1)
  const more = extra.length + (c.tested?.length ? 1 : 0) + (c.limit_evidence?.length ?? 0)
  return (
    <article className="panel insight">
      <div className="between" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <h3>
          {n !== undefined && <span className="faint">{n}. </span>}
          {c.title}
        </h3>
        <Explain q={`Explain this fire-safety insight in simple words and say how strong the evidence is: "${c.title}".`} />
      </div>
      <p>{c.text}</p>
      {c.evidence[0] && <Quote e={c.evidence[0]} />}
      {c.data && <DataTable data={c.data} />}
      {c.limits && (
        <div className="limits small">
          <b>Limits: </b>
          {c.limits}
        </div>
      )}
      {more > 0 && (
        <details className="src">
          <summary>
            <span className="small">
              More evidence
              {extra.length > 0 ? ` · ${extra.length} more NASA source${extra.length > 1 ? 's' : ''}` : ''}
              {c.tested?.length ? ' · conditions tested' : ''}
            </span>
            <span className="tiny faint">▾</span>
          </summary>
          <div className="body">
            {extra.map((e, i) => (
              <Quote key={i} e={e} />
            ))}
            {c.limit_evidence?.map((e, i) => (
              <Quote key={`l${i}`} e={e} />
            ))}
            {c.tested && <TestedConditions tested={c.tested} />}
          </div>
        </details>
      )}
    </article>
  )
}

export function LessonBlock({ c }: { c: Lesson }) {
  const extra = c.evidence.slice(1)
  return (
    <article className="panel insight">
      <div className="between" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <div className="stack-sm" style={{ gap: 6 }}>
          <span className="tiny muted">{c.when} · {c.where}</span>
          <h3>{c.title}</h3>
        </div>
        <Explain q={`Explain what happened and what NASA learned: "${c.title}". Use NASA's own page.`} />
      </div>
      <p>{c.text}</p>
      {c.evidence[0] && <Quote e={c.evidence[0]} />}
      <p className="small">
        <b>Why it matters here: </b>
        {c.today}
      </p>
      <div className="row small muted">
        Related:
        {c.related.map((i) => (
          <Link key={i.id} className="cite" to={`/explorer/${i.id}`}>
            {i.short}
          </Link>
        ))}
        <Link to={c.to}>{c.link} →</Link>
      </div>
      {c.limits && (
        <div className="limits small">
          <b>Limits: </b>
          {c.limits}
        </div>
      )}
      {extra.length > 0 && (
        <details className="src">
          <summary>
            <span className="small">More from NASA’s page · {extra.length} quote{extra.length > 1 ? 's' : ''}</span>
            <span className="tiny faint">▾</span>
          </summary>
          <div className="body">
            {extra.map((e, i) => (
              <Quote key={i} e={e} />
            ))}
          </div>
        </details>
      )}
    </article>
  )
}
