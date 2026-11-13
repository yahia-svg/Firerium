"""Chart presets and the cross-investigation "test envelope".

Charts are drawn in the browser (Plotly) from PSI run-table rows served by the
API. A preset only names real columns; `verify()` checks them at startup, so a
chart can never be shown for a measurement the source table does not contain.
"""
from __future__ import annotations

from . import environments, store

PRESETS: list[dict] = [
    {"id": "flex-burn-o2", "table_id": "PSI-69:1", "type": "scatter",
     "x": "_oxygen", "y": "Burning rate; mm", "color": "Fuel",
     "title": "FLEX: droplet burning rate against ambient oxygen",
     "what": "Each point is one droplet test on the ISS. Higher on the chart means the droplet burned away faster.",
     "read": "Look at how the points shift as oxygen rises, and how the two fuels differ."},
    {"id": "flex-burn-co2", "table_id": "PSI-69:1", "type": "scatter",
     "x": "CO initial ambient composition; mole fraction", "y": "Burning rate; mm", "color": "Fuel",
     "title": "FLEX: burning rate as carbon dioxide is added",
     "what": "Carbon dioxide was added to the chamber as a suppressant. Zero on the x-axis means no CO2.",
     "read": "A falling trend to the right shows CO2 slowing the burning."},
    {"id": "flex-extinction", "table_id": "PSI-69:1", "type": "scatter",
     "x": "Droplet initial diameter; mm", "y": "Visible flame extinction diameter; mm", "color": "Test end",
     "title": "FLEX: droplet size when the visible flame went out",
     "what": "For each test, the starting droplet size and the droplet size at which the visible flame disappeared.",
     "read": "Points near zero burned almost completely; higher points extinguished early."},
    {"id": "cfig-ignition", "table_id": "PSI-159/CFI-G: inverse flames", "type": "scatter",
     "x": "XO2", "y": "approx p (bar)", "color": "Hot ignition",
     "title": "CFI-G inverse flames: where ignition happened",
     "what": "Each point is one test at a given oxygen fraction (in the burner gas) and chamber pressure, "
             "coloured by whether a hot flame ignited.",
     "read": "This run log includes the highest oxygen levels of any microgravity test in PSI (up to 0.85)."},
    {"id": "bass2-oxygen", "table_id": "PSI-25:1", "type": "histogram", "x": "_oxygen", "color": "PI",
     "title": "BASS-II: starting oxygen level of each burn",
     "what": "How many BASS-II tests started at each oxygen level. Oxygen was lowered by adding nitrogen.",
     "read": "All tests sit at or below about 22% oxygen: BASS-II probed low-oxygen limits, not enriched air."},
    {"id": "spice-flow", "table_id": "PSI-107:1", "type": "scatter",
     "x": "Air Rate (cm/s)", "y": "Fuel Rate (mg/s)", "color": "Fuel",
     "title": "SPICE: fuel flow against co-flow air speed",
     "what": "Each point is one recorded flame condition: how fast the surrounding air moved and how much fuel flowed.",
     "read": "Shows the range of airflow and fuel-flow conditions explored for each fuel."},
    {"id": "flamedesign-tad", "table_id": "PSI-10/Flame Design: normal flames", "type": "scatter",
     "x": "XO2 (init)", "y": "Tad (K)", "color": "Fuel",
     "title": "Flame Design normal flames: flame temperature against chamber oxygen",
     "what": "Calculated adiabatic flame temperature (Tad) for each test against the chamber's starting oxygen fraction.",
     "read": "Tad is a calculated value listed in the PSI table, not a direct temperature measurement."},
    {"id": "samer-aging", "table_id": "PSI-101:1", "type": "scatter",
     "x": "Inlet velocity (cm/s)", "y": "Net aging time (sec)", "color": "Sample Type",
     "title": "SAME-R: smoke aging time against inlet air speed",
     "what": "Test settings for each smoke run: the inlet air speed and how long the smoke aged before measurement.",
     "read": "These are test conditions (settings), useful for seeing which combinations were covered."},
]


def verify() -> None:
    bad = []
    for p in PRESETS:
        if "/" in p["table_id"]:  # "PSI-159/<table title>": resolve to the real table id
            inv_id, title = p["table_id"].split("/", 1)
            match = [t["id"] for t in store.TABLES.values() if t["investigation_id"] == inv_id and t["title"] == title]
            p["table_id"] = match[0] if match else p["table_id"]
        t = store.TABLES.get(p["table_id"])
        if not t:
            bad.append(f"{p['id']}: table {p['table_id']} missing")
            continue
        keys = {c["key"] for c in t["columns"]}
        for axis in ("x", "y", "color"):
            if p.get(axis) and p[axis] not in keys:
                bad.append(f"{p['id']}: column {p[axis]!r} not in {p['table_id']}")
    if bad:
        raise RuntimeError("Chart presets reference missing data:\n  " + "\n  ".join(bad))


def presets() -> list[dict]:
    out = []
    for p in PRESETS:
        t = store.TABLES[p["table_id"]]
        inv = store.INVS[t["investigation_id"]]
        out.append({**p, "investigation_id": inv["id"], "investigation": inv["short"], "table_title": t["title"]})
    return out


def table_list() -> list[dict]:
    out = []
    for t in store.TABLES.values():
        inv = store.INVS[t["investigation_id"]]
        out.append({"id": t["id"], "title": t["title"], "investigation_id": inv["id"], "investigation": inv["short"],
                    "n_rows": t["n_rows"], "numeric_columns": sum(1 for c in t["columns"] if c["numeric"]),
                    "columns": [{k: c.get(k) for k in ("key", "label", "numeric", "derived", "formula", "min", "max",
                                                        "filled", "distinct")}
                                for c in t["columns"]]})
    out.sort(key=lambda t: (store.sort_key(t["investigation_id"]), t["id"]))
    return out


def envelope() -> dict:
    """Every PSI run that reports oxygen (and pressure where available), for the
    'where has NASA tested?' chart, with the habitat atmospheres to overlay."""
    both, oxygen_only = [], []
    for r in store.RUNS:
        if r["oxygen"] is None:
            continue
        inv = store.INVS[r["investigation_id"]]
        point = {"id": inv["id"], "short": inv["short"], "oxygen": r["oxygen"], "pressure": r["pressure"],
                 "material": r["material"], "fuel_state": inv["fuel_state"][0].split(" ")[0],
                 "table_id": r["table_id"]}
        (both if r["pressure"] is not None else oxygen_only).append(point)
    notes = []
    for t in store.TABLES.values():
        for c in t["columns"]:
            if c.get("derived") and c["key"] == "_oxygen" and "Inverse" in (c.get("formula") or ""):
                notes.append(f"{store.INVS[t['investigation_id']]['short']} ({t['title']}): oxygen is the fraction "
                             f"in the gas leaving the burner, not the chamber atmosphere.")
    return {
        "points": both, "oxygen_only": oxygen_only,
        "environments": [environments.public_env(e) for e in environments.ENVIRONMENTS],
        "notes": notes,
        "explain": "Each point is one test row from a PSI run table that reports both an oxygen level and a "
                   "pressure. Shaded boxes are the cabin atmospheres of the habitats. Rows that report oxygen "
                   "but no pressure are listed separately.",
    }
