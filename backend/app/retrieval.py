"""Retrieval for the AI assistant and "related experiments".

We use TF-IDF (scikit-learn) rather than a hosted embedding model: the collection
is 24 investigations / ~240 passages, TF-IDF needs no API key, runs offline, and
is easy to inspect. The interface (search -> scored passages) would not change if
embeddings were swapped in later.
"""
from __future__ import annotations

import logging
import re

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from . import embeddings, store

log = logging.getLogger("flame.retrieval")
_emb: np.ndarray | None = None
_query_cache: dict[str, np.ndarray] = {}
_vec: TfidfVectorizer | None = None
_matrix = None
_inv_vec: TfidfVectorizer | None = None
_inv_matrix = None
_inv_ids: list[str] = []
_aliases: dict[str, str] = {}


def build() -> None:
    global _vec, _matrix, _inv_vec, _inv_matrix, _inv_ids, _aliases
    _vec = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, stop_words="english", min_df=1)
    _matrix = _vec.fit_transform([c["text"] for c in store.CHUNKS])
    _load_embeddings()

    _inv_ids = sorted(store.INVS, key=store.sort_key)
    docs = []
    for i in _inv_ids:
        inv = store.INVS[i]
        docs.append(" ".join([inv["title"], inv["summary"], *inv["text"].values(), " ".join(inv["keywords"])]))
    _inv_vec = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, stop_words="english")
    _inv_matrix = _inv_vec.fit_transform(docs)

    _aliases = {}
    for inv in store.INVS.values():
        names = {inv["id"].lower(), inv["id"].lower().replace("-", " "), inv["id"].lower().replace("-", "")}
        if inv["acronym"]:
            for part in re.split(r"\s*/\s*", inv["acronym"]):
                names.add(part.lower())
            names.add(inv["acronym"].lower())
        short = re.sub(r"\s*\(.*\)", "", inv["name"]).lower()
        names.add(short)
        for n in names:
            if len(n) >= 3:
                _aliases[n] = inv["id"]
    # common spellings
    for alias, target in {"saffire-1": "PSI-98", "saffire 1": "PSI-98", "saffire-2": "PSI-99", "saffire 2": "PSI-99",
                          "saffire-3": "PSI-100", "saffire 3": "PSI-100", "bass-2": "PSI-25", "bass 2": "PSI-25",
                          "bass ii": "PSI-25", "flex 2": "PSI-68", "same r": "PSI-101", "cfi-g": "PSI-159",
                          "cfi g": "PSI-159", "bre": "PSI-20", "e-field": "PSI-22", "efield": "PSI-22",
                          "daft": "PSI-47", "s-flame": "PSI-23", "cld": "PSI-21", "flame design": "PSI-10"}.items():
        if target in store.INVS:
            _aliases[alias] = target


def mentioned(text: str) -> list[str]:
    """Investigations a piece of text names (by accession, acronym or common spelling)."""
    text = re.sub(r"\s+", " ", text)
    found: dict[str, int] = {}
    spans: list[tuple[int, int]] = []
    # longest aliases first so "BASS-II" wins over "BASS" and "SAME-R" over "SAME"
    for alias in sorted(_aliases, key=len, reverse=True):
        if alias in _ENGLISH_WORDS:  # "same", "slice"... only count when written as an acronym
            pattern, flags = re.escape(alias.upper()), 0
        else:
            pattern, flags = re.escape(alias), re.I
        for m in re.finditer(r"(?<![A-Za-z0-9-])" + pattern + r"(?![A-Za-z0-9])", text, flags):
            if any(m.start() < e and m.end() > s for s, e in spans):
                continue
            spans.append((m.start(), m.end()))
            found.setdefault(_aliases[alias], m.start())
    return [k for k, _ in sorted(found.items(), key=lambda kv: kv[1])]


_ENGLISH_WORDS = {"same", "slice", "spice", "daft", "flex", "bass", "bre", "cld", "cfi"}


def _load_embeddings() -> None:
    """Meaning vectors built by ingest/build_embeddings.py. Used only if they belong to exactly the
    passages loaded now; otherwise search is by keywords alone."""
    global _emb
    _emb = None
    path = store.ROOT / "data" / "embeddings.npz"
    if not path.exists():
        return
    data = np.load(path, allow_pickle=False)
    if list(data["ids"]) != [c["id"] for c in store.CHUNKS] or str(data["model"]) != embeddings.MODEL:
        log.warning("embeddings.npz does not match the loaded passages; run build_embeddings.py. Using keyword search.")
        return
    if embeddings.available():
        _emb = data["vectors"].astype(np.float32)


def mode() -> str:
    return "keywords + meaning" if _emb is not None else "keywords"


def _hybrid(query: str, sims: np.ndarray) -> np.ndarray:
    """Combine keyword similarity with meaning similarity by rank (reciprocal rank fusion).

    Keywords catch exact terms (PMMA, SIBAL, an experiment's name); meaning vectors catch a
    passage that answers the question in other words. If the vectors or the embedding service
    are not available, the keyword scores are returned unchanged."""
    if _emb is None:
        return sims.copy()
    vec = _query_cache.get(query)
    if vec is None:
        vec = embeddings.query(query)
        vec /= (np.linalg.norm(vec) or 1.0)
        if len(_query_cache) > 200:
            _query_cache.clear()
        _query_cache[query] = vec
    meaning = _emb @ vec
    rank_kw = np.empty(len(sims), dtype=np.int64)
    rank_kw[np.argsort(-sims)] = np.arange(len(sims))
    rank_me = np.empty(len(sims), dtype=np.int64)
    rank_me[np.argsort(-meaning)] = np.arange(len(sims))
    fused = np.where(sims > 0, 1.0 / (60 + rank_kw), 0.0) + 1.0 / (60 + rank_me)
    fused[(sims <= 0) & (rank_me >= 150)] = 0.0   # no shared words and not close in meaning
    return fused / (2.0 / 60)                      # 1.0 = first in both rankings


# How much each kind of source counts when passages tie. NASA's own results come first; the
# project-team summaries come last, so a NASA passage wins over our wording of the same point.
KIND_WEIGHT = {"report": 1.15, "analysed": 1.05, "record": 1.05, "conditions": 1.05, "challenge": 1.0,
               "resource": 1.0, "science_doc": 0.9, "project": 0.8}
_RESULT_WORDS = re.compile(r"\b(results?|found|showed?|shown|observed|measured|conclusions?|concluded|"
                           r"demonstrated|indicat\w+|findings?)\b", re.I)


def search(query: str, k: int = 10, boost_ids: list[str] | None = None, kinds: set[str] | None = None,
           ids: set[str] | None = None, prefer_results: bool = False) -> list[dict]:
    """Top-k passages.

    Passages from investigations named in the query (or passed in `boost_ids`, e.g. the page the
    reader is looking at) get a score bonus. `kinds` and `ids` narrow the search to some kinds of
    source or some investigations. `prefer_results` favours report passages that state results."""
    q = _vec.transform([query])
    sims = cosine_similarity(q, _matrix).ravel()
    boosted = set(boost_ids or []) | set(mentioned(query))
    scores = _hybrid(query, sims)
    for idx, c in enumerate(store.CHUNKS):
        if scores[idx] <= 0:
            continue
        if (kinds and c["kind"] not in kinds) or (ids and c["investigation_id"] not in ids):
            scores[idx] = 0.0
            continue
        scores[idx] *= KIND_WEIGHT.get(c["kind"], 1.0)
        if c["investigation_id"] in boosted:
            scores[idx] = scores[idx] * 1.5 + 0.08
        if prefer_results and c["kind"] in ("report", "analysed") and _RESULT_WORDS.search(c["text"]):
            scores[idx] *= 1.25
    order = np.argsort(-scores)
    out, per_inv, per_doc = [], {}, {}
    for idx in order:
        if len(out) >= k or scores[idx] <= 0:
            break
        c = store.CHUNKS[idx]
        doc = c.get("doc_id")
        # keep variety: across investigations, and across documents within one investigation
        if per_inv.get(c["investigation_id"], 0) >= (8 if ids and len(ids) == 1 else 5):
            continue
        if doc is not None and per_doc.get(doc, 0) >= 3:
            continue
        per_inv[c["investigation_id"]] = per_inv.get(c["investigation_id"], 0) + 1
        if doc is not None:
            per_doc[doc] = per_doc.get(doc, 0) + 1
        out.append({**c, "score": float(scores[idx]), "similarity": float(sims[idx])})
    return out


_DOMAIN = re.compile(
    r"fire|flam|combust|burn|smok|soot|aerosol|oxygen|\bo2\b|gravity|suppress|extinguish|extinct|detect|"
    r"material|fabric|plastic|fuel|pressure|airflow|air flow|ventilat|spacecraft|space|station|\biss\b|moon|"
    r"lunar|mars|martian|rover|habitat|cabin|crew|astronaut|nasa|\bpsi\b|experiment|investigation|sensor|"
    r"instrument|hardware|droplet|ignit|safety|co2|carbon dioxide|helium|nitrogen|temperature|heat|radiat|"
    r"buoyan|diffusion|convect|measure|dataset|data\b|dilut|quench|limit|particle|dust|glovebox|cygnus|"
    r"apollo|\bmir\b|spinoff|firefight|fireman|explosion|accident|lessons? learned|shuttle|"
    r"researcher.s guide|sciencecast", re.I)


def on_topic(query: str) -> bool:
    """Cheap relevance gate for the no-AI fallbacks: the text must name an
    investigation or use at least one word from the subject area. (With an AI
    model connected, the model itself judges relevance.)"""
    return bool(mentioned(query)) or bool(_DOMAIN.search(query))


def top_similarity(query: str) -> float:
    return float(cosine_similarity(_vec.transform([query]), _matrix).max())


def query_similarity_by_investigation(query: str) -> dict[str, float]:
    sims = cosine_similarity(_inv_vec.transform([query]), _inv_matrix).ravel()
    return {i: float(s) for i, s in zip(_inv_ids, sims)}


def related(inv_id: str, k: int = 5) -> list[dict]:
    """Related investigations with the reasons they are related (shared attributes are
    listed so the suggestion can be checked, not just trusted)."""
    me = store.INVS[inv_id]
    idx = _inv_ids.index(inv_id)
    sims = cosine_similarity(_inv_matrix[idx], _inv_matrix).ravel()
    out = []
    for j, other_id in enumerate(_inv_ids):
        if other_id == inv_id:
            continue
        o = store.INVS[other_id]
        reasons, score = [], 0.0
        if other_id in me["psi_related"] or inv_id in o["psi_related"]:
            reasons.append("Listed as a related investigation in PSI")
            score += 0.5
        if other_id in me["reuses"]:
            reasons.append(f"This study re-analyses {o['short']} data")
            score += 0.5
        if inv_id in o["reuses"]:
            reasons.append(f"Re-analyses {me['short']} data")
            score += 0.5
        for label, key, weight in (("material", "materials", 0.08), ("topic", "topics", 0.1),
                                   ("facility", "facilities", 0.06), ("fire-safety area", "pillars", 0.08)):
            shared = [x for x in me[key] if x in o[key] and x != "fundamental"]
            if shared:
                reasons.append(f"Shared {label}{'s' if len(shared) > 1 else ''}: {', '.join(shared[:4])}")
                score += weight * min(len(shared), 3)
        if set(f.split(' ')[0] for f in me["fuel_state"]) & set(f.split(' ')[0] for f in o["fuel_state"]):
            score += 0.05
        text_sim = float(sims[j])
        score += text_sim
        if text_sim > 0.25:
            reasons.append("Similar wording in objectives and approach")
        if reasons:
            out.append({"investigation": store.card(o), "score": round(score, 3), "reasons": reasons})
    out.sort(key=lambda r: -r["score"])
    return out[:k]
