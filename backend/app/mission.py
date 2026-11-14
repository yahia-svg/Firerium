"""Mission Report: one document for a chosen crew environment that pulls
together the briefing, the most relevant experiments, the fire-safety insights,
the research gaps and (when it applies) the model estimate, with references.

Nothing new is computed here. Every part comes from the module that owns it,
so the report always agrees with the pages of the site.
"""
from __future__ import annotations

import re
from datetime import date

from . import assistant, environments, gaps, insights, predict, report, store

CITE = report.CITE
FOCI = ("prevention", "detection", "suppression")


def _rng(c: dict | None) -> str:
    if not c:
        return "Not reported"
    n = lambda v: f"{round(v, 2):g}"  # noqa: E731
    if c["min"] is None:
        return f"up to {n(c['max'])} {c['unit']}"
    if abs(c["max"] - c["min"]) < 1e-9:
        return f"{n(c['max'])} {c['unit']}"
    return f"{n(c['min'])} to {n(c['max'])} {c['unit']}"


def build(env_id: str, focus: str | None = None, top: int = 6) -> dict:
    env = environments.public_env(env_id)
    briefing = dict(assistant.environment_summary(env_id))
    ranking = environments.rank(env_id, None, focus, {})
    if focus:  # the briefing's own top list is ranked without a focus; section 3 gives the focused ranking
        briefing["insights"] = [t for t in briefing["insights"] if not t.startswith("Highest-ranked")]

    ranked = []
    for r in ranking["results"][:top]:
        inv = r["investigation"]
        ranked.append({
            "id": inv["id"], "short": inv["short"], "title": inv["title"], "rank": r["rank"], "score": r["score"],
            "summary": inv["summary"], "safety_note": inv["safety_note"], "pillars": inv["pillars"],
            "gravity": inv["gravity"]["label"], "materials": inv["materials"][:5],
            "oxygen": _rng(inv["conditions"]["oxygen"]), "pressure": _rng(inv["conditions"]["pressure"]),
            "airflow": _rng(inv["conditions"]["airflow"]), "n_runs": inv["n_runs"],
            "reasons": [{"label": b["label"], "points": b["points"], "max_points": b["max_points"], "why": b["why"]}
                        for b in r["breakdown"][:3]],
            "psi": inv["links"]["psi"],
        })

    ins = insights.payload()
    order = sorted(ins["sections"], key=lambda s: (s["id"] != focus,))
    sections = []
    for s in order:
        sections.append({
            "id": s["id"], "title": s["title"], "meaning": s["meaning"],
            "points": [{"title": c["title"], "limits": c.get("limits"),
                        "text": c["text"].replace(" The table below is computed from the FLEX run log in PSI.", ""),
                        "evidence": c["evidence"][:1],
                        "sources": list(dict.fromkeys(e["source"] for e in c["evidence"]))}
                       for c in s["cards"]],
        })

    # The accident histories (Apollo 1, Apollo 13, Mir) are left out: they are history, not research
    # evidence for a habitat, and they live on the Lessons & Applications page. The field stays, empty,
    # so older readers of this API do not break.
    lessons: list[dict] = []

    g = gaps.analyse({}, env_id)
    model = predict.habitat_estimates(environments.ENVIRONMENTS[env_id])

    cited: list[str] = []

    def cite(ids):
        for i in ids:
            if i not in cited and (i == "CHALLENGE" or i in store.INVS or i in store.RESOURCES):
                cited.append(i)

    for text in briefing["safety_needs"] + briefing["insights"] + briefing["gaps"] + [briefing["headline"]]:
        cite(CITE.findall(text))
    cite(r["id"] for r in ranked)
    for s in sections:
        for p in s["points"]:
            cite(p["sources"])
    for p in lessons:
        cite(p["sources"])
    for h in g["headlines"]:
        cite(CITE.findall(h["text"]))
        cite(e["source"] for e in h["evidence"])
    if model:
        cite([model["table"]["investigation"]["id"]])
    if "challenge" in env["atmosphere_basis"].lower():
        cite(["CHALLENGE"])
    cite(re.findall(r"PSI-\d+", env["atmosphere_basis"]))

    refs = []
    for c in sorted(cited, key=report.ref_order):
        if c == "CHALLENGE":
            refs.append({"id": c, "short": "NASA challenge description",
                         "text": "NASA Space Apps Challenge, 'Flame in Freefall' challenge description.",
                         "url": None, "doi": None})
        elif c in store.RESOURCES:
            res = store.RESOURCES[c]
            refs.append({"id": c, "short": res["short"],
                         "text": f"{res['title']}. NASA ({res['kind_name']}), official resource for the challenge.",
                         "url": res["url"], "doi": None})
        else:
            inv = store.INVS[c]
            refs.append({"id": c, "short": inv["short"],
                         "text": inv["title"] + (f" ({inv['acronym']})" if inv["acronym"] else "")
                                 + ". NASA Physical Sciences Informatics.",
                         "url": inv["links"]["psi"], "doi": inv["links"]["doi"]})

    return {
        "title": f"Fire-safety mission report: {env['name']}",
        "generated": date.today().isoformat(), "environment": env, "focus": focus,
        "briefing": {k: briefing[k] for k in ("mode", "headline", "safety_needs", "insights", "gaps", "note")}
                    | {"model": briefing.get("model")},
        "ranking": {"method": ranking["method"], "weights": ranking["weights"],
                    "factors": {k: v["label"] for k, v in ranking["factors"].items()}, "results": ranked},
        "sections": sections, "lessons": lessons,
        "gaps": {"habitat": g["habitat"], "headlines": g["headlines"], "questions": g["questions"],
                 "questions_note": g["questions_note"], "disclaimer": g["disclaimer"]},
        "model": model, "references": refs,
        "disclaimer": "This report is a research aid built from public NASA PSI records. It is not a certified "
                      "spacecraft safety assessment, and nothing in it is a guaranteed real-world outcome. Check "
                      "each statement against the cited NASA source.",
        "data": {"source": store.META.get("source"), "built_at": store.META.get("built_at"),
                 "investigations": len(store.INVS)},
    }


def pdf(env_id: str, focus: str | None = None, top: int = 6) -> bytes:
    r = build(env_id, focus, top)
    env = r["environment"]
    tag = report.name_tags
    doc = report.Report(format="A4")
    doc.set_margins(18, 14, 18)
    doc.set_auto_page_break(True, margin=16)
    doc.add_page()

    doc.block(f"**{r['title']}**", 18, gap=1)
    doc.block(f"Generated {r['generated']} by Flame in Freefall from {r['data']['investigations']} NASA PSI "
              f"combustion-science investigations (data collected {str(r['data']['built_at'])[:10]})."
              + (f" Safety focus: {focus}." if focus else ""), 9, color=(90, 98, 110), gap=3)
    doc.block(r["disclaimer"], 8.5, "I", (120, 70, 20), gap=4)

    doc.block("**1. The environment**", 13)
    doc.block(f"**Cabin atmosphere:** {env['atmosphere_label']}", 10, gap=0.8)
    doc.block(f"**Gravity:** {env['g_label']}", 10, gap=0.8)
    doc.block(f"**Basis:** {env['atmosphere_basis']}", 9.5, gap=0.8)
    if env["assumption"]:
        doc.block(f"**Assumption:** {env['assumption']}", 9.5, color=(120, 70, 20), gap=0.8)
    doc.ln(2)

    b = r["briefing"]
    doc.block("**2. Fire-safety briefing**", 13)
    doc.block("Written by an AI model from the database facts and NASA records." if b["mode"] == "ai"
              else "Computed from the project database (no AI model was connected).", 8.5, "I", (90, 98, 110))
    for head, items in (("What fire safety here requires", b["safety_needs"]),
                        ("What the collected research tells us", b["insights"]),
                        ("Research gaps", b["gaps"])):
        doc.block(f"**{head}**", 10.5)
        for it in items:
            doc.block(f"- {tag(it)}", 10, indent=4, gap=0.8)
        doc.ln(1.5)

    doc.block("**3. Most relevant experiments**", 13)
    doc.block("The project's own 0-100 relevance score, not a NASA score"
              + (f"; safety focus: {focus}." if focus else "."), 8.5, "I", (90, 98, 110))
    for x in r["ranking"]["results"]:
        doc.block(f"**{x['rank']}. {x['short']}** [{x['id']}]  -  {x['score']:g} / 100", 10.5, color=(18, 70, 130), gap=0.8)
        doc.block(x["summary"], 10, indent=4, gap=0.8)
        top = sorted(x["reasons"], key=lambda w: -w["points"])[:2]
        doc.block(f"Oxygen {x['oxygen']}; pressure {x['pressure']}; airflow {x['airflow']}; {x['gravity'].lower()}. "
                  "Most points: " + ", ".join(f"{w['label'].lower()} +{w['points']:g}" for w in top) + ".",
                  9, color=(70, 78, 90), indent=4, gap=2)

    doc.block("**4. Fire-safety insights**", 13)
    for s in r["sections"]:
        doc.block(f"**{s['title']}**", 11.5, color=(18, 70, 130))
        doc.block(s["meaning"], 9.5, "I", (70, 78, 90))
        for p in s["points"]:
            src = " ".join(f"[{i}]" for i in p["sources"])
            doc.block(f"**{p['title']}.** {p['text']} {tag(src)}", 10, indent=4, gap=0.8)
            if p["limits"]:
                doc.block(f"Limits: {p['limits']}", 9, "I", (120, 70, 20), indent=8, gap=1.6)
        doc.ln(1)

    if r["lessons"]:
        doc.block("**Lessons from past spacecraft accidents**", 11.5, color=(18, 70, 130))
        doc.block("From NASA's own history pages: histories, not experiments.", 9.5, "I", (70, 78, 90))
        for p in r["lessons"]:
            src = " ".join(f"[{i}]" for i in p["sources"])
            doc.block(f"**{p['title']}** ({p['when']}). {p['text']} {tag(src)}", 10, indent=4, gap=1.6)
        doc.ln(1)

    g = r["gaps"]
    doc.block("**5. Research gaps for this environment**", 13)
    for row in g["habitat"]["rows"]:
        names = ", ".join(i["short"] for i in row["ids"][:8]) + (" ..." if len(row["ids"]) > 8 else "")
        doc.block(f"- **{row['label']}:** " + (f"{row['count']} ({names})" if row["count"]
                                               else "0. Not represented in this project collection."),
                  10, indent=4, gap=0.8)
    doc.ln(1.5)
    for h in g["headlines"]:
        doc.block(f"**{h['title']}.** {tag(h['text'])}", 10, indent=4, gap=1.2)
    doc.ln(1)
    doc.block("**Questions for future experiments (project team's)**", 10.5)
    for q in g["questions"]:
        doc.block(f"- {q['question']}", 10, indent=4, gap=0.8)
    doc.ln(2)

    m = r["model"]
    doc.block("**6. Model estimate**", 13)
    if m:
        doc.block(f"{m['label'].upper()}. Model version {m['version']}, trained on the {m['table']['investigation']['short']} "
                  f"run table [{m['table']['investigation']['id']}].", 9, "I", (120, 70, 20))
        for row in m["rows"]:
            e, a = row["estimate"], row["air"]
            doc.block(f"- **{row['fuel']} droplet at {row['oxygen']:g}% oxygen, {row['pressure']:g} atm:** about "
                      f"{e['value']:.2f} {e['unit']} (80% band {e['low']:.2f} to {e['high']:.2f}), against "
                      f"{a['value']:.2f} in air at 1 atm: {row['change_pct']:+d}%."
                      + (" Weakly supported: no FLEX test is close to this combination." if row["support"] == "weak"
                         else ""), 10, indent=4, gap=0.8)
        for s in m["skipped"]:
            doc.block(f"- No estimate: {s}", 9.5, indent=4, gap=0.8)
        doc.block(m["note"], 9, "I", (70, 78, 90), gap=2)
    else:
        doc.block("No model estimate is given for this environment: its atmosphere lies outside the range of the "
                  "data the model was trained on, or no model is available.", 10, gap=2)

    doc.ln(2)
    doc.block("**References**", 13)
    for ref in r["references"]:
        line = f"**[{ref['id']}]** {ref['text']}" + (f" {ref['url']}" if ref["url"] else "") \
               + (f"  DOI: {ref['doi']}" if ref["doi"] else "")
        doc.block(line, 9.5, gap=1.2)
    return bytes(doc.output())
