"""Turn the downloaded NASA documents into page-level passages the assistant can search and cite.

    python -X utf8 backend/ingest/build_docs.py

Reads data/raw/docs (see fetch_docs.py) and writes data/docs.db:

  documents   one row per NASA file: experiment, folder, title, pages, download link
  passages    one row per passage: document, page number, text

Rules:
  * Text is taken as NASA wrote it. Only line breaks and hyphenation at line ends are repaired.
  * A passage never crosses a page, so every citation can name its page.
  * Pages with almost no text (figures, scans) are skipped and counted, not guessed at.
  * Passages that are mostly numbers (axis ticks, raw tables) are left out: they cannot be
    read as statements. The CFI test summary sheets are the exception; their values are kept.
"""
from __future__ import annotations

import json
import re
import sqlite3
import sys
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "data" / "raw" / "docs"
DB = ROOT / "data" / "docs.db"
WORDS = 210          # target passage length
MIN_PAGE_WORDS = 25
KIND_LABEL = {"report": "NASA report", "science_doc": "NASA science document", "analysed": "NASA analysed data"}


def title_of(file_name: str, folder: str) -> str:
    """'PSI-10_Reports_FinalRpt_ACMEFlameDesign.pdf' -> 'FinalRpt ACMEFlameDesign'"""
    stem = file_name.rsplit(".", 1)[0]
    stem = re.sub(rf"^PSI-\d+_{re.escape(folder)}_", "", stem)
    return re.sub(r"\s+", " ", stem.replace("_", " ")).strip()


def clean(text: str) -> str:
    text = text.replace("­", "")
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)          # hyphenation at a line end
    text = re.sub(r"[ \t]*\n[ \t]*", " ", text)
    return re.sub(r"\s{2,}", " ", text).strip()


def strip_running_header(pages: list[str]) -> list[str]:
    """Remove the header a document repeats on every page ("ACME/Flame Design Final Report (2023)
    6 April 2023 15"). Left in, it makes every page look like a match for the document's title."""
    if len(pages) < 4:
        return pages
    heads = [tuple(re.sub(r"\d+", "#", w) for w in p.split()[:14]) for p in pages]
    for n in range(14, 2, -1):
        counts: dict[tuple, int] = {}
        for h in heads:
            if len(h) >= n:
                counts[h[:n]] = counts.get(h[:n], 0) + 1
        if not counts:
            continue
        best, seen = max(counts.items(), key=lambda kv: kv[1])
        if seen >= 0.6 * len(pages):
            return [" ".join(p.split()[n:]) if h[:n] == best else p for p, h in zip(pages, heads)]
    return pages


def not_prose(text: str) -> str | None:
    """Passages that cannot be read as statements: contents pages, lists of publications, name
    and heading blocks, number tables. They are counted and left out, never rewritten."""
    tokens = text.split()
    if len(tokens) < 40:
        return "too short"
    if text.count("....") >= 3 or len(re.findall(r"\.{4,}\s*\d+", text)) >= 2:
        return "contents page"
    if sum(1 for t in tokens if re.search(r"[A-Za-z]{3,}", t)) / len(tokens) < 0.45:
        return "numbers"
    years = len(re.findall(r"\b(?:19|20)\d{2}\b", text))
    marks = len(re.findall(r"\bet al\b|\bpp?\.\s?\d|\bVol\.|Proceedings|Journal|Combust\.|doi\.org|AIAA", text))
    if years >= 6 and marks >= 4:
        return "publication list"
    if sum(1 for t in tokens if t[:1].isupper()) / len(tokens) > 0.6:
        return "names or headings"
    return None


def split_page(text: str) -> list[str]:
    sentences = re.split(r"(?<=[.!?])\s+(?=[A-Z(\[])", text)
    out, cur, n = [], [], 0
    for s in sentences:
        w = len(s.split())
        if n and n + w > WORDS:
            out.append(" ".join(cur))
            cur, n = [], 0
        cur.append(s)
        n += w
        while n > WORDS * 1.6:                            # one very long "sentence" (lists, tables)
            words = " ".join(cur).split()
            out.append(" ".join(words[:WORDS]))
            cur, n = [" ".join(words[WORDS:])], len(words) - WORDS
    if cur and (n >= 40 or not out):
        out.append(" ".join(cur))
    elif cur:
        out[-1] += " " + " ".join(cur)   # a short tail stays with the passage before it
    return out


def summary_sheet(text: str) -> str | None:
    """CFI analysed-data sheets are one page: a plot (axis ticks come out as noise) and a block of
    values such as 'FLEX-1210 ... P = 775.346 mmHg YO2 = 0.207 ... Dodecane D0 = 3.793 mm'."""
    m = re.search(r"(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \w{3} \d{1,2}, \d{4}.*", text)
    if not m or "=" not in m.group(0):
        return None
    return "Test summary sheet. " + m.group(0)


def main() -> int:
    manifest = json.loads((DOCS / "manifest.json").read_text(encoding="utf-8"))
    DB.unlink(missing_ok=True)
    con = sqlite3.connect(DB)
    con.executescript("""
        CREATE TABLE documents (id INTEGER PRIMARY KEY, investigation_id TEXT, folder TEXT, kind TEXT, title TEXT,
                                file_name TEXT, url TEXT, bytes INTEGER, pages INTEGER, pages_used INTEGER, words INTEGER);
        CREATE TABLE passages (id INTEGER PRIMARY KEY, document_id INTEGER, investigation_id TEXT, kind TEXT,
                               page INTEGER, text TEXT NOT NULL);
        CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
    """)
    n_docs = n_pass = 0
    left_out: dict[str, int] = {}
    problems = list(manifest.get("skipped", []))
    for f in manifest["files"]:
        path = DOCS / f["accession"] / f["file_name"]
        try:
            reader = PdfReader(str(path))
            pages = [clean(p.extract_text() or "") for p in reader.pages]
        except Exception as exc:  # a damaged or encrypted file: report it, keep going
            problems.append({"accession": f["accession"], "file_name": f["file_name"], "why": f"unreadable: {exc}"[:160]})
            continue
        rows = []
        sheet_like = f["kind"] == "analysed" and len(pages) <= 2
        if not sheet_like:
            pages = strip_running_header(pages)
        for number, text in enumerate(pages, start=1):
            if sheet_like:
                sheet = summary_sheet(text)
                if sheet:
                    rows.append((number, sheet))
                continue
            if len(text.split()) < MIN_PAGE_WORDS:
                continue
            for passage in split_page(text):
                reason = not_prose(passage)
                if reason:
                    left_out[reason] = left_out.get(reason, 0) + 1
                else:
                    rows.append((number, passage))
        if not rows:
            problems.append({"accession": f["accession"], "file_name": f["file_name"], "why": "no readable text (scanned or figures only)"})
            continue
        cur = con.execute("INSERT INTO documents (investigation_id, folder, kind, title, file_name, url, bytes, pages, pages_used, words) "
                          "VALUES (?,?,?,?,?,?,?,?,?,?)",
                          (f["accession"], f["folder"], f["kind"], title_of(f["file_name"], f["folder"]), f["file_name"], f["url"],
                           f["bytes"], len(pages), len({r[0] for r in rows}), sum(len(t.split()) for _, t in rows)))
        con.executemany("INSERT INTO passages (document_id, investigation_id, kind, page, text) VALUES (?,?,?,?,?)",
                        [(cur.lastrowid, f["accession"], f["kind"], page, text) for page, text in rows])
        n_docs += 1
        n_pass += len(rows)
        print(f"  {f['accession']:8s} {f['kind']:11s} {len(pages):4d} pages -> {len(rows):4d} passages  {f['file_name'][:70]}")
    con.execute("INSERT INTO meta VALUES ('problems', ?)", (json.dumps(problems),))
    con.commit()
    by_kind = con.execute("SELECT kind, count(DISTINCT document_id), count(*) FROM passages GROUP BY kind").fetchall()
    con.close()
    print(f"\n{n_docs} documents, {n_pass} passages -> {DB.name} ({DB.stat().st_size / 2**20:.1f} MB)")
    for kind, docs, passages in by_kind:
        print(f"   {KIND_LABEL[kind]:24s} {docs:3d} documents  {passages:5d} passages")
    print(f"   passages left out as not readable prose: {left_out}")
    print(f"   not usable: {len(problems)}")
    for p in problems:
        print(f"     {p['accession']}: {p['file_name'][:70]}: {p['why']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
