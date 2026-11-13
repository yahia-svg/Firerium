# Flame in Freefall: progress and thinking log

This file records what was built, what was found in the NASA data, the decisions taken and why, and
what is left. Newest stage at the top of each section. Dates are when the work was done.

## Where the project stands (2026-11-12)

**Stages 1 and 2 are built and passing their checks (71 end-to-end checks).** The AI is wired in
and waits only for an API key in `backend/.env` (see "Full check, data audit and AI connection").
Stage 2 added the
three items the guide lists after stage-1 testing:

| Stage-2 item from the guide | Status |
|---|---|
| Research Gaps | Done: page 7. Counted from the selected experiments, with the filters always visible |
| One simple predictive model and What-If test | Done: page 8. Ridge regression on the FLEX run table, tested by test day, blocks unsupported scenarios |
| Mission Report | Done: page 9. On-screen preview and PDF with references, for each of the five crew environments |

Details are under "Stage 2: what was built and why" below. Still open from the guide's phase 7:
public deployment, architecture diagram, demo story.

**Stage 1** (all six features on real NASA data, plus the site-wide guide and the inline AI chat):

| Stage-1 item from the guide | Status |
|---|---|
| Research Explorer with real NASA information | Done |
| AI Research Assistant with source links | Done. Works without a key in retrieval-only mode; written answers need an Anthropic API key (not yet tested with a live key, see "Not yet verified") |
| Experiment Comparison | Done |
| Investigation Ranking (factor weights + custom AI criterion) | Done |
| Fire Safety Insights (prevention, detection, suppression, Earth vs. microgravity, next-gen equipment, Earth uses) | Done |
| At least one chart using real experimental data | Done: 8 ready-made charts, a chart builder over 18 run tables, and the cross-experiment "Where has NASA tested?" chart |
| A guide over the whole site | Done: Start page plan, Guide drawer on every page, 10-step Moon Base walkthrough |
| Inline AI chat in each feature | Done: "Ask AI" on every page with page context, plus "Explain this" buttons |


## Phase 1: what the NASA data actually contains

The PSI website is a JavaScript app, but it is backed by a public JSON API. Three read-only endpoints
give everything needed:

- `/geode-py/ws/repo/search` lists all 133 PSI investigations.
- `/geode-py/ws/repo/investigations/<accession>` returns one full record.
- `/geode-py/ws/studies/<accession>/download?source=datamanager&file=<name>` downloads a public file.

Findings:

- **24 of the 133 investigations are Combustion Science.** That is small enough to include all of
  them, so the guide's "pick 5 to 8" was not needed and nothing had to be left out.
- Each record has objective, approach, hypothesis, research impacts, hardware, team, keywords,
  publications with DOIs, related investigations and a dataset DOI.
- **20 investigations have an "experimental table"** (22 CSV files, 2,005 test rows). The four
  without one are ground studies that re-analyse flight data. These are the
  numerical data for charts: one row per test with its conditions and, for some, outcomes.
- The richest tables: FLEX (274 droplet tests with oxygen, CO2, helium, pressure, burning rate,
  extinction diameter, outcome), CFI-G (333 tests, oxygen up to 85%), Flame Design (327), SPICE (469),
  BASS-II (129), BASS (122), SAME-R (109).
- The full archives are huge (BASS-II alone is about 275 GB of images and video). Only the records
  and run tables are used.
- PSI's per-investigation thumbnail endpoint returns the same placeholder for every record, so real
  "representative images" are taken from the record's image list instead. Only 5 records have one.

Data-quality observations (all handled visibly, none silently "fixed"):

- The FLEX CSV lost subscripts and part of some units in its headers ("O" for O2, "CO" for CO2,
  "Burning rate; mm"). Corrected labels are shown with a note. The gas columns sum to 1, which
  confirms the reading.
- The BRE table has one oxygen cell reading "3400%". It is excluded from ranges and reported as a
  data note on the experiment page.
- Saffire tables end with footnote lines typed into the first column. They are separated from the
  test rows and shown as footnotes.
- Saffire-II leaves the material cell empty where it repeats the row above. The comparison table
  shows the material from the row above and marks it.
- The CFI record gives two different pressure ranges in its text (0.25 to 5 atm in the objective,
  0.25 to 0.5 atm in the approach). The run table goes to 5 atm; the objective sentence is quoted.

## Phase 2: one shared data format

`backend/ingest/build_db.py` writes `data/flame.db` (SQLite) with five tables: investigations, tables,
runs, chunks, meta. Every feature reads these, so an experiment added once shows up everywhere.

Decisions:

- **Verbatim NASA text is never rewritten.** The project adds a separate layer (`curation.py`): fuel
  state, fire-safety area, sample geometry, a plain-language summary and a one-line safety note. The
  UI labels this layer as the project team's.
- **Conditions carry provenance.** Oxygen, pressure and airflow ranges come either from a run table
  (computed over every row) or from a sentence quoted from the PSI record. The build fails if a quote
  is not found in the record. If neither source gives a value, it is "Not reported".
- **Tags come from the record's own words.** Materials, sensors and gases are matched with controlled
  vocabularies against the objective, approach, keywords, hardware field and run tables.
- **"Directness"** (3/2/1) records how directly NASA ties an investigation to spacecraft fire safety,
  following the challenge text. It is a project choice and is described as such.

What the organised data shows (these became the headline insights):

- Only 10 of 24 investigations report an oxygen level; 6 report pressure; 9 report airflow.
- 6 investigations tested at 30% oxygen or more (Moon Base level): Flame Design, BRE, s-Flame, FLEX-2,
  FLEX, CFI-G. **None of them burned solid cabin materials.** The highest oxygen level reported for
  solid materials is 22.2% (BASS-II).
- No investigation ran in partial gravity (the challenge text says the same). E-FIELD Flames is the
  only one linked to partial gravity, by mimicking it with an electric field.

## Phase 3: core website

Stack chosen: **FastAPI + SQLite + pandas + scikit-learn** on the backend, **React + TypeScript + Vite
+ Plotly** on the frontend. FastAPI also serves the built site, so deployment is a single process.

- **Crew environments** (station, spacecraft, Moon Base, rover, Mars Base) carry an oxygen and
  pressure band with its source. Moon Base and rover use the challenge text (30% or more, 10.2 psia or
  less). Station and spacecraft use the atmospheres listed in the BRE record. The challenge gives no
  Mars atmosphere, so the Mars band is flagged as an assumption on the page.
- **Ranking** = 100 x sum(weight x factor) / sum(weights), with seven factors (fire-safety directness,
  oxygen match, pressure match, gravity relevance, cabin-material relevance, ventilation data, run
  data) plus an optional safety focus. Users change the weights; every result has a "Why this score?"
  breakdown that adds up to the score. Sanity check: station ranks BASS-II, Saffire-II, Saffire-I
  first; Moon Base ranks FLEX, BRE, FLEX-2, CFI-G first because they reach its oxygen band.
- **Comparison** marks each row same / overlap / different / missing and writes the three summary
  lists (shared, different, missing) from the rows, with no AI involved.
- **No-match behaviour**: when filters match nothing, the page says so, lists the closest experiments
  with the conditions each one meets and misses, and offers an AI estimate labelled "AI estimate, not
  a NASA result" with low confidence. Without an AI key no estimate is written.

## Phase 4: AI assistant

- **Retrieval: TF-IDF instead of embeddings.** With 241 passages, TF-IDF is accurate enough, needs no
  second API key, runs offline and can be inspected. Passages from experiments named in the question
  (or on the page the user is viewing) get a boost. The interface would not change if embeddings were
  added later.
- **Model: Claude (`claude-opus-5-5`) through the official Anthropic SDK**, structured JSON output,
  server-side fallback if a safety classifier declines. Configurable in `backend/.env`.
- **Grounding rules in the prompt:** answer only from the supplied passages, cite every sourced
  sentence as `[PSI-n]`, separate hypotheses from measured results, say when the collection lacks the
  answer. After the model answers, citations that do not match a retrieved passage are removed and
  the user is told.
- **More than a chatbot:** grounding badge, sources with the exact passages, student/researcher
  wording, quick tools (summarise, related, explain a term, mission relevance), suggested next steps
  that deep-link into Explorer / Compare / Ranking / Charts, and a PDF report with references.
- **No key, no invention.** Every AI feature has a fallback that quotes passages or uses computed
  facts and is labelled "retrieval only" or "computed from the database".
- Off-topic questions are rejected: with a key the model decides; without one a subject-word check
  plus a similarity threshold does (calibrated with `tests/calibrate_retrieval.py`, because plain
  similarity let "best football striker of 2022" through).

## Phase 5 (stage-1 part): insights and charts

- Each insight is a short explanation plus verbatim quotes, the conditions actually tested (pulled
  live from the database) and a "Limits" box. `insights.verify()` checks every quote against its
  source at server start.
- Two tables are computed from run data with pandas: FLEX suppression (agent, concentration, fuel,
  pressure, oxygen, outcome for all 274 tests) and Saffire-II microgravity vs. 1-g burn results.
- Charts are Plotly, drawn in the browser from the run-table rows. Presets are verified at startup
  to reference real columns. Each chart states its source table, how many rows were left out as
  non-numeric, and offers the plotted data and the original NASA file.
- A caution kept visible: for "inverse" flames (Flame Design, CFI-G) the oxygen value is the gas
  leaving the burner, not the chamber atmosphere.

## Stage 2: what was built and why

### Research Gaps (`backend/app/gaps.py`, page `/gaps`)

- Every count is made from the experiments that pass the reader's filters. A sticky bar at the top
  of the page always shows how many experiments, which filters and which data collection the
  statements rest on.
- Each experiment is sorted into groups: gravity condition, what was burned, oxygen band, pressure
  band, airflow band, fire-safety area, materials, fuels, topic. For oxygen, pressure and airflow
  the individual test rows are used where the run table gives them (so "tested 12 to 34%" does not
  count as coverage of a band with no actual test in it); otherwise the range quoted from the PSI
  record is used.
- Status words: 0 experiments = "Not represented in this project collection", 1 or 2 = "Little
  data", 3 or more = "Represented". A value PSI does not report is shown as its own category
  ("coverage unknown"), not as a gap.
- The main gaps are computed, not typed in: no partial-gravity test; no solid material at 30% oxygen
  or more (highest for solids 22.2%); no solid-material investigation reports pressure; only 10 / 6
  / 9 of 24 report oxygen / pressure / airflow; the detection investigations report no atmosphere;
  each suppression agent was tested on one kind of fuel and water mist is absent; the large-scale
  fire tests list 6 sample rows.
- The coverage map crosses any two groupings. Default: what was burned against oxygen level, where
  the empty "solid materials at 30% or more" cell is visible at a glance.
- "Possible questions for future experiments" are the project team's, derived from the gaps, and
  are labelled as not being NASA's plans. Each lists the closest existing experiments.
- Challenge-text quotes used on the page are verified at server start (`gaps.verify()`).

### Predictive model and What-If (`backend/app/predict.py`, page `/whatif`)

- **Question chosen:** how fast does a fuel droplet burn for a given atmosphere? Target: the
  burning-rate constant in the FLEX run log. Inputs: fuel, oxygen, CO2, helium, pressure, initial
  droplet diameter. FLEX is the only table in the collection with a numeric outcome for hundreds of
  runs across varied conditions.
- **Data:** 257 of 274 FLEX tests (17 lack a burning rate, diameter or pressure), over 80 test days.
- **Leak-free testing:** 5-fold cross-validation grouped by test day, so tests from one day never
  sit on both sides of a split.
- **Result:** ridge regression has a mean absolute error of 0.050 mm²/s against 0.103 for the
  baseline (each fuel's average), 52% lower, R² 0.68. Random forest and gradient boosting were
  tried and did worse (0.059), so the simpler, inspectable linear model was kept. Methanol is
  predicted better (0.033) than heptane (0.073); the page says so.
- **Gate:** the model is retrained and re-tested at every server start and is offered only if its
  error is at least 20% below the baseline. Otherwise the page shows charts and evidence instead.
- **Uncertainty:** the band around an estimate is the 10th to 90th percentile of held-out errors for
  that fuel (an empirical 80% band).
- **Blocking unsupported scenarios, two checks:**
  1. Each input must be inside the range FLEX tested with that fuel (a value that rounds to the
     edge counts as inside). The gas mixture cannot exceed 100%.
  2. FLEX tested only certain combinations (for example, pressures above 1 atm were only run with
     CO2 or helium mixtures). So the distance from the request to the nearest real test is measured
     in standardised units. Up to the usual spacing between tests: estimate given. Up to twice
     that: estimate marked "weakly supported". Beyond: no estimate. Found while testing: without
     this check the model returned 1.08 mm²/s for a methanol case when no methanol test exceeded
     0.74.
- A blocked request still returns the five closest FLEX tests with their measured values and the
  investigations across the whole collection that tested near that oxygen level.
- **Not model inputs, and said so on the page:** airflow (FLEX has no airflow column), solid cabin
  materials, gravity level. Each links to the experiments that do have that evidence.
- The chart keeps measured and predicted apart: NASA measurements in blue, the model line and the
  reader's scenario in purple and orange. The line is drawn only where a real test backs it.

### Mission Report (`backend/app/mission.py`, page `/mission`)

- Assembles, for one crew environment: atmosphere and its source, the briefing, the top-ranked
  experiments with the reasons for their score, the insights with their limits, the gaps for that
  habitat, the model estimate, and the references (PSI page and DOI for each).
- It computes nothing of its own: each part comes from the module that owns it, so the report
  cannot disagree with the pages.
- The model section gives droplet estimates at the ends of the habitat's oxygen band, skips any
  point the model refuses (Moon Base 36% oxygen is above FLEX's 34%), and states that droplets in
  microgravity are not cabin materials in partial gravity.
- Same content on screen and in the PDF (`GET /api/mission/<env>/pdf`).

### Site guide

- Menu now has two groups: Explore (1 to 6) and Analyse and report (7 to 9).
- The 10-step Moon Base walkthrough now ends with a What-If scenario (step 9) and the mission
  report (step 10), matching the demo story in the project guide.

## Full check, data audit and AI connection (2026-11-12, evening)

**Site check.** Every page was loaded in headless Chrome at 1440 px and 390 px (20 addresses):
no script errors, no failed requests, no horizontal overflow, no broken images. The click-throughs
that had not been exercised were driven for real: Guide drawer, Ask AI panel and its starter
questions, "Explain this" buttons, Explorer search, no-match estimate, ranking sliders and custom
criterion, comparison, chart presets and builder, coverage map, What-If presets and blocking,
mission report habitat switch.

- One bug found and fixed: on the Ranking page, a second weight slider moved before the first
  re-rank had returned dropped the first change (the handler built on the last response instead
  of the last request). `Ranking.tsx` now builds on the latest requested weights.

**Data audit** (numbers are in the README, "How much of the NASA data is used"):

- NASA's archives for the 24 investigations total 12.28 TB by the records' own `totalFileSize`;
  the site holds about 22 MB of it (0.00018% of the bytes): every record, every run table, five
  images.
- 96 of 96 NASA text fields in the database equal the PSI records; all 24,569 served table cells
  are in NASA's CSVs; 22 of 22 CSVs are byte-identical to psi.nasa.gov today; PSI still lists the
  same 24 combustion investigations.
- No mock, sample or random data anywhere in the code.
- The start page now has a "How the NASA data is used" panel, computed from `/api/meta`.

**AI connection.**

- Found: for a question about the whole collection ("which experiments tested 30% oxygen or
  more?") the 12 retrieved passages named only 2 of the 6 experiments the Explorer lists, so even
  with a key the assistant would have contradicted the dashboard. Fixed by giving the model a
  collection index: one line per investigation from the database (what was burned, safety area,
  materials, oxygen, pressure, airflow, gravity, run rows, with the cautions such as the
  inverse-flame note). A smoke check keeps the index and the Explorer filter in agreement.
- `llm.verify()` checks the key and model at server start with one free Models API request. The
  sidebar now distinguishes connected / key rejected / not connected, and shows the reason.
- `max_tokens` raised to 16,000 for every AI call. The model's thinking counts against the
  ceiling, and the old 3,000 to 6,000 limits risked answers being cut off before any text.
- The assistant's instructions now put NASA first: NASA's own record text and run-table values
  before the project-team summaries, a NASA citation on every statement about an experiment, and
  general background only after checking that no NASA passage covers the point.
- `backend/.env` sets `FLAME_MODEL=claude-haiku-5-5` for a small budget (about $0.002 a question
  by estimate, against about $0.06 on the default Opus 5.5). `llm.py` leaves out the refusal
  fallback parameter for Haiku, which has none.
- Not built, but checked as a next step: NASA's records list 562 documents (3.0 GB) beside the raw
  data, among them 20 reports for 12 investigations. Two final reports were downloaded as a test
  (Flame Design: 109 pages, 39,000 words; SAME: 68 pages, 29,000 words) and their text extracts
  cleanly, so they could be added to the assistant's passages with page-level citations.
- `backend/tests/check_ai.py`: live check of every AI feature, to run once a key is in place.
- `backend/.env` created with an empty key line.

What was verified without a key: real requests reach api.anthropic.com (a deliberately wrong key
gets 401, the site reports "key rejected" and falls back to retrieval-only answers); and with the
model call replaced by a stand-in, all five AI features build their prompts, pass the citation
filter and render in AI mode on the pages. What is still not verified: the quality of real model
answers, because no key was available.

## Research assistant rebuilt: live model, NASA reports, checked answers (2026-11-13)

**Live model.** The AI now runs for real. `llm.py` talks to either the Claude API (official
Anthropic SDK) or an OpenAI-compatible service such as Hack Club AI (raw HTTP, as that service
documents), chosen from the key in `backend/.env`. Both were exercised live. Current setting:
Claude Haiku 5.5 at low effort, thinking on, on an Anthropic key (changed from Sonnet 5.5 at the
team's request for a faster and cheaper model).

- Second comparison, three questions each, live: Haiku 5.5 low 3.8 to 11.0 s (average 8.5),
  $0.0009 to $0.0023; Sonnet 5.5 low 8 to 11 s (average 9.3), $0.021 to $0.034. Haiku is about 15
  times cheaper and about as fast. Its slip: one answer said "seven investigations" while
  listing the correct six.
- Haiku with thinking switched off (`FLAME_THINKING=off`): 5.1 to 6.8 s, but it left FLEX out of
  the 30%-oxygen answer and opened one answer by stating a hypothesis as a finding. Kept as an
  option, off by default.
- The instructions now ask for short answers (about 150 words for a question, 280 for a task).
  The visible text got shorter; the time did not change much because most of the output tokens
  on harder questions are the model's thinking.

- Model comparison on two questions, live: Sonnet 5.5 low 7.5 to 8.8 s, about 1,000 output tokens,
  $0.015 to $0.032; Haiku 5.5 low 8.9 to 12.8 s, 1,850 to 2,800 output tokens, $0.0012 to $0.0024.
  Both named all six experiments the Explorer lists for 30% oxygen or more. Sonnet's answers were
  better structured and cited NASA on more statements.
- Prompt caching: the instructions and the 24-line collection index are sent as a cached prefix
  (5,678 tokens read from cache on a repeat question).
- A mistake to know about: the first run of `check_ai.py` used Opus 5.5 at medium effort and cost
  $0.46, because the script imported `llm` before the settings file was read. `llm.py` now reads
  `backend/.env` itself.

**NASA documents (RAG library).** `fetch_docs.py` downloaded 70 PDFs (132 MB) from PSI: Reports,
Science Documents, and the CFI analysed-data summary sheets. `build_docs.py` reads them page by
page into `data/docs.db`: 69 documents, 3,058 passages, each with its page number. Running
headers are stripped; contents pages, publication lists, name blocks and number tables are left
out (576 passages) and counted. Not usable: two BASS reports (download error from PSI), two DAFT
reports (.doc), one CFI sheet (not a real PDF), one publication list (no readable text). Ten
experiments have no documents in PSI's file lists and are answered from their record and run
tables only.

**Search.** Keyword search (TF-IDF) plus meaning search with a local model
(`BAAI/bge-small-en-v1.5` through `fastembed`: no key, no tokens), merged by reciprocal rank.
NASA reports are weighted above project-team summaries. Search can be limited to chosen
experiments and kinds of source.

**Answer checks, done in code** (`research.py`): numbered sources [S1]... become numbered
references with document and page; citations to anything the model was not given are removed;
the answer is split into statements, each labelled with its kind of evidence; every number with
a unit is looked up in the passage cited for it (a fraction such as 0.207 counts as 20.7%).

**Assistant page.** Rebuilt as a workbench: five research tasks (ask, findings brief, compare
evidence, design evidence review, explain a term), a search-scope control, a verification strip
on every answer, an evidence list with NASA file links and pages, a statement check, a "how this
was built" trace with tokens, time and cost, a reference-list copy button, the library contents
and the model's price and session spend.

Not done: the analysed-data spreadsheets (SAME, SAME-R, DAFT) and the figure-data tables
(PSI-117, PSI-142) are not ingested; slides and engineering documents are not indexed; the two
BASS reports need another download attempt.

## Official NASA resources added (2026-11-13)

The organisers published "Official NASA Resources": ten links. The first is PSI, which the site
was already built on. The other nine were not used before. Now all ten are.

**What was downloaded** (`fetch_resources.py`, 21 files, 9.2 MB): the NASA Combustion Science page
and the 8 experiment fact sheets it links to; the Researcher's Guide PDF (56 pages); the Apollo 1,
Apollo 13 and Mir pages; the three Spinoff pages and their full articles on NASA's Technical
Reports Server; and, for the ScienceCast video, NASA's own caption file. YouTube does not hand out
captions to a script, but the video's description links to NASA's copy on images.nasa.gov, which
publishes the .srt file.

**What was read** (`build_resources.py` -> `data/resources.json`): 19 documents, 231 passages,
36,644 words. Web pages are cut by heading, PDFs by page, the video by time, so every citation can
say where it is and link there (`...pdf#page=18`, `...watch?v=...&t=126s`). Found while reading:

- sma.nasa.gov wraps each page in one `<form>`, so a parser that skips forms reads nothing.
- NASA's Apollo 13 page contains the Apollo 1 mission summary in a pop-up. It is left out, with a
  note on the Resources page.
- Two of the three NTRS Spinoff articles are unusable: one is a scan with no text layer, the
  other's text layer is garbled (77% of tokens read as words; the cut-off is 85%). They are listed
  as not usable; the Spinoff summaries are read instead.
- Site menus, "View Resource" link lists, image credits and one-line sections are left out and
  counted (65 blocks). The fact sheets use typeset ligatures ("ﬁre"), which are spelled out so
  search finds the words.

**In the AI model.** The passages are a new kind of source, "NASA official resource", searched
with everything else. The instructions tell the model what they are (history, lessons, overviews,
uses on Earth), to name the resource in the sentence, and never to carry a number from an accident
page over to a PSI experiment. The statement check counts them as NASA sources. A search limited to
chosen experiments leaves them out. References, the PDF report and the reference-copy button
handle them (`[RES-5]` chips link to the Resources page).

**On the site.**

- New page 10, NASA Resources: each resource with NASA's description, how the site uses it, the
  places that quote it (found by scanning the pages' own evidence lists, not typed in), what was
  read, the PSI experiments it names, and ready questions for the assistant. The video plays
  there (it loads from YouTube only on click) beside its transcript.
- Fire Safety Insights: a new section, "Lessons from past spacecraft accidents" (Apollo 1,
  Apollo 13, Mir), each with NASA quotes, why it matters for the research here, and its limits;
  a new suppression card on water mist (Researcher's Guide); three new Uses-on-Earth cards from
  the Spinoff articles; and Researcher's Guide quotes added to four existing cards, including its
  list of misconceptions ("A fire will self-extinguish if ventilation is shut off").
- Experiment profiles: "In NASA's official resources" shows the sentences in the fact sheets and
  the Researcher's Guide that name the experiment. "ACME" and "Saffire" alone count for the whole
  family and are marked as such. Five ground studies are named by no resource and show nothing.
- Research Gaps: the partial-gravity gap now quotes NASA's page on FM2, "the first-ever
  combustion experiment to be performed on another planetary body".
- Mission report: the three accident lessons, on screen and in the PDF, with the resources in the
  reference list.

**Kept apart from the data.** Nothing from the resources enters the Explorer, the charts, the gap
counts or the What-If model. Every quote is verified at server start against the text that was
read; if `data/resources.json` is missing, the resource quotes and the lessons section are left
out instead of being shown unchecked.

**Live check** (Claude Haiku 5.5, low effort, two questions, $0.0022 in total). "What caused the
Apollo 1 fire to spread so fast, and what did NASA change afterwards?": 4.6 s, 8 of 9 statements
cited to NASA's Apollo 1 and Apollo 13 pages, the one number (90 seconds for the hatch) found in
the cited passage, no citation removed. "Which misconceptions about spacecraft fires does the
Researcher's Guide list, and which experiments tested them?": 3.5 s, the three misconceptions
cited to page 35 of the Guide; the model said the sources do not link them to specific experiments
and marked the answer "partly covered" instead of inventing a link.

Rebuilding the meaning vectors after adding passages (`build_embeddings.py`, 3,530 passages) took
about 35 minutes on this computer while other work was running.

Not done: the review-board reports and testimony the Apollo pages link to are not read.

## Interface and feature round (2026-11-13, later)

Applied with Emil Kowalski's design-engineering rules (custom ease-out curves, `scale(0.97)` on press,
hover only on fine pointers, enter animations from `scale(0.96)` + opacity, nothing animated on keyboard
shortcuts' critical path, `prefers-reduced-motion` respected).

- **Black-and-white theme.** `styles.css` rewritten: ink on white, colour kept for chart data (the validated
  eight-hue categorical order in `Plot.tsx`) and for status (good / caution / gap). Same class names, so
  every page picked it up. Emoji icons replaced with text. Navigation regrouped: Discover, Analyse,
  Report & sources (`guide.ts` has a `group` per feature).
- **Audience.** Start page and guide paths written for professors, graduate students, undergraduates,
  aerospace researchers and engineers (one plan each).
- **Fire Safety Insights split in two.** `/insights` keeps prevention, detection, suppression. The rest
  (accident lessons, Earth vs. microgravity, next-generation equipment, uses on Earth) moved to
  `/lessons`, "Lessons & Applications". Old `/insights#…` links in `gaps.py` and `resources.py` repointed.
- **Quiz.** A 10-question quiz (`components/Quiz.tsx`) opens as a modal from a banner at the top of
  `/insights` (or `/insights?quiz=1`). Every answer is stated in an insight card on the page; each
  explanation links back to its section. Best score is kept in the browser.
- **Small charts and photos** (`components/MiniViz.tsx`, plain HTML/SVG): experiments per safety area,
  most-tested materials, FLEX tests by added gas, how the FLEX tests ended (stacked), an accident timeline,
  a candle diagram (Earth vs. microgravity), a Saffire-II same-sample outcome matrix read from NASA's own
  wording, "n of 24 report oxygen / pressure / airflow / partial gravity" tiles, a Spinoff decade strip, and
  three NASA photos from the PSI records (BASS-II, Flame Design, DAFT). PSI-22 and PSI-159 images are the
  ACME logo and are not used.
- **Charts page.** "Build your own chart" and "Upload your CSV" now come first. One engine
  (`components/chartEngine.ts`) serves NASA tables, uploads and presets with five chart types (scatter,
  line, bar with count/average/total, histogram, box). Uploads are parsed in the browser (comma, semicolon
  or tab; quoted fields; 10 MB / 100,000 rows) and never sent to the server; only column names and the
  chart description go to the AI if the reader asks it. Defaults skip bookkeeping columns (day, test no.)
  and open on the FLEX run log.
- **Ranking centred on the score.** Top-three podium, a score ring on every row, and an always-visible bar
  showing the points each factor adds, in one fixed factor order and colour that matches the weight
  sliders (now in a sticky side panel).
- **What-If always answers.** `predict.whatif` no longer blocks out-of-range or untested combinations. It
  returns an estimate with a 0-100 confidence: `95·q / (1 + 0.15·r^1.8)` where r is the distance to the
  nearest FLEX test over the usual test spacing and q reflects the fuel's held-out R², then divided by
  `1 + 1.5 × (range-widths outside)` and capped at 30 below the lowest tested oxygen (a flame may not
  exist there). The error band widens past the usual spacing. Labels: High ≥70, Moderate ≥45, Low ≥20,
  Very low. Only a gas mixture above 100% gets no number (`status: "invalid"`). Examples (methanol): air
  90%, Moon Base 30% O₂ 87%, 5% O₂ 30%, 50% O₂ 14%, 2.5 atm 22%. The mission report stays
  conservative and still skips extrapolated points.
- **AI assistant as a docked side panel** (`AskPanel.tsx`), not a floating chat: it sits beside the page
  (the page reflows), knows the page context, has Student/Expert wording, keeps the conversation for the
  session, and opens with the topbar button or Ctrl+J. **Select any text** on a page to get a small toolbar
  (`SelectionAsk.tsx`): Ask AI (attach the passage and type a reply), Explain, Check evidence.
- **Missing information policy** (`research.py`). The model now separates two cases. Something NASA has
  not tested or reported (judged from the collection index) is called a research gap, in the answer and
  in a new `research_gap` field shown as "Research gap:". Something merely absent from the retrieved
  passages is not mentioned at all; the model answers from what it has and offers a follow-up. The old
  `missing` field and "What is missing" box are gone; the no-model notice moved to `notice`; an unmatched
  question is now `off_topic`. Grounding labels no longer say "partly covered" or "not in the collection".

Checked: type-check and production build clean; 89 of 89 smoke checks pass (What-If and off-topic checks
updated for the new behaviour; AI disabled, no credit spent); pages screenshotted in headless Chrome at
1440 px and inside 390 px frames (home, insights + quiz, lessons, charts build/upload, ranking, What-If at
50% oxygen, side panel with a quoted passage). Not checked: a live AI answer under the new gap policy
(needs the key and spends credit), and touch selection on a real phone.

### Follow-up: dark mode, logo, lighter pages (2026-11-13)

- **Light / dark switch** in the top bar. The first visit follows the system setting; a choice is
  remembered (`fif.theme`). `index.html` applies it before the first paint, so dark mode never flashes
  white. Every colour in `styles.css` is now a token with its own dark step (not an inversion). Charts
  follow automatically: `Plot.tsx` swaps the light palette for the validated dark steps in one place, and
  the small HTML/SVG charts use `--s1…--s8` variables.
- **Logo**: `logo.png` (project root) cropped to its visible pixels by a script and written to
  `frontend/public` as `logo.png`, `favicon.png`, `favicon.ico` and `apple-touch-icon.png`. It replaces the
  blue-ball mark in the sidebar, the favicon and the hero. The old `favicon.svg` was removed.
- **Less text, more space**: every page intro is now one line; redundant eyebrow labels, the insights
  disclaimer banner, long captions and helper paragraphs were cut; the Start page lost the duplicate
  audience row, the flow chips and two closing panels, and its data-use explanation is now one
  collapsible paragraph. Spacing grew (page padding, gaps between sections and panels, panel padding,
  line height).
- **Fire Safety Insights, visual pass**: five NASA photos extracted from the ACME fact sheet in the official
  resources (`data/raw/resources/RES-2`, the only fact sheet with embedded photos) are saved in
  `frontend/public/img` (BRE flame, CLD Flame sequence, a dim flame, ACME hardware on the ISS, the chamber
  insert diagram); captions follow the fact sheet's own text. Each section now opens with photos and a chart:
  an oxygen-range chart against the Moon Base band (prevention), a sketch of the SAME smoke hypothesis,
  labelled as a sketch (detection), and the FLEX outcome bars (suppression). Cards on this page are compact:
  the point and its source chips, with every quote, limit, table and tested condition under
  "NASA evidence & limits".
- **Responsive layout rebuilt on container queries.** `.main` is a size container (`container: main /
  inline-size`), and every in-page layout rule is an `@container main` query (1100 / 900 / 720 / 440 px of
  page width) instead of a window media query. Opening the AI panel takes width from the page, so pages now
  re-flow exactly as on a narrower screen (before, Ranking kept its two-column layout in ~690 px and
  collapsed). Window media queries remain only for the frame: sidebar drawer (≤820), panel floating over the
  page instead of docking (≤1180), panel width `clamp(340px, 30vw, 420px)`. In single-column mode the
  Ranking weights move above the scores in two columns, and the What-If sliders pair up. The quiz renders
  through a portal on `<body>` so it always covers the window.
- **Predictions page rebuilt** (`backend/app/models.py`, `frontend/src/pages/Predict.tsx`, still at `/whatif`).
  Three models from two experiments, each held to the original rules (grouped CV by test day, offered only
  if ≥20% better than a per-group baseline): FLEX burning rate (52% better, R² 0.68), FLEX flame-out chance
  (logistic with pairwise terms, Brier 26% better, AUC 0.90; linear-only reached 17% and would not have been
  offered), CFI-G peak burner temperature (51% better, R² 0.67, covers 18–40% O₂ and 0.5–3 atm, i.e. Moon and
  Mars atmospheres). Rejected after testing: CFI-G hot ignition and burn time. The page goes: question →
  place (habitat atmospheres from `environments.py`, rover deduplicated) → conditions → answer. Slider
  ranges are the tested range ± a quarter of its width inside physical limits, and gas sliders cap so the
  mixture never passes 100%. Confidence shows only at ≥60%; below that the answer is labelled "Rough
  estimate". CSV upload predicts up to 2,000 scenarios (`POST /api/predict/batch`) with a template and a
  download. `predict.py` and `/api/whatif` are unchanged and still feed the mission report. 97 smoke checks.
- **Faster assistant.** (1) Streaming: `POST /api/assistant/ask/stream` sends newline-delimited JSON events,
  text while the model writes and then the checked answer. `llm.FieldStream` pulls the `answer` field out of
  the model's JSON as it arrives (fuzz-tested over 2,000 random fragmentations); the side panel and the
  workbench show the text with a caret and swap in the checked answer (numbered references, statement
  check) at the end; if streaming fails the client falls back to `/api/assistant/ask`. Checked end-to-end
  with a stand-in model: first text at 0.09 s. (2) Fewer passages: 6 per question, 8 for findings/compare
  tasks (was 10/12). Not yet measured with the live model.
- The chart builder now starts from the curated preset for a table when one exists (FLEX opens on
  burning rate against oxygen, not pressure).

## Testing

- `backend/tests/check_ai.py`: live check of every AI feature (needs a key; costs money).
- `backend/tests/smoke_test.py`: 86 end-to-end checks against the real database, all passing (39
  from stage 1, 28 for stage 2, 4 for the data-use figures and the AI collection index, 15 for the
  official NASA resources).
- The production build (`npm run build`) type-checks cleanly.
- Pages checked in a headless browser at desktop and narrow widths: start, explorer, experiment
  profile, assistant, ranking, comparison, insights, charts (preset and test envelope), no-match,
  research gaps, What-If (estimate, out-of-range, untested combination), mission report.
- The mission report PDF was generated and its text read back (7 pages for Moon Base).

### Not yet verified

- **AI-written answers with a live Anthropic key.** No key was available on this machine. The path
  is verified up to the API (see the section above) but no real model answer has been read. First
  thing to do with a key: run `backend/tests/check_ai.py`, then ask a question in the site.
- The mission report's briefing section uses the AI-written briefing when a key is present; only the
  computed version has been run.
- The site has not been deployed to a public host.

## Still to do (guide phase 7)

- Deploy to a public host and check it on another device.
- Architecture diagram, demo story and presentation.
- The edits the team has collected for the existing pages.

## Notes for whoever works on this next

- Rebuild after changing `curation.py`: `python -X utf8 backend/ingest/build_db.py`, then restart the
  backend.
- Adding an investigation: add a `CURATION` entry (and a `TABLE_SPECS` entry for its run table). The
  build refuses to run if either is missing or a quote does not match.
- On Windows, pass `-X utf8` to Python: the NASA text contains characters the default console
  encoding cannot print.
