"""Prediction models for the Predictions page: several NASA experiments, one engine.

Each model answers one question from one PSI run table. The same rules apply to all of them
(they are the rules `predict.py` set for the first model):

- tested on data it was not trained on: 5-fold cross-validation grouped by test day;
- offered only if it beats a no-model baseline (the average of the training folds, per group)
  by at least REQUIRED_GAIN;
- every answer carries a confidence score computed from the distance to the nearest real test and
  from the model's held-out accuracy; outside a tested range it is labelled an extrapolation;
- a physically impossible request (gases above 100%) gets no number;
- every output is labelled a model prediction, never a NASA measurement.

Candidates that failed the baseline test and are therefore not offered (checked 2026-11-13):
CFI-G hot ignition yes/no (worse than always answering the majority), CFI-G burn time (no gain).

The flame-out model uses pairwise terms (oxygen x diluent and so on). A purely linear logistic model
reached only 17% over the per-fuel baseline at any regularisation; with pairwise terms it reached 26% at
C=0.1 and C=0.3 alike, so the result does not hinge on one lucky setting. C=0.1 (the stronger
regularisation) is used.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression, RidgeCV
from sklearn.metrics import brier_score_loss, mean_absolute_error, r2_score, roc_auc_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import PolynomialFeatures, StandardScaler

from . import predict, store

LABEL = "Model prediction, not a NASA measurement"
REQUIRED_GAIN = 0.20
N_SPLITS = 5
GAS = (0.0, 100.0)

# key, label, unit, source column label, factor, slider step, decimals, physical (min, max)
FLEX_INPUTS = [
    ("oxygen", "Oxygen", "%", "O2 (% by volume)", 1.0, 1.0, 0, GAS),
    ("co2", "Carbon dioxide", "%", "CO2 initial ambient (mole fraction)", 100.0, 1.0, 0, GAS),
    ("helium", "Helium", "%", "He initial ambient (mole fraction)", 100.0, 1.0, 0, GAS),
    ("pressure", "Pressure", "atm", "Pressure (atm)", 1.0, 0.05, 2, (0.05, 10.0)),
    ("diameter", "Droplet size", "mm", "Droplet initial diameter (mm)", 1.0, 0.1, 1, (0.1, 20.0)),
]

SPECS: dict[str, dict] = {
    "flex-rate": {
        "kind": "reg", "table": "PSI-69:1", "day": "Test Date", "id": "FLEX Identifier",
        "title": "Burning speed", "short": "How fast does a fuel droplet burn?",
        "question": "How fast a fuel droplet burns away in microgravity (the burning-rate constant)",
        "target": "Burning rate (mm^2/s)", "target_label": "Burning rate", "unit": "mm²/s", "decimals": 2,
        "group": "Fuel", "group_label": "Fuel", "inputs": FLEX_INPUTS, "gases": ["oxygen", "co2", "helium"],
        "defaults": {"oxygen": 21.0, "co2": 0.0, "helium": 0.0, "pressure": 1.0, "diameter": 3.0},
        "higher": "A larger number means the droplet burns away faster.",
        "limits": ["Single methanol and heptane droplets in microgravity, not cabin materials.",
                   "It assumes the droplet burns; use “Will the flame go out?” for that question."],
    },
    "flex-extinction": {
        "kind": "class", "table": "PSI-69:1", "day": "Test Date", "id": "FLEX Identifier", "pairwise": True,
        "title": "Will the flame go out?", "short": "Will the flame go out before the fuel is used up?",
        "question": "The chance that a burning droplet’s flame goes out before the droplet is used up",
        "outcome": "Test end", "positive": "extinction", "keep": ("extinction", "completion"),
        "positive_label": "Flame went out", "negative_label": "Droplet burned away",
        "target_label": "Chance the flame goes out", "unit": "%", "decimals": 0,
        "group": "Fuel", "group_label": "Fuel", "inputs": FLEX_INPUTS, "gases": ["oxygen", "co2", "helium"],
        "defaults": {"oxygen": 21.0, "co2": 0.0, "helium": 0.0, "pressure": 1.0, "diameter": 3.0},
        "higher": "Higher means the atmosphere is more likely to put the flame out on its own.",
        "limits": ["Trained on tests that ended in extinction or completion; tests ended for other reasons are left out.",
                   "Liquid droplets in microgravity, not solid cabin materials."],
    },
    "cfig-temp": {
        "kind": "reg", "table": "PSI-159:1", "day": "Day", "id": "Test",
        "title": "How hot does it get?", "short": "How hot does a gas flame make its burner?",
        "question": "The peak temperature a gas flame’s burner reaches (ACME CFI-G), a measure of how intense the flame is",
        "target": "Peak burner T (C )", "target_label": "Peak burner temperature", "unit": "°C", "decimals": 0,
        "group": "Fuel", "group_label": "Fuel", "gases": ["oxygen"],
        "inputs": [
            ("oxygen", "Oxygen", "%", "O2 (% by volume)", 1.0, 1.0, 0, GAS),
            ("pressure", "Pressure", "atm", "Pressure (atm)", 1.0, 0.05, 2, (0.05, 10.0)),
            ("xf", "Fuel share of the burner gas", "fraction", "Xf", 1.0, 0.05, 2, (0.0, 1.0)),
            ("mhc", "Fuel flow", "mg/s", "mHC (mg/s)", 1.0, 0.1, 1, (0.0, 20.0)),
        ],
        "defaults": {"oxygen": 30.0, "pressure": 1.0},
        "higher": "Higher means a hotter, more intense flame.",
        "limits": ["Spherical gas-burner flames (ethane, propane, butane), not cabin materials.",
                   "Normal flames only; the inverse-flame tests are a separate table."],
    },
}

STATE: dict[str, dict] = {}


# ---------------------------------------------------------------------------- data
def _frame(spec: dict) -> pd.DataFrame:
    t = store.TABLES[spec["table"]]
    raw = pd.DataFrame(t["rows"]).rename(columns={c["key"]: c["label"] for c in t["columns"]})
    df = pd.DataFrame({k: pd.to_numeric(raw[col], errors="coerce") * f for k, _, _, col, f, *_ in spec["inputs"]})
    df["group"] = raw[spec["group"]].astype(str).str.strip()
    df["day"] = raw[spec["day"]].astype(str)
    df["id"] = raw[spec["id"]].astype(str)
    if spec["kind"] == "reg":
        df["y"] = pd.to_numeric(raw[spec["target"]], errors="coerce")
    else:
        end = raw[spec["outcome"]].astype(str).str.strip().str.lower()
        df = df[end.isin(spec["keep"])]
        df["y"] = (end[end.isin(spec["keep"])] == spec["positive"]).astype(float)
    keys = [i[0] for i in spec["inputs"]]
    df = df.dropna(subset=keys + ["y"])
    df = df[df["group"].str.len() > 0].reset_index(drop=True)
    return df


def _x(spec: dict, groups: list[str], df: pd.DataFrame) -> np.ndarray:
    keys = [i[0] for i in spec["inputs"]]
    return np.column_stack([(df["group"] == g).astype(float) for g in groups[1:]] + [df[k].to_numpy(float) for k in keys])


def _make(spec: dict):
    """The first step is always the scaler: its units are reused to measure distances to real tests."""
    if spec["kind"] == "reg":
        return make_pipeline(StandardScaler(), RidgeCV(alphas=np.logspace(-3, 3, 13)))
    if spec.get("pairwise"):
        return make_pipeline(StandardScaler(), PolynomialFeatures(2, include_bias=False), StandardScaler(),
                             LogisticRegression(C=0.1, max_iter=5000))
    return make_pipeline(StandardScaler(), LogisticRegression(C=1.0, max_iter=3000))


def _predict(st: dict, x: np.ndarray) -> np.ndarray:
    m = st["model"]
    return m.predict_proba(x)[:, 1] if st["spec"]["kind"] == "class" else m.predict(x)


# ---------------------------------------------------------------------------- build
def build() -> None:
    STATE.clear()
    for mid, spec in SPECS.items():
        try:
            STATE[mid] = _build_one(mid, spec)
        except Exception as exc:  # a broken table must not take the server down
            STATE[mid] = {"spec": spec, "available": False, "reason": f"Could not build: {exc}"}


def _build_one(mid: str, spec: dict) -> dict:
    df = _frame(spec)
    groups = [g for g, _ in sorted(df["group"].value_counts().items(), key=lambda kv: -kv[1])]
    X, y, days = _x(spec, groups, df), df["y"].to_numpy(float), df["day"].to_numpy()
    if len(df) < 60 or len(set(days)) < 2 * N_SPLITS:
        return {"spec": spec, "available": False, "reason": f"Only {len(df)} usable tests over {len(set(days))} test days."}
    oof, base = np.zeros(len(y)), np.zeros(len(y))
    for tr, te in GroupKFold(n_splits=N_SPLITS).split(X, y, days):
        m = _make(spec).fit(X[tr], y[tr])
        oof[te] = m.predict_proba(X[te])[:, 1] if spec["kind"] == "class" else m.predict(X[te])
        for g in groups:  # baseline: that group's average in the training folds
            tr_g = df["group"].to_numpy()[tr] == g
            te_g = df["group"].to_numpy()[te] == g
            base[te[te_g]] = y[tr][tr_g].mean() if tr_g.any() else y[tr].mean()
    if spec["kind"] == "reg":
        err, err_b = mean_absolute_error(y, oof), mean_absolute_error(y, base)
        metrics = {"error": round(float(err), 3), "baseline_error": round(float(err_b), 3), "r2": round(float(r2_score(y, oof)), 2),
                   "error_name": "Typical error", "baseline_name": "Each fuel’s average"}
    else:
        err, err_b = brier_score_loss(y, oof), brier_score_loss(y, base)
        metrics = {"error": round(float(err), 3), "baseline_error": round(float(err_b), 3),
                   "auc": round(float(roc_auc_score(y, oof)), 2), "accuracy": round(float(((oof > 0.5) == y).mean()), 2),
                   "error_name": "Probability error (Brier)", "baseline_name": "Each fuel’s overall rate"}
    gain = 1 - err / err_b if err_b else 0.0
    metrics["improvement_pct"] = round(gain * 100)

    final = _make(spec).fit(X, y)
    scaler = final[0]
    Z = scaler.transform(X)
    ng = len(groups) - 1
    gaps = []
    for i in range(len(Z)):
        same = (df["group"] == df["group"].iloc[i]).to_numpy(copy=True)
        same[i] = False
        if same.any():
            gaps.append(float(np.sqrt(((Z[same][:, ng:] - Z[i, ng:]) ** 2).sum(axis=1)).min()))
    keys = [i[0] for i in spec["inputs"]]
    by_group = {}
    res = y - oof
    for g in groups:
        m = (df["group"] == g).to_numpy()
        q = (float(r2_score(y[m], oof[m])) if spec["kind"] == "reg" and m.sum() > 2
             else float(roc_auc_score(y[m], oof[m])) if spec["kind"] == "class" and 0 < y[m].mean() < 1 else 0.6)
        by_group[g] = {
            "n": int(m.sum()), "quality": q,
            "low": float(np.quantile(res[m], 0.10)), "high": float(np.quantile(res[m], 0.90)),
            "error": float(mean_absolute_error(y[m], oof[m])),
            "ranges": {k: [float(df.loc[m, k].min()), float(df.loc[m, k].max())] for k in keys},
        }
    overall = {k: [float(df[k].min()), float(df[k].max())] for k in keys}
    # starting values per group: the atmosphere from the spec, everything else that group's typical test
    defaults = {g: {k: float(np.round(df.loc[df["group"] == g, k].median(), 3)) for k in keys} | spec.get("defaults", {})
                for g in groups}
    return {
        "spec": spec, "id": mid, "available": bool(gain >= REQUIRED_GAIN), "frame": df, "X": X, "Z": Z, "y": y,
        "groups": groups, "model": final, "metrics": metrics, "by_group": by_group, "overall": overall,
        "defaults": defaults, "sparse_limit": float(np.quantile(gaps, 0.95)) if gaps else 1.0,
        "reason": None if gain >= REQUIRED_GAIN else
        f"On held-out test days the model is only {round(gain * 100)}% better than the baseline, so it is not offered.",
    }


# ---------------------------------------------------------------------------- describe
def _form_range(spec_in, lo: float, hi: float) -> list[float]:
    """The slider range: the tested range plus a quarter of its width on each side, inside physical limits.
    Wide enough to ask "what if a little beyond?", narrow enough not to offer meaningless atmospheres."""
    _, _, _, _, _, step, dec, (pmin, pmax) = spec_in
    w = max(hi - lo, step * 4)
    a, b = max(pmin, lo - 0.25 * w), min(pmax, hi + 0.25 * w)
    r = lambda v: round(round(v / step) * step, max(dec, 2))  # noqa: E731
    return [r(a), r(b)]


def catalog() -> dict:
    """Every model, with its inputs and accuracy, for the page to build its controls."""
    out = []
    for mid, st in STATE.items():
        spec = st["spec"]
        item = {"id": mid, "title": spec["title"], "short": spec["short"], "question": spec["question"],
                "kind": spec["kind"], "unit": spec["unit"], "decimals": spec["decimals"],
                "target_label": spec["target_label"], "higher": spec["higher"], "limits": spec["limits"],
                "available": st.get("available", False), "reason": st.get("reason"),
                "table": _table_ref(spec)}
        if "model" in st:
            item.update({
                "groups": st["groups"], "group_label": spec["group_label"], "gases": spec["gases"],
                "rows": len(st["y"]), "metrics": st["metrics"],
                "inputs": [{"key": i[0], "label": i[1], "unit": i[2], "step": i[5], "decimals": i[6],
                            "default": st["defaults"][st["groups"][0]][i[0]],
                            "defaults": {g: st["defaults"][g][i[0]] for g in st["groups"]},
                            "form": _form_range(i, *st["overall"][i[0]]),
                            "ranges": {g: st["by_group"][g]["ranges"][i[0]] for g in st["groups"]}}
                           for i in spec["inputs"]],
            })
        out.append(item)
    envs, seen = [], set()
    from . import environments  # local import: environments imports a lot
    for eid, e in environments.ENVIRONMENTS.items():
        # the cabin a habitat is designed around: its stated oxygen floor at its stated pressure
        o2, p = float(e["oxygen"][0]), round(float(e["pressure"][1]), 2)
        if (o2, p) in seen:  # the rover shares the Moon Base atmosphere
            continue
        seen.add((o2, p))
        envs.append({"id": eid, "name": e["name"], "oxygen": o2, "pressure": p, "label": e["atmosphere_label"]})
    return {"models": out, "places": envs, "label": LABEL}


def _table_ref(spec: dict) -> dict:
    t = store.TABLES[spec["table"]]
    inv = store.INVS[t["investigation_id"]]
    return {"id": t["id"], "title": t["title"], "source_url": t["source_url"],
            "investigation": {"id": inv["id"], "short": inv["short"]}}


# ---------------------------------------------------------------------------- predict
def _fmt(spec_in, v: float) -> str:
    unit, dec = spec_in[2], spec_in[6]
    return f"{v:.{dec}f}{'%' if unit == '%' else ' ' + unit}"


def _row(st: dict, group: str, values: dict) -> np.ndarray:
    keys = [i[0] for i in st["spec"]["inputs"]]
    return np.array([[1.0 if group == g else 0.0 for g in st["groups"][1:]] + [float(values[k]) for k in keys]])


def _dist(st: dict, group: str, values: dict) -> tuple[np.ndarray, np.ndarray]:
    ng = len(st["groups"]) - 1
    z = st["model"][0].transform(_row(st, group, values))
    same = (st["frame"]["group"] == group).to_numpy()
    return np.sqrt(((st["Z"][same][:, ng:] - z[0, ng:]) ** 2).sum(axis=1)), np.flatnonzero(same)


def _confidence(st: dict, group: str, d: float, outside_frac: float) -> int:
    r = d / st["sparse_limit"]
    q = st["by_group"][group]["quality"]
    q = q if st["spec"]["kind"] == "reg" else (q - 0.5) * 2  # AUC 0.5..1 -> 0..1
    quality = 0.85 + 0.15 * min(1.0, max(0.0, q))
    c = 95.0 * quality / (1.0 + 0.15 * r ** 1.8) / (1.0 + 1.5 * outside_frac)
    return int(round(max(3.0, c)))


def run(mid: str, group: str | None, values: dict) -> dict:
    st = STATE.get(mid)
    if not st or "model" not in st:
        return {"status": "no_model", "message": (st or {}).get("reason") or "Unknown model.", "label": LABEL}
    spec = st["spec"]
    if not st["available"]:
        return {"status": "no_model", "message": st["reason"], "label": LABEL}
    group = group if group in st["groups"] else st["groups"][0]
    vals = {i[0]: float(values.get(i[0], st["defaults"][group][i[0]])) for i in spec["inputs"]}
    out: dict = {"label": LABEL, "model": mid, "group": group, "inputs": vals, "kind": spec["kind"],
                 "unit": spec["unit"], "table": _table_ref(spec)}

    gas_total = sum(vals[g] for g in spec["gases"])
    if gas_total > 100 + 1e-9:
        return {**out, "status": "invalid", "warnings": [],
                "message": f"The gases add up to {gas_total:g}%. A gas mixture cannot exceed 100%."}

    ranges = st["by_group"][group]["ranges"]
    warnings, frac, outside = [], 0.0, []
    for i in spec["inputs"]:
        k = i[0]
        lo, hi = ranges[k]
        tol = 0.5 * 10 ** -i[6]
        if vals[k] < lo - tol or vals[k] > hi + tol:
            outside.append(k)
            frac += max(lo - vals[k], vals[k] - hi, 0.0) / max(1e-9, hi - lo)
            warnings.append(f"{i[1]} {_fmt(i, vals[k])} is outside what was tested with {group.lower()} "
                            f"({_fmt(i, lo)} to {_fmt(i, hi)}).")
    dist, idx = _dist(st, group, vals)
    order = np.argsort(dist)[:5]
    d0 = float(dist[order[0]])
    conf = _confidence(st, group, d0, frac)
    if "oxygen" in vals and vals["oxygen"] < ranges["oxygen"][0] - 0.5 and spec["kind"] == "reg":
        conf = min(conf, 30)
        warnings.append(f"Below the lowest oxygen tested with {group.lower()}, a flame may not burn at all.")
    support = "close" if d0 <= st["sparse_limit"] else "weak" if d0 <= 2 * st["sparse_limit"] else "far"

    raw = float(_predict(st, _row(st, group, vals))[0])
    g = st["by_group"][group]
    spread = 1.0 + max(0.0, d0 / st["sparse_limit"] - 1.0)
    if spec["kind"] == "reg":
        value = max(0.0, raw)
        est = {"value": round(value, 3), "low": round(max(0.0, value + g["low"] * spread), 3),
               "high": round(value + g["high"] * spread, 3), "typical_error": round(g["error"], 3)}
    else:
        value = raw * 100
        est = {"value": round(value, 1), "low": None, "high": None, "typical_error": None}

    ref_vals = dict(st["defaults"][group])
    ref = float(_predict(st, _row(st, group, ref_vals))[0]) * (100 if spec["kind"] == "class" else 1)
    effects = []
    for i in spec["inputs"]:
        k = i[0]
        if abs(vals[k] - ref_vals[k]) < 1e-9:
            continue
        one = {**ref_vals, k: vals[k]}
        v = float(_predict(st, _row(st, group, one))[0]) * (100 if spec["kind"] == "class" else 1)
        effects.append({"key": k, "label": i[1], "from": ref_vals[k], "to": vals[k], "unit": i[2], "delta": round(v - ref, 3)})

    # the model's line against oxygen, the measured tests of this group, and the closest tests
    curve = None
    if "oxygen" in vals:
        lo, hi = st["overall"]["oxygen"]
        a, b = math.floor(min(lo, vals["oxygen"])), math.ceil(max(hi, vals["oxygen"]))
        xs = [float(v) for v in np.arange(a, b + 0.01, 1.0)
              if v + sum(vals[gk] for gk in spec["gases"] if gk != "oxygen") <= 100]
        ys, backed = [], []
        for v in xs:
            at = {**vals, "oxygen": v}
            p = float(_predict(st, _row(st, group, at))[0])
            ys.append(round(max(0.0, p) * (100 if spec["kind"] == "class" else 1), 3))
            near = float(_dist(st, group, at)[0].min())
            backed.append(bool(ranges["oxygen"][0] - 0.5 <= v <= ranges["oxygen"][1] + 0.5 and near <= 2 * st["sparse_limit"]))
        curve = {"x": xs, "y": ys, "backed": backed}
    df = st["frame"]
    keys = [i[0] for i in spec["inputs"]]
    meas = df.iloc[idx]
    measured = [{"x": float(r["oxygen"]), "y": float(r["y"]) * (100 if spec["kind"] == "class" else 1), "id": r["id"]}
                for _, r in meas.iterrows()] if "oxygen" in keys else []
    nearest = []
    for j in order:
        r = df.iloc[int(idx[int(j)])]
        res = (spec["positive_label"] if r["y"] >= 0.5 else spec["negative_label"]) if spec["kind"] == "class" else round(float(r["y"]), 3)
        nearest.append({"id": r["id"], "values": {k: round(float(r[k]), 3) for k in keys}, "measured": res})

    level = "High" if conf >= 70 else "Moderate" if conf >= 45 else "Low" if conf >= 20 else "Very low"
    return {
        **out, "status": "ok", "estimate": est, "confidence": conf, "confidence_label": level,
        "extrapolated": bool(outside) or support == "far", "support": support, "warnings": warnings,
        "reference": {"value": round(ref, 3), "text": "the same " + spec["group_label"].lower() + " at the model’s reference conditions"},
        "effects": effects, "curve": curve, "measured": measured, "nearest": nearest,
        "evidence": predict.collection_evidence(vals.get("oxygen", 21.0), vals.get("pressure", 1.0))[:6],
    }


def batch(mid: str, rows: list[dict]) -> list[dict]:
    """Many scenarios at once (the CSV upload). Only the numbers, not the charts."""
    out = []
    for r in rows:
        try:
            values = {k: float(v) for k, v in (r.get("values") or {}).items() if v not in (None, "")}
            res = run(mid, r.get("group"), values)
        except (TypeError, ValueError):
            out.append({"status": "error", "message": "A value in this row is not a number."})
            continue
        if res.get("status") != "ok":
            out.append({"status": res.get("status"), "message": res.get("message")})
            continue
        e = res["estimate"]
        out.append({"status": "ok", "group": res["group"], "value": e["value"], "low": e["low"], "high": e["high"],
                    "confidence": res["confidence"], "extrapolated": res["extrapolated"]})
    return out
