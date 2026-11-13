import { PILLAR_LABEL, type Facet, type Facets, type Filters } from '../api'

// The same filters are used by the Research Explorer and the Experiment Ranking.

const TEXT_KEYS = ['q', 'fuel_state', 'material', 'pillar', 'gravity', 'facility', 'topic'] as const
const NUM_KEYS = ['o2_min', 'o2_max', 'p_min', 'p_max', 'flow_min', 'flow_max'] as const

export function filtersFromParams(sp: URLSearchParams): Filters {
  const f: Filters = {}
  for (const k of TEXT_KEYS) {
    const v = sp.get(k)
    if (v) f[k] = v
  }
  for (const k of NUM_KEYS) {
    const v = sp.get(k)
    if (v !== null && v !== '' && !Number.isNaN(Number(v))) f[k] = Number(v)
  }
  if (sp.get('has_runs') === '1') f.has_runs = true
  return f
}

export function filtersToParams(f: Filters, base?: URLSearchParams): URLSearchParams {
  const sp = new URLSearchParams(base)
  for (const k of [...TEXT_KEYS, ...NUM_KEYS, 'has_runs']) sp.delete(k)
  for (const k of TEXT_KEYS) if (f[k]) sp.set(k, f[k] as string)
  for (const k of NUM_KEYS) if (f[k] !== undefined) sp.set(k, String(f[k]))
  if (f.has_runs) sp.set('has_runs', '1')
  return sp
}

export const activeCount = (f: Filters) => Object.keys(f).length

const GRAVITY_LABEL: Record<string, string> = { microgravity: 'Microgravity (flight)', ground: 'Ground analysis / modeling' }

function Select({
  label, value, options, onChange, format,
}: {
  label: string
  value: string | undefined
  options: Facet[]
  onChange: (v: string | undefined) => void
  format?: (v: string) => string
}) {
  return (
    <label className="field">
      {label}
      <select className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">Any</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {format ? format(o.value) : o.value} ({o.count})
          </option>
        ))}
      </select>
    </label>
  )
}

function Range({
  label, unit, lo, hi, bounds, onChange,
}: {
  label: string
  unit: string
  lo: number | undefined
  hi: number | undefined
  bounds: Facets['oxygen']
  onChange: (lo: number | undefined, hi: number | undefined) => void
}) {
  const num = (s: string) => (s === '' || Number.isNaN(Number(s)) ? undefined : Number(s))
  return (
    <div className="field" style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem', color: 'var(--muted)' }}>
      <span>
        {label} ({unit})
      </span>
      <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
        <input
          className="input" type="number" inputMode="decimal" placeholder="min" value={lo ?? ''} aria-label={`${label} minimum`}
          onChange={(e) => onChange(num(e.target.value), hi)}
        />
        <span>to</span>
        <input
          className="input" type="number" inputMode="decimal" placeholder="max" value={hi ?? ''} aria-label={`${label} maximum`}
          onChange={(e) => onChange(lo, num(e.target.value))}
        />
      </div>
      {bounds && (
        <span className="tiny faint">
          Tested range in the collection: {Number(bounds.min.toFixed(2))} to {Number(bounds.max.toFixed(2))} · reported by{' '}
          {bounds.reported_in} of 24
        </span>
      )}
    </div>
  )
}

export default function FilterPanel({
  filters, facets, onChange, showSearch = true,
}: {
  filters: Filters
  facets: Facets | null
  onChange: (f: Filters) => void
  showSearch?: boolean
}) {
  const set = (patch: Partial<Filters>) => {
    const next: Filters = { ...filters, ...patch }
    for (const k of Object.keys(next) as (keyof Filters)[]) {
      if (next[k] === undefined || next[k] === '' || next[k] === false) delete next[k]
    }
    onChange(next)
  }
  return (
    <div className="panel tight filters">
      <div className="between">
        <h4>Filters</h4>
        {activeCount(filters) > 0 && (
          <button className="btn sm ghost" onClick={() => onChange({})}>
            Clear all
          </button>
        )}
      </div>
      {showSearch && (
        <label className="field">
          Search by name or topic
          <input
            className="input" type="search" placeholder="e.g. smoke, PMMA, BASS" value={filters.q ?? ''}
            onChange={(e) => set({ q: e.target.value || undefined })}
          />
        </label>
      )}
      {facets ? (
        <>
          <Select label="Fuel state" value={filters.fuel_state} options={facets.fuel_state} onChange={(v) => set({ fuel_state: v })} />
          <Select label="Material or fuel" value={filters.material} options={facets.material} onChange={(v) => set({ material: v })} />
          <Select
            label="Research area" value={filters.pillar} options={facets.pillar} onChange={(v) => set({ pillar: v })}
            format={(v) => PILLAR_LABEL[v] ?? v}
          />
          <Select
            label="Gravity condition" value={filters.gravity} options={facets.gravity} onChange={(v) => set({ gravity: v })}
            format={(v) => GRAVITY_LABEL[v] ?? v}
          />
          <Range label="Oxygen level" unit="% O2" lo={filters.o2_min} hi={filters.o2_max} bounds={facets.oxygen}
            onChange={(lo, hi) => set({ o2_min: lo, o2_max: hi })} />
          <Range label="Pressure" unit="atm" lo={filters.p_min} hi={filters.p_max} bounds={facets.pressure}
            onChange={(lo, hi) => set({ p_min: lo, p_max: hi })} />
          <Range label="Forced airflow" unit="cm/s" lo={filters.flow_min} hi={filters.flow_max} bounds={facets.airflow}
            onChange={(lo, hi) => set({ flow_min: lo, flow_max: hi })} />
          <Select label="Topic" value={filters.topic} options={facets.topic} onChange={(v) => set({ topic: v })} />
          <Select label="Facility" value={filters.facility} options={facets.facility} onChange={(v) => set({ facility: v })} />
          <label className="row small" style={{ gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!filters.has_runs} onChange={(e) => set({ has_runs: e.target.checked || undefined })} />
            Has a run table (test-by-test data)
          </label>
          <p className="tiny faint">
            Range filters match experiments whose tested range touches yours. Experiments that do not report a value
            are left out of a range filter.
          </p>
        </>
      ) : (
        <span className="tiny muted">Loading filter options…</span>
      )}
    </div>
  )
}
