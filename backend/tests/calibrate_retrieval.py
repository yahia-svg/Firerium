"""Prints the best passage similarity for on-topic and off-topic questions, to
choose the 'not in the collection' threshold used by the assistant."""
import os
import sys
from pathlib import Path

os.environ["FLAME_DISABLE_LLM"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import retrieval, store  # noqa: E402

store.load()
retrieval.build()

ON = [
    "Which NASA experiments studied smoke detection in space?",
    "What did BASS-II study?",
    "Which experiments tested oxygen above 30%?",
    "How does carbon dioxide suppress a flame in microgravity?",
    "What is known about partial gravity combustion?",
    "Which materials were burned in Saffire?",
    "What sensors did SAME use?",
    "moon base fire safety",
    "cool flames",
    "Is there data on fabric flammability?",
    "explain limiting oxygen index",
]
OFF = [
    "best pizza recipe in naples",
    "who won the world cup in 2018",
    "how do I fix my bicycle tire",
    "write me a poem about the sea",
    "stock price of apple tomorrow",
    "what is the capital of France",
    "best football striker of 2022",
    "how to bake bread at home",
]
for label, qs in (("ON ", ON), ("OFF", OFF)):
    for q in qs:
        hits = retrieval.search(q, k=1)
        top = hits[0] if hits else None
        print(f"{label} {retrieval.top_similarity(q):.3f}  {q[:52]:52s} -> {top['investigation_id'] + ' / ' + top['section'] if top else '-'}")
