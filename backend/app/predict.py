"""One simple predictive model and the What-If test built on it.

Question: how fast does a fuel droplet burn in microgravity for a given
atmosphere? Target = the burning-rate constant in the PSI FLEX run log
(PSI-69), inputs = fuel, oxygen, carbon dioxide, helium, pressure and initial
droplet diameter from the same rows.

Rules this module enforces (from the project guide):
- The model is tested on data it was not trained on. Folds are split by test
  day, so tests run on the same day never sit on both sides of a split.
- It is only offered if it clearly beats a no-model baseline. Otherwise
  `available` is False and the page shows charts and evidence instead.
- A What-If request is answered across the whole form range, with a confidence
  score that falls as the request moves away from the real FLEX tests (and an
  error band that widens with it). Outside the tested ranges the answer is an
  extrapolation and is labelled as one. Only a physically impossible request
  (a gas mixture above 100%) gets no number.
- Every output is labelled a model prediction, never a NASA measurement.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd
from sklearn.linear_model import RidgeCV
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from . import store

VERSION = "flex-burning-rate-ridge-1"
TABLE_ID = "PSI-69:1"
LABEL = "Model prediction, not a NASA measurement"
TARGET = {"key": "rate", "column": "Burning rate; mm", "label": "Droplet burning rate", "unit": "mm²/s"}
FUELS = ("Methanol", "Heptane")
REQUIRED_GAIN = 0.20  # the model must cut the baseline's error by at least this share
N_SPLITS = 5

# key, label, unit, source column, factor applied to the PSI value, step for the form, decimals
INPUTS = [
    ("oxygen", "Oxygen", "% by volume", "O initial ambient composition; mole fraction", 100.0, 1.0, 0),
    ("co2", "Carbon dioxide", "% by volume", "CO initial ambient composition; mole fraction", 100.0, 5.0, 0),
    ("helium", "Helium", "% by volume", "He initial ambient composition; mole fraction", 100.0, 5.0, 0),
    ("pressure", "Pressure", "atm", "_pressure", 1.0, 0.05, 2),
    ("diameter", "Initial droplet diameter", "mm", "Droplet initial diameter; mm", 1.0, 0.1, 1),
]
KEYS = [i[0] for i in INPUTS]
DEFAULTS = {"oxygen": 21.0, "co2": 0.0, "helium": 0.0, "pressure": 1.0, "diameter": 3.0}

STATE: dict = {"available": False, "reason": "The model has not been built yet."}


def _frame() -> tuple[pd.DataFrame, int]:
    t = store.TABLES[TABLE_ID]
    raw = pd.DataFrame(t["rows"])
    df = pd.DataFrame({key: pd.to_numeric(raw[col], errors="coerce") * factor
                       for key, _, _, col, factor, _, _ in INPUTS})
    df["rate"] = pd.to_numeric(raw[TARGET["column"]], errors="coerce")
    df["fuel"] = raw["Fuel"]
    df["day"] = raw["Test Date"]
    df["test"] = raw["FLEX Identifier"]
    df["end"] = raw["Test end"]
    used = df.dropna(subset=KEYS + ["rate"]).reset_index(drop=True)
    return used, len(df)


def _matrix(df: pd.DataFrame) -> np.ndarray:
    return np.column_stack([(df["fuel"] == "Heptane").astype(float)] + [df[k].to_numpy(float) for k in KEYS])


def _make():
    return make_pipeline(StandardScaler(), RidgeCV(alphas=np.logspace(-3, 3, 13)))


def build() -> None:
    """Train and evaluate. Called once at server start (257 rows, well under a second)."""
    STATE.clear()
    df, n_all = _frame()
    X, y, days = _matrix(df), df["rate"].to_numpy(float), df["day"].to_numpy()
    n_days = len(set(days))
    if len(df) < 60 or n_days < 2 * N_SPLITS:
        STATE.update(available=False, reason=f"Only {len(df)} usable tests over {n_days} test days: too few "
                                             "independent groups to train and test a model.")
        return

    oof_model, oof_base = np.zeros(len(y)), np.zeros(len(y))
    for tr, te in GroupKFold(n_splits=N_SPLITS).split(X, y, days):
        oof_model[te] = _make().fit(X[tr], y[tr]).predict(X[te])
        for hep in (0.0, 1.0):  # baseline: the average burning rate of that fuel in the training folds
            mask = X[te][:, 0] == hep
            train_mean = y[tr][X[tr][:, 0] == hep].mean()
            oof_base[te[mask]] = train_mean
    res = y - oof_model
    mae_m, mae_b = mean_absolute_error(y, oof_model), mean_absolute_error(y, oof_base)
    gain = 1 - mae_m / mae_b

    by_fuel = {}
    for fuel in FUELS:
        m = (df["fuel"] == fuel).to_numpy()
        by_fuel[fuel] = {
            "n": int(m.sum()), "mae": round(float(mean_absolute_error(y[m], oof_model[m])), 3),
            "baseline_mae": round(float(mean_absolute_error(y[m], oof_base[m])), 3),
            "r2": round(float(r2_score(y[m], oof_model[m])), 2),
            "low": float(np.quantile(res[m], 0.10)), "high": float(np.quantile(res[m], 0.90)),
            "ranges": {k: [float(df.loc[m, k].min()), float(df.loc[m, k].max())] for k in KEYS},
            "rate_range": [float(y[m].min()), float(y[m].max())],
        }

    final = _make().fit(X, y)
    scaler, ridge = final[0], final[1]
    per_unit = ridge.coef_ / scaler.scale_
    Z = scaler.transform(X)

    # how far apart are neighbouring tests? used to warn when a request sits in an empty part of the range
    gaps_nn = []
    for i in range(len(Z)):
        same = (X[:, 0] == X[i, 0])
        same[i] = False
        gaps_nn.append(float(np.sqrt(((Z[same][:, 1:] - Z[i, 1:]) ** 2).sum(axis=1)).min()))

    STATE.update(
        available=bool(gain >= REQUIRED_GAIN),
        reason=None if gain >= REQUIRED_GAIN else (
            f"The model's error on held-out test days ({mae_m:.3f} mm²/s) is not clearly better than simply using "
            f"each fuel's average ({mae_b:.3f} mm²/s), so no prediction is offered."),
        model=final, frame=df, X=X, Z=Z, y=y,
        n_all=n_all, n_used=len(df), n_days=n_days,
        mae=float(mae_m), r2=float(r2_score(y, oof_model)), baseline_mae=float(mae_b),
        baseline_r2=float(r2_score(y, oof_base)), gain=float(gain), by_fuel=by_fuel,
        per_unit=[float(v) for v in per_unit], intercept=float(ridge.intercept_),
        mean=[float(v) for v in scaler.mean_], sparse_limit=float(np.quantile(gaps_nn, 0.95)),
        oof=[{"measured": float(a), "predicted": round(float(b), 3), "fuel": f, "test": t}
             for a, b, f, t in zip(y, oof_model, df["fuel"], df["test"])],
    )


def _table_ref() -> dict:
    t = store.TABLES[TABLE_ID]
    inv = store.INVS[t["investigation_id"]]
    return {"id": t["id"], "title": t["title"], "source_url": t["source_url"],
            "investigation": {"id": inv["id"], "short": inv["short"], "psi": inv["links"]["psi"]}}


def not_supported() -> list[dict]:
    """Things a reader may want to change that this model cannot take as inputs, with where to look instead."""
    flow = [i for i in store.INVS.values() if i["conditions"]["airflow"]]
    solids = [i for i in store.INVS.values()
              if i["fuel_state"][0] == "solid" and i["gravity"]["level"] == "microgravity"]
    key = lambda i: store.sort_key(i["id"])  # noqa: E731
    return [
        {"name": "Airflow",
         "why": "The FLEX run log has no airflow column, so airflow cannot be a model input. "
                f"{len(flow)} other investigations report a forced-airflow speed.",
         "to": "/explorer?flow_min=0", "link": "Experiments that report airflow",
         "ids": [i["id"] for i in sorted(flow, key=key)]},
        {"name": "Solid cabin materials",
         "why": "The model was trained on methanol and heptane droplets only. It says nothing about fabrics or "
                "plastics. The solid-material investigations publish too few comparable outcome values in their "
                "PSI run tables to train a model, so they are shown as evidence instead.",
         "to": "/explorer?fuel_state=solid", "link": "Solid-material experiments",
         "ids": [i["id"] for i in sorted(solids, key=key)]},
        {"name": "Gravity level",
         "why": "Every FLEX test ran in microgravity on the ISS. The model cannot say anything about partial "
                "gravity or Earth gravity.",
         "to": "/gaps", "link": "Research Gaps: gravity", "ids": []},
    ]


def info() -> dict:
    base = {"available": STATE.get("available", False), "version": VERSION, "label": LABEL,
            "question": "How fast does a fuel droplet burn in microgravity for a given atmosphere?",
            "target": {k: TARGET[k] for k in ("label", "unit")},
            "target_explain": "The burning-rate constant: how quickly the square of the droplet's diameter shrinks "
                              "while it burns. A larger number means the droplet burns away faster.",
            "table": _table_ref(), "not_supported": not_supported()}
    if "model" not in STATE:
        return {**base, "reason": STATE.get("reason")}
    s = STATE
    inputs = []
    for (key, label, unit, col, _, step, decimals), coef in zip(INPUTS, s["per_unit"][1:]):
        inputs.append({"key": key, "label": label, "unit": unit, "step": step, "decimals": decimals,
                       "default": DEFAULTS[key], "column": col,
                       "ranges": {f: s["by_fuel"][f]["ranges"][key] for f in FUELS},
                       "per_unit": coef})
    return {
        **base, "reason": s["reason"],
        "method": "Ridge regression (a linear model) from scikit-learn on standardised inputs. A linear model was "
                  "chosen because it is easy to inspect, and on held-out test days it did better than the "
                  "tree-based models tried on the same data.",
        "split": f"{N_SPLITS}-fold cross-validation grouped by test day: all tests run on the same day are kept "
                 f"together, so the model is always scored on days it never saw ({s['n_days']} test days).",
        "rows_total": s["n_all"], "rows_used": s["n_used"],
        "rows_dropped": f"{s['n_all'] - s['n_used']} of {s['n_all']} FLEX tests are left out because the PSI table "
                        "gives no burning rate, droplet diameter or pressure for them.",
        "fuels": list(FUELS), "inputs": inputs,
        "fuel_effect": s["per_unit"][0],
        "metrics": {
            "mae": round(s["mae"], 3), "r2": round(s["r2"], 2),
            "baseline_mae": round(s["baseline_mae"], 3), "baseline_r2": round(s["baseline_r2"], 2),
            "baseline": "Always answering with the average burning rate of that fuel.",
            "improvement_pct": round(s["gain"] * 100),
            "by_fuel": {f: {k: (round(v, 3) if isinstance(v, float) else v) for k, v in s["by_fuel"][f].items()
                            if k in ("n", "mae", "baseline_mae", "r2", "rate_range")} for f in FUELS},
        },
        "interval": "The band around an estimate is where 80% of held-out tests of that fuel fell relative to the "
                    "model's prediction (10th to 90th percentile of the errors). It is an empirical error band, "
                    "not a guarantee.",
        "oof": s["oof"],
        "tested_conditions": {f: tested_conditions(f) for f in FUELS},
        "support": "FLEX tested only certain combinations of gas mixture, pressure and droplet size. Every "
                   "estimate comes with a confidence score computed from how far your request is from the "
                   "nearest real test (in standardised units, relative to the usual spacing between tests) and "
                   "from how well the model predicts that fuel. Close to a test: high confidence. Further away, "
                   "or outside a tested range: the estimate is still given, its error band widens and its "
                   "confidence drops, and it is labelled as an extrapolation.",
        "limitations": [
            "One investigation (FLEX), two fuels (methanol and heptane), single liquid droplets. It does not "
            "describe solid cabin materials, large fires or other fuels.",
            "Microgravity only. No partial-gravity or Earth-gravity tests are in the training data.",
            "The model is linear: it captures the main trends (more oxygen burns faster, carbon dioxide slows "
            "burning) but not thresholds such as the point where a flame can no longer exist.",
            f"Heptane is predicted less well than methanol (typical error {s['by_fuel']['Heptane']['mae']:.2f} "
            f"against {s['by_fuel']['Methanol']['mae']:.2f} mm²/s).",
            "It predicts a burning rate for a droplet that does burn. It does not predict whether ignition or "
            "extinction happens.",
        ],
    }


def _row(values: dict, fuel: str) -> np.ndarray:
    return np.array([[1.0 if fuel == "Heptane" else 0.0] + [float(values[k]) for k in KEYS]])


def _fmt(key: str, v: float) -> str:
    spec = next(i for i in INPUTS if i[0] == key)
    if spec[2].startswith("%"):
        return f"{v:g}%"
    return f"{v:.{spec[6]}f} {spec[2]}" if spec[6] else f"{v:g} {spec[2]}"


def _distances(fuel: str, values: dict) -> tuple[np.ndarray, pd.DataFrame]:
    """Distance from a request to every FLEX test of that fuel, in standardised input units."""
    s = STATE
    x = _row(values, fuel)
    z = s["model"][0].transform(x)
    same = s["X"][:, 0] == x[0, 0]
    return np.sqrt(((s["Z"][same][:, 1:] - z[0, 1:]) ** 2).sum(axis=1)), s["frame"][same].reset_index(drop=True)


def _support(d: float) -> str:
    """close: a real test sits about as near as tests sit to each other. weak: up to twice that. none: further."""
    limit = STATE["sparse_limit"]
    return "close" if d <= limit else "weak" if d <= 2 * limit else "none"


def _confidence(d: float, fuel: str) -> int:
    """0-100. Falls with the distance to the nearest real test (r = distance / usual spacing between tests):
    about 90 near a test, about 80 at the usual spacing, about 60 at twice it, about 30 at four times it,
    about 10 at nine times. Scaled by how well the model predicts this fuel on held-out test days."""
    r = d / STATE["sparse_limit"]
    quality = 0.85 + 0.15 * min(1.0, max(0.0, STATE["by_fuel"][fuel]["r2"]))
    return int(round(max(3.0, 95.0 * quality / (1.0 + 0.15 * r ** 1.8))))


def confidence_label(c: int) -> str:
    return "High" if c >= 70 else "Moderate" if c >= 45 else "Low" if c >= 20 else "Very low"


def tested_conditions(fuel: str, limit: int = 8) -> list[dict]:
    """The combinations FLEX tested most often for a fuel, as quick starting points for the form."""
    df = STATE["frame"]
    df = df[df["fuel"] == fuel]
    g = df.assign(oxygen=df["oxygen"].round(), co2=df["co2"].round(), helium=df["helium"].round(),
                  pressure=(df["pressure"] * 10).round() / 10)
    out = []
    for (o, c, h, p), rows in sorted(g.groupby(["oxygen", "co2", "helium", "pressure"]),
                                     key=lambda kv: -len(kv[1]))[:limit]:
        out.append({"oxygen": float(o), "co2": float(c), "helium": float(h), "pressure": float(p),
                    "diameter": round(float(rows["diameter"].median()), 1), "tests": int(len(rows))})
    return out


def collection_evidence(oxygen: float, pressure: float) -> list[dict]:
    """Across the whole collection: which investigations have test rows near this atmosphere?"""
    out: dict[str, dict] = {}
    for r in store.RUNS:
        if r["oxygen"] is None or abs(r["oxygen"] - oxygen) > 1.5:
            continue
        inv = store.INVS[r["investigation_id"]]
        e = out.setdefault(inv["id"], {"id": inv["id"], "short": inv["short"],
                                       "fuel_state": inv["fuel_state"][0].split(" ")[0],
                                       "summary": inv["summary"], "oxygen_rows": 0, "both_rows": 0})
        e["oxygen_rows"] += 1
        if r["pressure"] is not None and abs(r["pressure"] - pressure) <= 0.1:
            e["both_rows"] += 1
    return sorted(out.values(), key=lambda e: (-e["both_rows"], -e["oxygen_rows"], store.sort_key(e["id"])))


def whatif(fuel: str, values: dict) -> dict:
    out: dict = {"label": LABEL, "version": VERSION, "fuel": fuel, "inputs": values, "table": _table_ref()}
    evidence = collection_evidence(values["oxygen"], values["pressure"])
    out["collection_evidence"] = evidence
    out["evidence_note"] = (f"Investigations with test rows within 1.5 points of {values['oxygen']:g}% oxygen in "
                            f"their PSI run tables. 'Also at this pressure' counts rows within 0.1 atm of "
                            f"{values['pressure']:g} atm.")
    if "model" not in STATE or not STATE["available"]:
        return {**out, "status": "no_model", "message": STATE.get("reason") or "No model is available.",
                "problems": []}
    s = STATE
    ranges = s["by_fuel"][fuel]["ranges"]
    total = values["oxygen"] + values["co2"] + values["helium"]
    if total > 100 + 1e-9:
        # the one request that gets no number: it cannot exist
        return {**out, "status": "invalid", "warnings": [],
                "problems": [{"input": "composition", "label": "Gas mixture", "value": total, "range": [0, 100],
                              "message": f"Oxygen, carbon dioxide and helium add up to {total:g}%. A gas mixture "
                                         "cannot exceed 100%; the remainder is nitrogen."}],
                "message": "This gas mixture is not physically possible. Lower oxygen, carbon dioxide or helium so "
                           "that they add up to 100% or less."}

    warnings = []
    outside = []
    for key, label, *rest in INPUTS:
        lo, hi = ranges[key]
        v = values[key]
        tol = 0.5 * 10 ** -rest[-1]  # a value that rounds to the edge of the tested range still counts as inside
        if v < lo - tol or v > hi + tol:
            outside.append(key)
            warnings.append({"input": key, "label": label, "value": v, "range": [lo, hi],
                             "message": f"{label} {_fmt(key, v)} is outside what FLEX tested with {fuel.lower()} "
                                        f"({_fmt(key, lo)} to {_fmt(key, hi)}): the estimate extends the trend "
                                        "the model learned inside that range."})

    dist, rows = _distances(fuel, values)
    order = np.argsort(dist)[:5]
    nearest = []
    for i in order:
        r = rows.iloc[int(i)]
        nearest.append({"test": r["test"], "fuel": r["fuel"], "date": r["day"], "end": r["end"],
                        "measured": float(r["rate"]), "distance": round(float(dist[i]), 2),
                        **{k: float(r[k]) for k in KEYS}})
    out["nearest_runs"] = nearest
    out["tested_conditions"] = tested_conditions(fuel)

    d0 = float(dist[order[0]])
    support = _support(d0)
    confidence = _confidence(d0, fuel)
    if outside:
        # beyond a tested range the model extends a straight-line trend: lose confidence with every
        # range-width outside, on top of the distance to the nearest test
        frac = sum(max(ranges[k][0] - values[k], values[k] - ranges[k][1], 0.0) / max(1e-9, ranges[k][1] - ranges[k][0])
                   for k in outside)
        confidence = int(round(max(3.0, confidence / (1.0 + 1.5 * frac))))
    if values["oxygen"] < ranges["oxygen"][0] - 0.5:
        confidence = min(confidence, 30)
        warnings.append({"input": "flame", "label": "Flame", "value": None, "range": None,
                         "message": f"Below {_fmt('oxygen', ranges['oxygen'][0])} oxygen, the lowest level FLEX "
                                    f"tested with {fuel.lower()}, a droplet flame may not be sustained at all. The "
                                    "model assumes the droplet burns."})
    if support == "none" and not outside:
        n = nearest[0]
        differs = [f"{label.lower()} {_fmt(k, n[k])} instead of {_fmt(k, values[k])}"
                   for k, label, *_ in INPUTS if abs(n[k] - values[k]) > 1e-6
                   and abs(n[k] - values[k]) >= 0.25 * float(s["model"][0].scale_[1 + KEYS.index(k)])]
        warnings.append({"input": "combination", "label": "Combination", "value": None, "range": None,
                         "message": "Each value is inside the range FLEX tested, but no FLEX test comes close to "
                                    f"this combination. The nearest test ({n['test']}) had "
                                    + ("; ".join(differs) if differs else "different values") + "."})

    x = _row(values, fuel)
    raw = float(s["model"].predict(x)[0])
    pred = max(0.0, raw)
    f = s["by_fuel"][fuel]
    spread = 1.0 + max(0.0, d0 / s["sparse_limit"] - 1.0)  # the band widens once past the usual test spacing
    if raw <= 0.02:
        confidence = min(confidence, 15)
        warnings.append({"input": "flame", "label": "Flame", "value": None, "range": None,
                         "message": "The model's trend reaches zero here. In an atmosphere like this a droplet "
                                    "flame may not be sustained at all, which a linear model cannot predict."})

    # what moves the estimate, relative to the reference case (air, 1 atm, 3 mm droplet)
    effects = [{"key": k, "label": label, "delta": round(coef * (values[k] - DEFAULTS[k]), 3),
                "from": DEFAULTS[k], "to": values[k], "unit": unit}
               for (k, label, unit, *_), coef in zip(INPUTS, s["per_unit"][1:])]
    reference = float(s["model"].predict(_row(DEFAULTS, fuel))[0])

    # the model's line across the tested oxygen range (extended to the request), other inputs as chosen
    lo, hi = ranges["oxygen"]
    a, b = math.floor(min(lo, values["oxygen"])), math.ceil(max(hi, values["oxygen"]))
    xs = [float(v) for v in np.arange(a, b + 0.01, 1.0) if v + values["co2"] + values["helium"] <= 100]
    ys, low, high, backed = [], [], [], []
    for v in xs:
        at = {**values, "oxygen": v}
        near = float(_distances(fuel, at)[0].min())
        y = max(0.0, float(s["model"].predict(_row(at, fuel))[0]))
        w = 1.0 + max(0.0, near / s["sparse_limit"] - 1.0)
        ys.append(round(y, 3))
        low.append(round(max(0.0, y + f["low"] * w), 3))
        high.append(round(y + f["high"] * w, 3))
        backed.append(bool(lo - 0.5 <= v <= hi + 0.5 and _support(near) != "none"))
    measured = [{"oxygen": float(r["oxygen"]), "rate": float(r["rate"]), "test": r["test"],
                 "co2": float(r["co2"]), "helium": float(r["helium"]), "pressure": float(r["pressure"]),
                 "diameter": float(r["diameter"])} for _, r in rows.iterrows()]

    extrapolated = bool(outside) or support == "none"
    level = confidence_label(confidence)
    return {
        **out, "status": "ok", "problems": [], "warnings": warnings, "support": support,
        "confidence": confidence, "confidence_label": level, "extrapolated": extrapolated,
        "confidence_note": (f"{level} confidence ({confidence}%). "
                            + ("The nearest FLEX test is close to this scenario." if support == "close" else
                               "The nearest FLEX test is further away than tests usually are from each other."
                               if support == "weak" else
                               "This scenario is far from every FLEX test, so the number extends the learned trend "
                               "rather than interpolating between measurements.")),
        "estimate": {"value": round(pred, 3), "unit": TARGET["unit"],
                     "low": round(max(0.0, pred + f["low"] * spread), 3), "high": round(pred + f["high"] * spread, 3),
                     "typical_error": f["mae"]},
        "reference": {"value": round(reference, 3), "inputs": DEFAULTS,
                      "text": "the same fuel in air (21% oxygen, no added gas) at 1 atm with a 3 mm droplet"},
        "effects": effects, "sparse": support != "close",
        "sparse_note": None,
        "curve": {"x": xs, "y": ys, "low": low, "high": high, "backed": backed},
        "measured": measured,
        "message": f"For a {values['diameter']:g} mm {fuel.lower()} droplet the model estimates a burning rate of "
                   f"about {pred:.2f} mm²/s ({level.lower()} confidence, {confidence}%).",
    }


def habitat_estimates(env: dict) -> dict | None:
    """Burning-rate estimates at a habitat's atmosphere, for the mission report. None if out of range."""
    if not STATE.get("available"):
        return None
    pressure = round(max(env["pressure"][0], min(env["pressure"][1], 1.0)), 2)
    rows, skipped = [], []
    for oxygen in dict.fromkeys(env["oxygen"]):
        for fuel in FUELS:
            p = pressure
            there = whatif(fuel, {**DEFAULTS, "oxygen": oxygen, "pressure": p})
            air = whatif(fuel, dict(DEFAULTS))
            if there["status"] != "ok" or air["status"] != "ok" or there.get("extrapolated"):
                note = "; ".join(pr["message"] for pr in there.get("warnings") or there["problems"]) \
                    or there.get("message", "")
                if note not in skipped:
                    skipped.append(note)
                continue
            rows.append({"fuel": fuel, "oxygen": oxygen, "pressure": p, "support": there["support"],
                         "confidence": there["confidence"],
                         "estimate": there["estimate"], "air": air["estimate"],
                         "change_pct": round((there["estimate"]["value"] / air["estimate"]["value"] - 1) * 100)})
    if not rows:
        return None
    return {
        "label": LABEL, "version": VERSION, "rows": rows, "skipped": skipped, "table": _table_ref(),
        "note": "Estimates for 3 mm methanol and heptane droplets from the FLEX model at the ends of this "
                "habitat's oxygen band, compared with the same droplet in air at 1 atm. The pressure is the value "
                "in the habitat's band closest to 1 atm. Liquid droplets in microgravity are not "
                "cabin materials and not partial gravity: read this as the direction and rough size of the "
                "oxygen effect, not as a prediction for the habitat.",
    }
