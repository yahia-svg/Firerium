"""Give every passage a meaning vector, so the assistant can find a passage that answers a
question even when it uses different words (question: "how big are the smoke particles",
report: "count mean diameter").

    python -X utf8 backend/ingest/build_embeddings.py

Runs on this machine with a small local model (see app/embeddings.py): no AI key, no tokens.
Takes a few minutes. Writes data/embeddings.npz; the site uses it when it matches the passages
it has loaded, and falls back to keyword search when it does not. Run it again after
build_db.py or build_docs.py.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import numpy as np

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app import embeddings, store  # noqa: E402

OUT = store.ROOT / "data" / "embeddings.npz"
STEP = 256


def main() -> int:
    store.load()
    if not embeddings.available():
        print("The local embedding model is not available. Install it with: pip install fastembed")
        return 1
    ids = [c["id"] for c in store.CHUNKS]
    texts = [c["text"][:2000] for c in store.CHUNKS]
    parts = []
    started = time.time()
    for start in range(0, len(texts), STEP):
        parts.append(embeddings.passages(texts[start:start + STEP]))
        print(f"  {min(start + STEP, len(texts)):5d} / {len(texts)} passages  ({time.time() - started:.0f}s)", flush=True)
    vectors = np.vstack(parts)
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    vectors = (vectors / np.where(norms == 0, 1, norms)).astype(np.float16)
    np.savez_compressed(OUT, ids=np.asarray(ids, dtype=np.int64), vectors=vectors, model=embeddings.MODEL)
    print(f"{len(ids)} vectors of {vectors.shape[1]} dimensions -> {OUT.name} ({OUT.stat().st_size / 2**20:.1f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
