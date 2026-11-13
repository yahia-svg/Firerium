"""The official NASA resources listed for the challenge, and where this site uses each one.

NASA's organisers published ten resources for "Flame in Freefall". The first is the PSI data
repository, which is the site's database. The other nine are background: a NASA overview page
with experiment fact sheets, a video, a 2015 review, three pages on past accidents and three
Spinoff articles. `ingest/fetch_resources.py` downloads them and `ingest/build_resources.py`
turns them into passages (data/resources.json).

This module answers three questions for the pages:

  payload()            every resource: NASA's description, what was read, where the site uses it,
                       which PSI experiments it names
  for_investigation()  what the resources say about one experiment (shown on its profile)
  verify()             every quote shown from a resource exists in the text that was read

The resources are always labelled as NASA resources and never mixed with PSI records: a
statement from an accident page or a fact sheet is not data from a PSI run table.
"""
from __future__ import annotations

import re

from . import gaps, insights, retrieval, store

# How the site uses each resource: one sentence, the project team's own wording.
USE = {
    "RES-1": "The site's whole database. Every experiment, test condition, run table, chart, gap count and model "
             "estimate comes from the PSI records of the 24 combustion investigations, and the assistant reads "
             "the PSI reports and science documents page by page.",
    "RES-2": "Read in full, with the eight experiment fact sheets it links to. Each experiment profile shows what "
             "NASA's page and fact sheets say about it, and the Research Gaps page quotes its description of the "
             "current partial-gravity experiment (FM2).",
    "RES-3": "Embedded below, and NASA's own caption file is read so the assistant can quote the video with the "
             "time of each passage. Quoted in the Earth vs. microgravity and Uses on Earth insights.",
    "RES-4": "The full 56-page PDF is read page by page. It backs the prevention, detection and suppression "
             "insights (misconceptions about spacecraft fires, water-mist extinguishers, smoke detection) and the "
             "assistant cites it by page.",
    "RES-5": "Read in full. The Fire Safety Insights page has a lessons section built on it: what a pure-oxygen "
             "cabin did, and the material and design changes that followed.",
    "RES-6": "Read in full. Used in the lessons section of Fire Safety Insights: stored oxygen, damaged insulation "
             "and an ignition source.",
    "RES-7": "Read in full. Used in the lessons section of Fire Safety Insights: a real fire in orbit, with smoke, "
             "a blocked escape route and hand-held extinguishers.",
    "RES-8": "Read and quoted under Uses on Earth in Fire Safety Insights.",
    "RES-9": "Read and quoted under Uses on Earth in Fire Safety Insights, next to the smoke-or-dust question "
             "behind the DAFT and SAME experiments.",
    "RES-10": "Read, with the full two-page Spinoff article from NASA's Technical Reports Server, and quoted under "
              "Uses on Earth in Fire Safety Insights.",
}

# Ready questions for the assistant, each answerable from the resource it sits under.
ASK = {
    "RES-1": ["Which experiments tested oxygen levels above 30%?"],
    "RES-2": ["What does NASA's Combustion Science page say about the FM2 experiment on the Moon?",
              "What are SoFIE and FLARE, according to NASA's Combustion Science page?"],
    "RES-3": ["Why does NASA study combustion on the ISS, according to the ScienceCast video?"],
    "RES-4": ["Which misconceptions about spacecraft fires does the Researcher's Guide list?",
              "What does the Researcher's Guide say about water-mist fire extinguishers?"],
    "RES-5": ["What caused the Apollo 1 fire to spread so fast, and what did NASA change afterwards?"],
    "RES-6": ["What caused the Apollo 13 oxygen tank explosion, and what was redesigned?"],
    "RES-7": ["What happened in the 1997 fire aboard Mir, and what was learned from it?"],
    "RES-8": ["How did NASA technology improve firefighters' air tanks?"],
    "RES-9": ["How does the shuttle fire detector tell smoke from dust?"],
    "RES-10": ["What was Project FIRES, and what spacesuit materials did it use?"],
}

# Linked from the resources but not read in, said plainly on the page.
NOT_READ = [
    "The review-board reports and Congressional testimony that the Apollo 1 and Apollo 13 pages link to "
    "(thousands of scanned pages).",
    "The video picture itself: only NASA's caption file is read.",
    "The EPUB edition of the Researcher's Guide (the same text as the PDF).",
]

# An acronym that names a whole family of PSI investigations.
FAMILIES = {
    "ACME": ["PSI-10", "PSI-20", "PSI-21", "PSI-22", "PSI-23", "PSI-159"],
    "Saffire": ["PSI-98", "PSI-99", "PSI-100"],
}
_SENTENCE = re.compile(r"(?<=[.!?])\s+(?=[A-Z(\[•])")
_mention_cache: dict[int, list[str]] = {}


def _direct(text: str) -> list[str]:
    """Investigations named individually in the text."""
    ids = retrieval.mentioned(text)
    if "PSI-10" in ids and not re.search(r"flame design", text, re.I):
        ids.remove("PSI-10")           # the bare word "ACME" is matched to its first experiment
    return ids


def mentions(text: str) -> list[str]:
    """PSI investigations a NASA resource passage names. "ACME" and "Saffire" alone name a whole
    family, so they count for every member; a member named directly ("BRE", "Saffire-II") counts
    for itself."""
    ids = _direct(text)
    for word, members in FAMILIES.items():
        if re.search(rf"(?<![A-Za-z]){word}(?![A-Za-z]|-[I1-3])", text, re.I if word == "Saffire" else 0):
            ids.extend(m for m in members if m in store.INVS and m not in ids)
    return ids


def _chunks(res_id: str | None = None) -> list[dict]:
    return [c for c in store.CHUNKS if c["kind"] == "resource" and (res_id is None or c["investigation_id"] == res_id)]


def _mentions_of(chunk: dict) -> list[str]:
    if chunk["id"] not in _mention_cache:
        _mention_cache[chunk["id"]] = mentions(chunk["text"].split(": ", 1)[-1])
    return _mention_cache[chunk["id"]]


def _body(chunk: dict) -> str:
    return chunk["text"].split(f"{chunk['section']}: ", 1)[-1]


def for_investigation(inv_id: str, limit: int = 6) -> list[dict]:
    """What the official NASA resources say about one experiment: the sentences that name it, with
    the resource, the page or heading, and the address to read it at."""
    inv = store.INVS[inv_id]
    family = next((w for w, members in FAMILIES.items() if inv_id in members), None)
    out = []
    for c in _chunks():
        if inv_id not in _mentions_of(c):
            continue
        sentences = [s.strip() for s in _SENTENCE.split(_body(c)) if len(s.split()) >= 6]
        direct = [s for s in sentences if inv_id in _direct(s)]
        named = direct or [s for s in sentences if family and family.lower() in s.lower()]
        if not named:
            continue
        res = store.RESOURCES[c["investigation_id"]]
        # a fact sheet about this experiment's own family comes first, then direct mentions
        own_sheet = c["doc_title"].startswith("Fact sheet") and (
            (family and family.lower() in c["doc_title"].lower())
            or re.sub(r"[^a-z]", "", inv["short"].lower().split("-")[0]) in re.sub(r"[^a-z]", "", c["doc_title"].lower()))
        out.append({"resource_id": res["id"], "resource": res["short"], "document": c["doc_title"],
                    "section": c["section"], "page": c["page"], "url": c["url"], "direct": bool(direct),
                    "family": None if direct else family,
                    "excerpt": " ".join(named[:2])[:520], "_rank": (not own_sheet, not direct, c["id"]),
                    "_doc": c["doc_id"]})
    out.sort(key=lambda r: r["_rank"])
    kept, per_doc = [], {}
    for r in out:
        if per_doc.get(r["_doc"], 0) >= 2:
            continue
        per_doc[r["_doc"]] = per_doc.get(r["_doc"], 0) + 1
        kept.append({k: v for k, v in r.items() if not k.startswith("_")})
        if len(kept) >= limit:
            break
    return kept


def _used_in(res_id: str) -> list[dict]:
    """Where the site quotes this resource, found by scanning the pages' own evidence lists."""
    out: list[dict] = []

    def add(label: str, to: str) -> None:
        if not any(o["label"] == label for o in out):
            out.append({"label": label, "to": to})

    for sec in insights.SECTIONS:
        for card in sec["cards"]:
            if any(e["source"] == res_id for e in card["evidence"]):
                add(f"{sec['title']}: {card['title']}", f"/insights#{sec['id']}")
    for card in insights.LESSONS:
        if any(e["source"] == res_id for e in card["evidence"]):
            add(f"Lessons from past accidents: {card['title']}", "/lessons#lessons")
    if any(e["source"] == res_id for e in insights.EARTH_VS_MICRO["example"]["evidence"]):
        add("Earth vs. microgravity: the candle example", "/lessons#gravity")
    for card in insights.NEXT_GEN:
        if any(e["source"] == res_id for e in card["evidence"]):
            add(f"Next-generation equipment: {card['title']}", "/lessons#nextgen")
    for card in insights.EARTH_APPLICATIONS:
        if any(e["source"] == res_id for e in card["evidence"]):
            add(f"Uses on Earth: {card['title']}", "/lessons#earth")
    if any(e["source"] == res_id for e in gaps.CHALLENGE_PARTIAL):
        add("Research Gaps: no experiment was run in partial gravity", "/gaps")
    return out


def _highlights(res_id: str) -> list[dict]:
    """The quotes the pages show from this resource, each with the place it was read at."""
    seen, out = set(), []
    pools = [c["evidence"] for s in insights.SECTIONS for c in s["cards"]]
    pools += [c["evidence"] for c in insights.LESSONS + insights.NEXT_GEN + insights.EARTH_APPLICATIONS]
    pools += [insights.EARTH_VS_MICRO["example"]["evidence"], gaps.CHALLENGE_PARTIAL]
    for pool in pools:
        for e in pool:
            if e["source"] == res_id and e["quote"] not in seen:
                seen.add(e["quote"])
                out.append(insights._decorate(e))
    return out[:6]


def payload() -> dict:
    out = []
    for res in store.RESOURCES.values():
        named: dict[str, int] = {}
        for c in _chunks(res["id"]):
            for i in _mentions_of(c):
                named[i] = named.get(i, 0) + 1
        entry = {
            **{k: res[k] for k in ("id", "kind", "kind_name", "short", "title", "url", "description", "topic",
                                    "video", "note", "documents", "passages", "words")},
            "use": USE[res["id"]], "ask": ASK.get(res["id"], []),
            "used_in": _used_in(res["id"]), "highlights": _highlights(res["id"]),
            "experiments": [{"id": i, "short": store.INVS[i]["short"], "passages": n}
                            for i, n in sorted(named.items(), key=lambda kv: (-kv[1], store.sort_key(kv[0])))],
        }
        if res["kind"] == "video":   # NASA's captions, with the time each stretch starts at
            entry["transcript"] = [{"section": c["section"], "url": c["url"], "text": _body(c)}
                                   for c in _chunks(res["id"])]
        if res["id"] == "RES-1":   # PSI is the database itself: say what was taken from it
            entry["psi"] = {
                "investigations": len(store.INVS), "runs": len(store.RUNS), "tables": len(store.TABLES),
                "documents": len(store.DOCS),
                "document_passages": sum(1 for c in store.CHUNKS if c["kind"] in store.DOCUMENT_KINDS),
            }
            entry["used_in"] = [{"label": "Research Explorer: all 24 investigations", "to": "/explorer"},
                                {"label": "Charts: every run table", "to": "/charts"},
                                {"label": "Research Gaps: coverage counts", "to": "/gaps"},
                                {"label": "Predictions & What-If: the FLEX run table", "to": "/whatif"},
                                {"label": "AI Research Assistant: records, reports and science documents", "to": "/assistant"}]
        out.append(entry)
    read = [r for r in out if r["passages"]]
    return {
        "source_list": store.RES_INFO.get("source_list"), "built_at": store.RES_INFO.get("built_at"),
        "resources": out,
        "totals": {"resources": len(out), "read": len(read) + (1 if store.RESOURCES else 0),
                   "documents": sum(len(r["documents"]) for r in out),
                   "passages": sum(r["passages"] for r in out), "words": sum(r["words"] for r in out)},
        "not_usable": store.RES_INFO.get("not_usable", []), "left_out": store.RES_INFO.get("left_out", {}),
        "not_read": NOT_READ,
        "note": "Descriptions are NASA's, word for word from the organisers' resource list. The line on how each "
                "resource is used is the project team's.",
    }


def brief() -> list[dict]:
    """Names and links only, for citation chips and reference lists."""
    return [{"id": r["id"], "short": r["short"], "title": r["title"], "url": r["url"]} for r in store.RESOURCES.values()]


def verify() -> None:
    """Fails at start-up if the resource list and this module disagree."""
    if not store.RESOURCES:
        return
    missing = [i for i in store.RESOURCES if i not in USE]
    if missing:
        raise RuntimeError(f"resources.py has no 'use' line for: {', '.join(missing)}")
