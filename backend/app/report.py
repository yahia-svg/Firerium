"""PDF report built from an assistant conversation: summary, the questions and
answers, and a reference list of every NASA source cited."""
from __future__ import annotations

import re
from datetime import date

from fpdf import FPDF

from . import llm, store

CITE = re.compile(r"\[(PSI-\d+|RES-\d+|CHALLENGE)\]")
REPLACE = {
    "’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "—": "-", "‑": "-",
    "•": "-", "µ": "u", "μ": "u", "≥": ">=", "≤": "<=", "≈": "~", "→": "->",
    "×": "x", "₂": "2", "₃": "3", "₄": "4", "…": "...", " ": " ", "−": "-",
}

SUMMARY_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["title", "overview", "key_points", "open_questions"],
    "properties": {
        "title": {"type": "string"},
        "overview": {"type": "string"},
        "key_points": {"type": "array", "items": {"type": "string"}},
        "open_questions": {"type": "array", "items": {"type": "string"}},
    },
}


def name_tags(text: str) -> str:
    """On screen a [PSI-25] tag is drawn as a chip with the experiment's name. On paper
    the tag stays as text, so put the name in front of it unless it is already there."""
    def repl(m: re.Match) -> str:
        sid = m.group(1)
        if sid in store.RESOURCES:
            short = store.RESOURCES[sid]["short"]
        elif sid in store.INVS:
            short = store.INVS[sid]["short"]
        else:
            return m.group(0)
        before = text[:m.start()].rstrip(" (*_")
        return m.group(0) if before.lower().endswith(short.lower()) else f"{short} {m.group(0)}"
    return CITE.sub(repl, text)


def ref_order(sid: str) -> tuple:
    """Reference lists: PSI investigations by number, then the official NASA resources, then the challenge text."""
    if sid == "CHALLENGE":
        return (2, 0)
    return (1, int(sid.split("-")[1])) if sid in store.RESOURCES else (0, store.sort_key(sid))


def latin(text: str) -> str:
    for a, b in REPLACE.items():
        text = text.replace(a, b)
    return text.encode("latin-1", "replace").decode("latin-1")


def md_lines(md: str) -> list[tuple[str, str]]:
    """Very small markdown reader: returns (kind, text) with kind in h/li/p/quote/row."""
    out = []
    for raw in md.splitlines():
        line = raw.rstrip()
        if not line.strip():
            out.append(("gap", ""))
        elif re.match(r"^\s*\|?\s*:?-{3,}", line):
            continue  # table separator row
        elif line.lstrip().startswith("|"):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            out.append(("row", "  |  ".join(cells)))
        elif line.startswith("#"):
            out.append(("h", line.lstrip("# ").strip()))
        elif re.match(r"^\s*([-*]|\d+\.)\s+", line):
            out.append(("li", re.sub(r"^\s*([-*]|\d+\.)\s+", "", line)))
        elif line.lstrip().startswith(">"):
            out.append(("quote", line.lstrip("> ").strip()))
        else:
            out.append(("p", line.strip()))
    return out


class Report(FPDF):
    def header(self):
        self.set_font("Helvetica", "", 8)
        self.set_text_color(110, 118, 130)
        self.cell(0, 6, "Flame in Freefall  |  NASA PSI combustion research", align="L")
        self.cell(0, 6, f"Page {self.page_no()}", align="R", new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(210, 215, 222)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.ln(4)

    def block(self, text: str, size: float = 10, style: str = "", color=(30, 34, 40), indent: float = 0,
              gap: float = 1.5):
        self.set_font("Helvetica", style, size)
        self.set_text_color(*color)
        self.set_x(self.l_margin + indent)
        self.multi_cell(self.w - self.l_margin - self.r_margin - indent, size * 0.52, latin(text), markdown=True,
                        new_x="LMARGIN", new_y="NEXT")
        self.ln(gap)

    def markdown(self, md: str):
        for kind, text in md_lines(md):
            if kind == "gap":
                self.ln(1.5)
            elif kind == "h":
                self.block(f"**{text}**", 10.5)
            elif kind == "li":
                self.block(f"- {text}", 10, indent=4, gap=0.6)
            elif kind == "quote":
                self.block(text, 9, "I", (80, 88, 100), indent=6, gap=0.6)
            elif kind == "row":
                self.block(text, 8.5, color=(50, 56, 66), indent=2, gap=0.3)
            else:
                self.block(text, 10)


def conversation_summary(messages: list[dict]) -> dict | None:
    if not llm.available():
        return None
    transcript = "\n\n".join(
        f"{'READER' if m['role'] == 'user' else 'ASSISTANT'}: {m['content']}" for m in messages)[:60000]
    system = (
        "Summarise a research conversation from a NASA combustion-research dashboard into a short report for a "
        "professor, student or engineer. Use only what the conversation says; keep every citation tag such as "
        "[PSI-25] attached to the statement it supports, and add no new facts. title: a specific report title of "
        "at most ten words. overview: one paragraph. key_points: 3 to 6 findings, each one sentence with its "
        "citation tags. open_questions: up to 4 things the conversation left unanswered or that the collection "
        "does not cover.")
    try:
        return llm.complete_json(system, transcript, SUMMARY_SCHEMA)
    except llm.LLMError:
        return None


def build_pdf(messages: list[dict], title: str | None = None) -> bytes:
    summary = conversation_summary(messages)
    pdf = Report(format="A4")
    pdf.set_margins(18, 14, 18)
    pdf.set_auto_page_break(True, margin=16)
    pdf.add_page()

    pdf.block(f"**{(summary or {}).get('title') or title or 'Research report'}**", 18, gap=1)
    pdf.block(f"Generated {date.today().isoformat()} from the Flame in Freefall research assistant. "
              f"Sources: NASA Physical Sciences Informatics (PSI) records, the official NASA resources listed for "
              f"the challenge and the NASA challenge description.",
              9, color=(90, 98, 110), gap=3)
    pdf.block("This report is a research aid. It is not a certified spacecraft safety assessment, and nothing in "
              "it is a guaranteed real-world outcome. Check each statement against the cited NASA source.",
              8.5, "I", (120, 70, 20), gap=4)

    if summary:
        pdf.block("**Summary**", 13)
        pdf.block(name_tags(summary["overview"]), 10, gap=3)
        if summary["key_points"]:
            pdf.block("**Key points**", 11)
            for k in summary["key_points"]:
                pdf.block(f"- {name_tags(k)}", 10, indent=4, gap=0.8)
            pdf.ln(2)
        if summary["open_questions"]:
            pdf.block("**Open questions**", 11)
            for k in summary["open_questions"]:
                pdf.block(f"- {name_tags(k)}", 10, indent=4, gap=0.8)
            pdf.ln(2)
    else:
        pdf.block("No AI summary: no language model was connected when this report was generated. The full "
                  "questions and answers follow.", 9, "I", (90, 98, 110), gap=3)

    pdf.block("**Questions and answers**", 13)
    n = 0
    for m in messages:
        if m["role"] == "user":
            n += 1
            pdf.ln(1)
            pdf.block(f"**Q{n}. {m['content']}**", 10.5, color=(18, 70, 130))
        else:
            pdf.markdown(name_tags(m["content"]))
            if m.get("mode") == "retrieval":
                pdf.block("(Retrieval-only answer: quoted passages, no AI interpretation.)", 8, "I", (110, 118, 130))

    cited: list[str] = []
    for m in messages:
        for c in CITE.findall(m["content"]):
            if c not in cited and (c == "CHALLENGE" or c in store.INVS or c in store.RESOURCES):
                cited.append(c)
    pdf.ln(3)
    pdf.block("**References**", 13)
    if not cited:
        pdf.block("No sources were cited in this conversation.", 10)
    for c in sorted(cited, key=ref_order):
        if c == "CHALLENGE":
            pdf.block("**[CHALLENGE]** NASA Space Apps Challenge, 'Flame in Freefall' challenge description.", 9.5)
            continue
        if c in store.RESOURCES:
            res = store.RESOURCES[c]
            pdf.block(f"**[{c}]** {res['title']}. NASA ({res['kind_name']}), official resource for the challenge. "
                      f"{res['url']}", 9.5, gap=1.2)
            continue
        inv = store.INVS[c]
        line = f"**[{c}]** {inv['title']}" + (f" ({inv['acronym']})" if inv["acronym"] else "") + \
               ". NASA Physical Sciences Informatics. " + inv["links"]["psi"]
        if inv["links"]["doi"]:
            line += f"  DOI: {inv['links']['doi']}"
        pdf.block(line, 9.5, gap=1.2)
    return bytes(pdf.output())
