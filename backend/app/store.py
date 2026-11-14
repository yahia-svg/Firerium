"""In-memory view of data/flame.db. The collection is small (24 investigations,
about 2,000 runs), so every feature reads from these shared structures."""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = ROOT / "data" / "flame.db"
IMAGES = ROOT / "data" / "raw" / "images"

DOCS_DB = ROOT / "data" / "docs.db"

INVS: dict[str, dict] = {}
TABLES: dict[str, dict] = {}
RUNS: list[dict] = []
CHUNKS: list[dict] = []
META: dict[str, str] = {}
DOCS: dict[int, dict] = {}          # NASA documents read page by page (built by ingest/build_docs.py)
DOC_COUNT: dict[str, int] = {}      # documents per investigation
DOC_PROBLEMS: list[dict] = []       # files that could not be read, shown rather than hidden
RESOURCES_PATH = ROOT / "data" / "resources.json"
RESOURCES: dict[str, dict] = {}     # the official NASA resources listed for the challenge (ingest/build_resources.py)
RES_TEXT: dict[str, str] = {}       # full text read for each resource, to check quotes against
RES_INFO: dict = {}                 # build date, files that could not be read, what was left out

# Every searchable passage has a kind, so an answer can say what sort of evidence it rests on.
KIND_LABEL = {
    "report": "NASA report", "analysed": "NASA analysed data", "science_doc": "NASA science document",
    "record": "NASA PSI record", "conditions": "NASA run tables and record", "challenge": "NASA challenge text",
    "project": "Project-team summary", "index": "Project database (NASA run tables and records)",
    "resource": "NASA official resource",
}
DOCUMENT_KINDS = ("report", "analysed", "science_doc")   # passages read from PSI document files


def _kind(chunk: dict) -> str:
    if chunk["investigation_id"] == "CHALLENGE":
        return "challenge"
    section = chunk["section"].lower()
    if "project team" in section:
        return "project"
    if section.startswith(("test conditions", "run table")):
        return "conditions"
    return "record"


def _load_documents() -> None:
    """Passages from NASA's reports, science documents and analysed-data sheets, if they were built."""
    DOCS.clear(), DOC_COUNT.clear(), DOC_PROBLEMS.clear()
    if not DOCS_DB.exists():
        return
    con = sqlite3.connect(DOCS_DB)
    con.row_factory = sqlite3.Row
    for r in con.execute("SELECT * FROM documents"):
        if r["investigation_id"] in INVS:
            DOCS[r["id"]] = dict(r)
            DOC_COUNT[r["investigation_id"]] = DOC_COUNT.get(r["investigation_id"], 0) + 1
    for r in con.execute("SELECT * FROM passages ORDER BY id"):
        doc = DOCS.get(r["document_id"])
        if not doc:
            continue
        inv = INVS[r["investigation_id"]]
        section = f"{doc['title']}, p. {r['page']}"
        CHUNKS.append({"id": 100000 + r["id"], "investigation_id": r["investigation_id"], "section": section,
                       "text": f"{inv['short']} ({inv['id']}) - {section}: {r['text']}", "kind": r["kind"],
                       "doc_id": doc["id"], "doc_title": doc["title"], "page": r["page"], "url": doc["url"]})
    row = con.execute("SELECT value FROM meta WHERE key='problems'").fetchone()
    DOC_PROBLEMS.extend(json.loads(row["value"]) if row else [])
    con.close()


def _load_resources() -> None:
    """Passages from the official NASA resources (web pages, the Researcher's Guide, fact sheets,
    the ScienceCast captions), if they were built. They are searched like every other passage and
    always labelled as a NASA resource, never as a PSI record."""
    RESOURCES.clear(), RES_TEXT.clear(), RES_INFO.clear()
    if not RESOURCES_PATH.exists():
        return
    data = json.loads(RESOURCES_PATH.read_text(encoding="utf-8"))
    RESOURCES.update({r["id"]: r for r in data["resources"]})
    RES_TEXT.update(data["texts"])
    RES_INFO.update(built_at=data["built_at"], not_usable=data["not_usable"], left_out=data["left_out"],
                    source_list=data["source_list"])
    for p in data["passages"]:
        res = RESOURCES[p["resource_id"]]
        doc = res["documents"][p["doc"] - 1]
        # a web page is cited by its heading, a PDF by its title and page, the video by its time
        section = f"{doc['title']}, {p['section']}" if doc["type"] == "pdf" else p["section"]
        CHUNKS.append({"id": 200000 + p["n"], "investigation_id": res["id"], "section": section,
                       "text": f"{res['short']} ({res['id']}) - {section}: {p['text']}", "kind": "resource",
                       "doc_id": f"{res['id']}:{p['doc']}", "doc_title": doc["title"], "page": p["page"],
                       "url": p["url"]})


def source(sid: str) -> dict:
    """Name and links of whatever a passage belongs to: a PSI investigation, the challenge text or
    one of the official NASA resources."""
    if sid == "CHALLENGE":
        return {"id": sid, "type": "challenge", "short": "NASA challenge",
                "name": "NASA Space Apps challenge: Flame in Freefall", "psi": None, "doi": None, "url": None}
    if sid in RESOURCES:
        r = RESOURCES[sid]
        return {"id": sid, "type": "resource", "short": r["short"], "name": r["title"], "psi": None, "doi": None,
                "url": r["url"]}
    inv = INVS[sid]
    return {"id": sid, "type": "investigation", "short": inv["short"], "name": inv["title"],
            "psi": inv["links"]["psi"], "doi": inv["links"]["doi"], "url": inv["links"]["psi"]}


def load() -> None:
    if not DB_PATH.exists():
        raise RuntimeError(
            f"{DB_PATH} not found. Run: python backend/ingest/fetch_psi.py && python backend/ingest/build_db.py"
        )
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    INVS.clear(), TABLES.clear(), RUNS.clear(), CHUNKS.clear(), META.clear()
    for r in con.execute("SELECT json FROM investigations"):
        inv = json.loads(r["json"])
        INVS[inv["id"]] = inv
    for r in con.execute("SELECT json FROM tables"):
        t = json.loads(r["json"])
        TABLES[t["id"]] = t
    RUNS.extend(dict(r) for r in con.execute("SELECT * FROM runs"))
    CHUNKS.extend(dict(r) for r in con.execute("SELECT * FROM chunks ORDER BY id"))
    META.update({r["key"]: r["value"] for r in con.execute("SELECT * FROM meta")})
    con.close()
    for c in CHUNKS:
        c["kind"] = _kind(c)
    _load_documents()
    _load_resources()


def sort_key(inv_id: str) -> int:
    return int(inv_id.split("-")[1])


def card(inv: dict) -> dict:
    """Compact form used in lists (no long text)."""
    keep = ("id", "acronym", "name", "short", "title", "sub_area", "project_type", "gravity", "platform",
            "facilities", "fuel_state", "emulates", "pillars", "topics", "geometry", "directness", "materials",
            "sensors", "conditions", "summary", "safety_note", "n_runs", "tables", "has_image", "links",
            "suppressants", "reuses", "psi_related", "pi")
    return {k: inv.get(k) for k in keep}


def overlaps(cond: dict | None, lo: float | None, hi: float | None) -> bool:
    """Does a tested range touch [lo, hi]? Unreported conditions never match."""
    if cond is None:
        return False
    c_lo = cond["min"] if cond["min"] is not None else float("-inf")
    c_hi = cond["max"]
    if lo is not None and c_hi < lo:
        return False
    if hi is not None and c_lo > hi:
        return False
    return True


FILTER_KEYS = ("q", "fuel_state", "material", "pillar", "gravity", "facility", "topic",
               "o2_min", "o2_max", "p_min", "p_max", "flow_min", "flow_max", "has_runs")


_SUFFIXES = ("ations", "ation", "ions", "ion", "ors", "or", "ings", "ing", "ers", "er", "es", "ed", "s")


def _stem(tok: str) -> str:
    """A light word stem, so "detection" also finds "detector" and "suppression" finds "suppressant"."""
    for suf in _SUFFIXES:
        if tok.endswith(suf) and len(tok) - len(suf) >= 4:
            return tok[: -len(suf)]
    return tok


def apply_filters(f: dict) -> list[dict]:
    out = []
    q = (f.get("q") or "").strip().lower()
    stems = [_stem(tok) for tok in q.split()]
    for inv in INVS.values():
        if q:
            hay = " ".join([
                inv["id"], inv["short"], inv["name"], inv["title"], inv["summary"], inv.get("sub_area") or "",
                " ".join(inv["keywords"]), " ".join(inv["materials"]), " ".join(inv["topics"]),
                " ".join(inv["pillars"]),  # prevention / detection / suppression
                inv["text"]["objective"], inv.get("pi") or "",
            ]).lower()
            if not all(s in hay for s in stems):
                continue
        if f.get("fuel_state") and not any(fs.startswith(f["fuel_state"]) for fs in inv["fuel_state"]):
            continue
        if f.get("material") and f["material"] not in inv["materials"]:
            continue
        if f.get("pillar") and f["pillar"] not in inv["pillars"]:
            continue
        if f.get("gravity") and inv["gravity"]["level"] != f["gravity"]:
            continue
        if f.get("facility") and f["facility"] not in inv["facilities"]:
            continue
        if f.get("topic") and f["topic"] not in inv["topics"]:
            continue
        c = inv["conditions"]
        if (f.get("o2_min") is not None or f.get("o2_max") is not None) and not overlaps(
                c["oxygen"], f.get("o2_min"), f.get("o2_max")):
            continue
        if (f.get("p_min") is not None or f.get("p_max") is not None) and not overlaps(
                c["pressure"], f.get("p_min"), f.get("p_max")):
            continue
        if (f.get("flow_min") is not None or f.get("flow_max") is not None) and not overlaps(
                c["airflow"], f.get("flow_min"), f.get("flow_max")):
            continue
        if f.get("has_runs") and not inv["n_runs"]:
            continue
        out.append(inv)
    out.sort(key=lambda i: sort_key(i["id"]))
    return out


def facets() -> dict:
    def count(values_of) -> list[dict]:
        counts: dict[str, int] = {}
        for inv in INVS.values():
            for v in values_of(inv):
                counts[v] = counts.get(v, 0) + 1
        return [{"value": k, "count": v} for k, v in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))]

    def bounds(param: str) -> dict | None:
        cs = [i["conditions"][param] for i in INVS.values() if i["conditions"][param]]
        if not cs:
            return None
        lows = [c["min"] for c in cs if c["min"] is not None]
        return {"min": min(lows) if lows else 0, "max": max(c["max"] for c in cs),
                "unit": cs[0]["unit"], "reported_in": len(cs)}

    return {
        "fuel_state": count(lambda i: {fs.split(" ")[0] for fs in i["fuel_state"]}),
        "material": count(lambda i: i["materials"]),
        "pillar": count(lambda i: i["pillars"]),
        "gravity": count(lambda i: [i["gravity"]["level"]]),
        "facility": count(lambda i: i["facilities"]),
        "topic": count(lambda i: i["topics"]),
        "oxygen": bounds("oxygen"), "pressure": bounds("pressure"), "airflow": bounds("airflow"),
        "total": len(INVS),
    }
