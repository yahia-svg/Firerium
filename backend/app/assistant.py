"""AI features beside the research assistant (see research.py): environment summaries,
estimates for conditions nobody tested, and custom ranking.

Every function works in two modes:
  * with a Claude API key: Claude writes the answer from retrieved NASA passages
    and must cite them; citations are checked against what was retrieved.
  * without a key: a retrieval-only answer built from the same passages, clearly
    labelled as such. Nothing is generated, so nothing can be invented.
"""
from __future__ import annotations

import json
import re

from . import environments, llm, retrieval, store
from .research import index_lines as _index_lines  # noqa: F401  (used by the tests)
from .research import rng as _rng


# --------------------------------------------------------------------------
# Environment summary (primary filter of the Research Explorer)
# --------------------------------------------------------------------------
ENV_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["headline", "safety_needs", "insights", "gaps"],
    "properties": {
        "headline": {"type": "string"},
        "safety_needs": {"type": "array", "items": {"type": "string"}},
        "insights": {"type": "array", "items": {"type": "string"}},
        "gaps": {"type": "array", "items": {"type": "string"}},
    },
}
_env_cache: dict[str, dict] = {}


def _names(ids: list[str], limit: int = 6) -> str:
    if not ids:
        return "none"
    shown = [f"[{i}]" for i in ids[:limit]]
    return " ".join(shown) + (f" and {len(ids) - limit} more" if len(ids) > limit else "")


def _env_template(f: dict) -> dict:
    env = f["environment"]
    partial = env["gravity"] == "partial"
    insights = [
        f"{len(f['oxygen_in_band'])} of {f['total']} investigations report tests inside this environment's oxygen "
        f"band ({env['oxygen'][0]:g} to {env['oxygen'][1]:g}% O2): {_names(f['oxygen_in_band'])}.",
        f"Prevention is informed most directly by {_names(f['by_pillar']['prevention'])}; detection by "
        f"{_names(f['by_pillar']['detection'])}; suppression by {_names(f['by_pillar']['suppression'])}.",
        "Highest-ranked for this environment: " + ", ".join(
            f"[{t['id']}] ({t['score']:g}/100)" for t in f["top"][:4]) + ".",
    ]
    gaps = []
    if not f["oxygen_in_band_solids"]:
        gaps.append(
            f"No solid-material investigation in the collection reports oxygen inside this band. The highest oxygen "
            f"level reported for solid materials is {f['highest_oxygen_tested_on_solids']:g}%. The tests that do "
            f"reach the band used gas burners or liquid droplets.")
    else:
        gaps.append(f"Solid materials were tested inside the oxygen band in {_names(f['oxygen_in_band_solids'])}; "
                    f"check each record for the exact materials and airflow.")
    if partial:
        gaps.append("No investigation in PSI was run in partial gravity [CHALLENGE]. Microgravity and Earth results "
                    "can only bound what happens here; [PSI-22] mimicked partial gravity with an "
                    "electric field.")
    gaps.append(f"{len(f['oxygen_not_reported'])} investigations do not report an oxygen level in their PSI record "
                f"or run table, so they cannot be matched to this atmosphere.")
    if env["assumption"]:
        gaps.append("Assumption: " + env["assumption"])
    return {
        "mode": "computed",
        "headline": f"{env['name']}: {env['atmosphere_label']}. {env['g_label']}.",
        "safety_needs": env["needs"], "insights": insights, "gaps": gaps,
    }


def environment_summary(env_id: str) -> dict:
    facts = environments.environment_facts(env_id)
    base = _env_template(facts)
    base["facts"] = facts
    base["note"] = ("Counts are computed from the project database. A gap here means 'not represented in this "
                    "project collection', not proof that no research exists anywhere.")
    if not llm.available():
        return base
    key = f"{env_id}:{store.META.get('built_at')}"
    if key not in _env_cache:
        cards = [{"id": i["id"], "name": i["short"], "summary": i["summary"], "safety": i["safety_note"],
                  "pillars": i["pillars"], "fuel_state": i["fuel_state"], "materials": i["materials"],
                  "oxygen": _rng(i["conditions"]["oxygen"]), "pressure": _rng(i["conditions"]["pressure"]),
                  "airflow": _rng(i["conditions"]["airflow"]), "gravity": i["gravity"]["label"]}
                 for i in store.INVS.values()]
        system = (
            "You write the environment briefing shown at the top of a NASA combustion-research explorer. Readers are "
            "students, researchers and aerospace engineers. Use only the FACTS and INVESTIGATIONS given; cite "
            "investigations as [PSI-n] and the challenge text as [CHALLENGE]. Be concrete: name experiments, "
            "oxygen levels and what is missing. Do not state results that are not in the input. "
            "headline: one sentence. safety_needs: 3 items, what fire safety in this environment requires. "
            "insights: 3 to 4 items, what the collected research tells us for this environment. "
            "gaps: 3 to 4 items, what is missing or limited, including any stated assumption. "
            "Each item is one or two sentences.")
        user = f"FACTS\n{json.dumps(facts, indent=1)}\n\nINVESTIGATIONS\n{json.dumps(cards, indent=1)}"
        try:
            data = llm.complete_json(system, user, ENV_SCHEMA)
            _env_cache[key] = {**data, "mode": "ai", "model": llm.MODEL}
        except llm.LLMError as exc:
            base["notice"] = str(exc)
            return base
    return {**base, **_env_cache[key]}


# --------------------------------------------------------------------------
# "No experiment found, but based on the data..." estimate
# --------------------------------------------------------------------------
ESTIMATE_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["estimate", "reasoning", "confidence", "caveats"],
    "properties": {
        "estimate": {"type": "string"},
        "reasoning": {"type": "array", "items": {"type": "string"}},
        "confidence": {"type": "string", "enum": ["low", "very low"]},
        "caveats": {"type": "array", "items": {"type": "string"}},
    },
}

FILTER_LABELS = {"fuel_state": "fuel state", "material": "material", "pillar": "fire-safety area",
                 "gravity": "gravity condition", "facility": "facility", "topic": "topic", "q": "search text",
                 "has_runs": "run data"}


def describe_filters(f: dict) -> list[str]:
    out = []
    for k, label in FILTER_LABELS.items():
        if f.get(k):
            out.append(f"{label}: {f[k]}")
    for lo, hi, label, unit in (("o2_min", "o2_max", "oxygen", "% O2"), ("p_min", "p_max", "pressure", "atm"),
                                ("flow_min", "flow_max", "airflow", "cm/s")):
        if f.get(lo) is not None or f.get(hi) is not None:
            a = "any" if f.get(lo) is None else f"{f[lo]:g}"
            b = "any" if f.get(hi) is None else f"{f[hi]:g}"
            out.append(f"{label}: {a} to {b} {unit}")
    return out


def nearest(f: dict, k: int = 4) -> list[dict]:
    """Investigations that satisfy the most of the requested filters, with what each one misses."""
    single = [(key, {key: f[key]}) for key in ("q", "fuel_state", "material", "pillar", "gravity", "facility",
                                               "topic", "has_runs") if f.get(key)]
    for lo, hi in (("o2_min", "o2_max"), ("p_min", "p_max"), ("flow_min", "flow_max")):
        if f.get(lo) is not None or f.get(hi) is not None:
            single.append((lo.split("_")[0], {lo: f.get(lo), hi: f.get(hi)}))
    names = {"o2": "oxygen range", "p": "pressure range", "flow": "airflow range", **FILTER_LABELS}
    scored = []
    for inv in store.INVS.values():
        met, missed = [], []
        for key, sub in single:
            (met if inv in store.apply_filters(sub) else missed).append(names[key])
        scored.append((len(met), inv["directness"], inv, met, missed))
    scored.sort(key=lambda s: (-s[0], -s[1], store.sort_key(s[2]["id"])))
    return [{"investigation": store.card(inv), "meets": met, "misses": missed}
            for n, _, inv, met, missed in scored[:k] if n > 0]


def estimate(f: dict) -> dict:
    wanted = describe_filters(f)
    near = nearest(f)
    base = {
        "requested": wanted, "nearest": near,
        "label": "AI estimate, not a NASA result",
        "note": "No experiment in this project collection matches all of these conditions. That does not prove "
                "no such research exists elsewhere.",
    }
    if not near:
        return {**base, "mode": "none", "estimate": None,
                "message": "Nothing in the collection is close to these conditions, so no estimate is offered."}
    if not llm.available():
        return {**base, "mode": "retrieval", "estimate": None,
                "message": "No AI model is connected, so no estimate is written. The closest experiments are "
                           "listed with the conditions each one does and does not cover."}
    cards = []
    for n in near:
        inv = store.INVS[n["investigation"]["id"]]
        cards.append({"id": inv["id"], "name": inv["short"], "summary": inv["summary"], "safety": inv["safety_note"],
                      "materials": inv["materials"], "fuel_state": inv["fuel_state"],
                      "oxygen": _rng(inv["conditions"]["oxygen"]), "pressure": _rng(inv["conditions"]["pressure"]),
                      "airflow": _rng(inv["conditions"]["airflow"]), "gravity": inv["gravity"]["label"],
                      "hypothesis": inv["text"]["hypothesis"][:700], "impacts": inv["text"]["impacts"][:700],
                      "meets": n["meets"], "misses": n["misses"]})
    system = (
        "A reader of a NASA combustion-research dashboard filtered for conditions that no investigation in the "
        "collection covers. Using only the CLOSEST EXPERIMENTS given, write a cautious estimate of what would be "
        "expected under the requested conditions. Start the estimate with 'No experiment found, but based on the "
        "collected data'. Reason from the trends those records state (for example how oxygen level, airflow or "
        "gravity affected burning), cite them as [PSI-n], and say which requested condition lies outside what was "
        "tested. Do not give numbers that are not in the input. This is an extrapolation and must read as one: "
        "confidence is 'low' or 'very low'. reasoning: 2 to 4 bullet sentences. caveats: 2 to 3 sentences on why "
        "the estimate could be wrong.")
    user = f"REQUESTED CONDITIONS\n{json.dumps(wanted)}\n\nCLOSEST EXPERIMENTS\n{json.dumps(cards, indent=1)}"
    try:
        data = llm.complete_json(system, user, ESTIMATE_SCHEMA)
    except llm.LLMError as exc:
        return {**base, "mode": "retrieval", "estimate": None, "message": str(exc)}
    return {**base, "mode": "ai", "model": llm.MODEL, **data}


# --------------------------------------------------------------------------
# Custom ranking criterion
# --------------------------------------------------------------------------
CUSTOM_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["relevant", "reason", "interpretation", "results"],
    "properties": {
        "relevant": {"type": "boolean"},
        "reason": {"type": "string"},
        "interpretation": {"type": "string"},
        "results": {"type": "array", "items": {
            "type": "object", "additionalProperties": False, "required": ["id", "score", "why"],
            "properties": {"id": {"type": "string"}, "score": {"type": "integer"}, "why": {"type": "string"}}}},
    },
}


class IrrelevantCriterion(ValueError):
    pass


def custom_rank(criterion: str, f: dict) -> dict:
    pool = store.apply_filters(f)
    if not pool:
        raise IrrelevantCriterion("No investigations match the current filters, so there is nothing to rank.")
    if llm.available():
        cards = [{"id": i["id"], "name": i["short"], "title": i["title"], "summary": i["summary"],
                  "safety": i["safety_note"], "pillars": i["pillars"], "topics": i["topics"],
                  "fuel_state": i["fuel_state"], "materials": i["materials"], "sensors": i["sensors"],
                  "geometry": i["geometry"], "oxygen": _rng(i["conditions"]["oxygen"]),
                  "pressure": _rng(i["conditions"]["pressure"]), "airflow": _rng(i["conditions"]["airflow"]),
                  "gravity": i["gravity"]["label"], "run_rows": i["n_runs"], "facilities": i["facilities"]}
                 for i in pool]
        system = (
            "You rank NASA microgravity combustion investigations against a criterion typed by a dashboard user. "
            "Use only the INVESTIGATIONS data given. First decide whether the criterion can be judged from this "
            "data at all: it must concern combustion, fire safety, space habitats, test conditions, materials, "
            "hardware, measurements or data availability. If it cannot (for example a question about cooking, "
            "sports or finance), set relevant to false, explain in `reason`, and return an empty results list. "
            "Otherwise set relevant to true, restate in `interpretation` how you read the criterion in one "
            "sentence, and score EVERY investigation from 0 to 100 for how well it meets the criterion, with a "
            "one-sentence `why` that names the specific field values behind the score. Use the full range; "
            "investigations with no bearing on the criterion score near 0.")
        user = f"CRITERION\n{criterion}\n\nINVESTIGATIONS\n{json.dumps(cards, indent=1)}"
        try:
            data = llm.complete_json(system, user, CUSTOM_SCHEMA)
        except llm.LLMError as exc:
            return _custom_rank_fallback(criterion, pool, notice=str(exc))
        if not data["relevant"]:
            raise IrrelevantCriterion(data["reason"] or "This criterion cannot be judged from the NASA combustion data.")
        ids = {i["id"] for i in pool}
        results = [{"investigation": store.card(store.INVS[r["id"]]), "score": max(0, min(100, int(r["score"]))),
                    "why": r["why"]} for r in data["results"] if r["id"] in ids]
        results.sort(key=lambda r: -r["score"])
        for n, r in enumerate(results):
            r["rank"] = n + 1
        return {"mode": "ai", "model": llm.MODEL, "criterion": criterion,
                "interpretation": data["interpretation"], "results": results,
                "method": "Scores are an AI judgement of each investigation's database fields against your "
                          "criterion. They are not NASA scores; read the reason beside each one."}
    return _custom_rank_fallback(criterion, pool)


def _custom_rank_fallback(criterion: str, pool: list[dict], notice: str | None = None) -> dict:
    sims = retrieval.query_similarity_by_investigation(criterion)
    best = max((sims[i["id"]] for i in pool), default=0.0)
    if best < 0.03 or not retrieval.on_topic(criterion):
        raise IrrelevantCriterion(
            "This criterion does not match anything in the NASA combustion data. Try something about materials, "
            "oxygen, airflow, smoke, suppression, hardware or measurements.")
    words = {w for w in re.findall(r"[a-z0-9]{3,}", criterion.lower())}
    results = []
    for inv in pool:
        text = " ".join([inv["summary"], inv["safety_note"], " ".join(inv["materials"]), " ".join(inv["topics"]),
                         " ".join(inv["sensors"]), inv["text"]["objective"]]).lower()
        hits = sorted(w for w in words if w in text)
        results.append({"investigation": store.card(inv), "score": round(100 * sims[inv["id"]] / best),
                        "why": ("Matches your words: " + ", ".join(hits[:6])) if hits else
                               "Little overlap with your wording"})
    results.sort(key=lambda r: -r["score"])
    for n, r in enumerate(results):
        r["rank"] = n + 1
    return {"mode": "retrieval", "model": None, "criterion": criterion, "notice": notice,
            "interpretation": "Text similarity between your wording and each investigation's record.",
            "results": results,
            "method": "No AI model is connected, so this ranking is plain text similarity (TF-IDF), scaled so the "
                      "best match is 100. It does not understand meaning the way the AI ranking does."}
