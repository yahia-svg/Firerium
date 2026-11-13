// Typed client for the Flame in Freefall API. Every page reads the same shared data.

export type ConditionSource = {
  type: 'run_table' | 'psi_text'
  min: number | null
  max: number
  unit: string
  table_id?: string
  column?: string
  quote?: string
  note?: string | null
}
export type Condition = { min: number | null; max: number; unit: string; sources: ConditionSource[] } | null
export type Conditions = { oxygen: Condition; pressure: Condition; airflow: Condition }

export type Card = {
  id: string
  acronym: string | null
  name: string
  short: string
  title: string
  sub_area: string | null
  project_type: string
  gravity: { level: 'microgravity' | 'ground'; label: string; note: string | null }
  platform: string | null
  facilities: string[]
  fuel_state: string[]
  emulates: string | null
  pillars: string[]
  topics: string[]
  geometry: string | null
  directness: number
  materials: string[]
  sensors: string[]
  conditions: Conditions
  summary: string
  safety_note: string
  n_runs: number
  tables: { id: string; title: string; n_rows: number }[]
  has_image: boolean
  links: { psi: string; doi: string | null }
  suppressants: string[]
  reuses: string[]
  psi_related: string[]
  pi: string | null
}

export type Column = {
  key: string
  label: string
  numeric: boolean
  derived?: boolean
  formula?: string
  min?: number
  max?: number
  filled: number
  distinct?: number
}
export type TableMeta = {
  id: string
  title: string
  file_name: string
  source_url: string
  n_rows: number
  columns: Column[]
  label_note: string | null
  quality_notes: string[]
  footnotes?: string[]
}
export type TableFull = TableMeta & {
  rows: Record<string, string>[]
  investigation: { id: string; short: string; name: string; psi: string }
}

export type Related = { investigation: Card; score: number; reasons: string[] }
export type Investigation = Card & {
  research_area: string
  hardware: string | null
  hardware_links: string[]
  start_date: string | null
  end_date: string | null
  team: { name: string; role: string }[]
  keywords: string[]
  text: { objective: string; approach: string; hypothesis: string; impacts: string }
  publications: { title: string; authors: string; doi: string | null; url: string | null }[]
  license: string | null
  archive_gb: number | null
  gases: string[]
  table_details: TableMeta[]
  related: Related[]
  reused_by: { id: string; short: string; name: string }[]
  nasa_resources?: ResourceMention[]
}
/** A sentence in one of the official NASA resources that names this experiment. */
export type ResourceMention = {
  resource_id: string
  resource: string
  document: string
  section: string
  page: number | null
  url: string
  direct: boolean
  family: string | null
  excerpt: string
}

export type Environment = {
  id: string
  name: string
  tagline: string
  gravity: 'microgravity' | 'partial'
  g_label: string
  oxygen: [number, number]
  pressure: [number, number]
  atmosphere_label: string
  atmosphere_basis: string
  assumption: string | null
  needs: string[]
  weights: Record<string, number>
}

export type Facet = { value: string; count: number }
export type Facets = {
  fuel_state: Facet[]
  material: Facet[]
  pillar: Facet[]
  gravity: Facet[]
  facility: Facet[]
  topic: Facet[]
  oxygen: { min: number; max: number; unit: string; reported_in: number } | null
  pressure: { min: number; max: number; unit: string; reported_in: number } | null
  airflow: { min: number; max: number; unit: string; reported_in: number } | null
  total: number
}

export type Filters = {
  q?: string
  fuel_state?: string
  material?: string
  pillar?: string
  gravity?: string
  facility?: string
  topic?: string
  o2_min?: number
  o2_max?: number
  p_min?: number
  p_max?: number
  flow_min?: number
  flow_max?: number
  has_runs?: boolean
}

export type Meta = {
  built_at: string
  source: string
  psi_total_investigations: string
  combustion_investigations: string
  run_tables: string
  runs: string
  chunks: string
  llm: {
    available: boolean
    configured: boolean
    verified: boolean | null // true: key accepted by the API; false: rejected; null: not checked or unreachable
    model: string | null
    provider?: string | null
    pricing?: { prompt: number; completion: number } | null // USD per token
    session?: { requests: number; prompt_tokens: number; completion_tokens: number; cost_usd: number }
    last_error: string | null
  }
  data_use?: {
    archive_bytes: number
    largest: { id: string; short: string; gb: number }[]
    used_bytes: number | null
    records_bytes?: number | null
    tables_bytes?: number | null
    images_bytes?: number | null
    images: number
    database_bytes: number
    documents?: number
    documents_bytes?: number | null
    document_passages?: number
    experiments_with_documents?: number
    resources?: number
    resource_documents?: number
    resource_passages?: number
    resources_bytes?: number | null
  }
  resources?: { id: string; short: string; title: string; url: string }[]
  environments: Environment[]
  investigations: { id: string; short: string; name: string; n_runs: number }[]
  disclaimer: string
}

export type EnvSummary = {
  mode: 'ai' | 'computed'
  model?: string
  headline: string
  safety_needs: string[]
  insights: string[]
  gaps: string[]
  note: string
  notice?: string
  facts: {
    environment: Environment
    total: number
    flight: number
    oxygen_in_band: string[]
    oxygen_in_band_solids: string[]
    pressure_in_band: string[]
    oxygen_and_pressure_in_band: string[]
    highest_oxygen_tested_on_solids: number | null
    oxygen_not_reported: string[]
    by_pillar: Record<string, string[]>
    top: { id: string; short: string; score: number }[]
  }
}

export type Estimate = {
  mode: 'ai' | 'retrieval' | 'none'
  model?: string
  requested: string[]
  nearest: { investigation: Card; meets: string[]; misses: string[] }[]
  label: string
  note: string
  message?: string
  estimate: string | null
  reasoning?: string[]
  confidence?: string
  caveats?: string[]
}

export type Breakdown = {
  factor: string
  label: string
  value: number
  weight: number
  points: number
  max_points: number
  why: string
}
export type Ranking = {
  environment: Environment
  weights: Record<string, number>
  focus: string | null
  factors: Record<string, { label: string; explain: string }>
  method: string
  results: { investigation: Card; score: number; rank: number; breakdown: Breakdown[] }[]
}
export type CustomRanking = {
  mode: 'ai' | 'retrieval'
  model: string | null
  criterion: string
  interpretation: string
  method: string
  notice?: string | null
  results: { investigation: Card; score: number; rank: number; why: string }[]
}

export type RangeValue = { min: number | null; max: number; unit: string; text: string; basis: string[] }
export type CompareRow = {
  key: string
  label: string
  kind: 'set' | 'text' | 'long' | 'range'
  status: 'same' | 'overlap' | 'different' | 'partial' | 'missing'
  values: (string | string[] | RangeValue | null)[]
  shared?: string[]
  overlap?: { min: number | null; max: number; unit: string } | null
  hint?: string | null
}
export type Comparison = {
  investigations: Card[]
  rows: CompareRow[]
  similar: string[]
  different: string[]
  missing: string[]
}

/** `source` is a PSI accession, CHALLENGE, or RES-n for one of the official NASA resources. */
export type Evidence = {
  source: string; section: string; quote: string; short: string; label: string; url?: string
  source_type?: 'resource'; title?: string
}
export type Tested = {
  id: string
  short: string
  materials: string[]
  conditions: Conditions
  gravity: string
  n_runs: number
}
export type FlexRow = {
  fuel: string
  agent: string
  runs: number
  agent_pct: [number, number] | null
  oxygen_pct: [number, number]
  pressure_atm: [number, number]
  extinction: number
  completion: number
  disruption: number
}
export type SaffireRow = {
  sample: string
  material: string
  material_carried: boolean
  thickness: string
  flow: string
  oxygen: string
  micro_burn: string
  micro_spread: string
  earth_burn: string
  earth_spread: string
}
export type InsightData =
  | { kind: 'flex_suppression'; table_id: string; source_url: string; note: string; rows: FlexRow[] }
  | {
      kind: 'saffire2_gravity'
      table_id: string
      source_url: string
      note: string
      footnotes: string[]
      rows: SaffireRow[]
    }
export type InsightCard = {
  title: string
  text: string
  evidence: Evidence[]
  limits?: string
  limit_evidence?: Evidence[]
  tested?: Tested[]
  data?: InsightData
}
export type Insights = {
  sections: { id: string; title: string; meaning: string; cards: InsightCard[]; investigations: Card[] }[]
  material_coverage: { material: string; investigations: { id: string; short: string }[] }[]
  next_gen: InsightCard[]
  earth_vs_micro: {
    example: InsightCard
    points: { aspect: string; earth: string; micro: string; evidence: Evidence[] }[]
    data: InsightData
  }
  earth_applications: InsightCard[]
  lessons?: Lesson[]
  disclaimer: string
}
/** What a past accident taught, from one of NASA's lessons-learned or history pages. */
export type Lesson = InsightCard & {
  id: string
  resource: string
  when: string
  where: string
  today: string
  to: string
  link: string
  url: string
  related: { id: string; short: string }[]
}

export type Preset = {
  id: string
  table_id: string
  type: 'scatter' | 'histogram'
  x: string
  y?: string
  color?: string
  title: string
  what: string
  read: string
  investigation_id: string
  investigation: string
  table_title: string
}
export type TableListItem = {
  id: string
  title: string
  investigation_id: string
  investigation: string
  n_rows: number
  numeric_columns: number
  columns: Column[]
}
export type EnvelopePoint = {
  id: string
  short: string
  oxygen: number
  pressure: number | null
  material: string | null
  fuel_state: string
  table_id: string
}
export type Envelope = {
  points: EnvelopePoint[]
  oxygen_only: EnvelopePoint[]
  environments: Environment[]
  notes: string[]
  explain: string
}

export type Source = {
  id: string
  short: string
  name: string
  url: string | null
  doi?: string | null
  passages: { section: string; text: string }[]
}
export type Action = { type: 'open' | 'compare' | 'rank' | 'charts' | 'insights'; ids: string[]; label: string }
export type SourceKind =
  | 'report' | 'analysed' | 'science_doc' | 'record' | 'conditions' | 'challenge' | 'project' | 'index' | 'resource'
/** One numbered reference of an answer: the exact passage a statement cites. */
export type Ref = {
  n: number
  id: string // PSI-n, CHALLENGE, or RES-n for an official NASA resource
  source_type?: 'investigation' | 'challenge' | 'resource'
  short: string
  name: string
  kind: SourceKind
  kind_label: string
  section: string
  document: string | null
  page: number | null
  file_url: string | null // the NASA file the passage was read from
  psi: string | null
  doi: string | null
  text: string
  similarity: number | null
}
/** One statement of an answer with the evidence behind it, checked in code after the model wrote it. */
export type LedgerRow = {
  text: string
  refs: number[]
  basis: SourceKind | 'background' | 'none'
  basis_label: string
  status: 'verified' | 'cited' | 'check' | 'background' | 'uncited'
  numbers: { text: string; found: boolean }[]
}
export type Checks = {
  statements: number
  cited: number
  nasa_cited: number
  background: number
  uncited: number
  numbers: number
  numbers_found: number
  by_basis: Record<string, number>
  removed_citations: number
}
export type Trace = {
  searched: number
  searched_by_kind: Record<string, number>
  index_lines: number
  search_mode: string
  scope: { ids: string[]; kinds: string[] }
  given: { sid: string; kind_label: string; short: string; section: string; similarity: number }[]
  seconds: number
  tokens_in?: number
  tokens_out?: number
  cost_usd?: number | null
  model?: string
}
export type TaskId = 'ask' | 'findings' | 'compare' | 'design' | 'explain'
export type Answer = {
  mode: 'ai' | 'retrieval'
  model: string | null
  task: TaskId
  answer: string // markdown; citations appear as [#1], [#2]... and point into `refs`
  grounding: 'supported' | 'partial' | 'not_in_collection' | 'off_topic'
  /** A gap in NASA's own research that bears on the question (never a limit of this site). */
  research_gap?: string
  follow_ups: string[]
  actions: Action[]
  refs: Ref[]
  sources: Source[]
  ledger: LedgerRow[]
  checks: Checks
  trace: Trace
  removed_citations: string[]
  notice?: string
}
export type ChatMessage = {
  role: 'user' | 'assistant'; content: string; mode?: string; answer?: Answer; task?: TaskId
  /** text the reader selected on the page and asked about */
  quote?: string
}
export type AskScope = { ids: string[]; kinds: SourceKind[] }
export type Library = {
  passages: number
  search_mode: string
  kinds: { kind: SourceKind; label: string; passages: number }[]
  documents: {
    id: number; investigation_id: string; short: string; kind: SourceKind; kind_label: string; title: string
    pages: number; pages_used: number; words: number; url: string
  }[]
  experiments_with_documents: number
  experiments_without: { id: string; short: string }[]
  not_usable: { accession: string; file_name: string; why: string }[]
  resources?: {
    id: string; short: string; title: string; url: string; kind_name: string; passages: number
    documents: { title: string; type: string; pages: number | null; passages: number; url: string }[]
  }[]
  llm: Meta['llm']
}

/** The answer text with [#n] turned back into [PSI-n] tags, for the conversation history and the PDF report. */
export function plainCitations(a: Answer): string {
  return a.answer.replace(/\[#(\d+)\]/g, (_, n: string) => {
    const r = a.refs.find((x) => x.n === Number(n))
    return r ? `[${r.id}]` : ''
  })
}
export type AskContext = { page: string; ids?: string[]; note?: string }

// ---- stage 2: research gaps, predictive model + What-If, mission report ----
export type IdShort = { id: string; short: string }
export type CoverStatus = 'none' | 'thin' | 'covered' | 'unreported'
export type GapCell = { label: string; hint: string | null; count: number; ids: IdShort[]; status: CoverStatus; runs?: number }
export type GapDimension = { id: string; title: string; explain: string; cells: GapCell[]; fixed: boolean }
export type GapHeadline = {
  id: string
  kind: 'none' | 'thin' | 'unreported'
  title: string
  text: string
  ids: string[]
  evidence: Evidence[]
  to: string
  link: string
  table?: { agent: string; fuel_types: string[]; ids: string[] }[]
}
export type GapQuestion = { because: string; question: string; closest: string[] }
export type GapItem = { id: string; short: string; n_runs: number; dims: Record<string, string[]>; runs: Record<string, Record<string, number>> }
export type HabitatFit = {
  environment: Environment
  rows: { label: string; count: number; status: CoverStatus; ids: IdShort[] }[]
}
export type Gaps = {
  basis: { selected: number; total: number; filters: string[]; runs: number; built_at: string; source: string }
  disclaimer: string
  none_label: string
  legend: Record<CoverStatus, string>
  headlines: GapHeadline[]
  questions: GapQuestion[]
  questions_note: string
  dimensions: GapDimension[]
  items: GapItem[]
  habitat: HabitatFit | null
  not_comparable: {
    text: string
    points: { aspect: string; earth: string; micro: string; evidence: Evidence[] }[]
    with_1g_values: IdShort[]
  }
}

export type TableRef = { id: string; title: string; source_url: string; investigation: { id: string; short: string; psi: string } }
export type WhatIfValues = { oxygen: number; co2: number; helium: number; pressure: number; diameter: number }
export type ModelInput = {
  key: keyof WhatIfValues
  label: string
  unit: string
  step: number
  decimals: number
  default: number
  column: string
  ranges: Record<string, [number, number]>
  per_unit: number
}
export type TestedCondition = WhatIfValues & { tests: number }
export type FuelMetrics = { n: number; mae: number; baseline_mae: number; r2: number; rate_range: [number, number] }
export type ModelCard = {
  available: boolean
  version: string
  label: string
  question: string
  target: { label: string; unit: string }
  target_explain: string
  table: TableRef
  not_supported: { name: string; why: string; to: string; link: string; ids: string[] }[]
  reason: string | null
  method?: string
  split?: string
  rows_total?: number
  rows_used?: number
  rows_dropped?: string
  fuels?: string[]
  inputs?: ModelInput[]
  fuel_effect?: number
  metrics?: {
    mae: number
    r2: number
    baseline_mae: number
    baseline_r2: number
    baseline: string
    improvement_pct: number
    by_fuel: Record<string, FuelMetrics>
  }
  interval?: string
  oof?: { measured: number; predicted: number; fuel: string; test: string }[]
  tested_conditions?: Record<string, TestedCondition[]>
  support?: string
  limitations?: string[]
}
export type NearestRun = WhatIfValues & { test: string; fuel: string; date: string; end: string; measured: number; distance: number }
export type Estimate80 = { value: number; unit: string; low: number; high: number; typical_error: number }
export type WhatIf = {
  label: string
  version: string
  fuel: string
  inputs: WhatIfValues
  table: TableRef
  status: 'ok' | 'invalid' | 'no_model'
  message: string
  problems: { input: string; label: string; message: string }[]
  /** non-blocking cautions: an input outside the tested range, an untested combination, a flame that may not exist */
  warnings?: { input: string; label: string; message: string }[]
  /** 0-100: how far the scenario is from the real FLEX tests, and how well the model predicts this fuel */
  confidence?: number
  confidence_label?: 'High' | 'Moderate' | 'Low' | 'Very low'
  confidence_note?: string
  extrapolated?: boolean
  collection_evidence: { id: string; short: string; fuel_state: string; summary: string; oxygen_rows: number; both_rows: number }[]
  evidence_note: string
  nearest_runs?: NearestRun[]
  tested_conditions?: TestedCondition[]
  support?: 'close' | 'weak' | 'none'
  estimate?: Estimate80
  reference?: { value: number; inputs: WhatIfValues; text: string }
  effects?: { key: string; label: string; delta: number; from: number; to: number; unit: string }[]
  sparse_note?: string | null
  curve?: { x: number[]; y: (number | null)[]; low: (number | null)[]; high: (number | null)[]; backed?: boolean[] }
  measured?: (WhatIfValues & { rate: number; test: string })[]
}

// ---- the Predictions page: several models, one engine ----
export type PredictInput = {
  key: string; label: string; unit: string; step: number; decimals: number
  default: number; defaults: Record<string, number>
  form: [number, number] // slider range
  ranges: Record<string, [number, number]> // tested range per group
}
export type PredictModel = {
  id: string; title: string; short: string; question: string; kind: 'reg' | 'class'; unit: string; decimals: number
  target_label: string; higher: string; limits: string[]; available: boolean; reason: string | null
  table: TableRef; groups?: string[]; group_label?: string; gases?: string[]; rows?: number
  metrics?: { error: number; baseline_error: number; r2?: number; auc?: number; accuracy?: number; error_name: string; baseline_name: string; improvement_pct: number }
  inputs?: PredictInput[]
}
export type Place = { id: string; name: string; oxygen: number; pressure: number; label: string }
export type PredictCatalog = { models: PredictModel[]; places: Place[]; label: string }
export type Prediction = {
  status: 'ok' | 'invalid' | 'no_model'; message?: string; label: string; model?: string; group?: string
  inputs?: Record<string, number>; kind?: 'reg' | 'class'; unit?: string; table?: TableRef
  estimate?: { value: number; low: number | null; high: number | null; typical_error: number | null }
  confidence?: number; confidence_label?: string; extrapolated?: boolean; support?: 'close' | 'weak' | 'far'
  warnings?: string[]; reference?: { value: number; text: string }
  effects?: { key: string; label: string; from: number; to: number; unit: string; delta: number }[]
  curve?: { x: number[]; y: number[]; backed: boolean[] } | null
  measured?: { x: number; y: number; id: string }[]
  nearest?: { id: string; values: Record<string, number>; measured: number | string }[]
  evidence?: { id: string; short: string; fuel_state: string; summary: string; oxygen_rows: number; both_rows: number }[]
}
export type BatchResult = {
  status: string; message?: string; group?: string; value?: number; low?: number | null; high?: number | null
  confidence?: number; extrapolated?: boolean
}

export type HabitatModel = {
  label: string
  version: string
  note: string
  skipped: string[]
  table: TableRef
  rows: { fuel: string; oxygen: number; pressure: number; support: 'close' | 'weak'; confidence?: number; estimate: Estimate80; air: Estimate80; change_pct: number }[]
}
export type MissionRanked = {
  id: string
  short: string
  title: string
  rank: number
  score: number
  summary: string
  safety_note: string
  pillars: string[]
  gravity: string
  materials: string[]
  oxygen: string
  pressure: string
  airflow: string
  n_runs: number
  reasons: { label: string; points: number; max_points: number; why: string }[]
  psi: string
}
export type MissionReport = {
  title: string
  generated: string
  environment: Environment
  focus: string | null
  briefing: { mode: 'ai' | 'computed'; model?: string | null; headline: string; safety_needs: string[]; insights: string[]; gaps: string[]; note: string }
  ranking: { method: string; weights: Record<string, number>; factors: Record<string, string>; results: MissionRanked[] }
  sections: {
    id: string
    title: string
    meaning: string
    points: { title: string; text: string; limits?: string | null; evidence: Evidence[]; sources: string[] }[]
  }[]
  lessons?: {
    title: string; when: string; where: string; text: string; today: string; limits?: string | null
    evidence: Evidence[]; url: string; sources: string[]
  }[]
  gaps: { habitat: HabitatFit; headlines: GapHeadline[]; questions: GapQuestion[]; questions_note: string; disclaimer: string }
  model: HabitatModel | null
  references: { id: string; short: string; text: string; url: string | null; doi: string | null }[]
  disclaimer: string
  data: { source: string; built_at: string; investigations: number }
}

// ---- the official NASA resources listed for the challenge ----
export type ResourceDoc = {
  n: number; type: 'page' | 'pdf' | 'captions'; title: string; url: string; pages: number | null
  passages: number; words: number; fetched: string; bytes: number
}
export type NasaResource = {
  id: string
  kind: string
  kind_name: string
  short: string
  title: string
  url: string
  description: string // NASA's own words, from the organisers' resource list
  topic: 'data' | 'science' | 'lessons' | 'earth'
  video: { youtube_id: string; nasa_id: string; nasa_page: string } | null
  note: string | null
  documents: ResourceDoc[]
  passages: number
  words: number
  use: string // how this site uses it (project team's wording)
  ask: string[]
  used_in: { label: string; to: string }[]
  highlights: Evidence[]
  experiments: { id: string; short: string; passages: number }[]
  psi?: { investigations: number; runs: number; tables: number; documents: number; document_passages: number }
  transcript?: { section: string; url: string; text: string }[]
}
export type Resources = {
  source_list: string | null
  built_at: string | null
  resources: NasaResource[]
  totals: { resources: number; read: number; documents: number; passages: number; words: number }
  not_usable: { id: string; file: string; why: string; url?: string }[]
  left_out: Record<string, number>
  not_read: string[]
  note: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, init)
  } catch {
    throw new Error('Cannot reach the data server. Is the backend running on port 8000?')
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status}).`
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') detail = body.detail
    } catch {
      /* keep the generic message */
    }
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}

const post = <T,>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export const api = {
  meta: () => request<Meta>('/api/meta'),
  search: (filters: Filters) =>
    post<{ count: number; total: number; filters: string[]; results: Card[]; facets: Facets }>(
      '/api/investigations/search',
      filters,
    ),
  investigation: (id: string) => request<Investigation>(`/api/investigations/${id}`),
  envSummary: (id: string) => request<EnvSummary>(`/api/environments/${id}/summary`),
  estimate: (filters: Filters) => post<Estimate>('/api/explorer/estimate', filters),
  ranking: (body: { environment: string; weights?: Record<string, number>; focus?: string | null; filters: Filters }) =>
    post<Ranking>('/api/ranking', body),
  customRanking: (criterion: string, filters: Filters) =>
    post<CustomRanking>('/api/ranking/custom', { criterion, filters }),
  compare: (ids: string[]) => request<Comparison>(`/api/compare?ids=${ids.join(',')}`),
  insights: () => request<Insights>('/api/insights'),
  resources: () => request<Resources>('/api/resources'),
  tables: () => request<{ tables: TableListItem[]; presets: Preset[] }>('/api/tables'),
  table: (id: string) => request<TableFull>(`/api/tables/${encodeURIComponent(id)}`),
  envelope: () => request<Envelope>('/api/envelope'),
  gaps: (filters: Filters, environment: string | null) => post<Gaps>('/api/gaps', { filters, environment }),
  model: () => request<ModelCard>('/api/model'),
  whatif: (fuel: string, values: WhatIfValues) => post<WhatIf>('/api/whatif', { fuel, ...values }),
  predictModels: () => request<PredictCatalog>('/api/predict/models'),
  predict: (model: string, group: string | null, values: Record<string, number>) =>
    post<Prediction>('/api/predict', { model, group, values }),
  predictBatch: (model: string, rows: { group?: string; values: Record<string, string | number> }[]) =>
    post<{ results: BatchResult[] }>('/api/predict/batch', { model, rows }),
  mission: (env: string, focus: string | null, top: number) =>
    request<MissionReport>(`/api/mission/${env}?top=${top}${focus ? `&focus=${focus}` : ''}`),
  ask: (body: {
    question: string; history: ChatMessage[]; context?: AskContext; audience: string; scope?: AskScope; task?: TaskId
  }) =>
    post<Answer>('/api/assistant/ask', {
      ...body,
      history: body.history.map((m) => ({ role: m.role, content: m.content, mode: m.mode })),
    }),
  /** The same answer, streamed: `onText` gets the text while the model writes it; resolves with the checked answer. */
  askStream: async (
    body: { question: string; history: ChatMessage[]; context?: AskContext; audience: string; scope?: AskScope; task?: TaskId },
    onText: (soFar: string) => void,
  ): Promise<Answer> => {
    const payload = { ...body, history: body.history.map((m) => ({ role: m.role, content: m.content, mode: m.mode })) }
    let res: Response
    try {
      res = await fetch('/api/assistant/ask/stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    } catch {
      return post<Answer>('/api/assistant/ask', payload)
    }
    if (!res.ok || !res.body) return post<Answer>('/api/assistant/ask', payload) // an older server: no streaming
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    let text = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line) continue
        const ev = JSON.parse(line) as { type: string; text?: string; answer?: Answer; message?: string }
        if (ev.type === 'text' && ev.text) {
          text += ev.text
          onText(text)
        } else if (ev.type === 'done' && ev.answer) return ev.answer
        else if (ev.type === 'error') throw new Error(ev.message ?? 'The answer could not be built.')
      }
    }
    throw new Error('The answer stopped before it finished. Try again.')
  },
  library: () => request<Library>('/api/assistant/library'),
  report: async (messages: ChatMessage[], title?: string): Promise<Blob> => {
    const res = await fetch('/api/assistant/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messages.map((m) => ({ role: m.role, content: m.content, mode: m.mode })), title }),
    })
    if (!res.ok) throw new Error('The report could not be generated.')
    return res.blob()
  },
}

export const imageUrl = (id: string) => `/api/investigations/${id}/image`
export const missionPdfUrl = (env: string, focus: string | null, top: number) =>
  `/api/mission/${env}/pdf?top=${top}${focus ? `&focus=${focus}` : ''}`

export function fmtRange(c: Condition): string {
  if (!c) return 'Not reported'
  const r = (n: number) => Number(n.toFixed(2)).toString()
  if (c.min === null) return `up to ${r(c.max)} ${c.unit}`
  if (Math.abs(c.max - c.min) < 1e-9) return `${r(c.max)} ${c.unit}`
  return `${r(c.min)} to ${r(c.max)} ${c.unit}`
}

export const PILLAR_LABEL: Record<string, string> = {
  prevention: 'Prevention',
  detection: 'Detection',
  suppression: 'Suppression',
  fundamental: 'Combustion science',
}
