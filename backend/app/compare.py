"""Side-by-side comparison of two or more investigations.

Rows come straight from the shared database. Missing values are returned as
None and shown as "Not reported"; nothing is filled in by guessing.
"""
from __future__ import annotations

from . import store


def _range(c: dict | None) -> dict | None:
    if not c:
        return None
    lo = c["min"]
    text = (f"up to {c['max']:g}" if lo is None else
            f"{lo:g}" if abs(c["max"] - lo) < 1e-9 else f"{lo:g} to {c['max']:g}") + f" {c['unit']}"
    basis = sorted({"PSI run table" if s["type"] == "run_table" else "PSI record text" for s in c["sources"]})
    return {"min": lo, "max": c["max"], "unit": c["unit"], "text": text, "basis": basis}


def compare(ids: list[str]) -> dict:
    invs = [store.INVS[i] for i in ids]
    rows: list[dict] = []

    def set_row(key: str, label: str, values: list[list[str]], hint: str | None = None) -> None:
        present = [set(v) for v in values if v]
        shared = sorted(set.intersection(*present)) if len(present) == len(values) and present else []
        if not present:
            status = "missing"
        elif len(present) < len(values):
            status = "partial"
        elif all(p == present[0] for p in present):
            status = "same"
        elif shared:
            status = "overlap"
        else:
            status = "different"
        rows.append({"key": key, "label": label, "kind": "set", "status": status, "shared": shared,
                     "values": [v or None for v in values], "hint": hint})

    def text_row(key: str, label: str, values: list[str | None], long: bool = False) -> None:
        present = [v for v in values if v]
        status = ("missing" if not present else "partial" if len(present) < len(values)
                  else "same" if len(set(present)) == 1 else "different")
        rows.append({"key": key, "label": label, "kind": "long" if long else "text", "status": status,
                     "values": values})

    def range_row(key: str, label: str, param: str) -> None:
        vals = [_range(i["conditions"][param]) for i in invs]
        present = [v for v in vals if v]
        overlap = None
        if not present:
            status = "missing"
        elif len(present) < len(vals):
            status = "partial"
        else:
            lo = max(v["min"] if v["min"] is not None else float("-inf") for v in present)
            hi = min(v["max"] for v in present)
            if lo <= hi:
                same = all(v["min"] == present[0]["min"] and v["max"] == present[0]["max"] for v in present)
                status = "same" if same else "overlap"
                overlap = {"min": None if lo == float("-inf") else lo, "max": hi, "unit": present[0]["unit"]}
            else:
                status = "different"
        rows.append({"key": key, "label": label, "kind": "range", "status": status, "overlap": overlap,
                     "values": vals})

    text_row("summary", "In plain words", [i["summary"] for i in invs], long=True)
    text_row("objective", "Goal (PSI objective)", [i["text"]["objective"] or None for i in invs], long=True)
    set_row("pillars", "Fire-safety area", [[p for p in i["pillars"]] for i in invs])
    set_row("fuel_state", "Fuel state", [i["fuel_state"] for i in invs])
    set_row("materials", "Materials and fuels", [i["materials"] for i in invs],
            "Named in the PSI objective, approach or run table")
    text_row("geometry", "Sample or burner geometry", [i["geometry"] for i in invs])
    range_row("oxygen", "Oxygen level", "oxygen")
    range_row("pressure", "Pressure", "pressure")
    range_row("airflow", "Forced airflow", "airflow")
    text_row("gravity", "Gravity condition", [i["gravity"]["label"] for i in invs])
    set_row("suppressants", "Suppressant or diluent gases", [i["suppressants"] for i in invs])
    text_row("platform", "Platform", [i["platform"] for i in invs])
    set_row("facilities", "Facility", [i["facilities"] for i in invs])
    text_row("hardware", "Hardware (PSI wording)", [i["hardware"] for i in invs])
    set_row("sensors", "Sensors and diagnostics", [i["sensors"] for i in invs],
            "Named in the PSI record or run-table columns")
    measurements = []
    for i in invs:
        cols = []
        for t in i["tables"]:
            cols += [c["label"] for c in store.TABLES[t["id"]]["columns"] if c["numeric"] and not c.get("derived")]
        measurements.append(cols[:14])
    set_row("measurements", "Measured columns in run tables", measurements, "Numeric columns of the PSI run tables")
    text_row("runs", "Test rows in PSI run tables", [str(i["n_runs"]) if i["n_runs"] else None for i in invs])
    text_row("dates", "Investigation dates", [
        " to ".join(x for x in (i["start_date"], i["end_date"]) if x) or None for i in invs])
    text_row("pi", "Principal investigator", [i["pi"] for i in invs])
    text_row("pubs", "Publications listed in PSI", [str(len(i["publications"])) if i["publications"] else None
                                                    for i in invs])

    names = [i["short"] for i in invs]
    similar, different, missing = [], [], []
    for r in rows:
        if r["key"] in ("summary", "objective", "hardware", "pi", "dates", "pubs", "runs"):
            continue
        if r["status"] == "same":
            v = r["values"][0]
            shown = ", ".join(v) if isinstance(v, list) else v["text"] if isinstance(v, dict) else v
            similar.append(f"{r['label']}: all share {shown}")
        elif r["status"] == "overlap":
            if r["kind"] == "set":
                similar.append(f"{r['label']}: all include {', '.join(r['shared'])}")
            else:
                o = r["overlap"]
                lo = "" if o["min"] is None else f"{o['min']:g} to "
                similar.append(f"{r['label']}: tested ranges overlap at {lo}{o['max']:g} {o['unit']}")
        elif r["status"] == "different":
            parts = []
            for n, v in zip(names, r["values"]):
                shown = ", ".join(v) if isinstance(v, list) else v["text"] if isinstance(v, dict) else v
                parts.append(f"{n}: {shown}")
            different.append(f"{r['label']} differs ({'; '.join(parts)})")
        elif r["status"] in ("partial", "missing"):
            who = [n for n, v in zip(names, r["values"]) if not v]
            missing.append(f"{r['label']}: not reported for {', '.join(who)}")
    return {
        "investigations": [store.card(i) for i in invs], "rows": rows,
        "similar": similar, "different": different, "missing": missing,
    }
