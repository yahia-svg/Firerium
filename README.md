# Flame in Freefall

**NASA's fire-in-space research, organised for the people who will live with it.**
Pick a habitat (space station, spacecraft, Moon base, rover, Mars base), and every NASA result is ranked, predicted, checked and cited for that atmosphere.

🔗 **Live:** https://firerium.onrender.com · Built for the NASA Space Apps challenge *Flame in Freefall*

![Start page](docs/project-details/img/01-home.png)

| 24 NASA investigations | 2,005 measured tests | 3,530 NASA passages for the AI | 5 crew habitats | 0 tests in Moon/Mars gravity |
|:-:|:-:|:-:|:-:|:-:|

---

## 🤖 An AI assistant that cannot make things up

Every claim is cited to a NASA page. Every number is checked against its source, in code.

![AI assistant answer with checks](docs/project-details/img/04b-assistant-answer.png)

## 🏆 Which NASA experiments matter for *your* habitat

<table><tr>
<td><img src="docs/project-details/img/09-ranking.png" alt="Ranking for Moon Base"></td>
<td><img src="docs/project-details/img/22-ranking-table.png" alt="Score breakdown per factor"></td>
</tr><tr>
<td align="center">0–100 score for the chosen habitat</td>
<td align="center">Every point explained; you set the weights</td>
</tr></table>

## 🔥 What would a fire do in this atmosphere?

<table><tr>
<td><img src="docs/project-details/img/11-predictions.png" alt="Prediction at Moon Base air"></td>
<td><img src="docs/project-details/img/20-predict-chart.png" alt="Model against NASA tests"></td>
</tr><tr>
<td align="center">3 models trained on NASA run tables, with confidence</td>
<td align="center">The model against the real NASA tests</td>
</tr></table>

| Model | NASA tests | Better than a simple guess |
|---|:-:|:-:|
| How fast does a droplet burn? | 257 (FLEX) | **52%** |
| Will the flame go out? | 206 (FLEX) | **26%** |
| How hot does it get? | 133 (ACME CFI-G) | **51%** |

## 🕳️ What NASA has *not* tested

<table><tr>
<td><img src="docs/project-details/img/12-gaps.png" alt="Gap map"></td>
<td><img src="docs/project-details/img/21-gaps-main.png" alt="Main gaps"></td>
</tr><tr>
<td align="center">Gap map: 11 empty combinations</td>
<td align="center">The main gaps, with the NASA text behind them</td>
</tr></table>

![Where has NASA tested?](docs/project-details/img/08b-envelope.png)
<p align="center"><i>1,009 NASA tests against the habitat atmospheres: no solid-material test falls inside the Moon Base box.</i></p>

## 📊 Explore, chart and compare NASA's data

<table><tr>
<td><img src="docs/project-details/img/02-explorer.png" alt="Research Explorer"></td>
<td><img src="docs/project-details/img/03-profile.png" alt="Experiment profile"></td>
</tr><tr>
<td align="center">All 24 investigations, filtered by habitat</td>
<td align="center">Full profile with NASA's own words</td>
</tr><tr>
<td><img src="docs/project-details/img/08-charts.png" alt="Chart builder"></td>
<td><img src="docs/project-details/img/10-compare.png" alt="Compare experiments"></td>
</tr><tr>
<td align="center">Build charts from 18 NASA run tables</td>
<td align="center">Two to four experiments side by side</td>
</tr></table>

## 🧯 Prevention, detection, suppression and lessons learned

<table><tr>
<td><img src="docs/project-details/img/05-insights.png" alt="Fire Safety Insights"></td>
<td><img src="docs/project-details/img/24-insights-detection.png" alt="Fire detection"></td>
</tr><tr>
<td align="center">The three challenge themes, from NASA evidence</td>
<td align="center">Every point quotes its NASA source</td>
</tr><tr>
<td><img src="docs/project-details/img/18-earth-vs-micro.png" alt="Earth vs microgravity"></td>
<td><img src="docs/project-details/img/07-drop-towers.png" alt="Drop towers"></td>
</tr><tr>
<td align="center">Earth vs. microgravity, same samples</td>
<td align="center">Testing fire on Earth in drop towers</td>
</tr></table>

## 📄 Mission Report, quizzes and sources

<table><tr>
<td><img src="docs/project-details/img/13-mission.png" alt="Mission Report"></td>
<td><img src="docs/project-details/img/19-quiz.png" alt="Quiz"></td>
<td><img src="docs/project-details/img/14-resources.png" alt="NASA Resources"></td>
</tr><tr>
<td align="center">One-click PDF per habitat</td>
<td align="center">2 quizzes, 20 questions</td>
<td align="center">All 10 NASA resources used</td>
</tr></table>

## 🌗 Light, dark and phone

<table><tr>
<td width="62%"><img src="docs/project-details/img/15-dark-home.png" alt="Dark mode"></td>
<td><img src="docs/project-details/img/16-phone-home.png" alt="Phone"></td>
<td><img src="docs/project-details/img/17-phone-predictions.png" alt="Phone dark"></td>
</tr></table>

---

## Built with

**Python:** FastAPI · pandas · scikit-learn · SQLite · pypdf · fpdf2 · FastEmbed (bge-small) · Claude API (Haiku)
**TypeScript:** React · Vite · Plotly
**Data:** [NASA PSI](https://psi.nasa.gov) + the 10 official challenge resources · **Hosting:** Render

Full write-up: [docs/project-details/PROJECT_DETAILS.md](docs/project-details/PROJECT_DETAILS.md)

## Run it

Windows: double-click **`start.bat`**, then open <http://localhost:8000>.

<details>
<summary>Manual setup</summary>

```bash
python -m venv backend/.venv
backend/.venv/Scripts/python -m pip install -r backend/requirements.txt
cd frontend && npm install && npm run build && cd ..
backend/.venv/Scripts/python -m uvicorn app.main:app --app-dir backend --port 8000
```

The databases are included. To rebuild them from NASA:
`fetch_psi.py` → `build_db.py` → `fetch_docs.py` → `build_docs.py` → `fetch_resources.py` → `build_resources.py` → `build_embeddings.py` (all in `backend/ingest/`).

**AI:** put an Anthropic key in `backend/.env` as `ANTHROPIC_API_KEY=...`. Without a key the site still works, and the assistant quotes NASA passages instead of writing answers.

**Tests:** `backend/.venv/Scripts/python -X utf8 backend/tests/smoke_test.py` (100 checks).
</details>

<details>
<summary>Rules the site enforces</summary>

- NASA's text is shown word for word; anything the project adds is labelled as ours.
- Every quote is checked against its NASA source when the server starts.
- Missing values are "Not reported", never guessed.
- AI citations that point to nothing are removed; numbers are looked up in the cited passage.
- A model is offered only if it beats a simple guess on unseen test days; every output says "model prediction, not a NASA measurement".
- A research gap means "not in this NASA collection", never "never studied".
</details>

> A research tool, not a certified spacecraft safety system.
