"""Meaning vectors for search, from a small model that runs on this machine.

No AI key and no tokens are involved: the model (BAAI/bge-small-en-v1.5, about 70 MB, run
with ONNX through the `fastembed` package) is downloaded once and then works offline. It is
optional. Without the package, or without data/embeddings.npz, search is by keywords alone.
"""
from __future__ import annotations

import logging

import numpy as np

log = logging.getLogger("flame.embeddings")
MODEL = "BAAI/bge-small-en-v1.5"
_model = None
_failed = False


def _get():
    global _model, _failed
    if _model is None and not _failed:
        try:
            from fastembed import TextEmbedding

            _model = TextEmbedding(MODEL)
        except Exception as exc:  # package missing, or the model could not be downloaded
            _failed = True
            log.warning("meaning-based search is off (%s); keyword search is used", exc)
    return _model


def available() -> bool:
    return _get() is not None


def passages(texts: list[str]) -> np.ndarray:
    return np.asarray(list(_get().embed(texts, batch_size=32)), dtype=np.float32)


def query(text: str) -> np.ndarray:
    return np.asarray(next(iter(_get().query_embed(text))), dtype=np.float32)
