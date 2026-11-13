"""Turn the official NASA resources into passages the site and the assistant can quote and cite.

    python -X utf8 backend/ingest/build_resources.py

Reads data/raw/resources (see fetch_resources.py) and writes data/resources.json:

  resources   the ten resources NASA listed for the challenge, with NASA's description of each
              and the documents read for it (web page, PDF, caption file)
  passages    one entry per passage: resource, document, heading or page (or time in the
              video), the address to open it at, and the text
  texts       the full text read for each resource, used to check every quote shown on the site
  not_usable  files that could not be read, shown rather than hidden

Rules, the same as for the PSI documents:
  * Text is taken as NASA wrote it. Only line breaks, hyphenation at line ends and typeset
    ligatures are repaired.
  * A passage never crosses a web-page section, a PDF page or a stretch of the video, so every
    citation can say where it is.
  * Menus, image credits, contents pages and publication lists are left out and counted.
  * A scanned article whose text layer is missing or garbled is reported, not guessed at.
"""
from __future__ import annotations

import datetime as dt
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

from pypdf import PdfReader

from build_docs import clean, not_prose, split_page, strip_running_header
from nasa_resources import KIND_NAME, RESOURCES

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "resources"
OUT = ROOT / "data" / "resources.json"
SKIP_TAGS = {"script", "style", "noscript", "svg", "button", "select", "template", "iframe"}   # not "form": sma.nasa.gov wraps the whole page in one
CHROME_TAGS = {"nav", "header", "footer", "aside"}   # skipped only on pages with no <article>
BLOCK_TAGS = {"p", "li", "figcaption", "blockquote"}
HEAD_TAGS = {"h1", "h2", "h3", "h4"}
VOID_TAGS = {"br", "img", "hr", "input", "meta", "link", "source", "wbr"}
WORDS_PER_CAPTION_PASSAGE = 130
MIN_SECTION_WORDS = 20
CONTENTS_ENTRY = re.compile(r"[A-Za-z?)] \d{1,3} [A-Z]")   # "...in Microgravity? 8 Results from Past..."
SENTENCE = re.compile(r"[.!?][\"”’)]?(?:\s|$)")   # the end of a sentence somewhere in the text


def squash(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip()


class Blocks(HTMLParser):
    """Headings and paragraphs of a page's own content, in reading order."""

    def __init__(self, article_only: bool):
        super().__init__(convert_charrefs=True)
        self.article_only = article_only
        self.in_article = 0
        self.skip = 0
        self.chrome = 0
        self.kind: str | None = None     # "head" or "text" while a block is open
        self.tag: str | None = None
        self.depth = 0
        self.buf: list[str] = []
        self.blocks: list[tuple[str, str]] = []

    def handle_starttag(self, tag, attrs):
        if tag in VOID_TAGS:
            if tag == "br" and self.kind:
                self.buf.append(" ")
            return
        if tag == "article":
            self.in_article += 1
        if tag in SKIP_TAGS:
            self.skip += 1
        if tag in CHROME_TAGS and not self.article_only:
            self.chrome += 1
        if self.kind:
            if tag == self.tag:
                self.depth += 1
            self.buf.append(" ")
            return
        if self.skip or self.chrome or (self.article_only and not self.in_article):
            return
        if tag in HEAD_TAGS or tag in BLOCK_TAGS:
            self.kind, self.tag, self.depth, self.buf = ("head" if tag in HEAD_TAGS else "text"), tag, 1, []

    def handle_endtag(self, tag):
        if tag in SKIP_TAGS:
            self.skip = max(0, self.skip - 1)
        if tag in CHROME_TAGS and not self.article_only:
            self.chrome = max(0, self.chrome - 1)
        if self.kind and tag == self.tag:
            self.depth -= 1
            if self.depth == 0:
                text = squash("".join(self.buf))
                if text:
                    self.blocks.append((self.kind, text))
                self.kind = self.tag = None
        elif self.kind:
            self.buf.append(" ")
        if tag == "article":
            self.in_article = max(0, self.in_article - 1)

    def handle_data(self, data):
        if self.kind and not self.skip:
            self.buf.append(data)


def page_sections(html_text: str, res: dict) -> tuple[list[tuple[str, str]], dict[str, int]]:
    """(heading, text) for each section of a web page, and a count of what was left out."""
    parser = Blocks(article_only=bool(re.search(r"<article\b", html_text, re.I)))
    parser.feed(html_text)
    left_out: dict[str, int] = {}

    def skip(why: str) -> None:
        left_out[why] = left_out.get(why, 0) + 1

    stop = {s.lower() for s in res.get("stop_at", [])}
    drop = {s.lower() for s in res.get("drop_sections", [])}
    sections: list[list] = []           # [heading, [paragraphs]]
    seen: set[str] = set()
    dropping = False
    for kind, text in parser.blocks:
        if kind == "head":
            if text.lower() in stop:
                break
            dropping = text.lower() in drop
            if dropping:
                skip("section left out (see note)")
                continue
            sections.append([text, []])
            continue
        if dropping:
            continue
        words = text.split()
        key = re.sub(r"[^a-z0-9]", "", text.lower())[:70]
        if re.fullmatch(r"\d+ min read", text) or text.lower().startswith("full article: http"):
            continue
        if key in seen:
            skip("repeated paragraph")
            continue
        seen.add(key)
        if not sections:
            sections.append([res["title"], []])
        if len(words) < 8 and sections[-1][1]:
            skip("caption or menu line")       # a short line after real text: image caption, menu item
            continue
        if len(words) >= 8 and not SENTENCE.search(text):
            skip("menu or list of links")      # many words and not one sentence: site menu, "View Resource" lists
            continue
        sections[-1][1].append(text)

    out: list[tuple[str, str]] = []
    for heading, paras in sections:
        if len(paras) > 1 and len(paras[0].split()) < 8 and not SENTENCE.search(paras[0]):
            paras = paras[1:]                  # a byline or label standing before the text
        body = " ".join(paras)
        n = len(body.split())
        if n == 0:
            continue
        if n <= 5:                             # "Launched to ISS" / "November 2008": a labelled fact
            if out:
                out[-1] = (out[-1][0], f"{out[-1][1]} {heading}: {body}{'' if body.endswith('.') else '.'}")
            continue
        if n < MIN_SECTION_WORDS:              # one line under a heading ("There are a number of memorials...")
            skip("section too short to stand alone")
            continue
        out.append((heading, body))
    return out, left_out


def readable_share(text: str) -> float:
    """Share of tokens that look like words or numbers. Garbled OCR scores low."""
    tokens = text.split()
    if not tokens:
        return 0.0
    good = sum(1 for t in tokens if re.fullmatch(r"[\"'“”‘’(\[]*(?:[A-Za-z][A-Za-z’'\-]*|\d[\d,.:%/\-]*)[\"'“”‘’)\].,;:!?]*", t))
    return good / len(tokens)


def pdf_title(first_page: str, file_name: str, res: dict) -> str:
    if res.get("kind") == "review":
        return "A Researcher’s Guide to: Combustion Science (NASA ISS Program Science Office, 2015)"
    m = re.match(r"(.{8,90}?\([A-Za-z][A-Za-z\-]+\))", first_page)
    name = m.group(1) if m else re.sub(r"[-_]+", " ", file_name.rsplit(".", 1)[0]).strip().capitalize()
    return f"Fact sheet: {name}"


LIGATURES = {"ﬁ": "fi", "ﬂ": "fl", "ﬀ": "ff", "ﬃ": "ffi", "ﬄ": "ffl"}


def read_pdf(path: Path) -> list[str]:
    """Page texts. Typeset ligatures are spelled out ("ﬁre" -> "fire") so that search finds the words."""
    pages = [clean(p.extract_text() or "") for p in PdfReader(str(path)).pages]
    for a, b in LIGATURES.items():
        pages = [p.replace(a, b) for p in pages]
    return pages


def srt_cues(text: str) -> list[tuple[int, str]]:
    cues = []
    for block in re.split(r"\r?\n\s*\r?\n", text.strip()):
        m = re.search(r"(\d+):(\d+):(\d+)[,.]\d+\s*-->", block)
        if not m:
            continue
        start = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3))
        words = squash(block[block.index("-->"):].split("\n", 1)[1] if "\n" in block[block.index("-->"):] else "")
        if words and not re.fullmatch(r"\[.*\]", words):   # [ MUSIC ]
            cues.append((start, words))
    return cues


def clock(seconds: int) -> str:
    return f"{seconds // 60}:{seconds % 60:02d}"


def main() -> int:
    manifest = json.loads((RAW / "manifest.json").read_text(encoding="utf-8"))
    files: dict[str, list[dict]] = {}
    for f in manifest["files"]:
        files.setdefault(f["id"], []).append(f)
    passages: list[dict] = []
    texts: dict[str, str] = {}
    resources: list[dict] = []
    not_usable: list[dict] = [{"id": p["id"], "file": p["url"], "why": p["why"]} for p in manifest.get("problems", [])]
    left_out: dict[str, int] = {}

    def count(reasons: dict[str, int]) -> None:
        for k, v in reasons.items():
            left_out[k] = left_out.get(k, 0) + v

    for res in RESOURCES:
        docs: list[dict] = []
        full: list[str] = []

        def add(doc: dict, rows: list[dict]) -> None:
            doc.update(n=len(docs) + 1, passages=len(rows), words=sum(len(r["text"].split()) for r in rows))
            docs.append(doc)
            for r in rows:
                passages.append({"resource_id": res["id"], "doc": doc["n"], "doc_title": doc["title"], **r})
                full.append(r["text"])

        for f in files.get(res["id"], []):
            path = RAW / res["id"] / f["file"]
            if f["role"] == "page":
                sections, skipped = page_sections(path.read_text(encoding="utf-8", errors="replace"), res)
                count(skipped)
                rows = []
                for heading, body in sections:
                    for part in split_page(body):
                        rows.append({"section": heading, "page": None, "start": None, "url": f["url"], "text": part})
                add({"type": "page", "title": f"{res['title']} (web page)", "url": f["url"], "pages": None,
                     "fetched": f["fetched"], "bytes": f["bytes"]}, rows)
            elif f["role"] in ("pdf", "ntrs"):
                try:
                    pages = read_pdf(path)
                except Exception as exc:  # a damaged or encrypted file: report it, keep going
                    not_usable.append({"id": res["id"], "file": f["file"], "why": f"unreadable: {exc}"[:160]})
                    continue
                text = " ".join(pages)
                if len(text.split()) < 40:
                    not_usable.append({"id": res["id"], "file": f["file"], "url": f["url"],
                                       "why": "scanned pages with no text layer"})
                    continue
                if readable_share(text) < 0.85:
                    not_usable.append({"id": res["id"], "file": f["file"], "url": f["url"],
                                       "why": f"the scan's text layer is garbled (only {readable_share(text):.0%} "
                                              "of it reads as words)"})
                    continue
                if f["role"] == "ntrs":
                    title = f"{res['title']}: full Spinoff article (NASA Technical Reports Server)"
                else:
                    title = pdf_title(next((p for p in pages if len(p.split()) > 20), ""), f["file"], res)
                pages = strip_running_header(pages)
                rows = []
                for number, page_text in enumerate(pages, start=1):
                    if len(page_text.split()) < 25:
                        continue
                    if page_text.startswith(f"{number} "):       # the printed page number
                        page_text = page_text[len(str(number)) + 1:]
                    if len(CONTENTS_ENTRY.findall(page_text)) >= 8:
                        count({"contents page": 1})
                        continue
                    for part in split_page(page_text):
                        reason = not_prose(part)
                        if reason:
                            count({reason: 1})
                        else:
                            rows.append({"section": f"p. {number}", "page": number, "start": None,
                                         "url": f"{f['url']}#page={number}", "text": part})
                if rows:
                    add({"type": "pdf", "title": title, "url": f["url"], "pages": len(pages), "fetched": f["fetched"],
                         "bytes": f["bytes"]}, rows)
            elif f["role"] == "captions":
                cues = srt_cues(path.read_text(encoding="utf-8", errors="replace"))
                rows, cur, n, start = [], [], 0, None
                for i, (t, words) in enumerate(cues):
                    if start is None:
                        start = t
                    cur.append(words)
                    n += len(words.split())
                    last = i == len(cues) - 1
                    if (n >= WORDS_PER_CAPTION_PASSAGE and words.rstrip('"”').endswith((".", "?", "!"))) or last:
                        end = cues[i + 1][0] if not last else t
                        rows.append({"section": f"transcript, {clock(start)} to {clock(end)}", "page": None,
                                     "start": start, "url": f"{res['url']}&t={start}s", "text": " ".join(cur)})
                        cur, n, start = [], 0, None
                add({"type": "captions", "title": f"{res['title']} (NASA caption file)", "url": f["url"],
                     "pages": None, "fetched": f["fetched"], "bytes": f["bytes"]}, rows)

        texts[res["id"]] = " ".join(full)
        resources.append({
            **{k: res[k] for k in ("id", "slug", "kind", "short", "title", "url", "description", "topic")},
            "kind_name": KIND_NAME[res["kind"]], "video": res.get("video"), "note": res.get("note"),
            "documents": docs, "passages": sum(d["passages"] for d in docs), "words": sum(d["words"] for d in docs),
        })
        print(f"  {res['id']:7s} {res['short'][:34]:34s} {len(docs):2d} documents {resources[-1]['passages']:4d} passages "
              f"{resources[-1]['words']:6d} words")

    for i, p in enumerate(passages, start=1):
        p["n"] = i
    OUT.write_text(json.dumps({
        "built_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source_list": "Official NASA Resources, published by the NASA Space Apps organisers for the Flame in Freefall challenge",
        "resources": resources, "passages": passages, "texts": texts, "not_usable": not_usable, "left_out": left_out,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n{len(resources)} resources, {sum(len(r['documents']) for r in resources)} documents, "
          f"{len(passages)} passages -> {OUT.name} ({OUT.stat().st_size / 1024:.0f} KB)")
    print(f"   left out: {left_out}")
    for p in not_usable:
        print(f"   not usable: {p['id']}: {p['file'][:70]}: {p['why']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
