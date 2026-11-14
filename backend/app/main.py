"""Flame in Freefall API (FastAPI).

Run from the project root:
    backend/.venv/Scripts/python -m uvicorn app.main:app --app-dir backend --reload --port 8000
"""
from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from fastapi import FastAPI, HTTPException, Query  # noqa: E402
from fastapi.concurrency import run_in_threadpool  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse, Response, StreamingResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from . import (assistant, charts, compare, environments, gaps, insights, llm, mission, models,  # noqa: E402
               predict, report, research, resources, retrieval, store)

logging.basicConfig(level=logging.INFO)
DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
DATA_USE: dict = {}


def _data_use() -> dict:
    """How much NASA holds for these investigations against how much this site uses.

    The archive size is the `totalFileSize` NASA publishes in each PSI record. The used size is
    what the build read: the PSI records, the run tables and the representative images."""
    raw = store.ROOT / "data" / "raw"
    names = ("details", "tables", "images", "docs", "resources")
    parts = {name: sum(f.stat().st_size for f in (raw / name).rglob("*") if f.is_file())
             for name in names if (raw / name).exists()}
    # The large downloads (records, documents, resource pages) are not in the repository, so a
    # deployed server does not have them. Where they exist the sizes are saved; elsewhere the
    # saved sizes are used, so the figures are the same on every machine.
    saved_path = store.ROOT / "data" / "raw_sizes.json"
    if len(parts) == len(names):
        try:
            if not saved_path.exists() or json.loads(saved_path.read_text()) != parts:
                saved_path.write_text(json.dumps(parts, indent=2) + "\n")
        except OSError:
            pass
    elif saved_path.exists():
        try:
            parts = {**json.loads(saved_path.read_text()), **parts}
        except (OSError, ValueError):
            pass
    return {
        "archive_bytes": round(sum((i.get("archive_gb") or 0) for i in store.INVS.values()) * 1e9),
        "largest": [{"id": i["id"], "short": i["short"], "gb": i["archive_gb"]} for i in
                    sorted(store.INVS.values(), key=lambda i: -(i.get("archive_gb") or 0))[:3]],
        "used_bytes": sum(v for k, v in parts.items() if k != "resources") or None,   # the PSI part
        "records_bytes": parts.get("details"), "tables_bytes": parts.get("tables"),
        "images_bytes": parts.get("images"), "images": len(list((raw / "images").glob("*.jpg"))) if "images" in parts else 0,
        "database_bytes": store.DB_PATH.stat().st_size,
        # NASA reports, science documents and test summary sheets read page by page for the assistant
        "documents": len(store.DOCS), "documents_bytes": parts.get("docs"),
        "document_passages": sum(1 for c in store.CHUNKS if c["kind"] in store.DOCUMENT_KINDS),
        "experiments_with_documents": len(store.DOC_COUNT),
        # the official NASA resources listed for the challenge, besides PSI itself
        "resources": sum(1 for r in store.RESOURCES.values() if r["passages"]),
        "resource_documents": sum(len(r["documents"]) for r in store.RESOURCES.values()),
        "resource_passages": sum(r["passages"] for r in store.RESOURCES.values()),
        "resources_bytes": parts.get("resources"),
    }


@asynccontextmanager
async def lifespan(_: FastAPI):
    store.load()
    retrieval.build()
    insights.verify()  # every quoted sentence must exist in its NASA source
    charts.verify()    # every chart must point at real columns
    gaps.verify()      # quotes on the Research Gaps page must exist in their NASA source
    resources.verify() # every official NASA resource has its "how it is used" line
    predict.build()    # train and test the What-If model (offered only if it beats the baseline)
    models.build()     # the Predictions page's models (same rules, several experiments)
    DATA_USE.update(_data_use())
    await run_in_threadpool(llm.verify)  # one free request: is the AI key accepted? (skipped without a key)
    yield


app = FastAPI(title="Flame in Freefall API", version="0.2.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_methods=["*"], allow_headers=["*"])


class Filters(BaseModel):
    q: str | None = None
    fuel_state: str | None = None
    material: str | None = None
    pillar: str | None = None
    gravity: str | None = None
    facility: str | None = None
    topic: str | None = None
    o2_min: float | None = None
    o2_max: float | None = None
    p_min: float | None = None
    p_max: float | None = None
    flow_min: float | None = None
    flow_max: float | None = None
    has_runs: bool | None = None

    def as_dict(self) -> dict:
        return {k: v for k, v in self.model_dump().items() if v not in (None, "", False)}


def need_inv(inv_id: str) -> dict:
    inv = store.INVS.get(inv_id)
    if not inv:
        raise HTTPException(404, f"No investigation '{inv_id}' in the collection.")
    return inv


def need_env(env_id: str) -> None:
    if env_id not in environments.ENVIRONMENTS:
        raise HTTPException(404, f"Unknown environment '{env_id}'.")


@app.get("/api/health", include_in_schema=False)
def health():
    """For Render's health check and uptime monitors: cheap, no AI call, no large payload."""
    return {"ok": True, "investigations": len(store.INVS), "ai": llm.available()}


@app.get("/api/meta")
def meta():
    return {
        **store.META,
        "llm": llm.status(),
        "data_use": DATA_USE,
        "environments": [environments.public_env(e) for e in environments.ENVIRONMENTS],
        "investigations": [{"id": i["id"], "short": i["short"], "name": i["name"], "n_runs": i["n_runs"]}
                           for i in sorted(store.INVS.values(), key=lambda i: store.sort_key(i["id"]))],
        "resources": resources.brief(),
        "disclaimer": "Research tool built on public NASA PSI records. Not a certified spacecraft safety system; "
                      "estimates and predictions are not guaranteed real-world outcomes.",
    }


# ---- Research Explorer ------------------------------------------------------
@app.post("/api/investigations/search")
def search(filters: Filters):
    f = filters.as_dict()
    found = store.apply_filters(f)
    return {"count": len(found), "total": len(store.INVS), "filters": assistant.describe_filters(f),
            "results": [store.card(i) for i in found], "facets": store.facets()}


@app.get("/api/investigations/{inv_id}")
def investigation(inv_id: str):
    inv = need_inv(inv_id)
    tables = []
    for t in inv["tables"]:
        full = store.TABLES[t["id"]]
        tables.append({k: full[k] for k in ("id", "title", "file_name", "source_url", "n_rows", "columns",
                                            "label_note", "quality_notes")})
    return {**inv, "table_details": tables, "related": retrieval.related(inv_id),
            "nasa_resources": resources.for_investigation(inv_id),
            "reused_by": [{"id": o["id"], "short": o["short"], "name": o["name"]}
                          for o in store.INVS.values() if inv_id in o["reuses"]]}


@app.get("/api/investigations/{inv_id}/image")
def image(inv_id: str):
    need_inv(inv_id)
    path = store.IMAGES / f"{inv_id}.jpg"
    if not path.exists():
        raise HTTPException(404, "No image for this investigation.")
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


@app.get("/api/environments/{env_id}/summary")
async def environment_summary(env_id: str):
    need_env(env_id)
    return await run_in_threadpool(assistant.environment_summary, env_id)


@app.post("/api/explorer/estimate")
async def estimate(filters: Filters):
    return await run_in_threadpool(assistant.estimate, filters.as_dict())


# ---- Ranking ----------------------------------------------------------------
class RankRequest(BaseModel):
    environment: str = "moon"
    weights: dict[str, float] | None = None
    focus: str | None = None
    filters: Filters = Field(default_factory=Filters)


@app.post("/api/ranking")
def ranking(req: RankRequest):
    need_env(req.environment)
    if req.focus and req.focus not in ("prevention", "detection", "suppression"):
        raise HTTPException(400, "focus must be prevention, detection or suppression.")
    return environments.rank(req.environment, req.weights, req.focus, req.filters.as_dict())


class CustomRankRequest(BaseModel):
    criterion: str = Field(min_length=3, max_length=400)
    filters: Filters = Field(default_factory=Filters)


@app.post("/api/ranking/custom")
async def custom_ranking(req: CustomRankRequest):
    try:
        return await run_in_threadpool(assistant.custom_rank, req.criterion.strip(), req.filters.as_dict())
    except assistant.IrrelevantCriterion as exc:
        raise HTTPException(422, str(exc)) from exc


# ---- Comparison -------------------------------------------------------------
@app.get("/api/compare")
def compare_route(ids: str = Query(..., description="Comma-separated PSI accessions")):
    wanted = list(dict.fromkeys(x.strip() for x in ids.split(",") if x.strip()))
    if not 2 <= len(wanted) <= 4:
        raise HTTPException(400, "Choose two to four investigations to compare.")
    for i in wanted:
        need_inv(i)
    return compare.compare(wanted)


# ---- Insights ---------------------------------------------------------------
@app.get("/api/insights")
def insights_route():
    return insights.payload()


# ---- Official NASA resources -------------------------------------------------
@app.get("/api/resources")
def resources_route():
    """The resources NASA listed for the challenge: what each is, what was read, where the site uses it."""
    return resources.payload()


# ---- Charts -----------------------------------------------------------------
@app.get("/api/tables")
def tables():
    return {"tables": charts.table_list(), "presets": charts.presets()}


@app.get("/api/tables/{table_id}")
def table(table_id: str):
    t = store.TABLES.get(table_id)
    if not t:
        raise HTTPException(404, f"No run table '{table_id}'.")
    inv = store.INVS[t["investigation_id"]]
    return {**t, "investigation": {"id": inv["id"], "short": inv["short"], "name": inv["name"],
                                   "psi": inv["links"]["psi"]}}


@app.get("/api/envelope")
def envelope():
    return charts.envelope()


# ---- Research Gaps ----------------------------------------------------------
class GapsRequest(BaseModel):
    filters: Filters = Field(default_factory=Filters)
    environment: str | None = None


@app.post("/api/gaps")
def gaps_route(req: GapsRequest):
    if req.environment:
        need_env(req.environment)
    return gaps.analyse(req.filters.as_dict(), req.environment)


# ---- Predictive model and What-If -------------------------------------------
@app.get("/api/model")
def model_card():
    return predict.info()


class WhatIfRequest(BaseModel):
    fuel: str = "Methanol"
    oxygen: float = Field(ge=0, le=100, description="% by volume")
    co2: float = Field(0, ge=0, le=100, description="% by volume")
    helium: float = Field(0, ge=0, le=100, description="% by volume")
    pressure: float = Field(gt=0, le=20, description="atm")
    diameter: float = Field(gt=0, le=50, description="mm")


@app.post("/api/whatif")
def whatif(req: WhatIfRequest):
    fuel = next((f for f in predict.FUELS if f.lower() == req.fuel.lower()), None)
    if not fuel:
        raise HTTPException(400, f"The model supports these fuels only: {', '.join(predict.FUELS)}.")
    return predict.whatif(fuel, {k: getattr(req, k) for k in predict.KEYS})


class PredictRequest(BaseModel):
    model: str = "flex-rate"
    group: str | None = None
    values: dict[str, float] = Field(default_factory=dict)


@app.get("/api/predict/models")
def predict_models():
    """The models on the Predictions page, their inputs, tested ranges and accuracy, and the habitat presets."""
    return models.catalog()


@app.post("/api/predict")
def predict_one(req: PredictRequest):
    if req.model not in models.SPECS:
        raise HTTPException(404, f"Unknown model '{req.model}'.")
    return models.run(req.model, req.group, req.values)


class BatchRequest(BaseModel):
    model: str = "flex-rate"
    rows: list[dict] = Field(max_length=2000)


@app.post("/api/predict/batch")
def predict_batch(req: BatchRequest):
    """Many scenarios at once, for an uploaded CSV."""
    if req.model not in models.SPECS:
        raise HTTPException(404, f"Unknown model '{req.model}'.")
    return {"results": models.batch(req.model, req.rows)}


# ---- Mission Report ---------------------------------------------------------
def _mission_args(env_id: str, focus: str | None, top: int) -> tuple[str, str | None, int]:
    need_env(env_id)
    if focus and focus not in mission.FOCI:
        raise HTTPException(400, "focus must be prevention, detection or suppression.")
    return env_id, focus or None, top


@app.get("/api/mission/{env_id}")
async def mission_report(env_id: str, focus: str | None = None, top: int = Query(6, ge=3, le=12)):
    return await run_in_threadpool(mission.build, *_mission_args(env_id, focus, top))


@app.get("/api/mission/{env_id}/pdf")
async def mission_pdf(env_id: str, focus: str | None = None, top: int = Query(6, ge=3, le=12)):
    pdf = await run_in_threadpool(mission.pdf, *_mission_args(env_id, focus, top))
    return Response(pdf, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="flame-in-freefall-mission-report-{env_id}.pdf"'})


# ---- AI assistant -----------------------------------------------------------
class ChatMessage(BaseModel):
    role: str
    content: str
    mode: str | None = None


class Scope(BaseModel):
    ids: list[str] = Field(default_factory=list, max_length=24)     # limit the search to these experiments
    kinds: list[str] = Field(default_factory=list, max_length=8)    # and to these kinds of source


class AskRequest(BaseModel):
    question: str = Field(min_length=2, max_length=2000)
    history: list[ChatMessage] = Field(default_factory=list)
    context: dict | None = None
    audience: str = "student"
    scope: Scope = Field(default_factory=Scope)
    task: str = "ask"


@app.post("/api/assistant/ask")
async def ask(req: AskRequest):
    return await run_in_threadpool(
        research.ask, req.question.strip(), [m.model_dump() for m in req.history], req.context, req.audience,
        req.scope.model_dump(), req.task)


@app.post("/api/assistant/ask/stream")
def ask_stream(req: AskRequest):
    """The same answer as /api/assistant/ask, sent as it is written: newline-delimited JSON events,
    {"type": "text", "text": ...} while the model writes, then {"type": "done", "answer": {...}} with the
    checked answer (numbered references, statement check), or {"type": "error", "message": ...}."""
    import json
    import queue
    import threading

    q: queue.Queue = queue.Queue()

    def work():
        try:
            out = research.ask(req.question.strip(), [m.model_dump() for m in req.history], req.context, req.audience,
                               req.scope.model_dump(), req.task, on_text=lambda t: q.put({"type": "text", "text": t}))
            q.put({"type": "done", "answer": out})
        except Exception as exc:  # report, never hang the reader
            logging.exception("streamed answer failed")
            q.put({"type": "error", "message": f"The answer could not be built: {exc}"})

    threading.Thread(target=work, daemon=True).start()

    def events():
        while True:
            ev = q.get()
            yield json.dumps(ev, ensure_ascii=False) + "\n"
            if ev["type"] in ("done", "error"):
                return

    return StreamingResponse(events(), media_type="application/x-ndjson",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/assistant/library")
def library():
    """What the assistant can search: passages by kind of source and the NASA documents read."""
    return {**research.library(), "llm": llm.status()}


class ReportRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1)
    title: str | None = None


@app.post("/api/assistant/report")
async def report_route(req: ReportRequest):
    pdf = await run_in_threadpool(report.build_pdf, [m.model_dump() for m in req.messages], req.title)
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": 'attachment; filename="flame-in-freefall-report.pdf"'})


# ---- Built frontend (production) --------------------------------------------
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "Unknown API route.")
        file = DIST / path
        if path and file.is_file() and DIST in file.resolve().parents:
            return FileResponse(file)
        return FileResponse(DIST / "index.html")
