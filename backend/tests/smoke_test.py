"""End-to-end smoke test of the API against the real database.

    backend/.venv/Scripts/python backend/tests/smoke_test.py

Runs without an AI key (FLAME_DISABLE_LLM=1) so results are deterministic.
"""
import os
import sys
from pathlib import Path

os.environ["FLAME_DISABLE_LLM"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

checks = 0


def ok(cond, label):
    global checks
    checks += 1
    print(("  ok  " if cond else "FAIL  ") + label)
    if not cond:
        raise SystemExit(1)


with TestClient(app) as c:
    m = c.get("/api/meta").json()
    ok(m["combustion_investigations"] == "24", "24 combustion investigations loaded")
    ok(len(m["environments"]) == 5, "5 habitable environments")
    ok({k: m["llm"][k] for k in ("available", "configured", "verified", "model", "last_error")}
       == {"available": False, "configured": False, "verified": None, "model": None, "last_error": None},
       "AI status reports 'not connected' when no key is set")
    du = m["data_use"]
    print(f"      NASA archives: {du['archive_bytes'] / 2**40:.2f} TB; used by the site: {(du['used_bytes'] or 0) / 2**20:.1f} MB")
    ok(du["archive_bytes"] > 1e13 and du["database_bytes"] > 1e6, "data-use figures come from the PSI records")

    r = c.post("/api/investigations/search", json={}).json()
    ok(r["count"] == 24, "empty filter returns everything")
    r = c.post("/api/investigations/search", json={"fuel_state": "solid"}).json()
    names = [x["short"] for x in r["results"]]
    print("      solid:", names)
    ok("BASS-II" in names and "FLEX" not in names, "fuel-state filter")
    r = c.post("/api/investigations/search", json={"o2_min": 30}).json()
    print("      O2 >= 30%:", [x["short"] for x in r["results"]])
    ok(any(x["id"] == "PSI-159" for x in r["results"]), "oxygen range filter finds CFI-G")
    r = c.post("/api/investigations/search", json={"q": "smoke"}).json()
    print("      q=smoke:", [x["short"] for x in r["results"]])
    ok({"PSI-101", "PSI-102"} <= {x["id"] for x in r["results"]}, "text search finds SAME and SAME-R")
    r = c.post("/api/investigations/search", json={"fuel_state": "solid", "o2_min": 30}).json()
    ok(r["count"] == 0, "no solid-material investigation reports O2 >= 30% (a real gap)")

    d = c.get("/api/investigations/PSI-25").json()
    print("      BASS-II related:", [(x["investigation"]["short"], x["score"]) for x in d["related"]])
    ok("PSI-26" in [x["investigation"]["id"] for x in d["related"][:2]], "BASS is among BASS-II's closest relatives")
    ok(d["links"]["psi"].endswith("PSI-25") and d["table_details"][0]["source_url"].startswith("https://psi.nasa.gov"),
       "source links present")
    ok(c.get("/api/investigations/PSI-999").status_code == 404, "unknown investigation gives 404")

    for env in ("moon", "station"):
        r = c.post("/api/ranking", json={"environment": env}).json()
        print(f"      rank[{env}]:", [(x["investigation"]["short"], x["score"]) for x in r["results"][:7]])
        ok(len(r["results"]) == 24 and r["results"][0]["score"] >= r["results"][-1]["score"], f"ranking for {env}")
        total = sum(b["points"] for b in r["results"][0]["breakdown"])
        ok(abs(total - r["results"][0]["score"]) < 0.3, "breakdown points add up to the score")
    r = c.post("/api/ranking", json={"environment": "moon", "focus": "detection"}).json()
    print("      rank[moon, detection]:", [(x["investigation"]["short"], x["score"]) for x in r["results"][:4]])
    ok("detection" in r["results"][0]["investigation"]["pillars"], "focus puts a detection study first")
    r = c.post("/api/ranking", json={"environment": "moon", "weights": {"oxygen": 10, "directness": 0}}).json()
    ok(r["weights"]["oxygen"] == 10, "custom weights applied")

    s = c.get("/api/environments/moon/summary").json()
    print("      moon:", s["headline"])
    for g in s["gaps"]:
        print("        gap:", g)
    ok(s["mode"] == "computed" and len(s["gaps"]) >= 2, "environment summary (computed mode)")

    cmp_ = c.get("/api/compare", params={"ids": "PSI-25,PSI-26"}).json()
    print("      similar:", cmp_["similar"][:3])
    print("      missing:", cmp_["missing"][:3])
    ok(len(cmp_["rows"]) > 12 and cmp_["similar"], "comparison rows + similarities")
    ok(c.get("/api/compare", params={"ids": "PSI-25"}).status_code == 400, "comparison needs two or more")

    ins = c.get("/api/insights").json()
    ok([s["id"] for s in ins["sections"]] == ["prevention", "detection", "suppression"], "three insight sections")
    flex = ins["sections"][2]["cards"][0]["data"]["rows"]
    for row in flex:
        print("        FLEX:", row)
    ok(sum(r["runs"] for r in flex) == 274, "FLEX suppression table covers all 274 runs")
    ok(len(ins["earth_vs_micro"]["data"]["rows"]) == 9, "Saffire-II gravity comparison has 9 samples")

    t = c.get("/api/tables").json()
    ok(len(t["tables"]) == 22 and len(t["presets"]) >= 8, "22 run tables, chart presets")
    for p in t["presets"]:
        full = c.get(f"/api/tables/{p['table_id']}").json()
        xs = [r[p["x"]] for r in full["rows"] if r.get(p["x"])]
        ok(len(xs) > 5, f"preset {p['id']} has data ({len(xs)} points)")
    e = c.get("/api/envelope").json()
    print("      envelope:", len(e["points"]), "points with O2+pressure;", len(e["oxygen_only"]), "with O2 only")
    ok(len(e["points"]) > 500, "test envelope has real runs")

    a = c.post("/api/assistant/ask", json={"question": "Which NASA experiments studied smoke detection in space?"}).json()
    print("      ask:", a["mode"], a["grounding"], [s["id"] for s in a["sources"]])
    print("     ", a["answer"][:500].replace("\n", " "))
    ok({"PSI-101", "PSI-102"} & {s["id"] for s in a["sources"]}, "smoke question retrieves SAME / SAME-R")
    a2 = c.post("/api/assistant/ask", json={"question": "best pizza recipe in naples"}).json()
    ok(a2["grounding"] == "off_topic" and not a2["sources"], "off-topic question is refused, no sources")
    a3 = c.post("/api/assistant/ask", json={"question": "What is the oxygen range?", "context": {"page": "x", "ids": ["PSI-69"]}}).json()
    ok(a3["sources"][0]["id"] == "PSI-69", "page context steers retrieval")

    # the collection index handed to the AI model must agree with the Explorer's own filter
    from app import assistant as _assistant  # noqa: E402
    import re as _re  # noqa: E402
    index = _assistant._index_lines()
    high = set()
    for sid, line in index.items():
        oxygen = line.split("| oxygen: ")[1].split(" | ")[0]  # e.g. "12 to 85 % O2 (note)" or "not reported"
        nums = _re.findall(r"[\d.]+", oxygen.split("%")[0]) if "%" in oxygen else []
        if nums and float(nums[-1]) >= 30:
            high.add(sid)
    explorer = {x["id"] for x in c.post("/api/investigations/search", json={"o2_min": 30}).json()["results"]}
    ok(len(index) == 24 and high == explorer, f"AI collection index matches the Explorer filter ({len(high)} experiments at 30% oxygen or more)")
    ok("Inverse flames" in index["PSI-159"], "AI collection index keeps the inverse-flame caution")

    est = c.post("/api/explorer/estimate", json={"fuel_state": "solid", "o2_min": 30}).json()
    print("      nearest:", [(n["investigation"]["short"], n["misses"]) for n in est["nearest"]])
    ok(est["nearest"] and est["estimate"] is None, "no-match: nearest experiments, no invented estimate")

    cr = c.post("/api/ranking/custom", json={"criterion": "experiments useful for choosing fabrics for a lunar habitat"})
    print("      custom:", [(x["investigation"]["short"], x["score"]) for x in cr.json()["results"][:5]])
    ok(cr.status_code == 200, "custom ranking")
    cr = c.post("/api/ranking/custom", json={"criterion": "best football striker of 2022"})
    ok(cr.status_code == 422, "irrelevant custom criterion gives an error: " + cr.json()["detail"][:60])

    pdf = c.post("/api/assistant/report", json={"messages": [
        {"role": "user", "content": "Which experiments studied smoke?"},
        {"role": "assistant", "content": a["answer"], "mode": "retrieval"}]})
    ok(pdf.status_code == 200 and pdf.content[:5] == b"%PDF-" and len(pdf.content) > 1500, "PDF report generated")

    # ---- stage 2: research gaps -------------------------------------------------
    g = c.post("/api/gaps", json={"environment": "moon"}).json()
    ok(g["basis"]["selected"] == 24 and "not prove" in g["disclaimer"], "gaps: basis and disclaimer")
    heads = {h["id"]: h for h in g["headlines"]}
    print("      gaps:", list(heads))
    ok({"partial-gravity", "solids-high-oxygen"} <= set(heads), "gaps: partial gravity and solids at high oxygen")
    dims = {d["id"]: {cell["label"]: cell for cell in d["cells"]} for d in g["dimensions"]}
    ok(dims["gravity"]["Partial gravity (Moon 1/6 g, Mars 3/8 g)"]["status"] == "none",
       "gaps: partial gravity is 'not represented'")
    ok(sum(cell["count"] for cell in dims["gravity"].values() if cell["label"].startswith(("Microgravity", "Ground"))) == 24,
       "gaps: every investigation is a flight test or ground analysis")
    solids_30 = [i for i in g["items"] if "Solid materials (fabrics, plastics)" in i["dims"]["fuel"]
                 and any(label.startswith("30%") for label in i["dims"]["oxygen"])]
    ok(not solids_30, "gaps: coverage map has no solid material at 30% oxygen or more")
    fit = {r["label"]: r for r in g["habitat"]["rows"]}
    ok(fit["Solid cabin materials inside the oxygen band"]["count"] == 0, "gaps: Moon Base habitat fit")
    ok(len(g["questions"]) >= 3 and all(q["closest"] for q in g["questions"]), "gaps: future questions with closest experiments")
    g2 = c.post("/api/gaps", json={"filters": {"pillar": "detection"}}).json()
    ok(g2["basis"]["selected"] < 24 and g2["basis"]["filters"], "gaps: filters narrow the basis and stay visible")
    ok(c.post("/api/gaps", json={"filters": {"q": "zzzz"}}).json()["headlines"] == [], "gaps: empty selection makes no claims")

    # ---- stage 2: predictive model and What-If -----------------------------------
    mc = c.get("/api/model").json()
    print("      model:", mc["version"], mc["metrics"]["mae"], "vs baseline", mc["metrics"]["baseline_mae"],
          f"({mc['metrics']['improvement_pct']}% better)")
    ok(mc["available"] and mc["metrics"]["mae"] < 0.8 * mc["metrics"]["baseline_mae"], "model beats the baseline on held-out test days")
    ok(len(mc["oof"]) == mc["rows_used"] and mc["limitations"], "model card: held-out predictions and limitations")
    air = {"fuel": "Methanol", "oxygen": 21, "co2": 0, "helium": 0, "pressure": 1, "diameter": 3}
    w = c.post("/api/whatif", json=air).json()
    ok(w["status"] == "ok" and w["estimate"]["low"] < w["estimate"]["value"] < w["estimate"]["high"]
       and "not a NASA measurement" in w["label"], "what-if: estimate with error band, labelled as a model prediction")
    ok(len(w["nearest_runs"]) == 5 and w["nearest_runs"][0]["measured"] > 0, "what-if: closest real tests listed")
    w30 = c.post("/api/whatif", json={**air, "oxygen": 30, "pressure": 0.69}).json()
    print("      what-if 21% -> 30% O2:", w["estimate"]["value"], "->", w30["estimate"]["value"], w30["support"])
    ok(w30["status"] == "ok" and w30["estimate"]["value"] > w["estimate"]["value"], "what-if: more oxygen burns faster")
    ok(w["confidence"] >= 70 and not w["extrapolated"], "what-if: air case has high confidence")
    far = c.post("/api/whatif", json={**air, "oxygen": 50}).json()
    ok(far["status"] == "ok" and far["extrapolated"] and far["confidence"] < w["confidence"] and far["warnings"],
       "what-if: out of range is answered as a labelled extrapolation with lower confidence")
    ok(far["estimate"]["high"] - far["estimate"]["low"] > w["estimate"]["high"] - w["estimate"]["low"],
       "what-if: the error band widens away from the tests")
    ok(far["nearest_runs"] and far["collection_evidence"], "what-if: extrapolation still shows related experiments")
    odd = c.post("/api/whatif", json={**air, "pressure": 2.5}).json()
    ok(odd["status"] == "ok" and odd["support"] == "none" and odd["confidence"] < 45, "what-if: untested combination has low confidence")
    bad = c.post("/api/whatif", json={**air, "oxygen": 60, "co2": 50}).json()
    ok(bad["status"] == "invalid" and "estimate" not in bad, "what-if: impossible gas mixture gets no number")
    ok(c.post("/api/whatif", json={**air, "fuel": "wood"}).status_code == 400, "what-if: unsupported fuel rejected")
    ok(c.post("/api/whatif", json={**air, "oxygen": 130}).status_code == 422, "what-if: impossible value rejected")

    # ---- the assistant, streamed: same answer, sent as events ---------------------------------
    import json as _json
    lines = [_json.loads(x) for x in c.post("/api/assistant/ask/stream", json={"question": "What did BASS-II study?"}).text.splitlines() if x.strip()]
    ok(lines and lines[-1]["type"] == "done" and lines[-1]["answer"]["refs"], "assistant stream: ends with the checked answer")

    # ---- the Predictions page: several experiments, one engine ---------------------------------
    cat = c.get("/api/predict/models").json()
    by = {m["id"]: m for m in cat["models"]}
    ok(all(by[k]["available"] for k in ("flex-rate", "flex-extinction", "cfig-temp")),
       "predictions: three models pass the held-out baseline test")
    ok(all(m["metrics"]["improvement_pct"] >= 20 for m in by.values() if m["available"]), "predictions: every offered model is >=20% better than its baseline")
    ok({p["id"] for p in cat["places"]} >= {"station", "moon", "mars"} and "rover" not in {p["id"] for p in cat["places"]},
       "predictions: habitat places, without the duplicate rover atmosphere")
    pr = c.post("/api/predict", json={"model": "flex-rate", "group": "Methanol", "values": {"oxygen": 21}}).json()
    ok(pr["status"] == "ok" and abs(pr["estimate"]["value"] - w["estimate"]["value"]) < 0.02,
       "predictions: the burning-rate model agrees with the What-If endpoint")
    moon = c.post("/api/predict", json={"model": "cfig-temp", "values": {"oxygen": 30, "pressure": 0.69}}).json()
    ok(moon["status"] == "ok" and moon["confidence"] >= 60 and not moon["extrapolated"],
       "predictions: CFI-G covers the Moon Base atmosphere with high confidence")
    ex = c.post("/api/predict", json={"model": "flex-extinction", "group": "Heptane", "values": {"oxygen": 30, "pressure": 0.69}}).json()
    ok(ex["status"] == "ok" and 0 <= ex["estimate"]["value"] <= 100, "predictions: flame-out chance is a probability")
    ok(c.post("/api/predict", json={"model": "flex-rate", "values": {"oxygen": 60, "co2": 50}}).json()["status"] == "invalid",
       "predictions: a mixture above 100% gets no number")
    bt = c.post("/api/predict/batch", json={"model": "flex-rate", "rows": [
        {"group": "Heptane", "values": {"oxygen": "25"}}, {"values": {"oxygen": "abc"}}, {"values": {"oxygen": 99, "co2": 10}}]}).json()["results"]
    ok([r["status"] for r in bt] == ["ok", "error", "invalid"], "predictions: CSV batch handles good, bad and impossible rows")

    # ---- stage 2: mission report ----------------------------------------------------
    mr = c.get("/api/mission/moon", params={"focus": "prevention", "top": 6}).json()
    refs = {r["id"] for r in mr["references"]}
    ok(len(mr["ranking"]["results"]) == 6 and {r["id"] for r in mr["ranking"]["results"]} <= refs,
       "mission report: every ranked experiment is in the references")
    ok("CHALLENGE" in refs and mr["sections"][0]["id"] == "prevention", "mission report: challenge cited, focus section first")
    ok(mr["model"] and all(r["oxygen"] <= 34 for r in mr["model"]["rows"]) and mr["model"]["skipped"],
       "mission report: model rows stay inside the tested range")
    for env in ("station", "spacecraft", "rover", "mars"):
        ok(c.get(f"/api/mission/{env}").status_code == 200, f"mission report for {env}")
    mp = c.get("/api/mission/moon/pdf")
    ok(mp.status_code == 200 and mp.content[:5] == b"%PDF-" and len(mp.content) > 8000, "mission report PDF generated")
    ok(c.get("/api/mission/venus").status_code == 404, "mission report: unknown environment gives 404")

    # ---- the official NASA resources listed for the challenge ------------------------
    rs = c.get("/api/resources").json()
    by_id = {r["id"]: r for r in rs["resources"]}
    print("      resources:", rs["totals"])
    ok(len(by_id) == 10 and rs["totals"]["read"] == 10, "resources: all ten official NASA resources are listed and used")
    ok(all(r["passages"] > 0 for i, r in by_id.items() if i != "RES-1") and by_id["RES-1"]["psi"]["investigations"] == 24,
       "resources: every resource besides PSI has passages read; PSI is the database")
    ok(all(r["used_in"] and r["use"] and r["description"] for r in by_id.values()),
       "resources: each one has NASA's description and at least one place on the site that uses it")
    ok(by_id["RES-4"]["documents"][-1]["pages"] == 56 and by_id["RES-3"]["transcript"] and by_id["RES-3"]["video"],
       "resources: the 56-page Researcher's Guide and the video's NASA captions were read")
    ok({"PSI-26", "PSI-69"} <= {e["id"] for e in by_id["RES-4"]["experiments"]},
       "resources: the Researcher's Guide is linked to the PSI experiments it names")
    ins = c.get("/api/insights").json()
    ok([x["id"] for x in ins["lessons"]] == ["apollo-1", "apollo-13", "mir"]
       and all(e["source_type"] == "resource" and e["url"] for x in ins["lessons"] for e in x["evidence"]),
       "insights: lessons from Apollo 1, Apollo 13 and Mir, every quote verified in NASA's page")
    earth = [e["source"] for card in ins["earth_applications"] for e in card["evidence"]]
    ok({"RES-8", "RES-9", "RES-10", "RES-3"} <= set(earth), "insights: the three Spinoff articles and the video are quoted under Uses on Earth")
    bass = c.get("/api/investigations/PSI-26").json()["nasa_resources"]
    ok(bass and bass[0]["document"].startswith("Fact sheet") and "BASS" in bass[0]["excerpt"],
       "experiment profile: BASS shows what NASA's fact sheet says about it")
    ok(c.get("/api/investigations/PSI-142").json()["nasa_resources"] == [],
       "experiment profile: an experiment no resource names shows none")
    ok(mr["lessons"] == [] and not ({"RES-6", "RES-7"} & refs),
       "mission report: research evidence only (accident histories stay on the Lessons page)")
    lib = c.get("/api/assistant/library").json()
    ok(any(k["kind"] == "resource" and k["passages"] == rs["totals"]["passages"] for k in lib["kinds"]),
       "assistant library: the resource passages are searchable")
    a = c.post("/api/assistant/ask", json={"question": "What happened in the 1997 fire aboard Mir and what was learned?"}).json()
    kinds = {r["kind"] for r in a["refs"]}
    ok(a["mode"] == "retrieval" and "resource" in kinds and a["refs"][0]["id"] == "RES-7" and a["refs"][0]["file_url"],
       "assistant: a question about the Mir fire is answered from NASA's Mir page, with its link")
    a = c.post("/api/assistant/ask", json={"question": "How did NASA technology improve firefighters' air tanks?"}).json()
    ok(any(r["id"] == "RES-8" for r in a["refs"]), "assistant: a Spinoff question finds the Spinoff article")
    a = c.post("/api/assistant/ask", json={"question": "What did BASS-II study?", "scope": {"ids": ["PSI-25"], "kinds": []}}).json()
    ok(all(r["id"] == "PSI-25" for r in a["refs"]), "assistant: a search limited to one experiment leaves the resources out")
    a = c.post("/api/assistant/ask", json={"question": "Who won the football world cup in 2022?"}).json()
    ok(a["grounding"] == "off_topic", "assistant: an off-topic question is still rejected")

print(f"\nall {checks} checks passed")
