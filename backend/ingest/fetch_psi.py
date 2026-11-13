"""Download NASA PSI combustion-science investigation records.

Source: NASA Physical Sciences Informatics (PSI) repository, https://psi.nasa.gov
The PSI web app is backed by a public JSON API (the same "geode" backend used by
NASA OSDR). This script uses three read-only endpoints:

  /geode-py/ws/repo/search                      -> list of investigations
  /geode-py/ws/repo/investigations/<accession>  -> full record for one investigation
  /geode-py/ws/studies/<accession>/download     -> a public file (experimental tables)

Everything is written under data/raw/ so the rest of the pipeline works offline.
Re-running skips files that already exist (use --force to refresh).
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://psi.nasa.gov"
RAW = Path(__file__).resolve().parents[2] / "data" / "raw"
UA = "flame-in-freefall-research-dashboard/0.1"


def get(url: str, timeout: int = 180, tries: int = 3) -> bytes:
    last: Exception | None = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except Exception as exc:  # network hiccup: wait and retry
            last = exc
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"failed to fetch {url}: {last}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="re-download existing files")
    args = ap.parse_args()

    RAW.mkdir(parents=True, exist_ok=True)
    (RAW / "details").mkdir(exist_ok=True)
    (RAW / "tables").mkdir(exist_ok=True)
    (RAW / "images").mkdir(exist_ok=True)

    # 1. every PSI investigation (133 at time of writing); we filter locally
    listing_path = RAW / "psi_investigations_all.json"
    if args.force or not listing_path.exists():
        url = f"{BASE}/geode-py/ws/repo/search?q=&data_source=psi&data_type=investigation&from=0&size=500"
        listing_path.write_bytes(get(url))
    listing = json.loads(listing_path.read_text(encoding="utf-8"))
    hits = [h["_source"] for h in listing["hits"]["hits"]]
    combustion = [h for h in hits if "combustion" in (h.get("Research Area") or "").lower()]
    combustion.sort(key=lambda h: int(h["Accession"].split("-")[1]))
    print(f"{len(hits)} PSI investigations, {len(combustion)} in Combustion Science")

    manifest = []
    for h in combustion:
        acc = h["Accession"]
        detail_path = RAW / "details" / f"{acc}.json"
        if args.force or not detail_path.exists():
            detail_path.write_bytes(get(f"{BASE}/geode-py/ws/repo/investigations/{acc}"))
            time.sleep(0.5)
        detail = json.loads(detail_path.read_text(encoding="utf-8"))

        tables = []
        for t in detail.get("experimentalTable") or []:
            name = t.get("file_name")
            if not name or t.get("restricted"):
                continue
            out = RAW / "tables" / name
            url = (
                f"{BASE}/geode-py/ws/studies/{acc}/download?source=datamanager&file="
                + urllib.parse.quote(name)
            )
            if args.force or not out.exists():
                try:
                    out.write_bytes(get(url))
                    time.sleep(0.5)
                except RuntimeError as exc:
                    print(f"  ! {acc}: could not download {name}: {exc}")
                    continue
            tables.append({"file_name": name, "url": url, "bytes": out.stat().st_size})
        # representative image shown on the investigation page (optional)
        img = RAW / "images" / f"{acc}.jpg"
        pics = [p for p in (detail.get("images") or []) if p.get("file_name") and not p.get("restricted")
                and p["file_name"].lower().endswith((".jpg", ".jpeg", ".png"))]
        if pics and (args.force or not img.exists()):
            try:
                data = get(f"{BASE}/geode-py/ws/studies/{acc}/download?source=datamanager&file="
                           + urllib.parse.quote(pics[0]["file_name"]), timeout=120, tries=2)
                if data[:3] == bytes([0xFF, 0xD8, 0xFF]) or data[:4] == bytes([0x89, 0x50, 0x4E, 0x47]):
                    img.write_bytes(data)
            except RuntimeError:
                pass
        manifest.append(
            {"accession": acc, "acronym": h.get("Acronym") or "", "title": h["Title"], "tables": tables}
        )
        print(f"  {acc:8s} {(h.get('Acronym') or '-'):22s} tables={len(tables)}")

    (RAW / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
