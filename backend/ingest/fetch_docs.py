"""Download the NASA documents the AI assistant reads and cites.

For each combustion investigation, PSI lists files beside the raw footage. This script takes
the ones that state what was tested and found, as PDF:

  Reports             final science reports, post-flight reports, theses
  Science Documents   science requirements, test matrices, operations manuals
  Analyzed Data       PDF only (for CFI these are one-page summaries of each test)

They are saved under data/raw/docs/<accession>/ with a manifest. Re-running skips files that
are already there. Run fetch_psi.py first: the file lists come from the PSI records.
"""
from __future__ import annotations

import json
import sys
import time
import urllib.parse
from pathlib import Path

from fetch_psi import BASE, RAW, get

DOCS = RAW / "docs"
FOLDERS = {"Reports": "report", "Science Documents": "science_doc", "Analyzed Data": "analysed"}
MAX_BYTES = 60 * 2**20


def main() -> int:
    DOCS.mkdir(parents=True, exist_ok=True)
    manifest, skipped = [], []
    for path in sorted((RAW / "details").glob("*.json"), key=lambda p: int(p.stem.split("-")[1])):
        d = json.loads(path.read_text(encoding="utf-8"))
        acc = d["accession"]
        for f in d.get("added") or []:
            parts = (f.get("remote_path") or "").split("/")
            folder = parts[4] if len(parts) > 5 else ""
            name = f.get("file_name") or ""
            if folder not in FOLDERS or f.get("restricted") or f.get("visible") is False:
                continue
            if not name.lower().endswith(".pdf"):
                if folder == "Reports":
                    skipped.append({"accession": acc, "file_name": name, "why": "not a PDF"})
                continue
            if (f.get("file_size") or 0) > MAX_BYTES:
                skipped.append({"accession": acc, "file_name": name, "why": "larger than 60 MB"})
                continue
            url = f"{BASE}/geode-py/ws/studies/{acc}/download?source=datamanager&file=" + urllib.parse.quote(name)
            out = DOCS / acc / name
            out.parent.mkdir(exist_ok=True)
            if not out.exists():
                try:
                    data = get(url, timeout=300, tries=3)
                except RuntimeError as exc:
                    skipped.append({"accession": acc, "file_name": name, "why": f"download failed: {exc}"[:160]})
                    print(f"  ! {acc}: {name}: download failed")
                    continue
                if data[:5] != b"%PDF-":
                    skipped.append({"accession": acc, "file_name": name, "why": "not a PDF file"})
                    continue
                out.write_bytes(data)
                time.sleep(0.3)
                print(f"  {acc:8s} {len(data) / 2**20:6.1f} MB  {name[:90]}")
            manifest.append({"accession": acc, "folder": folder, "kind": FOLDERS[folder], "file_name": name,
                             "bytes": out.stat().st_size, "url": url})
    (DOCS / "manifest.json").write_text(json.dumps({"files": manifest, "skipped": skipped}, indent=1), encoding="utf-8")
    total = sum(m["bytes"] for m in manifest)
    print(f"{len(manifest)} documents, {total / 2**20:.0f} MB; {len(skipped)} skipped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
