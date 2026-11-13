"""Research Gaps: what the collected investigations cover and what is missing.

Everything here is counted from the shared database for the investigations
that pass the reader's filters. A gap means "not represented in this project
collection"; it is never a claim that no such research exists anywhere.
The suggested questions are the project team's, derived from the counts.
"""
from __future__ import annotations

import re

from . import assistant, environments, insights, store

E = insights.E
NONE_LABEL = "Not represented in this project collection"

FUEL_TYPES = [
    ("Solid materials (fabrics, plastics)", "Samples of solid material that burn with a flame."),
    ("Smoke from overheated solids", "Solid samples heated until they smoke, for smoke-detector studies."),
    ("Gas burner emulating solids and liquids", "A gas flame built to behave like a burning solid or liquid."),
    ("Liquid fuel droplets", "Single droplets of liquid fuel."),
    ("Gas flames", "Flames of gaseous fuels such as methane or ethylene."),
    ("Dust and test aerosols (no flame)", "Particles used to test instruments; nothing burns."),
]
GRAVITY = [
    ("Microgravity flight test", "Run in orbit, in free fall."),
    ("Ground-based analysis of flight data", "Modeling or re-analysis on Earth of data from earlier flights."),
    ("Earth-gravity (1 g) values in the PSI run table", "The run table lists the same sample burned in normal gravity."),
    ("Partial-gravity analogue (electric field)", "Partial gravity imitated in orbit; not a true partial-gravity test."),
    ("Partial gravity (Moon 1/6 g, Mars 3/8 g)", "Run at lunar or Martian gravity."),
]
# label, low (inclusive), high (exclusive); None = open
OXYGEN = [
    ("Below 20% (reduced oxygen)", None, 20.0),
    ("20 to 22.5% (air-like cabin)", 20.0, 22.5001),
    ("22.5 to 30% (enriched)", 22.5001, 30.0),
    ("30% or more (Moon Base and exploration atmospheres)", 30.0, None),
]
PRESSURE = [
    ("10.2 psia or less (up to 0.71 atm)", None, 0.71),
    ("0.71 to 0.95 atm", 0.71, 0.95),
    ("About 1 atm (0.95 to 1.05)", 0.95, 1.0501),
    ("Above 1.05 atm", 1.0501, None),
]
AIRFLOW = [
    ("Up to 10 cm/s", None, 10.0001),
    ("10 to 30 cm/s", 10.0001, 30.0001),
    ("Above 30 cm/s", 30.0001, None),
]
UNREPORTED = "Not reported in the PSI record or run table"
PILLARS = [("prevention", "Prevention"), ("detection", "Detection"), ("suppression", "Suppression"),
           ("fundamental", "Combustion science")]

CHALLENGE_PARTIAL = [
    E("CHALLENGE", "Partial-gravity data", "there is currently no partial-gravity combustion data available in PSI"),
    E("CHALLENGE", "Partial-gravity data", "We expect such data will be added in the future, for example from the Lunar-g Combustion Investigation (LUCI) and the Flammability of Materials on the Moon (FM2) experiment."),
    E("CHALLENGE", "Partial-gravity data", "Microgravity and normal-gravity results could bound what occurs at intermediate gravity levels."),
    # NASA's Combustion Science page (official resource) on the experiment the challenge text expects data from
    E("RES-2", None, "FM2 is the first-ever combustion experiment to be performed on another planetary body."),
    E("RES-2", None, "FM2 investigates burning materials on the Moon at its 1/6 reduced gravity level."),
    E("RES-4", None, "In the low-flow conditions of microgravity or partial gravity, some materials are flammable at lower oxygen concentrations than in normal gravity (Figure 8)."),
]
CHALLENGE_OXYGEN = [
    E("CHALLENGE", "Spacesuits and oxygen concentration", "The intermediate oxygen concentration used on the Moon will likely be 30% or greater, with a corresponding pressure of 10.2 psi or less."),
    E("CHALLENGE", "Background: prevention, detection, suppression", "Flammability studies focus on solid materials such as fabrics and plastics"),
]
CHALLENGE_SUPPRESSION = [
    E("CHALLENGE", "Background: detection and suppression studies", "Suppression was studied in the Flame Extinguishment Experiment (FLEX) through dilution of the chamber atmosphere with carbon dioxide and helium, both of which suppress fire."),
    E("CHALLENGE", "Earth applications", "Fine-water-mist extinguishers developed for use on the ISS have practical applications here on Earth"),
]
CHALLENGE_DETECTION = [
    E("CHALLENGE", "Background: detection and suppression studies", "Fire detection was tested in microgravity through the Smoke and Aerosol Measurement Experiment studies (SAME and SAME-R)."),
]


def verify() -> None:
    quoted = insights.usable(CHALLENGE_PARTIAL + CHALLENGE_OXYGEN + CHALLENGE_SUPPRESSION + CHALLENGE_DETECTION)
    bad = [f"{e['source']}: {e['quote'][:70]}" for e in quoted if not insights.quote_ok(e)]
    if bad:
        raise RuntimeError("Research-gap quotes not found in their NASA source:\n  " + "\n  ".join(bad))


# ---------------------------------------------------------------- classification
def fuel_types(inv: dict) -> list[str]:
    out = []
    for f in inv["fuel_state"]:
        if f.startswith("solid"):
            out.append(FUEL_TYPES[1][0] if "smoke" in f else FUEL_TYPES[0][0])
        elif f.startswith("liquid"):
            out.append(FUEL_TYPES[3][0])
        elif f.startswith("gas"):
            out.append(FUEL_TYPES[2][0] if inv.get("emulates") else FUEL_TYPES[4][0])
        else:
            out.append(FUEL_TYPES[5][0])
    return list(dict.fromkeys(out))


def _has_1g_column(inv: dict) -> bool:
    for t in inv["tables"]:
        for c in store.TABLES[t["id"]]["columns"]:
            if re.search(r"\b1-?g\b", c["key"], re.I):
                return True
    return False


def gravity_cells(inv: dict) -> list[str]:
    out = [GRAVITY[0][0] if inv["gravity"]["level"] == "microgravity" else GRAVITY[1][0]]
    if _has_1g_column(inv):
        out.append(GRAVITY[2][0])
    if "partial-gravity analogue" in inv["topics"]:
        out.append(GRAVITY[3][0])
    return out


def _in(v: float, lo: float | None, hi: float | None) -> bool:
    return (lo is None or v >= lo) and (hi is None or v < hi)


def band_cells(inv: dict, param: str, bands: list[tuple]) -> tuple[list[str], dict[str, int]]:
    """Bands an investigation tested in. Uses the individual test rows where the run table gives
    the value; otherwise the range quoted from the PSI record."""
    cond = inv["conditions"][param]
    if not cond:
        return [UNREPORTED], {}
    values = [r[param] for r in store.RUNS if r["investigation_id"] == inv["id"] and r[param] is not None]
    runs = {label: sum(1 for v in values if _in(v, lo, hi)) for label, lo, hi in bands}
    if values:
        return [label for label, _, _ in bands if runs[label]], {k: v for k, v in runs.items() if v}
    out = []
    for label, lo, hi in bands:
        top = None if hi is None else hi - 1e-6
        if store.overlaps(cond, lo, top):
            out.append(label)
    return out, {}


def classify(inv: dict) -> dict:
    solid = any(f.startswith("solid") for f in inv["fuel_state"])
    dims: dict[str, list[str]] = {"fuel": fuel_types(inv), "gravity": gravity_cells(inv)}
    runs: dict[str, dict[str, int]] = {}
    for key, param, bands in (("oxygen", "oxygen", OXYGEN), ("pressure", "pressure", PRESSURE),
                              ("airflow", "airflow", AIRFLOW)):
        dims[key], runs[key] = band_cells(inv, param, bands)
    dims["material"] = inv["materials"] if solid else []
    dims["fuels"] = [] if solid else inv["materials"]
    dims["topic"] = inv["topics"]
    dims["pillar"] = [dict(PILLARS)[p] for p in inv["pillars"]]
    return {"id": inv["id"], "short": inv["short"], "n_runs": inv["n_runs"], "dims": dims, "runs": runs}


def _status(n: int) -> str:
    return "none" if n == 0 else "thin" if n <= 2 else "covered"


def _dimension(dim_id: str, title: str, explain: str, items: list[dict], fixed: list[tuple] | None,
               unreported: bool = False) -> dict:
    labels = [(c[0], c[1] if len(c) == 2 and isinstance(c[1], str) else None) for c in fixed] if fixed else None
    if labels is None:
        seen: dict[str, int] = {}
        for it in items:
            for label in it["dims"][dim_id]:
                seen[label] = seen.get(label, 0) + 1
        labels = [(k, None) for k, _ in sorted(seen.items(), key=lambda kv: (-kv[1], kv[0]))]
    if unreported:
        labels = labels + [(UNREPORTED, None)]
    cells = []
    for label, hint in labels:
        members = [it for it in items if label in it["dims"][dim_id]]
        cell = {"label": label, "hint": hint, "count": len(members),
                "ids": [{"id": m["id"], "short": m["short"]} for m in members],
                "status": "unreported" if label == UNREPORTED else _status(len(members))}
        rows = sum(m["runs"].get(dim_id, {}).get(label, 0) for m in members)
        if dim_id in ("oxygen", "pressure", "airflow") and label != UNREPORTED:
            cell["runs"] = rows
        cells.append(cell)
    return {"id": dim_id, "title": title, "explain": explain, "cells": cells, "fixed": bool(fixed)}


def _ids(invs: list[dict]) -> list[str]:
    return [i["id"] for i in sorted(invs, key=lambda i: store.sort_key(i["id"]))]


def _names(invs: list[dict], limit: int = 6) -> str:
    ids = _ids(invs)
    if not ids:
        return "none"
    return " ".join(f"[{i}]" for i in ids[:limit]) + (f" and {len(ids) - limit} more" if len(ids) > limit else "")


# ---------------------------------------------------------------- headline gaps
def headlines(pool: list[dict]) -> tuple[list[dict], list[dict]]:
    total = len(pool)
    solid = [i for i in pool if i["fuel_state"][0] == "solid"]
    smoke = [i for i in pool if "detection" in i["pillars"] and i["gravity"]["level"] == "microgravity"]
    out: list[dict] = []
    questions: list[dict] = []
    dec = lambda evs: [insights._decorate(e) for e in insights.usable(evs)]  # noqa: E731

    # 1. partial gravity
    analogue = [i for i in pool if "partial-gravity analogue" in i["topics"]]
    with_1g = [i for i in pool if _has_1g_column(i)]
    out.append({
        "id": "partial-gravity", "kind": "none", "title": "No experiment was run in partial gravity",
        "text": f"None of the {total} selected investigations ran at lunar (1/6 g) or Martian (3/8 g) gravity. "
                + (f"The closest is {_names(analogue)}, which imitated partial gravity with an electric field. "
                   if analogue else "")
                + (f"{_names(with_1g)} lists Earth-gravity values beside the microgravity ones, which gives the "
                   "two ends that partial gravity lies between." if with_1g else ""),
        "ids": _ids(analogue + [i for i in with_1g if i not in analogue]),
        "evidence": dec(CHALLENGE_PARTIAL), "to": "/lessons#gravity", "link": "Earth vs. microgravity explained",
    })
    questions.append({
        "because": "partial-gravity",
        "question": "How do flame spread and extinction limits of cabin materials change at 1/6 g and 3/8 g, "
                    "between the microgravity and Earth-gravity results that exist today?",
        "closest": _ids(analogue + with_1g),
    })

    # 2. solids in exploration atmospheres
    if solid:
        hit = [i for i in solid if store.overlaps(i["conditions"]["oxygen"], 30, None)]
        reported = [i for i in solid if i["conditions"]["oxygen"]]
        top = max((i["conditions"]["oxygen"]["max"] for i in reported), default=None)
        others = [i for i in pool if i not in solid and store.overlaps(i["conditions"]["oxygen"], 30, None)]
        if not hit:
            out.append({
                "id": "solids-high-oxygen", "kind": "none",
                "title": "No solid material was burned at Moon Base oxygen levels",
                "text": f"{len(solid)} selected investigations study solid materials, and none reports a test at 30% "
                        f"oxygen or more. "
                        + (f"The highest oxygen level reported for solids is {top:g}% ({_names([i for i in reported if i['conditions']['oxygen']['max'] == top])}). " if top is not None else "None of them reports an oxygen level at all. ")
                        + (f"Tests that do reach 30% used gas flames or liquid droplets: {_names(others)}." if others else ""),
                "ids": _ids(reported + others), "evidence": dec(CHALLENGE_OXYGEN),
                "to": "/charts?view=envelope", "link": "See every test against the habitat atmospheres",
            })
            questions.append({
                "because": "solids-high-oxygen",
                "question": "At 30 to 36% oxygen and 10.2 psia or less, which cabin fabrics and plastics still "
                            "self-extinguish, and how fast does flame spread on those that do not?",
                "closest": _ids(reported + others[:3]),
            })
        no_p = [i for i in solid if not i["conditions"]["pressure"]]
        if len(no_p) == len(solid):
            out.append({
                "id": "solids-pressure", "kind": "unreported",
                "title": "No solid-material investigation reports its test pressure",
                "text": f"None of the {len(solid)} solid-material investigations gives a pressure in its PSI record or "
                        "run table, so they cannot be matched to a reduced-pressure cabin (10.2 psia or less).",
                "ids": _ids(solid), "evidence": [], "to": "/explorer?fuel_state=solid",
                "link": "Open the solid-material experiments",
            })

    # 3. conditions that are not reported
    rep = {p: [i for i in pool if i["conditions"][p]] for p in ("oxygen", "pressure", "airflow")}
    out.append({
        "id": "unreported", "kind": "unreported", "title": "Many records do not state their test conditions",
        "text": f"Of the {total} selected investigations, {len(rep['oxygen'])} report an oxygen level, "
                f"{len(rep['pressure'])} a pressure and {len(rep['airflow'])} a forced-airflow speed in the PSI "
                "record or run table. The others may have recorded these values elsewhere (for example in "
                "publications), but they cannot be filtered, ranked or charted here.",
        "ids": [], "evidence": [], "to": "/explorer", "link": "Filter the experiments by condition",
    })

    # 4. detection in enriched atmospheres
    if smoke:
        with_o2 = [i for i in smoke if i["conditions"]["oxygen"] or i["conditions"]["pressure"]]
        if not with_o2:
            out.append({
                "id": "detection-atmosphere", "kind": "none",
                "title": "Smoke detection is not represented for oxygen-enriched cabins",
                "text": f"The {len(smoke)} selected flight investigations that inform fire detection ({_names(smoke)}) "
                        "report no oxygen level or pressure, so nothing here shows how smoke particles or "
                        "detectors behave in a 30% oxygen, reduced-pressure cabin.",
                "ids": _ids(smoke), "evidence": dec(CHALLENGE_DETECTION), "to": "/insights#detection",
                "link": "Fire detection insights",
            })
            questions.append({
                "because": "detection-atmosphere",
                "question": "Do smoke particle sizes and smoke-detector response change in an oxygen-enriched, "
                            "reduced-pressure cabin, and in partial gravity where smoke rises slowly?",
                "closest": _ids(smoke),
            })

    # 5. suppression agents by fuel type
    supp = [i for i in pool if "suppression" in i["pillars"]]
    if supp:
        agents = {"carbon dioxide": "Carbon dioxide", "helium": "Helium", "nitrogen": "Nitrogen",
                  "sf6": "SF6", "water": "Water mist"}
        table = []
        for key, label in agents.items():
            users = [i for i in supp if any(key in s.lower() for s in i["suppressants"])]
            table.append({"agent": label, "fuel_types": sorted({ft for i in users for ft in fuel_types(i)}),
                          "ids": _ids(users)})
        used = "; ".join(f"{r['agent']} on {', '.join(r['fuel_types']).lower()}" for r in table if r["ids"])
        missing = [r["agent"] for r in table if not r["ids"]]
        out.append({
            "id": "suppression-agents", "kind": "thin",
            "title": "Each suppression agent was tested on one kind of fuel",
            "text": f"{len(supp)} selected investigations deal with suppression ({_names(supp)}). Agents recorded, "
                    f"and what they were tested on: {used or 'none'}. No agent was tested on both solid materials "
                    f"and droplets, so the results cannot be compared across fuel types. "
                    + (f"{', '.join(missing)}: {NONE_LABEL.lower()}." if missing else ""),
            "ids": _ids(supp), "evidence": dec(CHALLENGE_SUPPRESSION), "table": table,
            "to": "/insights#suppression", "link": "Fire suppression insights",
        })
        questions.append({
            "because": "suppression-agents",
            "question": "Do the carbon dioxide and helium suppression limits measured on fuel droplets carry over "
                        "to burning solid materials, and how do they shift at 30% oxygen or more?",
            "closest": _ids(supp),
        })

    # 6. large-scale fires
    large = [i for i in pool if "large-scale fire" in i["topics"]]
    if large:
        rows = sum(i["n_runs"] for i in large)
        o2 = [i["conditions"]["oxygen"] for i in large if i["conditions"]["oxygen"]]
        out.append({
            "id": "large-scale", "kind": "thin", "title": "Large fires: very few samples",
            "text": f"The large-scale fire tests in this selection ({_names(large)}) list {rows} sample rows in total"
                    + (f", at {min(c['min'] if c['min'] is not None else c['max'] for c in o2):g} to "
                       f"{max(c['max'] for c in o2):g}% oxygen" if o2 else "")
                    + ". How a large fire grows in an oxygen-enriched cabin is not represented.",
            "ids": _ids(large), "evidence": [], "to": f"/compare?ids={','.join(_ids(large)[:4])}" if len(large) > 1
            else f"/explorer/{large[0]['id']}", "link": "Look at these experiments",
        })
        questions.append({
            "because": "large-scale",
            "question": "How quickly does a realistic-size fire grow, and how much heat and smoke does it "
                        "release, in a small sealed cabin at exploration-atmosphere oxygen levels?",
            "closest": _ids(large),
        })
    return out, questions


# ---------------------------------------------------------------- habitat fit
def habitat_fit(env_id: str, pool: list[dict]) -> dict:
    env = environments.ENVIRONMENTS[env_id]
    o_lo, o_hi = env["oxygen"]
    p_lo, p_hi = env["pressure"]
    o2 = [i for i in pool if store.overlaps(i["conditions"]["oxygen"], o_lo, o_hi)]
    pr = [i for i in pool if store.overlaps(i["conditions"]["pressure"], p_lo, p_hi)]
    both = [i for i in o2 if i in pr]
    solids = [i for i in o2 if i["fuel_state"][0] == "solid"]
    flow = [i for i in o2 if i["conditions"]["airflow"]]
    if env["gravity"] == "microgravity":
        grav = [i for i in pool if i["gravity"]["level"] == "microgravity"]
        grav_label = "Run at this gravity level (microgravity flight)"
    else:
        grav, grav_label = [], f"Run at this gravity level: {env['g_label']}"
    rows = [
        (f"Tested inside the oxygen band ({o_lo:g} to {o_hi:g}%)", o2),
        (f"Tested inside the pressure band ({p_lo:.2f} to {p_hi:.2f} atm)", pr),
        ("Inside both the oxygen and the pressure band", both),
        ("Solid cabin materials inside the oxygen band", solids),
        ("Inside the oxygen band with forced airflow reported", flow),
        (grav_label, grav),
    ]
    return {"environment": environments.public_env(env_id),
            "rows": [{"label": label, "count": len(v), "status": _status(len(v)),
                      "ids": [{"id": i["id"], "short": i["short"]} for i in sorted(v, key=lambda i: store.sort_key(i["id"]))]}
                     for label, v in rows]}


def analyse(filters: dict, env_id: str | None = None) -> dict:
    pool = store.apply_filters(filters)
    items = [classify(i) for i in pool]
    dims = [
        _dimension("gravity", "Gravity condition", "Where and how each investigation was run.", items, GRAVITY),
        _dimension("fuel", "What was burned", "The kind of fuel or sample.", items, FUEL_TYPES),
        _dimension("oxygen", "Oxygen level tested",
                   "Counted from individual test rows where the PSI run table gives oxygen, otherwise from the "
                   "range quoted in the PSI record.", items, OXYGEN, unreported=True),
        _dimension("pressure", "Pressure tested", "10.2 psia (0.69 atm) is the expected Moon Base cabin pressure; "
                   "tests logged at a nominal 0.7 atm are counted in the first band.", items, PRESSURE, unreported=True),
        _dimension("airflow", "Forced airflow tested", "Ventilation speed past the sample.", items, AIRFLOW,
                   unreported=True),
        _dimension("pillar", "Fire-safety area", "Which part of fire safety the investigation informs.", items,
                   [(label,) for _, label in PILLARS]),
        _dimension("material", "Solid materials", "Materials named in solid-material and smoke investigations.",
                   items, None),
        _dimension("fuels", "Gas and liquid fuels, test aerosols",
                   "Fuels and test substances named in the investigations that did not burn solid samples.", items, None),
        _dimension("topic", "Research topic", "Topics assigned by the project team from each PSI record.", items, None),
    ]
    heads, questions = headlines(pool) if pool else ([], [])
    ev = insights.payload()["earth_vs_micro"]
    return {
        "basis": {
            "selected": len(pool), "total": len(store.INVS), "filters": assistant.describe_filters(filters),
            "runs": sum(i["n_runs"] for i in pool), "built_at": store.META.get("built_at"),
            "source": "NASA Physical Sciences Informatics (PSI), combustion-science investigations",
        },
        "disclaimer": "A gap on this page means 'not represented in this project collection': the "
                      f"{len(store.INVS)} combustion-science investigations in NASA PSI, as recorded in their PSI "
                      "pages and run tables. It does not prove that no such research exists anywhere. Publications, "
                      "ground tests and newer missions outside PSI are not counted.",
        "none_label": NONE_LABEL,
        "legend": {"none": NONE_LABEL, "thin": "Little data (one or two investigations)",
                   "covered": "Represented (three or more investigations)",
                   "unreported": "Value not reported, so coverage is unknown"},
        "headlines": heads, "questions": questions,
        "questions_note": "These questions are the project team's suggestions, derived from the counts on this "
                          "page. They are not NASA's stated research plans.",
        "dimensions": dims, "items": items,
        "habitat": habitat_fit(env_id, pool) if env_id else None,
        "not_comparable": {
            "text": "Earth and microgravity results cannot simply be swapped for one another. Each row is a way "
                    "they differ, with the NASA text it rests on.",
            "points": ev["points"],
            "with_1g_values": [{"id": i["id"], "short": i["short"]} for i in pool if _has_1g_column(i)],
        },
    }
