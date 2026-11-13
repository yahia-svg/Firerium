# Flame in Freefall

A web dashboard that makes NASA's microgravity combustion research easier to find, compare and
understand, and turns it into fire-safety insights for spacecraft, space stations, Moon and Mars bases
and pressurized rovers. Built for the NASA Space Apps challenge "Flame in Freefall".

**NASA research → organized information → AI-supported understanding → useful fire-safety insights.**

All data comes from NASA's Physical Sciences Informatics (PSI) repository: the 24 combustion-science
investigations, their records, and their experimental run tables (about 2,000 individual tests).
The site also uses the other nine official resources NASA listed for the challenge (the NASA
Combustion Science page and its fact sheets, the Researcher's Guide, the ScienceCast video, the
Apollo 1, Apollo 13 and Mir pages, three Spinoff articles) as background, always labelled as such.
See "Official NASA resources" below.

> This is a research tool. It is not a certified spacecraft safety system, and its estimates are not
> guaranteed real-world outcomes.

## Run it

Double-click **`start.bat`** (Windows). It sets up anything missing and opens <http://localhost:8000>.

Manual steps, from the project folder:

```bash
python -m venv backend/.venv
backend/.venv/Scripts/python -m pip install -r backend/requirements.txt

backend/.venv/Scripts/python -X utf8 backend/ingest/fetch_psi.py   # download NASA PSI records (once)
backend/.venv/Scripts/python -X utf8 backend/ingest/build_db.py    # build data/flame.db

backend/.venv/Scripts/python -X utf8 backend/ingest/fetch_resources.py   # the other official NASA resources (9 MB)
backend/.venv/Scripts/python -X utf8 backend/ingest/build_resources.py   # read them into data/resources.json

cd frontend && npm install && npm run build && cd ..               # build the website

backend/.venv/Scripts/python -X utf8 -m uvicorn app.main:app --app-dir backend --port 8000
```

For development with live reload, run the API with `--reload` and, in a second terminal,
`cd frontend && npm run dev` (site on <http://localhost:5173>, API calls are proxied to port 8000).

### Switching on the AI

The site works without an AI key: the assistant then returns the most relevant NASA passages with
their sources ("retrieval-only"), and says so. For written, cited answers:

1. Open `backend/.env` and paste a key after `ANTHROPIC_API_KEY=`. Two kinds work and the site
   detects which it is: an Anthropic key (`sk-ant-...`, Claude API through the official SDK) or a
   Hack Club AI key (`sk-hc-...`, their OpenAI-compatible service).
2. `FLAME_MODEL` and `FLAME_EFFORT` in the same file choose the model. The site is set to Claude
   Haiku 5.5 at low effort. Measured on this site on 2026-11-13, three live questions each:
   Haiku 5.5 answers in 4 to 11 s (average 8.5) for $0.001 to $0.002; Sonnet 5.5 in 8 to 11 s
   (average 9.3) for $0.02 to $0.035, with the best wording. `FLAME_THINKING=off` makes Haiku
   answer in 5 to 7 s, but in the test it missed one of six experiments on a whole-collection
   question and once stated a hypothesis as a finding, so it is off by default.
3. Restart the backend. At start-up the server checks the key with a free request, so the sidebar
   tells the truth: "AI connected (model)", "AI key rejected" with the reason, or "AI model not
   connected".
4. Optional: run `backend/.venv/Scripts/python -X utf8 backend/tests/check_ai.py`. It exercises
   every AI feature against the real model (about eight requests; roughly one cent on Haiku, twenty
   cents on Sonnet).

### How the research assistant works (LLM + RAG)

```
backend/ingest/fetch_docs.py        downloads NASA reports, science documents, analysed-data PDFs
backend/ingest/build_docs.py        reads them page by page into data/docs.db (passage + page number)
backend/ingest/fetch_resources.py   downloads the official NASA resources (pages, PDFs, video captions)
backend/ingest/build_resources.py   reads them into data/resources.json (passage + heading, page or video time)
backend/ingest/build_embeddings.py  meaning vectors from a local model, no key and no tokens
backend/app/research.py             search -> model -> checks
```

1. **Library.** 3,530 passages: NASA PSI records, 69 NASA documents read page by page (15 reports,
   24 science documents, 30 CFI test summary sheets), condition summaries from the run tables, the
   NASA challenge text, 231 passages from the official NASA resources (19 documents), and the
   project-team summaries. Each passage has a kind, and a resource passage is never presented as
   a PSI record.
2. **Search.** Keyword search and meaning search (a small local model) are combined by rank. NASA
   reports are weighted above project summaries. The reader can limit the search to some
   experiments or kinds of source.
3. **Model.** The ten best passages go to the model as numbered sources, with a one-line summary of
   all 24 investigations from the project database so that answers about the whole collection
   agree with the Explorer. The instructions and that summary are sent as a cached prefix.
4. **Checks, in code.** Citations that point at nothing the model was given are removed. The
   answer is split into statements; each is labelled with the kind of evidence behind it, and
   every number with a unit is looked up in the passage cited for it. The page shows the result.

Research tasks on the assistant page (ask, findings brief, compare evidence, design evidence
review, explain a term) use the same engine with a fixed answer layout.

### Check that everything works

```bash
backend/.venv/Scripts/python -X utf8 backend/tests/smoke_test.py
```

86 checks against the real database: search, filters, ranking, comparison, insights, every chart
preset, the assistant's fallback, off-topic rejection, the PDF report, the research-gap counts, the
predictive model (accuracy against a baseline, out-of-range blocking), the mission report, the
data-use figures, the agreement between the AI's collection index and the Explorer filter, and the
official NASA resources (all ten listed and used, quotes verified, searchable by the assistant).

## What is in the site (stages 1 and 2)

| # | Section | What it does |
|---|---------|--------------|
| ★ | Start here + Guide | A plan for where to go, three paths by kind of user, and a 10-step Moon Base walkthrough. The Guide button is on every page. |
| 1 | Research Explorer | Pick a crew environment for a fire-safety briefing with gaps; search and filter the experiments; open a full profile with NASA's text, test conditions with provenance, run tables and source links. If no experiment matches, it shows the closest ones and offers an AI estimate. |
| 2 | AI Research Assistant | Questions in plain language, answers cited to experiment profiles, student/researcher wording, suggested next steps into other sections, PDF report with references. |
| 3 | Experiment Ranking | Relevance to a crew environment from factors you weight yourself, with a per-factor breakdown; or rank by a criterion you type (AI), with irrelevant criteria rejected. |
| 4 | Experiment Comparison | Two to four experiments side by side; shared, different and "Not reported" values marked. |
| 5 | Fire Safety Insights | Prevention, detection, suppression, lessons from Apollo 1, Apollo 13 and the Mir fire, Earth vs. microgravity, next-generation equipment, uses on Earth (with the NASA Spinoff articles). Every point shows its NASA quote, the tested conditions and its limits. |
| 6 | Charts | Interactive Plotly charts from the NASA run tables, a chart builder, and "Where has NASA tested?" against the habitat atmospheres. |
| 7 | Research Gaps | Counts what the selected experiments cover by gravity, fuel, oxygen, pressure, airflow, material and topic. Empty groups are marked "Not represented in this project collection". Includes a two-condition coverage map, a per-habitat check, questions for future experiments, and where Earth and microgravity results cannot be compared. |
| 8 | Predictions & What-If | One simple model (ridge regression, scikit-learn) that estimates droplet burning rate from the FLEX run table. Tested on held-out test days; shown with its error band, the closest real tests and a model card. Requests outside the tested range, or far from any real test, get no number and the related experiments instead. |
| 9 | Mission Report | For one crew environment: briefing, most relevant experiments, insights, gaps, model estimate and references. Preview on screen, download as PDF. |
| 10 | NASA Resources | The ten official NASA resources for the challenge: NASA's description of each, what was read, the embedded ScienceCast video with its transcript, and links to every place the site quotes it. |
| ✦ | Ask AI (every page) | Inline chat that knows which page, experiment or chart you are looking at. |

Still to do (guide phase 7): deploy to a public host, architecture diagram, demo story.

## How it is built

```
backend/
  ingest/fetch_psi.py      downloads PSI records, run tables and images into data/raw/
  ingest/curation.py       project-team layer: fuel state, safety area, plain summaries, quoted conditions
  ingest/build_db.py       builds data/flame.db (SQLite) and verifies every quoted condition
  ingest/challenge_text.py NASA challenge description passages (cited as "NASA challenge")
  ingest/nasa_resources.py the ten official NASA resources, with NASA's description of each
  ingest/fetch_resources.py, build_resources.py   download them and read them into data/resources.json
  app/main.py              FastAPI routes; also serves the built website
  app/store.py             shared in-memory data + filters
  app/environments.py      crew environments and the relevance ranking
  app/compare.py           side-by-side comparison
  app/insights.py          fire-safety insights and accident lessons with verified quotes
  app/resources.py         the official NASA resources: where each is used, what they say about each experiment
  app/charts.py            chart presets and the test envelope
  app/gaps.py              research gaps: coverage counts, headline gaps, future questions
  app/predict.py           the FLEX burning-rate model, its evaluation and the What-If checks
  app/mission.py           mission report (on-screen data and PDF)
  app/retrieval.py         TF-IDF passage search and related experiments
  app/assistant.py         AI features and their retrieval-only fallbacks
  app/llm.py               Claude API wrapper (official Anthropic SDK)
  app/report.py            PDF report
  tests/smoke_test.py      end-to-end checks
frontend/                  React + TypeScript + Vite, Plotly charts
data/raw/                  what was downloaded from NASA (tables, images, manifest)
data/flame.db              the shared database (rebuilt by build_db.py)
PROGRESS.md                development log: decisions, findings, what is left
```

Tools: Python, FastAPI, pandas, scikit-learn (TF-IDF retrieval), SQLite, Claude (Anthropic API),
fpdf2; React, TypeScript, Vite, Plotly.

### Rules the data layer enforces

- NASA's text is shown verbatim. Summaries, tags and scores added by the project are labelled as such.
- A condition (oxygen, pressure, airflow) is shown only if it comes from a PSI run table or from a
  sentence quoted from the PSI record. The build fails if a quote is not found in the record.
- Missing values are "Not reported". Nothing is guessed.
- Every insight quote is checked against its source when the server starts: the PSI record, the
  challenge text, or the text read from the official NASA resource it is attributed to.
- The official NASA resources are background. A statement from an accident page, a fact sheet or
  the Researcher's Guide is labelled "NASA official resource" and is never shown as PSI data.
- A chart exists only for columns that exist in a NASA table.
- AI answers may only use retrieved passages; citations that do not match a retrieved source are removed.
- Relevance scores are this project's method, not NASA's, and the formula is shown on the page.
- A research gap is counted from the selected experiments and worded as "not represented in this
  project collection", never as proof that no research exists.
- The predictive model is offered only if it beats a no-model baseline on held-out test days (it is
  re-checked at every server start). It refuses requests outside its training range or far from any
  real test, and every estimate is labelled "Model prediction, not a NASA measurement".

## Data source

NASA Physical Sciences Informatics (PSI), <https://psi.nasa.gov>. 23 of the 24 records used here list
the license "Creative Commons Zero v1.0 Universal"; one record gives no license.
`fetch_psi.py` uses PSI's public read-only JSON endpoints and downloads only the investigation
records, the experimental run tables and one representative image per investigation.

### How much of the NASA data is used

NASA's archives for the 24 combustion investigations total **12.28 TB** (13,496,771,103,733 bytes,
the sum of the `totalFileSize` field in the 24 PSI records). 99.9% of the bytes in the records'
file lists sit in "Raw Data" folders: zipped camera and instrument files and video. The site does
not download that. It uses, in full:

| Part | Size | Used for |
|---|---|---|
| The complete PSI record of each of the 24 investigations | 19.7 MB | Explorer, profiles, comparison, insights quotes, AI passages |
| All 22 experimental run tables (2,005 test rows) | 206 KB | Charts, condition ranges, research gaps, the What-If model |
| Representative images (5 investigations have one) | 1.9 MB | Experiment profiles |

| 69 NASA reports, science documents and test summary sheets (14 experiments have them) | 131 MB | AI assistant: 3,058 passages cited by document and page |

That is about 150 MB, organised into a 1.3 MB database and a 3.6 MB passage database. Not read in:
the raw footage, the analysed-data spreadsheets, and NASA's slides and engineering documents; six
report files could not be used (two failed to download, two are old .doc files, one is not a real
PDF, one has no readable text); every
experiment page links to them on PSI. Checked on 2026-11-12: all 96 NASA text fields in the
database are identical to the PSI records, all 24,569 table cells the site serves are in NASA's CSV
files, and the 22 CSV files are byte-identical to the copies on psi.nasa.gov.

### Official NASA resources

The challenge organisers published ten official NASA resources. All ten are used:

| # | Resource | What is read | Where the site uses it |
|---|---|---|---|
| 1 | PSI Data Repository: Combustion Science | Everything above | The whole site |
| 2 | NASA Combustion Science (Glenn) | The page and the 8 experiment fact sheets it links to (106 passages) | Experiment profiles ("In NASA's official resources"), Research Gaps (the FM2 lunar experiment), assistant |
| 3 | NASA ScienceCasts: The Power of Studying Combustion on the ISS | NASA's caption file from images.nasa.gov (4 passages, with times) | Embedded on the NASA Resources page with its transcript; insights; assistant |
| 4 | A Researcher's Guide to ISS Combustion Science | The full 56-page PDF, page by page (87 passages) | Prevention, detection and suppression insights; Research Gaps; assistant, cited by page |
| 5 | Apollo 1 | The page (11 passages) | Insights: lessons from past accidents; mission report |
| 6 | Apollo 13 | The page (10 passages) | Insights: lessons from past accidents; mission report |
| 7 | 25 Years Ago: Fire Aboard Space Station Mir | The article (5 passages) | Insights: lessons from past accidents; mission report |
| 8 | Spinoff: Fireman's Air Tanks | The page | Insights: uses on Earth |
| 9 | Spinoff: Fire Detector | The page | Insights: uses on Earth |
| 10 | Spinoff: New Technology for the Fire Attire | The page and the full 2-page article from NASA's Technical Reports Server | Insights: uses on Earth |

That is 19 documents, 231 passages and about 36,600 words, in `data/resources.json` (about 570 KB).
Not usable: the full NTRS articles for the air tanks (a scan with no text layer) and the fire
detector (garbled text layer); their Spinoff summaries are read instead. Not read: the review-board
reports the Apollo pages link to. NASA's Apollo 13 page carries a copy of the Apollo 1 mission
summary in a pop-up; that block is left out. Every quote the site shows from a resource is checked
against the text read from it when the server starts.

Not NASA data, and labelled as such on the pages: the plain-language summaries and tags, the
relevance scores, the crew-environment atmospheres (taken from the challenge text and the BRE
record; the Mars one is an assumption), the "questions for future experiments", the What-If model's
estimates and anything the AI writes.
