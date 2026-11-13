"""Build data/flame.db (SQLite) from the raw NASA PSI downloads.

Run after fetch_psi.py:

    python backend/ingest/build_db.py

One shared data format feeds every feature of the site:

  investigations  one JSON document per PSI investigation (PSI text kept verbatim,
                  plus tags and condition ranges with their provenance)
  tables          the PSI "experimental table" CSV files (one row per test/run)
  runs            every table row, normalised to oxygen / pressure / airflow / material
  chunks          text passages for the AI assistant's retrieval step
  meta            build information

Missing values stay missing (None -> "Not reported" in the UI); nothing is guessed.
"""
from __future__ import annotations

import csv
import io
import json
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from challenge_text import CHALLENGE_PASSAGES, CHALLENGE_SOURCE  # noqa: E402
from curation import (  # noqa: E402
    CURATION,
    DILUENT_VOCAB,
    MATERIAL_VOCAB,
    SENSOR_VOCAB,
    TABLE_SPECS,
)

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
DB_PATH = ROOT / "data" / "flame.db"
PSI = "https://psi.nasa.gov"
NUM = re.compile(r"(?<![A-Za-z])[-+]?(?:\d+\.?\d*|\.\d+)")


def clean(s) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip()


def read_csv(path: Path) -> tuple[list[str], list[list[str]]]:
    raw = path.read_bytes()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp1252")
    rows = [r for r in csv.reader(io.StringIO(text)) if any(c.strip() for c in r)]
    header = [h.strip() for h in rows[0]]
    width = len(header)
    body = [[(c or "").strip() for c in (r + [""] * width)[:width]] for r in rows[1:]]
    return header, body


def numbers(cell: str, regex: str | None = None) -> list[float]:
    if not cell:
        return []
    found = re.findall(regex, cell) if regex else NUM.findall(cell)
    out = []
    for f in found:
        try:
            out.append(float(f))
        except ValueError:
            pass
    return out


def find_spec(file_name: str) -> dict:
    # longest matching fragment wins ("CFI-G_Normal Flames.csv" before "CFI.csv")
    best = None
    for frag, spec in TABLE_SPECS.items():
        if file_name.endswith(frag) and (best is None or len(frag) > len(best[0])):
            best = (frag, spec)
    return best[1] if best else {}


def vocab_tags(vocab: dict[str, str], text: str) -> list[str]:
    return [label for label, pat in vocab.items() if re.search(pat, text, re.I)]


def split_chunks(text: str, target: int = 900) -> list[str]:
    text = clean(text)
    if len(text) <= target * 1.3:
        return [text] if text else []
    sentences = re.split(r"(?<=[.;:])\s+(?=[A-Z0-9(])", text)
    chunks, cur = [], ""
    for s in sentences:
        if cur and len(cur) + len(s) > target:
            chunks.append(cur.strip())
            cur = ""
        cur += s + " "
    if cur.strip():
        chunks.append(cur.strip())
    return chunks


def fmt_range(c: dict | None) -> str:
    if not c:
        return "Not reported"
    lo, hi, unit = c["min"], c["max"], c["unit"]
    lo = None if lo is None else round(lo, 2)
    hi = round(hi, 2)
    if lo is None:
        return f"up to {hi:g} {unit}"
    if abs(hi - lo) < 1e-9:
        return f"{lo:g} {unit}"
    return f"{lo:g} to {hi:g} {unit}"


def build() -> None:
    listing = json.loads((RAW / "psi_investigations_all.json").read_text(encoding="utf-8"))
    hits = {h["_source"]["Accession"]: h["_source"] for h in listing["hits"]["hits"]}
    manifest = json.loads((RAW / "manifest.json").read_text(encoding="utf-8"))

    investigations, tables, runs, chunks = [], [], [], []
    problems: list[str] = []

    for entry in manifest:
        acc = entry["accession"]
        d = json.loads((RAW / "details" / f"{acc}.json").read_text(encoding="utf-8"))
        s = hits[acc]
        cur = CURATION.get(acc)
        if not cur:
            problems.append(f"{acc}: no curation entry")
            continue

        text = {
            "objective": clean(d.get("objective")),
            "approach": clean(d.get("approach")),
            "hypothesis": clean(d.get("hypothesis")),
            "impacts": clean(d.get("researchImpacts")),
        }
        keywords = [k.strip() for k in re.split(r"\s{2,}", (s.get("Keywords") or "").strip()) if k.strip()]
        hardware = clean(d.get("experimentHardware"))
        all_text = " ".join([*text.values(), " ".join(keywords), hardware])
        method_text = " ".join([text["objective"], text["approach"]])

        # ---- run tables --------------------------------------------------
        cond_sources: dict[str, list[dict]] = {"oxygen": [], "pressure": [], "airflow": []}
        table_material_text = ""
        table_ids = []
        for t in entry["tables"]:
            fname = t["file_name"]
            header, body = read_csv(RAW / "tables" / fname)
            # some PSI tables end with footnote lines ("Note 1 ...") typed into the first cell;
            # they are notes about the data, not test rows
            footnotes = [r[0] for r in body if re.match(r"(?i)note\b", r[0]) and not any(r[1:])]
            body = [r for r in body if not (re.match(r"(?i)note\b", r[0]) and not any(r[1:]))]
            spec = find_spec(fname)
            if not spec:
                problems.append(f"{acc}: no TABLE_SPEC for {fname}")
            table_id = f"{acc}:{len(table_ids) + 1}"
            table_ids.append(table_id)
            labels = spec.get("labels", {})

            columns = []
            for i, h in enumerate(header):
                vals = [r[i] for r in body if r[i]]
                nums = []
                for v in vals:
                    try:
                        nums.append(float(v))
                    except ValueError:
                        pass
                numeric = bool(nums) and len(nums) >= 0.7 * len(vals)
                col = {"key": h, "label": labels.get(h, clean(h)), "numeric": numeric, "filled": len(vals)}
                if numeric:
                    col.update(min=min(nums), max=max(nums))
                else:
                    col["distinct"] = len(set(vals))
                columns.append(col)

            # normalised per-run conditions
            units = {"oxygen": "% O2", "pressure": "atm", "airflow": "cm/s"}
            derived_cols: dict[str, list] = {}
            per_param_values: dict[str, list[float]] = {}
            quality_notes: list[str] = []
            for param in ("oxygen", "pressure", "airflow"):
                ps = spec.get(param)
                if not ps:
                    continue
                if ps["col"] not in header:
                    problems.append(f"{acc}: column {ps['col']!r} not in {fname}")
                    continue
                ci = header.index(ps["col"])
                allv, single, excluded = [], [], []
                for r in body:
                    ns = [n * ps["scale"] for n in numbers(r[ci], ps.get("regex"))]
                    if ps.get("drop_zero"):
                        ns = [n for n in ns if n != 0]
                    if "min_valid" in ps:
                        ns = [n for n in ns if n >= ps["min_valid"]]
                    if param == "oxygen" and any(n > 100 for n in ns):
                        # an oxygen percentage above 100 is a typing/format slip in the
                        # source file; we leave it out of ranges and say so, never "fix" it
                        excluded.append(r[ci])
                        ns = [n for n in ns if n <= 100]
                    allv.extend(ns)
                    single.append(round(ns[0], 4) if len(ns) == 1 else None)
                per_param_values[param] = allv
                derived_cols[param] = single
                note = ps.get("note")
                if excluded:
                    q = (f"{len(excluded)} cell(s) in '{clean(ps['col'])}' were left out of the range because "
                         f"the value is not a possible oxygen percentage: {', '.join(repr(x) for x in excluded)}.")
                    quality_notes.append(q)
                    note = f"{note} {q}" if note else q
                if allv:
                    cond_sources[param].append({
                        "type": "run_table", "table_id": table_id,
                        "min": round(min(allv), 4), "max": round(max(allv), 4),
                        "unit": units[param], "column": labels.get(ps["col"], clean(ps["col"])),
                        "note": note,
                    })

            mat_col = spec.get("material")
            mi = header.index(mat_col) if mat_col and mat_col in header else None
            if mat_col and mi is None:
                problems.append(f"{acc}: material column {mat_col!r} not in {fname}")

            derived_meta = []
            names = {"oxygen": "O2 (% by volume)", "pressure": "Pressure (atm)", "airflow": "Airflow (cm/s)"}
            for param, vals in derived_cols.items():
                present = [v for v in vals if v is not None]
                if not present:
                    continue
                ps = spec[param]
                src = labels.get(ps["col"], clean(ps["col"]))
                how = f"'{src}'" + (f" x {ps['scale']:g}" if abs(ps["scale"] - 1) > 1e-9 else "")
                derived_meta.append({
                    "key": f"_{param}", "label": names[param], "numeric": True, "derived": True,
                    "formula": f"Normalised from {how}" + (f". {ps['note']}" if ps.get("note") else ""),
                    "filled": len(present), "min": min(present), "max": max(present),
                })

            rows_out = []
            for ri, r in enumerate(body):
                row = dict(zip(header, r))
                for param, vals in derived_cols.items():
                    if any(m["key"] == f"_{param}" for m in derived_meta):
                        row[f"_{param}"] = "" if vals[ri] is None else f"{vals[ri]:g}"
                rows_out.append(row)
                material = r[mi] if mi is not None else ""
                if spec.get("material_exclude") and material.startswith(spec["material_exclude"]):
                    material = ""
                if spec.get("material_split") and material:
                    material = material.split(spec["material_split"])[0].strip()
                table_material_text += " " + material
                runs.append({
                    "investigation_id": acc, "table_id": table_id, "row": ri,
                    "material": material or None,
                    "oxygen": derived_cols.get("oxygen", [None] * len(body))[ri],
                    "pressure": derived_cols.get("pressure", [None] * len(body))[ri],
                    "airflow": derived_cols.get("airflow", [None] * len(body))[ri],
                })

            tables.append({
                "id": table_id, "investigation_id": acc,
                "title": spec.get("title", fname), "file_name": fname, "source_url": t["url"],
                "n_rows": len(body), "columns": columns + derived_meta,
                "label_note": spec.get("label_note"), "quality_notes": quality_notes,
                "footnotes": footnotes, "rows": rows_out,
            })

        # ---- conditions: run tables + statements quoted from the PSI text
        for st in cur.get("stated", []):
            if st["quote"] not in clean(" ".join(text.values())):
                problems.append(f"{acc}: quote not found in PSI text: {st['quote']!r}")
            cond_sources[st["param"]].append({
                "type": "psi_text", "min": None if st["min"] is None else round(st["min"], 4),
                "max": round(st["max"], 4), "unit": st["unit"], "quote": st["quote"], "note": st.get("note"),
            })
        conditions = {}
        for param, sources in cond_sources.items():
            if not sources:
                conditions[param] = None
                continue
            lows = [x["min"] for x in sources if x["min"] is not None]
            conditions[param] = {
                "min": min(lows) if lows else None,
                "max": max(x["max"] for x in sources),
                "unit": sources[0]["unit"], "sources": sources,
            }

        project_type = clean(d.get("projectType"))
        is_flight = project_type.lower().startswith("microgravity")
        gravity = {
            "level": "microgravity" if is_flight else "ground",
            "label": "Microgravity (flight)" if is_flight else "Ground-based analysis / modeling",
            "note": cur.get("gravity_note"),
        }

        pubs = []
        for p in d.get("publications") or []:
            title = clean(p.get("title"))
            if not title:
                continue
            doi = clean(p.get("doi"))
            pubs.append({
                "title": title, "authors": clean(p.get("authorList")),
                "doi": doi or None,
                "url": (doi if doi.startswith("http") else f"https://doi.org/{doi}") if doi else None,
            })

        team = []
        for c in d.get("contacts") or []:
            name = clean(f"{c.get('firstName', '')} {c.get('lastName', '')}")
            role = clean(((c.get("roles") or [{}])[0]).get("annotationValue"))
            if name:
                team.append({"name": name, "role": role})
        pi = next((m["name"] for m in team if "Principal" in m["role"]), None)

        hw_links = [u.strip() for u in (d.get("experimentHardwareLink") or "").split(",") if u.strip().startswith("http")]
        facilities = [name for name, pat in {
            "Combustion Integrated Rack (CIR)": r"Combustion Integrated Rack|\bCIR\b",
            "ACME insert": r"\bACME\b",
            "Multi-user Droplet Combustion Apparatus (MDCA)": r"Droplet Combustion App",
            "Microgravity Science Glovebox (MSG)": r"Microgravity Science Glovebox|Microgravity Glove Box|\bMSG\b",
            "Cygnus cargo vehicle": r"Cygnus",
        }.items() if re.search(pat, hardware)]
        msg = "Microgravity Science Glovebox (MSG)"
        if is_flight and msg not in facilities and re.search(r"Glovebox|Glove Box", text["approach"]):
            facilities.append(msg)
        for extra in cur.get("facilities_extra", []):
            if extra not in facilities:
                facilities.append(extra)

        doi = clean(d.get("doi"))
        acronym = clean(d.get("investigationAcronym"))
        inv = {
            "id": acc,
            "acronym": acronym or None,
            "name": cur["name"],
            "short": acronym or cur["name"],
            "title": clean(d.get("title")),
            "research_area": clean(d.get("researchArea")),
            "sub_area": clean(d.get("subResearchArea")) or None,
            "project_type": project_type,
            "gravity": gravity,
            "platform": clean(d.get("flightProgram")) or None,
            "hardware": hardware or None,
            "hardware_links": hw_links,
            "facilities": facilities,
            "start_date": clean(d.get("investigationStartDate")) or None,
            "end_date": clean(d.get("investigationEndDate")) or None,
            "pi": pi,
            "team": team,
            "keywords": keywords,
            "text": text,
            "publications": pubs,
            "psi_related": [x.strip() for x in (d.get("related_glds") or "").split(",") if x.strip() in CURATION],
            "links": {
                "psi": f"{PSI}/physci/repo/data/investigations/{acc}",
                "doi": f"https://doi.org/{doi}" if doi else None,
            },
            "license": clean(d.get("licenseName")) or None,
            "archive_gb": round((d.get("totalFileSize") or 0) / 1e9, 1) or None,
            "has_image": (RAW / "images" / f"{acc}.jpg").exists(),
            # project-team layer
            "fuel_state": cur["fuel_state"],
            "emulates": cur.get("emulates"),
            "pillars": cur["pillars"],
            "topics": cur["topics"],
            "geometry": cur.get("geometry"),
            "directness": cur["directness"],
            "suppressants": cur.get("suppressants", []),
            "reuses": cur.get("reuses", []),
            "summary": cur["summary"],
            "safety_note": cur["safety_note"],
            # tags found in the record's own text / tables
            "materials": vocab_tags(MATERIAL_VOCAB, method_text + " " + table_material_text),
            "sensors": vocab_tags(SENSOR_VOCAB, all_text + " " + " ".join(
                c["key"] for t in tables if t["investigation_id"] == acc for c in t["columns"])),
            "gases": vocab_tags(DILUENT_VOCAB, method_text),
            "conditions": conditions,
            "tables": [{"id": t["id"], "title": t["title"], "n_rows": t["n_rows"]}
                       for t in tables if t["investigation_id"] == acc],
            "n_runs": sum(t["n_rows"] for t in tables if t["investigation_id"] == acc),
        }
        investigations.append(inv)

        # ---- retrieval chunks -------------------------------------------
        def add(section: str, body_text: str) -> None:
            for part in split_chunks(body_text):
                chunks.append({"investigation_id": acc, "section": section,
                               "text": f"{inv['short']} ({acc}) - {section}: {part}"})

        overview = (
            f"{inv['title']}" + (f" ({acronym})" if acronym else "") + f". PSI accession {acc}. "
            f"Research area: {inv['research_area']}; sub-area: {inv['sub_area'] or 'not reported'}. "
            f"Type: {project_type}. Platform: {inv['platform'] or 'not reported'}. "
            f"Hardware: {hardware or 'not reported'}. Principal investigator: {pi or 'not reported'}. "
            f"Fuel state: {', '.join(inv['fuel_state'])}. Materials and fuels named: {', '.join(inv['materials']) or 'not reported'}. "
            f"Sample geometry: {inv['geometry'] or 'not reported'}. "
            f"Sensors and measurements named: {', '.join(inv['sensors']) or 'not reported'}. "
            f"Keywords: {', '.join(keywords)}."
        )
        add("Overview", overview)
        add("Test conditions", (
            f"Oxygen: {fmt_range(conditions['oxygen'])}. Pressure: {fmt_range(conditions['pressure'])}. "
            f"Forced airflow: {fmt_range(conditions['airflow'])}. Gravity: {gravity['label']}. "
            + (gravity["note"] or "")
            + (f" Suppressant or diluent gases: {', '.join(inv['suppressants'])}." if inv["suppressants"] else "")
            + f" Run tables in PSI: {', '.join(t['title'] + ' (' + str(t['n_rows']) + ' rows)' for t in inv['tables']) or 'none'}."
        ))
        add("Plain-language summary (project team)", inv["summary"] + " Fire-safety relevance: " + inv["safety_note"])
        add("Objective", text["objective"])
        add("Approach", text["approach"])
        add("Hypothesis", text["hypothesis"])
        add("Research impacts and Earth benefits", text["impacts"])
        if pubs:
            add("Publications", "; ".join(p["title"] for p in pubs[:25]))

    for title, passage in CHALLENGE_PASSAGES:
        chunks.append({"investigation_id": CHALLENGE_SOURCE["id"], "section": title,
                       "text": f"{CHALLENGE_SOURCE['name']} - {title}: {passage}"})

    if problems:
        print("BUILD PROBLEMS:")
        for p in problems:
            print("  -", p)
        raise SystemExit(1)

    # ---- write SQLite ------------------------------------------------------
    if DB_PATH.exists():
        DB_PATH.unlink()
    con = sqlite3.connect(DB_PATH)
    con.executescript("""
        CREATE TABLE investigations (id TEXT PRIMARY KEY, short TEXT, json TEXT NOT NULL);
        CREATE TABLE tables (id TEXT PRIMARY KEY, investigation_id TEXT, title TEXT, json TEXT NOT NULL);
        CREATE TABLE runs (investigation_id TEXT, table_id TEXT, row INTEGER, material TEXT,
                           oxygen REAL, pressure REAL, airflow REAL);
        CREATE TABLE chunks (id INTEGER PRIMARY KEY, investigation_id TEXT, section TEXT, text TEXT NOT NULL);
        CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
    """)
    con.executemany("INSERT INTO investigations VALUES (?,?,?)",
                    [(i["id"], i["short"], json.dumps(i, ensure_ascii=False)) for i in investigations])
    con.executemany("INSERT INTO tables VALUES (?,?,?,?)",
                    [(t["id"], t["investigation_id"], t["title"], json.dumps(t, ensure_ascii=False)) for t in tables])
    con.executemany("INSERT INTO runs VALUES (?,?,?,?,?,?,?)",
                    [(r["investigation_id"], r["table_id"], r["row"], r["material"],
                      r["oxygen"], r["pressure"], r["airflow"]) for r in runs])
    con.executemany("INSERT INTO chunks (investigation_id, section, text) VALUES (?,?,?)",
                    [(c["investigation_id"], c["section"], c["text"]) for c in chunks])
    meta = {
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "NASA Physical Sciences Informatics (PSI), https://psi.nasa.gov",
        "psi_total_investigations": str(len(hits)),
        "combustion_investigations": str(len(investigations)),
        "run_tables": str(len(tables)),
        "runs": str(len(runs)),
        "chunks": str(len(chunks)),
    }
    con.executemany("INSERT INTO meta VALUES (?,?)", list(meta.items()))
    con.commit()
    con.close()

    print(f"wrote {DB_PATH}")
    for k, v in meta.items():
        print(f"  {k}: {v}")
    print("\nconditions per investigation (computed):")
    for i in investigations:
        c = i["conditions"]
        print(f"  {i['id']:8s} {i['short'][:22]:22s} O2 {fmt_range(c['oxygen']):22s} P {fmt_range(c['pressure']):20s} "
              f"flow {fmt_range(c['airflow']):18s} runs={i['n_runs']}")
    print("\ntags:")
    for i in investigations:
        print(f"  {i['id']:8s} materials={i['materials']}\n           sensors={i['sensors']}\n           gases={i['gases']} facilities={i['facilities']}")


if __name__ == "__main__":
    build()
