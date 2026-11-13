"""Download the official NASA resources listed for the challenge (see nasa_resources.py).

    python -X utf8 backend/ingest/fetch_resources.py [--force]

For each resource this saves, under data/raw/resources/<id>/:

  page.html      the web page
  *.pdf          the PDFs the page's article links to (the Researcher's Guide; the fact sheets
                 on the NASA Combustion Science page)
  captions.srt   NASA's caption file for the ScienceCast video, from images.nasa.gov
  ntrs_*.pdf     the full Spinoff article on NASA's Technical Reports Server, when the page
                 points to one

and a manifest with the address and size of every file. Re-running skips what is already
there. PSI itself (resource 1) is downloaded by fetch_psi.py and fetch_docs.py.
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from nasa_resources import RESOURCES

OUT = Path(__file__).resolve().parents[2] / "data" / "raw" / "resources"
# nasa.gov answers a plain browser-style client; nothing about this project is sent
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
MAX_PDF = 40 * 2**20


def get(url: str, timeout: int = 120, tries: int = 3) -> bytes:
    last: Exception | None = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*", "Accept-Language": "en"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except Exception as exc:  # network hiccup: wait and retry
            last = exc
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"failed to fetch {url}: {last}")


def article_html(page: str) -> str:
    """The part of a page that holds its own content (not the site menus)."""
    m = re.search(r"<article\b.*?</article>", page, re.S | re.I) or re.search(r"<main\b.*?</main>", page, re.S | re.I)
    return m.group(0) if m else page


def linked_pdfs(page: str, base: str) -> list[dict]:
    """PDF links inside the page's article, with the link text as the title."""
    out, seen = [], set()
    for m in re.finditer(r'<a\b[^>]*href="([^"]+?\.pdf)(?:\?[^"]*)?"[^>]*>(.*?)</a>', article_html(page), re.S | re.I):
        url = urllib.parse.urljoin(base, html.unescape(m.group(1)))
        if url in seen or "nasa.gov" not in urllib.parse.urlparse(url).netloc:
            continue
        seen.add(url)
        label = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", m.group(2)))).strip()
        out.append({"url": url, "label": label})
    return out


def ntrs_id(page: str) -> str | None:
    """Spinoff pages end with 'Full article: http://hdl.handle.net/hdl:2060/20030005480'."""
    m = re.search(r"hdl\.handle\.net/(?:hdl:)?2060/(\d{8,})", page)
    return m.group(1) if m else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="re-download existing files")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    manifest, problems = [], []

    def save(res: dict, name: str, url: str, role: str, label: str = "", check=None) -> Path | None:
        path = OUT / res["id"] / name
        path.parent.mkdir(exist_ok=True)
        if args.force or not path.exists():
            try:
                data = get(url)
            except RuntimeError as exc:
                problems.append({"id": res["id"], "url": url, "why": f"download failed: {exc}"[:200]})
                print(f"  ! {res['id']}: {url}: download failed")
                return None
            if check and not check(data):
                problems.append({"id": res["id"], "url": url, "why": "not the expected kind of file"})
                return None
            path.write_bytes(data)
            time.sleep(0.4)
            print(f"  {res['id']:7s} {len(data) / 1024:8.0f} KB  {name}")
        manifest.append({"id": res["id"], "file": name, "role": role, "label": label, "url": url,
                         "bytes": path.stat().st_size,
                         "fetched": dt.date.fromtimestamp(path.stat().st_mtime).isoformat()})
        return path

    is_pdf = lambda data: data[:5] == b"%PDF-" and len(data) <= MAX_PDF  # noqa: E731
    for res in RESOURCES:
        plan = res["fetch"]
        page_text = ""
        if plan.get("page"):
            path = save(res, "page.html", res["url"], "page")
            page_text = path.read_text(encoding="utf-8", errors="replace") if path else ""
        if plan.get("pdfs") == "linked" and page_text:
            for link in linked_pdfs(page_text, res["url"]):
                name = urllib.parse.unquote(link["url"].rsplit("/", 1)[-1])
                save(res, name, link["url"], "pdf", link["label"], check=is_pdf)
        if plan.get("captions"):
            save(res, "captions.srt", plan["captions"], "captions", check=lambda d: b"-->" in d[:400])
        if plan.get("ntrs") and page_text:
            nid = ntrs_id(page_text)
            if nid:
                save(res, f"ntrs_{nid}.pdf", f"https://ntrs.nasa.gov/api/citations/{nid}/downloads/{nid}.pdf",
                     "ntrs", f"NTRS {nid}", check=is_pdf)

    (OUT / "manifest.json").write_text(json.dumps({"files": manifest, "problems": problems}, indent=1), encoding="utf-8")
    total = sum(m["bytes"] for m in manifest)
    print(f"{len(manifest)} files for {len({m['id'] for m in manifest})} resources, {total / 2**20:.1f} MB; "
          f"{len(problems)} problems")
    for p in problems:
        print(f"   {p['id']}: {p['url'][:90]}: {p['why']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
