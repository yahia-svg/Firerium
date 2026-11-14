"""The research assistant: retrieval, the model call, and the checks made on its answer.

What happens for one question:

  1. Search. The question is matched against every passage in the library: NASA PSI records,
     NASA reports and science documents (page by page), NASA analysed-data sheets, condition
     summaries from the run tables, the NASA challenge text, the official NASA resources listed
     for the challenge (see resources.py) and the project-team summaries.
     The reader can narrow the search to some experiments or some kinds of source.
  2. Ask. The best passages go to the model as numbered sources [S1], [S2]... together with a
     one-line-per-experiment index from the project database. The model may only answer from
     these and must cite them.
  3. Check, in code, not by the model:
       * every citation must point at something the model was given, or it is removed;
       * the answer is split into statements, each labelled with the kind of evidence behind
         it (NASA report, NASA record, run table, project summary, general background);
       * every number with a unit is looked up in the passages cited for that statement.
     The result is returned as a ledger the reader can inspect.

Without a model the same search runs and the passages are quoted instead of interpreted.
"""
from __future__ import annotations

import re
import time

from . import llm, retrieval, store

MIN_SIMILARITY = 0.05  # below this, the collection has nothing on the question
INDEX_SECTION = "Conditions in the project database"

AUDIENCE = {
    "student": "Write for an undergraduate: plain words, short sentences, define each technical term the first time "
               "it appears.",
    "researcher": "Write for a combustion researcher or aerospace engineer: precise terminology, exact conditions "
                  "and units, no simplification of mechanisms.",
}

# Research tasks: the same engine with a brief that fixes the shape of the answer.
TASKS = {
    "ask": "",
    "findings": "Write a findings brief for the experiment named in the question, with these bold labels in this "
                "order: **What was tested**, **Conditions**, **What was found**, **Limits**, **Where the data is**. "
                "Under **What was found** give measured results from NASA reports and analysed data first, with "
                "their numbers. If the sources give only an objective or hypothesis for a point, present it as "
                "the stated objective or hypothesis; never restate it as a finding.",
    "compare": "Answer with one table: a row per experiment, and the columns What was burned, Conditions tested, "
               "What was measured or found, Source. After the table write two short paragraphs: what the "
               "comparison shows, and what it cannot show because the experiments differ or because NASA did not "
               "test or report something (a research gap).",
    "design": "This is an evidence review for a design question, not a design recommendation. Use these bold "
              "labels: **What the NASA evidence supports**, **What it cautions against**, **Research gaps**. "
              "Under the last label name the conditions (gravity, oxygen, pressure, material) that none of NASA's "
              "PSI combustion investigations tested, as shown by the COLLECTION INDEX.",
    "explain": "Explain the term in two or three sentences, then list which experiments in the collection involve "
               "it and what each did with it. Prefer a NASA passage that defines or uses the term over general "
               "knowledge.",
}

SYSTEM = """You are the research assistant inside "Flame in Freefall", a dashboard built on NASA's Physical \
Sciences Informatics (PSI) combustion investigations. Readers are professors, graduate and undergraduate students, \
aerospace researchers and aerospace engineers who use your answers to find and understand NASA research on fire in \
space. Every answer is checked after you write it: each citation is matched to its source and each number with a \
unit is looked up in the passage you cited for it, and the reader sees the result. Accuracy matters more than \
coverage.

What you are given
- SOURCES: numbered passages [S1], [S2]... Each header states the kind of source, the experiment, and the \
document and page. The kinds are:
  NASA report: final and post-flight reports and theses. These hold measured results and conclusions.
  NASA analysed data: summary sheets of individual tests with their measured values.
  NASA PSI record: NASA's description of an investigation (objective, approach, hypothesis, impacts, hardware, \
publications). Mostly what was planned and why, not what was measured.
  NASA science document: science requirements, test matrices and manuals. These state plans and requirements.
  NASA run tables and record: test conditions computed from NASA's experimental run tables.
  NASA challenge text: the NASA Space Apps challenge description.
  NASA official resource: the background resources NASA listed for this challenge. They are the NASA Combustion \
Science web page with its experiment fact sheets, the 2015 Researcher's Guide to ISS Combustion Science (a NASA \
review of the research), the transcript of the NASA ScienceCast video on combustion on the ISS, NASA's \
lessons-learned pages on the Apollo 1 fire and the Apollo 13 oxygen tank explosion, NASA's history article on \
the 1997 fire aboard Mir, and three NASA Spinoff articles on firefighter air tanks, a fire detector and \
firefighter clothing. The header names the resource and the heading, page or video time. These are NASA's own \
words but they are not PSI records: use them for history, lessons learned, overviews of the experiments and \
uses on Earth, and name the resource in the sentence ("NASA's Apollo 1 page says...").
  Project-team summary: written by the dashboard's authors, not NASA.
- COLLECTION INDEX: one line for every investigation, tagged [PSI-n], with the values the dashboard's Explorer, \
Ranking and Research Gaps pages use: what was burned, fire-safety area, materials, and the oxygen, pressure and \
airflow ranges. "not reported" means neither the run table nor the record gives a value, which is different from \
"not tested". SOURCES holds only the passages closest to the question, so for any question about the collection \
as a whole (which experiments tested a condition, how many report a value, the highest or lowest level tested, \
what is missing) work from the index and check every line of it: the reader will compare your answer with the \
dashboard's filters.

How to answer
- Cite NASA first. This assistant exists to lead readers to real NASA data, so build every answer on NASA's own \
material and look there before writing anything from general knowledge. Prefer, in this order: NASA reports and \
analysed data for results; the NASA PSI record and run tables for what was tested and under which conditions; \
science documents for what was planned; NASA official resources for reviews of the research, past spacecraft \
fires and their lessons, and uses on Earth; the project-team summary only to orient the reader. When a NASA passage \
supports a point, base the sentence on it and not on the project summary; when only the project summary supports \
it, say "the project's summary says".
- Put a citation tag at the end of every sentence that states something from a source or an index line: [S3] for \
a passage, [PSI-25] for an index line. Cite the specific passage that contains the statement, and cite each \
number from the passage where that number appears, with its unit exactly as written there. Never cite a tag you \
were not given and never invent a publication, number or result. An answer about the experiments with no NASA \
citation in it is a failed answer: find the supporting passage, or leave the point out.
- Keep three things apart in your wording: a measured result ("the report gives...", "the tests showed..."), a \
plan or requirement ("was designed to...", "the science requirements call for..."), and a hypothesis ("the \
record states the hypothesis that..."). Do not present a plan or a hypothesis as a result.
- When something the reader asks about is not in front of you, decide which of two cases it is, and treat them \
differently:
  1. A research gap: NASA itself has not tested, measured or reported it. Judge this from the COLLECTION INDEX, \
which lists every PSI combustion investigation: for example no investigation ran in partial gravity, no solid \
material was burned at 30% oxygen or more, or a record gives no pressure ("not reported"). Say plainly that this \
is a research gap in NASA's work ("This is a research gap: none of NASA's PSI combustion investigations has \
tested..."), give the closest evidence NASA does have, and put the gap in `research_gap`. If the whole question \
is about such a gap, set grounding to "not_in_collection".
  2. Anything else: NASA may well have it, but it is not among the passages you were given. Do not mention that \
it is missing, unavailable, not in the sources, not in the documents or not in this collection, and do not \
apologise. Answer fully from what you do have, leave the unsupported part out, and offer a follow-up question \
instead. Never describe the limits of this site, its search, its library or its documents. Never write about \
the passages themselves: no "the passages I have", "the provided sources", "the documents I was given", "the \
excerpts do not say", "I do not have". Start with what NASA found, tested or designed.
  A short, well-cited answer is better than a padded one.
- You may explain a general scientific term (for example buoyancy, limiting oxygen index, diffusion flame) from \
general knowledge, but only after checking that SOURCES does not already explain it; if a NASA passage does, use \
and cite that instead. Start each general-knowledge sentence with "General background:" and attach no citation \
to it, so the reader can always tell NASA's statements from yours.
- Questions about the Apollo 1 fire, the Apollo 13 oxygen tank explosion, the Mir fire or NASA fire-safety \
spinoffs are on topic: answer them from the NASA official resources. Never carry a number or a condition from \
one of those events over to a PSI experiment, or the other way round.
- If the question has nothing to do with combustion, fire safety, space habitats or this collection, set \
grounding to "off_topic" and say briefly what you can help with.
- This is a research aid, not a certified safety tool. Do not present anything as a guaranteed real-world outcome.

Format
- answer: GitHub-flavoured markdown. Lead with the direct answer. Use a short table when comparing experiments \
across the same attributes, bullets for lists, and no headings for short answers. When a TASK is given, follow \
its structure.
- Be brief. Readers scan these answers and wait for them to be written, so every sentence should carry a cited \
fact or a needed caveat. Aim for about 150 words for a question and about 280 for a TASK, and go longer only \
when the reader asks for detail. Do not restate the question or repeat a point.
- research_gap: one or two sentences on a gap in NASA's research that bears on the question (case 1 above), \
or an empty string. Never use it for something that is merely absent from the passages you were given.
- follow_ups: up to three questions the reader could usefully ask next, answerable from this collection.
- actions: up to three next steps inside the dashboard that fit the question: "open" one investigation profile, \
"compare" two to four investigations side by side, "rank" investigations for an environment, "charts" for an \
investigation with run data, or "insights". Use only investigation ids (PSI-n) that appear in SOURCES or the \
COLLECTION INDEX."""

ANSWER_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["answer", "grounding", "research_gap", "follow_ups", "actions"],
    "properties": {
        "answer": {"type": "string"},
        "grounding": {"type": "string", "enum": ["supported", "partial", "not_in_collection", "off_topic"]},
        "research_gap": {"type": "string", "description": "A gap in NASA's own research (something NASA has not "
                         "tested or reported) that bears on the question; empty if none."},
        "follow_ups": {"type": "array", "items": {"type": "string"}},
        "actions": {"type": "array", "items": {
            "type": "object", "additionalProperties": False, "required": ["type", "ids", "label"],
            "properties": {
                "type": {"type": "string", "enum": ["open", "compare", "rank", "charts", "insights"]},
                "ids": {"type": "array", "items": {"type": "string"}},
                "label": {"type": "string"},
            }}},
    },
}


# ---------------------------------------------------------------------------
# The collection index: the dashboard's own organised data, one line per experiment
# ---------------------------------------------------------------------------
def rng(c: dict | None) -> str:
    if not c:
        return "not reported"
    lo = "" if c["min"] is None or c["min"] == c["max"] else f"{c['min']:g} to "
    return f"{lo}{c['max']:g} {c['unit']}"


_index_cache: dict[str, dict[str, str]] = {}


def index_lines() -> dict[str, str]:
    """Retrieval returns the passages closest to the question, which is not enough for questions
    about the whole collection ("which experiments tested above 30% oxygen?"). This index gives
    the model the same organised data the Explorer uses, so its answers agree with the pages."""
    key = store.META.get("built_at", "")
    if key not in _index_cache:
        def cond(c: dict | None) -> str:
            # keep the cautions the pages show beside a range (for example: inverse flames, where the
            # oxygen value is the gas leaving the burner and not the chamber atmosphere)
            notes = list(dict.fromkeys(s["note"] for s in (c or {}).get("sources", []) if s.get("note")))
            return rng(c) + (f" ({' '.join(notes)})" if notes else "")

        lines = {}
        for inv in sorted(store.INVS.values(), key=lambda i: store.sort_key(i["id"])):
            c = inv["conditions"]
            burned = ", ".join(inv["fuel_state"]) or "not reported"
            if inv.get("emulates"):
                burned += f" (emulating {inv['emulates']})"
            docs = store.DOC_COUNT.get(inv["id"], 0)
            lines[inv["id"]] = (
                f"{inv['short']} | burned: {burned}"
                f" | fire-safety area: {', '.join(inv['pillars']) or 'none'}"
                f" | materials: {', '.join(inv['materials'][:8]) or 'not reported'}"
                f" | oxygen: {cond(c['oxygen'])} | pressure: {cond(c['pressure'])} | airflow: {cond(c['airflow'])}"
                f" | gravity: {inv['gravity']['label']} | test rows in PSI run tables: {inv['n_runs']}"
                f" | NASA documents indexed: {docs}")
        _index_cache.clear()
        _index_cache[key] = lines
    return _index_cache[key]


def _index_block() -> str:
    return "\n".join(f"[{sid}] {line}" for sid, line in index_lines().items())


# ---------------------------------------------------------------------------
# References
# ---------------------------------------------------------------------------
def body(p: dict) -> str:
    """Passage text without its 'NAME (PSI-n) - Section: ' prefix."""
    return p["text"].split(f"{p['section']}: ", 1)[-1]


def _ref_from_passage(p: dict) -> dict:
    src = store.source(p["investigation_id"])
    base = {"id": src["id"], "source_type": src["type"], "short": src["short"], "name": src["name"],
            "psi": src["psi"], "doi": src["doi"]}
    return {**base, "kind": p["kind"], "kind_label": store.KIND_LABEL[p["kind"]], "section": p["section"],
            "document": p.get("doc_title"), "page": p.get("page"), "file_url": p.get("url"),
            "text": body(p), "similarity": round(p.get("similarity", 0.0), 3)}


def _ref_from_index(sid: str) -> dict:
    inv = store.INVS[sid]
    return {"id": sid, "source_type": "investigation", "short": inv["short"], "name": inv["title"],
            "psi": inv["links"]["psi"], "doi": inv["links"]["doi"], "kind": "index", "kind_label": store.KIND_LABEL["index"],
            "section": INDEX_SECTION, "document": None, "page": None, "file_url": None,
            "text": index_lines()[sid], "similarity": None}


_TAG = r"(?:S\d+|PSI-\d+|RES-\d+|CHALLENGE)"
_GROUP = re.compile(rf"\[\s*({_TAG}(?:\s*[,;]\s*{_TAG})*)\s*\]")


# Sentences about the assistant's own sources ("the passages I have do not say...") describe a limit of this
# site, not of NASA's research, so they are removed even if the model writes one. A gap in NASA's own work is
# worded about NASA ("none of NASA's investigations tested...") and is kept.
_SELF_LIMIT = re.compile(
    r"\b(passages?|sources?|excerpts?|documents?|materials?)\s+(that\s+)?(I|we)\s+(have|had|was given|were given|received|can see)\b"
    r"|\b(the|these|those|my)\s+(provided\s+|available\s+|given\s+|retrieved\s+)?(passages?|sources?|excerpts?)\b"
    r"[^.!?]*\b(do(es)?\s+not|do(es)?n[’']t|did\s+not|lack|never)\b"
    r"|\bnot\s+(in|among|within|covered\s+by|found\s+in)\s+(the|these|my)\s+(provided\s+)?(passages?|sources?|excerpts?)\b"
    r"|\bI\s+(do\s+not|don[’']t)\s+have\b",
    re.I)


def drop_self_limits(text: str) -> str:
    out_lines = []
    for line in text.split("\n"):
        parts = re.split(r"(?<=[.!?])\s+(?=[A-Z\[*(])", line)
        kept = [p for p in parts if not _SELF_LIMIT.search(p)]
        if parts and not kept and line.strip():
            continue  # the whole line was about the sources
        out_lines.append(" ".join(kept))
    cleaned = re.sub(r"\n{3,}", "\n\n", "\n".join(out_lines)).strip()
    return cleaned or text  # never return an empty answer


def _number_refs(answer: str, passages: dict[str, dict]) -> tuple[str, list[dict], list[str]]:
    """Rewrite the model's [S3] / [PSI-25] tags as [#1], [#2]... in order of first use and build
    the reference list. Tags that point at nothing the model was given are removed."""
    refs: list[dict] = []
    number: dict[str, int] = {}
    removed: list[str] = []
    challenge = next((sid for sid, p in passages.items() if p["investigation_id"] == "CHALLENGE"), None)

    def one(tag: str) -> str:
        key = challenge if tag == "CHALLENGE" and challenge else tag
        if key not in number:
            if key in passages:
                ref = _ref_from_passage(passages[key])
            elif key in store.INVS:
                ref = _ref_from_index(key)
            else:
                if tag not in removed:
                    removed.append(tag)
                return ""
            number[key] = len(refs) + 1
            refs.append({"n": number[key], **ref})
        return f"[#{number[key]}]"

    def group(m: re.Match) -> str:
        return "".join(dict.fromkeys(one(t.strip()) for t in re.split(r"[,;]", m.group(1))))

    text = _GROUP.sub(group, answer)
    return re.sub(r"[ \t]+([.,;:])", r"\1", text), refs, removed


def _grouped_sources(refs: list[dict]) -> list[dict]:
    """References grouped by experiment (used by the PDF report and the inline panel)."""
    out: dict[str, dict] = {}
    for r in refs:
        entry = out.setdefault(r["id"], {"id": r["id"], "short": r["short"], "name": r["name"], "url": r["psi"],
                                         "doi": r["doi"], "passages": []})
        if len(entry["passages"]) < 4:
            entry["passages"].append({"section": r["section"], "text": r["text"]})
    return list(out.values())


# ---------------------------------------------------------------------------
# The ledger: what each statement rests on, and whether its numbers are in the source
# ---------------------------------------------------------------------------
_UNITS = (r"%|percent|atm|psia|psi|kPa|mmHg|torr|cm/s|mm/s|m/s|mm²/s|mm2/s|mm\^2/s|mm|cm|µm|μm|nm|K|°C|W|ppm|"
          r"seconds|sec|minutes|min|mg|g/s|slpm|L/min|kg|Hz|kV")
_NUM = re.compile(rf"(?<![\w.#\-/])(\d{{1,3}}(?:,\d{{3}})+|\d+(?:\.\d+)?)\s?({_UNITS})(?![\w/])")
_ANY_NUM = re.compile(r"\d+(?:\.\d+)?")
_REF = re.compile(r"\[#(\d+)\]")
_BASIS_ORDER = ["report", "analysed", "record", "conditions", "index", "resource", "science_doc", "challenge",
                "project"]
BASIS_LABEL = {"report": "NASA report", "analysed": "NASA analysed data", "record": "NASA PSI record",
               "conditions": "NASA run tables", "index": "Project database (NASA run tables and records)",
               "science_doc": "NASA science document", "challenge": "NASA challenge text",
               "resource": "NASA official resource", "project": "Project-team summary", "background": "General background",
               "none": "Assistant's own remark"}


def _statements(md: str) -> list[str]:
    out: list[str] = []
    lines = md.split("\n")
    for i, line in enumerate(lines):
        s = line.strip()
        if not s or re.fullmatch(r"[|\s:\-]+", s):
            continue
        if s.startswith("|"):
            if i + 1 < len(lines) and re.fullmatch(r"[|\s:\-]+", lines[i + 1].strip() or "x"):
                continue  # table header
            out.append(" · ".join(c.strip() for c in s.strip("|").split("|") if c.strip()))
            continue
        s = re.sub(r"^(?:#+|[-*+]|\d+[.)])\s+", "", s)
        parts = re.split(r"(?<=[.!?])\s+(?=[\[A-Z\"“(*])", s)
        for part in parts:
            lead = re.match(r"^((?:\[#\d+\]\s*)+)", part)
            if lead and out:          # "…in microgravity. [#2] Next sentence": the tag belongs to the previous one
                out[-1] += " " + lead.group(1).strip()
                part = part[lead.end():]
            if part.strip():
                out.append(part.strip())
    return out


def _found(value: float, decimals: int, pool: list[float]) -> bool:
    tol = 0.5 * 10 ** -decimals + 1e-9
    return any(abs(value - y) <= tol or abs(value - 100 * y) <= max(tol, 0.05) for y in pool)


def build_ledger(answer: str, refs: list[dict]) -> tuple[list[dict], dict]:
    by_n = {r["n"]: r for r in refs}
    pools = {n: [float(x) for x in _ANY_NUM.findall(r["text"].replace(",", ""))] for n, r in by_n.items()}
    ledger: list[dict] = []
    for raw in _statements(answer):
        cited = [int(n) for n in dict.fromkeys(_REF.findall(raw)) if int(n) in by_n]
        text = re.sub(r"\s+([.,;:])", r"\1", re.sub(r"\s+", " ", _REF.sub("", raw))).strip(" *_")
        plain = re.sub(r"[*_`]", "", text)
        bare = _REF.sub("", raw).strip()
        label = bare.endswith(":") or bare.endswith(":**") or re.fullmatch(r"\*\*[^*]+\*\*[:.]?", bare) is not None
        if not cited and (len(plain.split()) < 4 or label):
            continue  # a label or heading, not a statement
        numbers = []
        if cited:
            pool = [y for n in cited for y in pools[n]]
            for m in _NUM.finditer(plain):
                digits = m.group(1).replace(",", "")
                decimals = len(digits.split(".")[1]) if "." in digits else 0
                numbers.append({"text": f"{m.group(1)} {m.group(2)}".replace(" %", "%"),
                                "found": _found(float(digits), decimals, pool)})
            kinds = {by_n[n]["kind"] for n in cited}
            basis = next(k for k in _BASIS_ORDER if k in kinds)
            status = "check" if any(not x["found"] for x in numbers) else ("verified" if numbers else "cited")
        elif plain.lower().startswith("general background"):
            basis, status = "background", "background"
        else:
            basis, status = "none", "uncited"
        ledger.append({"text": plain[:420], "refs": cited, "basis": basis, "basis_label": BASIS_LABEL[basis],
                       "status": status, "numbers": numbers})
    nums = [x for s in ledger for x in s["numbers"]]
    nasa = {"report", "analysed", "record", "conditions", "index", "science_doc", "challenge", "resource"}
    checks = {
        "statements": len(ledger),
        "cited": sum(1 for s in ledger if s["refs"]),
        "nasa_cited": sum(1 for s in ledger if s["basis"] in nasa),
        "background": sum(1 for s in ledger if s["status"] == "background"),
        "uncited": sum(1 for s in ledger if s["status"] == "uncited"),
        "numbers": len(nums), "numbers_found": sum(1 for x in nums if x["found"]),
        "by_basis": {BASIS_LABEL[k]: sum(1 for s in ledger if s["basis"] == k)
                     for k in [*_BASIS_ORDER, "background", "none"] if any(s["basis"] == k for s in ledger)},
    }
    return ledger, checks


# ---------------------------------------------------------------------------
# Ask
# ---------------------------------------------------------------------------
def _clean_actions(actions: list[dict], valid: set[str]) -> list[dict]:
    out = []
    for a in actions[:3]:
        ids = [i for i in a.get("ids", []) if i in valid and i in store.INVS]
        if a["type"] == "open" and len(ids) < 1:
            continue
        if a["type"] == "compare" and len(ids) < 2:
            continue
        if a["type"] == "charts":
            ids = [i for i in ids if store.INVS[i]["n_runs"]]
            if not ids:
                continue
        out.append({"type": a["type"], "ids": ids[:4], "label": a["label"][:80]})
    return out


def _history_text(history: list[dict]) -> str:
    if not history:
        return ""
    lines = []
    for m in history[-6:]:
        who = "Reader" if m.get("role") == "user" else "Assistant"
        lines.append(f"{who}: {m.get('content', '')[:1200]}")
    return "EARLIER IN THIS CONVERSATION\n" + "\n".join(lines) + "\n\n"


def _sources_block(passages: dict[str, dict]) -> str:
    lines = []
    for sid, p in passages.items():
        src = store.source(p["investigation_id"])
        where = {"challenge": "NASA challenge description", "resource": f"{src['name']} (official NASA resource)",
                 "investigation": f"{src['short']} ({src['id']})"}[src["type"]]
        lines.append(f"[{sid}] {store.KIND_LABEL[p['kind']]} | {where} | {p['section']}\n{body(p)}")
    return "\n\n".join(lines)


def _trace(passages: dict[str, dict], scope: dict, started: float, info: dict | None = None) -> dict:
    kinds = scope.get("kinds") or None
    ids = scope.get("ids") or None
    pool = [c for c in store.CHUNKS if (not kinds or c["kind"] in kinds)
            and (not ids or c["investigation_id"] in ids or c["investigation_id"] == "CHALLENGE")]
    by_kind: dict[str, int] = {}
    for c in pool:
        by_kind[store.KIND_LABEL[c["kind"]]] = by_kind.get(store.KIND_LABEL[c["kind"]], 0) + 1
    return {
        "searched": len(pool), "searched_by_kind": by_kind, "index_lines": len(store.INVS),
        "search_mode": retrieval.mode(),
        "scope": {"ids": ids or [], "kinds": sorted(kinds) if kinds else []},
        "given": [{"sid": sid, "kind_label": store.KIND_LABEL[p["kind"]],
                   "short": store.source(p["investigation_id"])["short"], "section": p["section"], "similarity": round(p["similarity"], 3)} for sid, p in passages.items()],
        "seconds": round(time.time() - started, 1), **(info or {}),
    }


def ask(question: str, history: list[dict] | None = None, context: dict | None = None,
        audience: str = "student", scope: dict | None = None, task: str = "ask", on_text=None) -> dict:
    """Answer one question. `on_text`, if given, receives the answer text while the model writes it
    (raw, with [S1]-style tags); the checked answer with numbered references is returned at the end."""
    started = time.time()
    history = history or []
    context = context or {}
    scope = scope or {}
    task = task if task in TASKS else "ask"
    scope_ids = [i for i in scope.get("ids") or [] if i in store.INVS]
    scope_kinds = {k for k in scope.get("kinds") or [] if k in store.KIND_LABEL} or None
    ctx_ids = [i for i in context.get("ids", []) if i in store.INVS]
    # short follow-ups ("and its oxygen range?") need the previous question to retrieve well
    prev_user = next((m["content"] for m in reversed(history) if m.get("role") == "user"), "")
    query = question if len(question.split()) > 6 or not prev_user else f"{prev_user} {question}"
    # fewer passages = less for the model to read: faster and cheaper. 6 for a question, 8 for a brief
    # or a comparison (which name several experiments); the collection index always comes along.
    found = retrieval.search(query, k=8 if task in ("findings", "compare") else 6, boost_ids=ctx_ids + scope_ids,
                             kinds=scope_kinds, ids=set(scope_ids) or None, prefer_results=task == "findings")
    passages = {f"S{i}": p for i, p in enumerate(found, start=1)}
    best = max((p["similarity"] for p in found), default=0.0)
    scope_out = {"ids": scope_ids, "kinds": scope_kinds}

    if not llm.available():
        return _extractive(question, passages, best, scope_out, started)

    page = ""
    if context.get("page"):
        page = f"PAGE CONTEXT (what the reader is looking at)\nPage: {context['page']}\n"
        if ctx_ids:
            page += "Investigations on screen: " + ", ".join(f"{store.INVS[i]['short']} [{i}]" for i in ctx_ids) + "\n"
        if context.get("note"):
            page += f"Details: {str(context['note'])[:1500]}\n"
        page += "\n"
    limited = ""
    if scope_ids or scope_kinds:
        limited = ("SEARCH SCOPE CHOSEN BY THE READER\n"
                   + (f"Experiments: {', '.join(scope_ids)}\n" if scope_ids else "")
                   + (f"Kinds of source: {', '.join(store.KIND_LABEL[k] for k in sorted(scope_kinds))}\n" if scope_kinds else "")
                   + "SOURCES was searched inside this scope only. If the scope leaves part of the question "
                     "unanswered, suggest widening the search scope as a follow-up.\n\n")
    brief = f"TASK\n{TASKS[task]}\n\n" if TASKS[task] else ""
    stable = f"COLLECTION INDEX (all {len(store.INVS)} investigations, from the project database)\n{_index_block()}"
    user = (f"{_history_text(history)}{page}{limited}"
            f"SOURCES (the passages closest to the question)\n{_sources_block(passages)}\n\n"
            f"AUDIENCE\n{AUDIENCE.get(audience, AUDIENCE['student'])}\n\n{brief}QUESTION\n{question}")
    info: dict = {}
    field = llm.FieldStream("answer") if on_text else None
    feed = (lambda frag: (lambda t: t and on_text(t))(field.feed(frag))) if field else None
    try:
        data = llm.complete_json(SYSTEM, user, ANSWER_SCHEMA, info=info, stable=stable, on_text=feed)
    except llm.LLMError as exc:
        out = _extractive(question, passages, best, scope_out, started)
        out["notice"] = f"{exc} Showing a retrieval-only answer instead."
        return out

    answer, refs, removed = _number_refs(drop_self_limits(data["answer"].strip()), passages)
    ledger, checks = build_ledger(answer, refs)
    checks["removed_citations"] = len(removed)
    valid = {r["id"] for r in refs} | {p["investigation_id"] for p in found} | set(store.INVS)
    return {
        "mode": "ai", "model": info.get("model") or llm.MODEL, "task": task, "answer": answer,
        "grounding": data["grounding"], "research_gap": (data.get("research_gap") or "").strip(),
        "follow_ups": data.get("follow_ups", [])[:3], "actions": _clean_actions(data.get("actions", []), valid),
        "refs": refs, "sources": _grouped_sources(refs), "ledger": ledger, "checks": checks,
        "removed_citations": removed, "trace": _trace(passages, scope_out, started, info),
    }


def _best_sentences(question: str, text: str, n: int = 2) -> list[str]:
    words = {w for w in re.findall(r"[a-z0-9]{3,}", question.lower())}
    sentences = [s.strip() for s in re.split(r"(?<=[.;])\s+(?=[A-Z0-9(])", text) if len(s.strip()) > 40]
    scored = sorted(sentences, key=lambda s: -len(words & set(re.findall(r"[a-z0-9]{3,}", s.lower()))))
    return scored[:n]


def _extractive(question: str, passages: dict[str, dict], best: float, scope: dict, started: float) -> dict:
    """Retrieval-only answer: quotes the most relevant passages, generates nothing."""
    empty = {"refs": [], "sources": [], "ledger": [], "removed_citations": [], "actions": [], "task": "ask",
             "checks": {"statements": 0, "cited": 0, "nasa_cited": 0, "background": 0, "uncited": 0, "numbers": 0,
                        "numbers_found": 0, "by_basis": {}, "removed_citations": 0}}
    if best < MIN_SIMILARITY or not passages or not retrieval.on_topic(question):
        return {
            **empty, "mode": "retrieval", "model": None, "grounding": "off_topic",
            "answer": "This assistant answers questions about NASA's research on fire in space: the 24 "
                      "combustion-science investigations in NASA PSI (their records, reports, test conditions and "
                      "run tables) and NASA's material on spacecraft fire safety, from the Researcher's Guide to "
                      "the Apollo 1, Apollo 13 and Mir fires. Try one of the questions below, or rephrase yours "
                      "around combustion, fire safety or a named experiment.",
            "research_gap": "",
            "follow_ups": ["Which NASA experiments studied smoke detection in space?",
                           "Which experiments tested oxygen levels above 30%?",
                           "What did BASS-II study?"],
            "trace": _trace({}, scope, started),
        }
    parts = ["**Most relevant passages in the collection** (retrieval-only mode: passages are quoted, not interpreted)\n"]
    used: dict[str, dict] = {}
    per_inv: dict[str, int] = {}
    for sid, p in passages.items():
        inv = p["investigation_id"]
        if per_inv.get(inv, 0) >= 2 or len(used) >= 6:
            continue
        quote = " ".join(_best_sentences(question, body(p), 1))[:420]
        if not quote:
            continue
        per_inv[inv] = per_inv.get(inv, 0) + 1
        used[sid] = p
        name = store.source(inv)["short"]
        parts.append(f"> **{name}** · *{p['section']}:* {quote} [{sid}]")
    answer, refs, _ = _number_refs("\n\n".join(parts), used)
    ledger, checks = build_ledger(answer, refs)
    checks["removed_citations"] = 0
    invs = list(dict.fromkeys(r["id"] for r in refs if r["id"] in store.INVS))
    actions = []
    if invs:
        actions.append({"type": "open", "ids": invs[:1], "label": f"Open {store.INVS[invs[0]]['short']}"})
    if len(invs) >= 2:
        actions.append({"type": "compare", "ids": invs[:3], "label": "Compare these investigations"})
    return {
        "mode": "retrieval", "model": None, "task": "ask", "grounding": "partial", "answer": answer,
        "research_gap": "",
        "notice": (f"{llm.status()['last_error']} This answer lists the matching NASA passages instead of "
                   "explaining them."
                   if llm.configured() and llm.status()["last_error"] else
                   "No AI model is connected, so this answer lists the matching NASA passages instead of "
                   "explaining them. Add an AI key to backend/.env for written answers."),
        "follow_ups": [f"What conditions did {store.INVS[invs[0]]['short']} test?"] if invs else [],
        "actions": actions, "refs": refs, "sources": _grouped_sources(refs), "ledger": ledger, "checks": checks,
        "removed_citations": [], "trace": _trace(passages, scope, started),
    }


def library() -> dict:
    """What the assistant can search, for the page that explains it."""
    by_kind: dict[str, int] = {}
    for c in store.CHUNKS:
        by_kind[c["kind"]] = by_kind.get(c["kind"], 0) + 1
    docs = sorted(store.DOCS.values(), key=lambda d: (store.sort_key(d["investigation_id"]), d["kind"], d["title"]))
    return {
        "passages": len(store.CHUNKS),
        "kinds": [{"kind": k, "label": store.KIND_LABEL[k], "passages": by_kind[k]}
                  for k in ("report", "analysed", "science_doc", "record", "conditions", "resource", "challenge",
                            "project") if k in by_kind],
        "resources": [{"id": r["id"], "short": r["short"], "title": r["title"], "url": r["url"],
                       "kind_name": r["kind_name"], "passages": r["passages"],
                       "documents": [{"title": d["title"], "type": d["type"], "pages": d["pages"],
                                      "passages": d["passages"], "url": d["url"]} for d in r["documents"]]}
                      for r in store.RESOURCES.values() if r["passages"]],
        "documents": [{"id": d["id"], "investigation_id": d["investigation_id"],
                       "short": store.INVS[d["investigation_id"]]["short"], "kind": d["kind"],
                       "kind_label": store.KIND_LABEL[d["kind"]], "title": d["title"], "pages": d["pages"],
                       "pages_used": d["pages_used"], "words": d["words"], "url": d["url"]} for d in docs],
        "experiments_with_documents": len({d["investigation_id"] for d in docs}),
        "experiments_without": [{"id": i["id"], "short": i["short"]} for i in
                                sorted(store.INVS.values(), key=lambda i: store.sort_key(i["id"]))
                                if i["id"] not in store.DOC_COUNT],
        "not_usable": store.DOC_PROBLEMS,
        "tasks": list(TASKS), "search_mode": retrieval.mode(),
    }
