import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, PILLAR_LABEL, type CompareRow, type RangeValue } from '../api'
import { ErrorBox, Explain, Loading, NotReported } from '../components/bits'
import { useApp, useLoad, usePageContext } from '../ctx'

const STATUS_LABEL: Record<CompareRow['status'], string> = {
  same: 'same', overlap: 'overlap', different: 'different', partial: 'missing for some', missing: 'not reported',
}

function Cell({ row, value }: { row: CompareRow; value: CompareRow['values'][number] }) {
  const [more, setMore] = useState(false)
  if (value === null || (Array.isArray(value) && value.length === 0)) return <NotReported />
  if (row.kind === 'set') {
    const shared = new Set(row.shared ?? [])
    return (
      <div className="pills">
        {(value as string[]).map((v) => (
          <span key={v} className={`pill ${shared.has(v) ? 'shared' : ''}`} title={shared.has(v) ? 'Shared by all selected experiments' : undefined}>
            {row.key === 'pillars' ? PILLAR_LABEL[v] ?? v : v}
          </span>
        ))}
      </div>
    )
  }
  if (row.kind === 'range') {
    const r = value as RangeValue
    return (
      <div>
        <b>{r.text}</b>
        <div className="tiny faint">{r.basis.join(' + ')}</div>
      </div>
    )
  }
  if (row.kind === 'long') {
    const t = value as string
    return (
      <div>
        <div className={more ? '' : 'clamp'}>{t}</div>
        {t.length > 320 && (
          <button className="btn sm ghost" style={{ marginTop: 4, padding: '0 4px' }} onClick={() => setMore((m) => !m)}>
            {more ? 'Show less' : 'Show all'}
          </button>
        )}
      </div>
    )
  }
  return <>{value as string}</>
}

export default function Compare() {
  const { meta, compare, setCompare } = useApp()
  const [sp, setSp] = useSearchParams()
  const [onlyDiff, setOnlyDiff] = useState(false)

  const ids = useMemo(() => {
    const fromUrl = (sp.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    return (fromUrl.length ? fromUrl : compare).slice(0, 4)
  }, [sp, compare])

  // keep the URL (shareable) and the selection in step
  useEffect(() => {
    const cur = sp.get('ids') ?? ''
    if (ids.join(',') !== cur) setSp(ids.length ? { ids: ids.join(',') } : {}, { replace: true })
    if (ids.join(',') !== compare.join(',')) setCompare(ids)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(',')])

  const update = (next: string[]) => {
    setCompare(next)
    setSp(next.length ? { ids: next.join(',') } : {}, { replace: true })
  }

  const ready = ids.length >= 2
  const { data, error, loading } = useLoad(() => (ready ? api.compare(ids) : Promise.resolve(null)), [ids.join(',')])

  usePageContext(
    'Experiment Comparison',
    ids,
    data ? `Similarities: ${data.similar.join('; ')}. Differences: ${data.different.join('; ')}. Missing: ${data.missing.join('; ')}` : '',
  )

  const rows = data ? (onlyDiff ? data.rows.filter((r) => r.status !== 'same') : data.rows) : []
  const names = data?.investigations.map((i) => i.short).join(' and ') ?? ''

  return (
    <div className="page stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h1>Experiment Comparison</h1>
        <p>
          Two to four experiments, side by side.
        </p>
      </div>

      <section className="panel tight stack-sm">
        <h4>Experiments to compare ({ids.length}/4)</h4>
        <div className="row">
          {ids.map((id) => (
            <button key={id} className="pill accent" onClick={() => update(ids.filter((x) => x !== id))} title="Remove from comparison">
              {meta?.investigations.find((i) => i.id === id)?.short ?? id} ✕
            </button>
          ))}
          {ids.length < 4 && (
            <select
              className="select" style={{ width: 'auto', minWidth: 220 }} value=""
              onChange={(e) => e.target.value && update([...ids, e.target.value])}
              aria-label="Add an experiment"
            >
              <option value="">+ Add an experiment…</option>
              {meta?.investigations.filter((i) => !ids.includes(i.id)).map((i) => (
                <option key={i.id} value={i.id}>
                  {i.short} ({i.id})
                </option>
              ))}
            </select>
          )}
          {ids.length > 0 && (
            <button className="btn sm ghost" onClick={() => update([])}>
              Clear
            </button>
          )}
        </div>
        {!ready && (
          <div className="stack-sm">
            <p className="small muted">Choose at least two experiments, or start from a suggested pair:</p>
            <div className="chips">
              {[
                ['PSI-25', 'PSI-26', 'BASS-II vs BASS (solids in a wind tunnel)'],
                ['PSI-102', 'PSI-101', 'SAME vs SAME-R (smoke detection)'],
              ].map(([a, b, label]) => (
                <button key={label} className="chip" onClick={() => update([a, b])}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {ready && loading && <Loading label="Comparing" />}
      {error && <ErrorBox message={error} />}

      {data && (
        <>
          <div className="grid c3">
            <section className="panel tight stack-sm">
              <h4 style={{ color: 'var(--good)' }}>What they share</h4>
              {data.similar.length ? (
                <ul className="dots small">
                  {data.similar.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              ) : (
                <p className="small muted">No attribute is shared by all of them.</p>
              )}
            </section>
            <section className="panel tight stack-sm">
              <h4 style={{ color: 'var(--ember)' }}>Where they differ</h4>
              {data.different.length ? (
                <ul className="dots small">
                  {data.different.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              ) : (
                <p className="small muted">No attribute is entirely different.</p>
              )}
            </section>
            <section className="panel tight stack-sm">
              <h4 style={{ color: 'var(--warn)' }}>Missing information</h4>
              {data.missing.length ? (
                <ul className="dots small">
                  {data.missing.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              ) : (
                <p className="small muted">Every compared attribute is reported for all of them.</p>
              )}
            </section>
          </div>

          <div className="between">
            <label className="row small" style={{ gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />
              Hide rows that are identical
            </label>
            <Explain q={`Compare ${names}: what are the most important similarities and differences for fire safety?`} label="Ask AI to interpret this comparison" />
          </div>

          <div className="panel scroll-x" style={{ padding: 0 }}>
            <table className="cmp">
              <thead>
                <tr>
                  <th className="attr">Attribute</th>
                  {data.investigations.map((i) => (
                    <th key={i.id}>
                      <Link to={`/explorer/${i.id}`}>{i.short}</Link>
                      <div className="tiny faint" style={{ fontWeight: 400 }}>
                        {i.id} ·{' '}
                        <a href={i.links.psi} target="_blank" rel="noreferrer">
                          NASA PSI ↗
                        </a>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className={row.status === 'same' || row.status === 'overlap' ? 'same' : row.status === 'different' ? 'different' : ''}>
                    <th className="attr" title={row.hint ?? undefined}>
                      {row.label}
                      <br />
                      <span className={`st ${row.status}`}>{STATUS_LABEL[row.status]}</span>
                      {row.kind === 'range' && row.overlap && (
                        <div className="tiny faint" style={{ fontWeight: 400, marginTop: 3 }}>
                          common range: {row.overlap.min === null ? 'up to ' : `${row.overlap.min} to `}
                          {row.overlap.max} {row.overlap.unit}
                        </div>
                      )}
                    </th>
                    {row.values.map((v, i) => (
                      <td key={i}>
                        <Cell row={row} value={v} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tiny faint">
            Green tags are shared by every selected experiment. Ranges show whether they come from a PSI run table or
            from the PSI record text. “Not reported” means the NASA record and its run tables give no value.
          </p>
        </>
      )}
    </div>
  )
}
