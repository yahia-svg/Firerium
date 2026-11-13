"""Habitable crew environments and the relevance ranking built on them.

The environments are the ones named in the NASA challenge: spacecraft, space
stations, bases on the lunar and Martian surfaces, and pressurized rovers.

IMPORTANT: the relevance score is this project's own method. It is not a NASA
score. Every factor is computed from fields in the shared database and the page
shows the formula, the weights, and a per-factor breakdown for each result.
"""
from __future__ import annotations

import math

from . import store

PSI_PER_ATM = 14.696

ENVIRONMENTS: dict[str, dict] = {
    "station": {
        "name": "Space station",
        "tagline": "ISS-like orbiting laboratory",
        "gravity": "microgravity", "g_label": "Microgravity",
        "oxygen": [20.0, 22.5], "pressure": [0.95, 1.05],
        "atmosphere_label": "About 21% O2 at 14.7 psia (Earth-like cabin air)",
        "atmosphere_basis": "PSI-20 (BRE) lists '14.7 psia, 21 % oxygen' among the atmospheres NASA considers for "
                            "human missions. The ISS cabin is kept close to sea-level air.",
        "assumption": None,
        "needs": [
            "Materials that do not sustain flame in ventilated microgravity (cabin fans keep air moving).",
            "Smoke detection that works when smoke does not rise and particles grow larger.",
            "Suppression that works without buoyancy to carry agent to the flame.",
        ],
        "weights": {"directness": 3, "gravity": 3, "oxygen": 2, "pressure": 1, "materials": 2, "airflow": 2, "data": 1},
    },
    "spacecraft": {
        "name": "Spacecraft in transit",
        "tagline": "Crew capsule or deep-space vehicle",
        "gravity": "microgravity", "g_label": "Microgravity",
        "oxygen": [21.0, 34.0], "pressure": [8.2 / PSI_PER_ATM, 1.0],
        "atmosphere_label": "From 21% O2 at 14.7 psia to 34% O2 at 8.2 psia, depending on mission phase",
        "atmosphere_basis": "PSI-20 (BRE) objective: 'NASA - considered atmosphere for human space missions will be "
                            "examined: 14.7 psia, 21 % oxygen: 10.2 psia, 26.5 %; and 8.2 psia, 34 % oxygen.'",
        "assumption": "The challenge text does not fix one cabin atmosphere for transit vehicles; we use the full span "
                      "of atmospheres NASA lists in PSI-20.",
        "needs": [
            "Flammability limits across both Earth-like and oxygen-enriched cabin atmospheres.",
            "Early detection: the crew cannot evacuate and return may take days.",
            "Understanding how a realistically large fire grows in a small sealed volume.",
        ],
        "weights": {"directness": 3, "gravity": 3, "oxygen": 3, "pressure": 2, "materials": 2, "airflow": 2, "data": 1},
    },
    "moon": {
        "name": "Moon Base",
        "tagline": "Lunar surface habitat",
        "gravity": "partial", "g_label": "Partial gravity (about 1/6 of Earth's)",
        "oxygen": [30.0, 36.0], "pressure": [8.2 / PSI_PER_ATM, 10.2 / PSI_PER_ATM],
        "atmosphere_label": "30% O2 or more, at 10.2 psia or less",
        "atmosphere_basis": "NASA challenge description: 'The intermediate oxygen concentration used on the Moon will "
                            "likely be 30% or greater, with a corresponding pressure of 10.2 psi or less.' The upper "
                            "end (34% at 8.2 psia) is the richest atmosphere listed in PSI-20.",
        "assumption": None,
        "needs": [
            "Material flammability at 30% oxygen or more, where materials are much more flammable than in air.",
            "Behaviour at reduced pressure (10.2 psia or less).",
            "Partial gravity: weak buoyancy returns, so neither Earth nor microgravity results apply directly.",
        ],
        "weights": {"directness": 3, "gravity": 2, "oxygen": 4, "pressure": 2, "materials": 3, "airflow": 1, "data": 1},
    },
    "rover": {
        "name": "Pressurized rover",
        "tagline": "Small mobile cabin on the Moon or Mars",
        "gravity": "partial", "g_label": "Partial gravity (Moon about 1/6 g, Mars about 3/8 g)",
        "oxygen": [30.0, 36.0], "pressure": [8.2 / PSI_PER_ATM, 10.2 / PSI_PER_ATM],
        "atmosphere_label": "30% O2 or more, at 10.2 psia or less (same as the Moon Base)",
        "atmosphere_basis": "NASA challenge description: 'it is expected that the Moon Base and pressurized rover(s) "
                            "will be at a pressure and oxygen concentration between those in a spacesuit and the "
                            "Earth's atmosphere.'",
        "assumption": None,
        "needs": [
            "Material flammability in oxygen-enriched, reduced-pressure air.",
            "Fast detection and suppression: a very small volume fills with smoke quickly.",
            "Partial gravity behaviour, for which PSI has no direct data yet.",
        ],
        "weights": {"directness": 3, "gravity": 2, "oxygen": 4, "pressure": 2, "materials": 3, "airflow": 1, "data": 1},
    },
    "mars": {
        "name": "Mars Base",
        "tagline": "Martian surface habitat",
        "gravity": "partial", "g_label": "Partial gravity (about 3/8 of Earth's)",
        "oxygen": [26.5, 34.0], "pressure": [8.2 / PSI_PER_ATM, 10.2 / PSI_PER_ATM],
        "atmosphere_label": "Assumed: 26.5% O2 at 10.2 psia to 34% O2 at 8.2 psia",
        "atmosphere_basis": "The exploration atmospheres NASA lists in the PSI-20 (BRE) objective.",
        "assumption": "The challenge text gives no cabin atmosphere for a Mars habitat. We assume the same "
                      "exploration atmospheres as for other suit-compatible habitats. Treat results as indicative.",
        "needs": [
            "Material flammability in oxygen-enriched, reduced-pressure air.",
            "Partial gravity (3/8 g): stronger buoyancy than on the Moon, still weaker than on Earth.",
            "Long stays far from help: prevention and reliable detection matter most.",
        ],
        "weights": {"directness": 3, "gravity": 2, "oxygen": 3, "pressure": 2, "materials": 3, "airflow": 1, "data": 1},
    },
}

FACTORS: dict[str, dict] = {
    "directness": {
        "label": "Fire-safety directness",
        "explain": "How directly NASA ties the investigation to spacecraft fire safety. 1.0 = named in the challenge "
                   "text as a prevention, detection or suppression study; 0.5 = given a specific fire-safety link "
                   "there or filed by PSI under spacecraft fire safety; 0 = other combustion science.",
    },
    "oxygen": {
        "label": "Oxygen match",
        "explain": "1.0 when the tested oxygen range reaches the environment's oxygen band; falls by 0.1 for every "
                   "percentage point of gap; 0 when PSI reports no oxygen level.",
    },
    "pressure": {
        "label": "Pressure match",
        "explain": "1.0 when the tested pressure range reaches the environment's pressure band; falls by 0.25 for "
                   "every 0.1 atm of gap; 0 when PSI reports no pressure.",
    },
    "gravity": {
        "label": "Gravity relevance",
        "explain": "For microgravity environments: 1.0 for flight tests, 0.4 for ground analysis. For partial-gravity "
                   "environments no PSI investigation was run at that gravity, so flight tests score 0.6 (the "
                   "challenge notes microgravity and normal-gravity results can bound partial gravity), E-FIELD "
                   "Flames scores 0.85 (it mimicked partial gravity), ground analysis 0.4.",
    },
    "materials": {
        "label": "Cabin-material relevance",
        "explain": "1.0 for solid materials (fabrics, plastics); 0.8 for gas burners built to emulate solids, and "
                   "for smoke from overheated solids; 0.4 for liquid droplets; 0.3 for gas flames and dust.",
    },
    "airflow": {
        "label": "Ventilation data",
        "explain": "1.0 when a forced-airflow speed is reported (ventilation matters in a cabin), otherwise 0.",
    },
    "data": {
        "label": "Run data available",
        "explain": "Grows with the number of test rows in the PSI run tables (log scale, 1.0 at 300 rows or more).",
    },
    "focus": {
        "label": "Matches chosen safety focus",
        "explain": "1.0 when the investigation belongs to the fire-safety area you selected, otherwise 0.",
    },
}


def band_score(cond: dict | None, band: list[float], per_unit: float) -> tuple[float, str]:
    if cond is None:
        return 0.0, "Not reported in PSI"
    lo = cond["min"] if cond["min"] is not None else cond["max"]
    hi = cond["max"]
    unit = cond["unit"]
    tested = f"{lo:g} to {hi:g} {unit}" if abs(hi - lo) > 1e-9 else f"{hi:g} {unit}"
    if cond["min"] is None:
        tested = f"up to {hi:g} {unit}"
        lo = float("-inf")
    target = f"{band[0]:g} to {band[1]:g} {unit}"
    if hi >= band[0] and lo <= band[1]:
        return 1.0, f"Tested {tested}; reaches the target band {target}"
    gap = band[0] - hi if hi < band[0] else lo - band[1]
    score = max(0.0, 1 - gap * per_unit)
    return score, f"Tested {tested}; {gap:.2g} {unit.split(' ')[0] if unit != '% O2' else 'points'} outside the target band {target}"


def factor_values(inv: dict, env: dict, focus: str | None) -> dict[str, dict]:
    out: dict[str, dict] = {}
    d = inv["directness"]
    out["directness"] = {"value": (d - 1) / 2, "why": {
        3: "Named in the NASA challenge text as a core fire-safety study",
        2: "Specific fire-safety link in the challenge text or PSI sub-area",
        1: "General combustion science (indirect relevance)"}[d]}

    v, why = band_score(inv["conditions"]["oxygen"], env["oxygen"], 0.1)
    out["oxygen"] = {"value": v, "why": why}
    c = inv["conditions"]["pressure"]
    if c:
        rounded = {**c, "min": None if c["min"] is None else round(c["min"], 2), "max": round(c["max"], 2)}
        band = [round(env["pressure"][0], 2), round(env["pressure"][1], 2)]
        v, why = band_score(rounded, band, 2.5)
    else:
        v, why = 0.0, "Not reported in PSI"
    out["pressure"] = {"value": v, "why": why}

    flight = inv["gravity"]["level"] == "microgravity"
    if env["gravity"] == "microgravity":
        out["gravity"] = ({"value": 1.0, "why": "Flight test in microgravity, the same gravity as this environment"}
                          if flight else {"value": 0.4, "why": "Ground-based analysis or modeling, not a flight test"})
    elif inv["id"] == "PSI-22":
        out["gravity"] = {"value": 0.85, "why": "Mimicked partial gravity with an electric field (NASA challenge text)"}
    elif flight:
        out["gravity"] = {"value": 0.6, "why": "Microgravity only; no partial-gravity test exists in PSI, so this "
                                               "bounds the behaviour rather than matching it"}
    else:
        out["gravity"] = {"value": 0.4, "why": "Ground-based analysis; no partial-gravity test exists in PSI"}

    fs = " ".join(inv["fuel_state"])
    if fs.startswith("solid") and "smoke" not in fs:
        m = (1.0, "Solid materials such as fabrics and plastics")
    elif "smoke" in fs:
        m = (0.8, "Smoke from overheated solid spacecraft materials")
    elif inv.get("emulates"):
        m = (0.8, "Gas burner designed to emulate burning solids and liquids")
    elif "liquid" in fs:
        m = (0.4, "Liquid fuel droplets, not cabin materials")
    else:
        m = (0.3, "Gas flames or dust, not cabin materials")
    out["materials"] = {"value": m[0], "why": m[1]}

    a = inv["conditions"]["airflow"]
    out["airflow"] = ({"value": 1.0, "why": f"Forced airflow reported (up to {a['max']:g} {a['unit']})"}
                      if a else {"value": 0.0, "why": "No forced-airflow speed reported in PSI"})
    n = inv["n_runs"]
    out["data"] = {"value": min(1.0, math.log10(1 + n) / math.log10(301)),
                   "why": f"{n} test rows in PSI run tables" if n else "No run table in PSI"}
    if focus:
        hit = focus in inv["pillars"]
        out["focus"] = {"value": 1.0 if hit else 0.0,
                        "why": f"{'Covers' if hit else 'Does not cover'} {focus}"}
    return out


def rank(env_id: str, weights: dict[str, float] | None, focus: str | None, filters: dict) -> dict:
    env = ENVIRONMENTS[env_id]
    w = dict(env["weights"])
    if focus:
        w["focus"] = 8
    for k, v in (weights or {}).items():
        if k in FACTORS and (k != "focus" or focus):
            w[k] = max(0.0, float(v))
    total_w = sum(w.values()) or 1.0
    results = []
    for inv in store.apply_filters(filters):
        fv = factor_values(inv, env, focus)
        breakdown = []
        score = 0.0
        for k, weight in w.items():
            contrib = weight * fv[k]["value"] / total_w * 100
            score += contrib
            breakdown.append({"factor": k, "label": FACTORS[k]["label"], "value": round(fv[k]["value"], 3),
                              "weight": weight, "points": round(contrib, 1),
                              "max_points": round(weight / total_w * 100, 1), "why": fv[k]["why"]})
        breakdown.sort(key=lambda b: -b["points"])
        results.append({"investigation": store.card(inv), "score": round(score, 1), "breakdown": breakdown})
    results.sort(key=lambda r: (-r["score"], store.sort_key(r["investigation"]["id"])))
    for i, r in enumerate(results):
        r["rank"] = i + 1
    return {
        "environment": public_env(env_id), "weights": w, "focus": focus,
        "factors": {k: FACTORS[k] for k in w},
        "method": "score = 100 x sum(weight x factor value) / sum(weights). Factor values run from 0 to 1. "
                  "Weights are project choices you can change; this is not an official NASA score.",
        "results": results,
    }


def public_env(env_id: str) -> dict:
    e = ENVIRONMENTS[env_id]
    return {"id": env_id, **{k: e[k] for k in (
        "name", "tagline", "gravity", "g_label", "oxygen", "pressure", "atmosphere_label",
        "atmosphere_basis", "assumption", "needs", "weights")}}


def environment_facts(env_id: str) -> dict:
    """Counted facts behind the environment summary (used by both the AI and the fallback text)."""
    env = ENVIRONMENTS[env_id]
    invs = list(store.INVS.values())
    flights = [i for i in invs if i["gravity"]["level"] == "microgravity"]
    o2_hit = [i for i in invs if store.overlaps(i["conditions"]["oxygen"], env["oxygen"][0], env["oxygen"][1])]
    o2_solid = [i for i in o2_hit if any(f.startswith("solid") for f in i["fuel_state"])]
    p_hit = [i for i in invs if store.overlaps(i["conditions"]["pressure"], env["pressure"][0], env["pressure"][1])]
    both = [i for i in o2_hit if i in p_hit]
    solid_o2_max = max((i["conditions"]["oxygen"]["max"] for i in invs
                        if i["conditions"]["oxygen"] and any(f.startswith("solid") for f in i["fuel_state"])),
                       default=None)
    ranked = rank(env_id, None, None, {})["results"]
    by_pillar = {p: [i["id"] for i in invs if p in i["pillars"] and i["directness"] >= 2]
                 for p in ("prevention", "detection", "suppression")}
    return {
        "environment": public_env(env_id),
        "total": len(invs), "flight": len(flights),
        "partial_gravity_tests": 0,
        "oxygen_in_band": [i["id"] for i in o2_hit],
        "oxygen_in_band_solids": [i["id"] for i in o2_solid],
        "pressure_in_band": [i["id"] for i in p_hit],
        "oxygen_and_pressure_in_band": [i["id"] for i in both],
        "highest_oxygen_tested_on_solids": solid_o2_max,
        "oxygen_not_reported": [i["id"] for i in invs if not i["conditions"]["oxygen"]],
        "by_pillar": by_pillar,
        "top": [{"id": r["investigation"]["id"], "short": r["investigation"]["short"], "score": r["score"]}
                for r in ranked[:6]],
    }
