"""Live check of every AI feature against the real model.

    backend/.venv/Scripts/python -X utf8 backend/tests/check_ai.py

Needs an AI key in backend/.env. It makes about eight model requests, so it costs a few cents
on Claude Haiku and roughly twenty cents on Claude Sonnet. The smoke test (smoke_test.py)
covers everything that works without a key; this script covers the part that needs one.
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app import llm, store  # noqa: E402
from app.main import app  # noqa: E402

failed = 0


def ok(cond, label, detail=""):
    global failed
    failed += not cond
    print(("  ok  " if cond else "FAIL  ") + label + (f"\n        {detail}" if detail else ""))


def timed(fn):
    start = time.time()
    out = fn()
    return out, time.time() - start


def show(a, secs):
    c, t = a["checks"], a["trace"]
    print(f"\n[{secs:.0f}s] {a['mode']} / {a['grounding']} | {c['nasa_cited']}/{c['statements']} statements cite NASA, "
          f"{c['numbers_found']}/{c['numbers']} numbers found, {len(a['refs'])} passages cited | "
          f"{t.get('tokens_in')} tokens in ({t.get('tokens_cached')} cached), {t.get('tokens_out')} out, ${t.get('cost_usd')}")
    print(a["answer"][:700] + ("…" if len(a["answer"]) > 700 else "") + "\n")


with TestClient(app) as c:
    st = c.get("/api/meta").json()["llm"]
    print("status:", {k: st[k] for k in ("provider", "model", "effort", "verified", "last_error")})
    if not st["configured"]:
        raise SystemExit("No key found. Put an AI key in backend/.env and run this again.")
    ok(st["verified"] is True, "start-up check: the service accepted the key and the model", st["last_error"] or st["model"])
    if st["verified"] is False:
        raise SystemExit(1)
    lib = c.get("/api/assistant/library").json()
    print(f"library: {lib['passages']} passages, {len(lib['documents'])} NASA documents, searched by {lib['search_mode']}")

    # 1. a question about the whole collection: the answer must agree with the Explorer filter
    truth = {i["id"] for i in store.apply_filters({"o2_min": 30})}
    a, secs = timed(lambda: c.post("/api/assistant/ask", json={
        "question": "Which experiments tested oxygen levels of 30% or more, and what did each one burn?",
        "audience": "researcher"}).json())
    show(a, secs)
    cited = {r["id"] for r in a["refs"]}
    ok(a["mode"] == "ai", "assistant answered with the model", a.get("notice", ""))
    ok(truth <= cited, "answer cites every experiment the Explorer lists for 30% oxygen or more",
       f"Explorer: {sorted(truth)}; missing from the answer: {sorted(truth - cited)}")
    ok(not a["removed_citations"], "no citation had to be removed", str(a["removed_citations"]))
    # A flagged number is the check working (for example the question's own "30%" repeated beside a
    # citation that does not contain it), so this passes unless many numbers are unsupported.
    flagged = [n["text"] for s in a["ledger"] for n in s["numbers"] if not n["found"]]
    ok(a["checks"]["numbers_found"] >= 0.8 * a["checks"]["numbers"],
       "at least four in five numbers with a unit were found in the passage cited for them",
       f"{a['checks']['numbers_found']} of {a['checks']['numbers']}; flagged for the reader: {flagged}")

    # 2. a question whose answer is in a NASA report, not in the PSI record
    a, secs = timed(lambda: c.post("/api/assistant/ask", json={
        "question": "What did the SAME experiment find about the size of smoke particles in microgravity?",
        "audience": "researcher"}).json())
    show(a, secs)
    pages = [r for r in a["refs"] if r["kind"] == "report" and r["page"]]
    ok(bool(pages), "answer cites a NASA report by page", ", ".join(f"{r['document']} p.{r['page']}" for r in pages[:4]))
    ok(a["checks"]["nasa_cited"] >= 0.6 * a["checks"]["statements"], "most statements cite NASA",
       f"{a['checks']['nasa_cited']} of {a['checks']['statements']}")

    # 3. the prompt cache: the second question should have read the instructions and index from cache
    ok((a["trace"].get("tokens_cached") or 0) > 0 or st["provider"] != "anthropic",
       "instructions and collection index were read from the prompt cache", str(a["trace"].get("tokens_cached")))

    # 4. a research task with a search scope
    a, secs = timed(lambda: c.post("/api/assistant/ask", json={
        "question": "Findings brief for ACME CFI-G (PSI-159): what was tested, under which conditions, and what was found.",
        "task": "findings", "audience": "researcher", "scope": {"ids": ["PSI-159"], "kinds": []}}).json())
    show(a, secs)
    ok(all(k in a["answer"] for k in ("What was tested", "What was found", "Limits")), "findings brief follows its layout")
    ok({r["id"] for r in a["refs"]} <= {"PSI-159", "CHALLENGE"}, "search scope was respected",
       str(sorted({r["id"] for r in a["refs"]})))

    # 5. off-topic
    a, secs = timed(lambda: c.post("/api/assistant/ask", json={"question": "best pizza recipe in naples"}).json())
    ok(a["grounding"] in ("off_topic", "not_in_collection"), f"[{secs:.0f}s] off-topic question is declined", a["answer"][:160])

    # 6. environment briefing, estimate, custom ranking
    s, secs = timed(lambda: c.get("/api/environments/moon/summary").json())
    ok(s["mode"] == "ai" and len(s["gaps"]) >= 2, f"[{secs:.0f}s] Moon Base briefing written by the model",
       s.get("notice") or s["headline"])
    e, secs = timed(lambda: c.post("/api/explorer/estimate", json={"fuel_state": "solid", "o2_min": 30}).json())
    ok(e["mode"] == "ai" and e["confidence"] in ("low", "very low"), f"[{secs:.0f}s] no-match estimate, labelled low confidence",
       e.get("message") or e["estimate"][:300])
    r, secs = timed(lambda: c.post("/api/ranking/custom", json={
        "criterion": "Most useful for choosing cabin fabrics for a lunar habitat"}))
    body = r.json()
    ok(r.status_code == 200 and body["mode"] == "ai" and len(body["results"]) == 24,
       f"[{secs:.0f}s] custom ranking scores all 24 experiments",
       body.get("notice") or ", ".join(f"{x['investigation']['short']} {x['score']}" for x in body["results"][:5]))
    r, secs = timed(lambda: c.post("/api/ranking/custom", json={"criterion": "best football striker of 2022"}))
    ok(r.status_code == 422, f"[{secs:.0f}s] irrelevant criterion rejected", r.json().get("detail", "")[:160])

    print("\nsession:", llm.status()["session"])

print("\nall AI checks passed" if not failed else f"\n{failed} check(s) failed")
raise SystemExit(1 if failed else 0)
