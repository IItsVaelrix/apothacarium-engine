#!/usr/bin/env python3
"""
build_scholomance_dict.py

Build an offline dictionary SQLite DB with FTS5 from lean, open sources:
- CMU Pronouncing Dictionary (phonemes, rhyme families)
- Open English WordNet (OEWN) XML (definitions, synonyms, semantic relations)
- Datamuse API is used at runtime (no build-time dependency)

Output:
- SQLite database with entry tables, WordNet tables, rhyme index, and FTS
"""

from __future__ import annotations

import argparse
import gzip
import io
import json
import os
import re
import sqlite3
import sys
import time
import xml.etree.ElementTree as ET
from typing import Optional

DEFAULT_DB_PATH = "scholomance_dict.sqlite"
DEFAULT_CMU_PATH = os.path.join("node_modules", "cmudict", "lib", "cmu", "cmudict.0.7a")
SCHEMA_VERSION = "2"

# ARPAbet vowels (match src/lib/phonology/phoneme.constants.js)
ARPABET_VOWELS = {
    "AA", "AE", "AH", "AO", "AW", "AY",
    "EH", "ER", "EY", "IH", "IY", "OW",
    "OY", "UH", "UW",
}

# Map ARPAbet vowels to base families (match src/lib/phonology/phoneme.constants.js VOWEL_TO_BASE_FAMILY)
VOWEL_TO_FAMILY = {
    "AA": "A",  "AH": "U",  "AW": "AW", "AE": "AE",
    "EH": "AE", "AO": "AO", "OW": "OW", "OY": "OY",
    "UW": "U",  "UH": "U",  "IY": "IY", "IH": "IH",
    "ER": "UR", "EY": "EY", "AY": "AY",
}

WORD_VARIANT_RE = re.compile(r"\(\d+\)$")


def file_text_preview(path: str, n: int = 120) -> str:
    with open(path, "rb") as raw:
        chunk = raw.read(n)
    return chunk.decode("utf-8", errors="replace").replace("\\n", "\\\\n").replace("\\r", "\\\\r")


def open_maybe_gzip(path: str):
    with open(path, "rb") as probe:
        head = probe.read(4)

    if head.startswith(b"\x1f\x8b"):
        return gzip.open(path, "rb")

    if path.endswith(".gz") and head.lstrip().startswith(b"<"):
        print(
            f"Warning: {path} ends with .gz but appears to be plain XML; reading without decompression.",
            file=sys.stderr,
        )
        return open(path, "rb")

    if path.endswith(".gz"):
        preview = file_text_preview(path)
        raise SystemExit(
            f"Expected a gzip-compressed XML file at '{path}', but it is not gzip. "
            f"File starts with: {preview!r}. "
            "This often means the download failed (for example: a 'Not Found' response)."
        )

    return open(path, "rb")

def init_db(db_path: str, overwrite: bool) -> sqlite3.Connection:
    if os.path.exists(db_path):
        if overwrite:
            os.remove(db_path)
        else:
            raise SystemExit(f"Refusing to overwrite existing DB: {db_path}. Use --overwrite.")

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA temp_store=MEMORY;")

    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS entry (
            id INTEGER PRIMARY KEY,
            headword TEXT NOT NULL,
            headword_lower TEXT NOT NULL,
            lang TEXT NOT NULL,
            pos TEXT,
            ipa TEXT,
            etymology TEXT,
            senses_json TEXT NOT NULL,
            source TEXT NOT NULL,
            source_url TEXT,
            embeddings_tq BLOB
        );

        CREATE INDEX IF NOT EXISTS idx_entry_headword_lower ON entry(headword_lower);
        CREATE INDEX IF NOT EXISTS idx_entry_lang_pos ON entry(lang, pos);

        CREATE VIRTUAL TABLE IF NOT EXISTS entry_fts USING fts5(
            headword,
            content,
            tokenize='unicode61',
            prefix='2 3 4'
        );

        CREATE TABLE IF NOT EXISTS wordnet_synset (
            id TEXT PRIMARY KEY,
            pos TEXT,
            lexname TEXT,
            definition TEXT,
            examples_json TEXT,
            source TEXT NOT NULL,
            source_url TEXT
        );

        CREATE TABLE IF NOT EXISTS wordnet_lemma (
            lemma TEXT NOT NULL,
            lemma_lower TEXT NOT NULL,
            synset_id TEXT NOT NULL,
            sense_rank INTEGER,
            pos TEXT,
            source TEXT NOT NULL,
            source_url TEXT,
            FOREIGN KEY (synset_id) REFERENCES wordnet_synset(id)
        );

        CREATE INDEX IF NOT EXISTS idx_wordnet_lemma_lower ON wordnet_lemma(lemma_lower);
        CREATE INDEX IF NOT EXISTS idx_wordnet_lemma_synset ON wordnet_lemma(synset_id);

        CREATE TABLE IF NOT EXISTS wordnet_rel (
            synset_id TEXT NOT NULL,
            rel TEXT NOT NULL,
            target_synset_id TEXT NOT NULL,
            source TEXT NOT NULL,
            source_url TEXT,
            FOREIGN KEY (synset_id) REFERENCES wordnet_synset(id)
        );

        CREATE INDEX IF NOT EXISTS idx_wordnet_rel_synset ON wordnet_rel(synset_id);

        CREATE TABLE IF NOT EXISTS lexicon (
            word TEXT NOT NULL,
            word_lower TEXT NOT NULL,
            source TEXT NOT NULL,
            source_url TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_lexicon_word_lower ON lexicon(word_lower);

        CREATE TABLE IF NOT EXISTS rhyme_index (
            word_id INTEGER PRIMARY KEY,
            word_lower TEXT NOT NULL,
            rhyme_family TEXT NOT NULL,
            coda TEXT,
            rhyme_key TEXT NOT NULL,
            FOREIGN KEY (word_id) REFERENCES entry(id)
        );

        CREATE INDEX IF NOT EXISTS idx_rhyme_family ON rhyme_index(rhyme_family);
        CREATE INDEX IF NOT EXISTS idx_rhyme_key ON rhyme_index(rhyme_key);
        CREATE INDEX IF NOT EXISTS idx_rhyme_word ON rhyme_index(word_lower);
        """
    )
    return conn


# ---------------------------------------------------------------------------
# CMU Dict ingestion
# ---------------------------------------------------------------------------

def strip_stress(phoneme: str) -> str:
    """Remove stress digit from a phoneme: AH0 -> AH"""
    return re.sub(r"[0-9]", "", phoneme)


def find_stressed_vowel(phonemes: list[str]) -> Optional[str]:
    """Find the primary-stressed vowel (marker 1), else secondary (2), else last vowel."""
    for marker in ("1", "2"):
        for ph in phonemes:
            base = strip_stress(ph)
            if base in ARPABET_VOWELS and ph.endswith(marker):
                return base
    # Fallback: last vowel
    for ph in reversed(phonemes):
        base = strip_stress(ph)
        if base in ARPABET_VOWELS:
            return base
    return None


def compute_coda(phonemes: list[str]) -> Optional[str]:
    """Extract consonant cluster after the last vowel."""
    last_vowel_idx = -1
    for i, ph in enumerate(phonemes):
        base = strip_stress(ph)
        if base in ARPABET_VOWELS:
            last_vowel_idx = i
    if last_vowel_idx < 0:
        return None
    coda_parts = [strip_stress(ph) for ph in phonemes[last_vowel_idx + 1:]]
    return "".join(coda_parts) if coda_parts else None


def phonemes_to_ipa_approx(phonemes: list[str]) -> str:
    """Store the ARPAbet string as the 'ipa' field — it's what the app uses internally."""
    return " ".join(phonemes)


def ingest_cmu_dict(conn: sqlite3.Connection, cmu_path: str) -> int:
    """Parse CMU pronouncing dictionary and populate entry + rhyme_index tables."""
    if not os.path.exists(cmu_path):
        raise SystemExit(f"CMU dictionary not found: {cmu_path}\nRun 'npm install' first.")

    cur = conn.cursor()
    seen_words: dict[str, int] = {}  # word -> entry_id (first variant only)
    entry_rows = []
    fts_rows = []
    rhyme_rows = []
    entry_id = 1
    inserted = 0

    with open(cmu_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith(";"):
                continue

            # Format: WORD  PH1 PH2 PH3 (double-space separator)
            split_idx = line.find("  ")
            if split_idx <= 0:
                continue

            raw_word = line[:split_idx].strip()
            phones_raw = line[split_idx + 2:].strip()
            if not raw_word or not phones_raw:
                continue

            # Strip variant suffix like (1), (2) — keep first variant only
            word = WORD_VARIANT_RE.sub("", raw_word).strip()
            if not word:
                continue

            # Skip if we already have this word (first variant wins)
            word_upper = word.upper()
            if word_upper in seen_words:
                continue

            phonemes = phones_raw.split()
            if not phonemes:
                continue

            # Compute rhyme data
            stressed_vowel = find_stressed_vowel(phonemes)
            vowel_family = VOWEL_TO_FAMILY.get(stressed_vowel, "A") if stressed_vowel else "A"
            coda = compute_coda(phonemes)
            rhyme_key = f"{vowel_family}-{coda or 'open'}"
            ipa_field = phonemes_to_ipa_approx(phonemes)

            # Title-case the headword for display
            headword = word.capitalize()
            headword_lower = word.lower()

            seen_words[word_upper] = entry_id

            entry_rows.append((
                entry_id, headword, headword_lower, "English",
                None,  # pos — will be enriched from WordNet later
                ipa_field,
                None,  # etymology
                "[]",  # senses_json — will be enriched from WordNet later
                "cmudict",
                "https://github.com/cmusphinx/cmudict",
            ))
            fts_rows.append((entry_id, headword, ""))
            rhyme_rows.append((entry_id, headword_lower, vowel_family, coda or "", rhyme_key))

            entry_id += 1
            inserted += 1

            if len(entry_rows) >= 5000:
                cur.executemany(
                    """INSERT INTO entry(id, headword, headword_lower, lang, pos, ipa,
                       etymology, senses_json, source, source_url)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    entry_rows,
                )
                cur.executemany(
                    "INSERT INTO entry_fts(rowid, headword, content) VALUES (?, ?, ?)",
                    fts_rows,
                )
                cur.executemany(
                    "INSERT OR REPLACE INTO rhyme_index(word_id, word_lower, rhyme_family, coda, rhyme_key) VALUES (?, ?, ?, ?, ?)",
                    rhyme_rows,
                )
                conn.commit()
                entry_rows.clear()
                fts_rows.clear()
                rhyme_rows.clear()

    # Flush remaining
    if entry_rows:
        cur.executemany(
            """INSERT INTO entry(id, headword, headword_lower, lang, pos, ipa,
               etymology, senses_json, source, source_url)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            entry_rows,
        )
        cur.executemany(
            "INSERT INTO entry_fts(rowid, headword, content) VALUES (?, ?, ?)",
            fts_rows,
        )
        cur.executemany(
            "INSERT OR REPLACE INTO rhyme_index(word_id, word_lower, rhyme_family, coda, rhyme_key) VALUES (?, ?, ?, ?, ?)",
            rhyme_rows,
        )
        conn.commit()

    return inserted


# ---------------------------------------------------------------------------
# OEWN XML ingestion (kept from original, minimal changes)
# ---------------------------------------------------------------------------

def strip_ns(tag: str) -> str:
    return tag.split("}", 1)[-1] if "}" in tag else tag


def sense_synset_id(elem: ET.Element) -> Optional[str]:
    synset = elem.get("synset") or elem.get("synsetRef") or elem.get("synset_id")
    if synset:
        return synset
    ref = elem.find(".//{*}SynsetRef")
    if ref is not None:
        return ref.get("synset") or ref.get("synsetRef")
    return None


def ingest_oewn_xml(
    conn: sqlite3.Connection,
    xml_path: str,
    source_url: str,
) -> tuple[int, int, int]:
    cur = conn.cursor()
    syn_rows = []
    lemma_rows = []
    rel_rows = []
    syn_count = 0
    lemma_count = 0
    rel_count = 0

    with open_maybe_gzip(xml_path) as f:
        context = ET.iterparse(f, events=("end",))
        for _, elem in context:
            tag = strip_ns(elem.tag)

            if tag == "Synset":
                syn_id = elem.get("id")
                if not syn_id:
                    elem.clear()
                    continue
                pos = elem.get("partOfSpeech") or elem.get("pos")
                lexname = elem.get("lexfile") or elem.get("lexname")
                definition = None
                examples: list[str] = []

                for child in elem:
                    ctag = strip_ns(child.tag)
                    if ctag == "Definition":
                        definition = " ".join(child.itertext()).strip() or None
                    elif ctag == "Example":
                        ex = " ".join(child.itertext()).strip()
                        if ex:
                            examples.append(ex)
                    elif ctag == "SynsetRelation":
                        rel = child.get("relType") or child.get("type") or child.get("rel")
                        target = child.get("target") or child.get("targetSynset")
                        if rel and target:
                            rel_rows.append((syn_id, rel, target, "oewn", source_url))

                syn_rows.append((
                    syn_id, pos, lexname, definition,
                    json.dumps(examples), "oewn", source_url,
                ))
                syn_count += 1

                if len(syn_rows) >= 5000:
                    cur.executemany(
                        """INSERT INTO wordnet_synset(id, pos, lexname, definition, examples_json, source, source_url)
                           VALUES (?, ?, ?, ?, ?, ?, ?)""",
                        syn_rows,
                    )
                    syn_rows.clear()

                if len(rel_rows) >= 10000:
                    cur.executemany(
                        """INSERT INTO wordnet_rel(synset_id, rel, target_synset_id, source, source_url)
                           VALUES (?, ?, ?, ?, ?)""",
                        rel_rows,
                    )
                    rel_count += len(rel_rows)
                    rel_rows.clear()

                elem.clear()

            elif tag == "LexicalEntry":
                lemma_elem = elem.find(".//{*}Lemma")
                lemma = None
                pos = elem.get("partOfSpeech")
                if lemma_elem is not None:
                    lemma = (
                        lemma_elem.get("writtenForm")
                        or lemma_elem.get("form")
                        or lemma_elem.get("lemma")
                    )
                    pos = pos or lemma_elem.get("partOfSpeech")

                if lemma:
                    lemma_lower = lemma.casefold()
                    senses = elem.findall(".//{*}Sense")
                    seen = set()
                    for idx, sense in enumerate(senses, start=1):
                        synset = sense_synset_id(sense)
                        if synset and synset not in seen:
                            lemma_rows.append(
                                (lemma, lemma_lower, synset, idx, pos, "oewn", source_url)
                            )
                            seen.add(synset)

                    if not senses:
                        synset_ref = elem.find(".//{*}SynsetRef")
                        synset = None
                        if synset_ref is not None:
                            synset = synset_ref.get("synset") or synset_ref.get("synsetRef")
                        if synset:
                            lemma_rows.append(
                                (lemma, lemma_lower, synset, 1, pos, "oewn", source_url)
                            )

                if len(lemma_rows) >= 10000:
                    cur.executemany(
                        """INSERT INTO wordnet_lemma(lemma, lemma_lower, synset_id, sense_rank, pos, source, source_url)
                           VALUES (?, ?, ?, ?, ?, ?, ?)""",
                        lemma_rows,
                    )
                    lemma_count += len(lemma_rows)
                    lemma_rows.clear()

                elem.clear()

        # Flush remaining
        if syn_rows:
            cur.executemany(
                """INSERT INTO wordnet_synset(id, pos, lexname, definition, examples_json, source, source_url)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                syn_rows,
            )
        if lemma_rows:
            cur.executemany(
                """INSERT INTO wordnet_lemma(lemma, lemma_lower, synset_id, sense_rank, pos, source, source_url)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                lemma_rows,
            )
            lemma_count += len(lemma_rows)
        if rel_rows:
            cur.executemany(
                """INSERT INTO wordnet_rel(synset_id, rel, target_synset_id, source, source_url)
                   VALUES (?, ?, ?, ?, ?)""",
                rel_rows,
            )
            rel_count += len(rel_rows)

        conn.commit()

    return syn_count, lemma_count, rel_count


# ---------------------------------------------------------------------------
# Post-processing: enrich CMU entries with WordNet definitions
# ---------------------------------------------------------------------------

def enrich_entries_from_wordnet(conn: sqlite3.Connection) -> int:
    """
    Cross-reference CMU entry headwords with WordNet lemmas.
    For each match, populate senses_json with WordNet definitions and
    set pos from WordNet data.
    """
    cur = conn.cursor()

    # Build a map: lemma_lower -> [(definition, pos, examples_json, sense_rank)]
    wn_rows = conn.execute(
        """
        SELECT l.lemma_lower, s.definition, l.pos, s.examples_json, l.sense_rank
        FROM wordnet_lemma l
        JOIN wordnet_synset s ON l.synset_id = s.id
        WHERE s.definition IS NOT NULL
        ORDER BY l.lemma_lower, l.sense_rank
        """
    ).fetchall()

    lemma_defs: dict[str, list[dict]] = {}
    lemma_pos: dict[str, str] = {}
    for lemma_lower, definition, pos, examples_json, rank in wn_rows:
        if lemma_lower not in lemma_defs:
            lemma_defs[lemma_lower] = []
            if pos:
                lemma_pos[lemma_lower] = pos
        lemma_defs[lemma_lower].append({
            "glosses": [definition] if definition else [],
            "examples": json.loads(examples_json) if examples_json else [],
        })

    # Update entries that have matching WordNet data
    entries = conn.execute("SELECT id, headword_lower FROM entry").fetchall()
    update_rows = []
    fts_updates = []
    enriched = 0

    for entry_id, hw_lower in entries:
        defs = lemma_defs.get(hw_lower)
        if not defs:
            continue
        senses_json = json.dumps(defs[:10])  # Cap at 10 senses
        pos = lemma_pos.get(hw_lower)

        # Build FTS content from definitions
        fts_parts = []
        for d in defs[:10]:
            fts_parts.extend(d.get("glosses", []))
            fts_parts.extend(d.get("examples", []))
        fts_content = "\n".join(str(p) for p in fts_parts if p)

        update_rows.append((senses_json, pos, entry_id))
        fts_updates.append((entry_id, fts_content))
        enriched += 1

        if len(update_rows) >= 5000:
            cur.executemany("UPDATE entry SET senses_json = ?, pos = ? WHERE id = ?", update_rows)
            for fts_id, fts_text in fts_updates:
                cur.execute("UPDATE entry_fts SET content = ? WHERE rowid = ?", (fts_text, fts_id))
            conn.commit()
            update_rows.clear()
            fts_updates.clear()

    if update_rows:
        cur.executemany("UPDATE entry SET senses_json = ?, pos = ? WHERE id = ?", update_rows)
        for fts_id, fts_text in fts_updates:
            cur.execute("UPDATE entry_fts SET content = ? WHERE rowid = ?", (fts_text, fts_id))
        conn.commit()

    return enriched


# ---------------------------------------------------------------------------
# Lexicon population from CMU (for word-existence checks)
# ---------------------------------------------------------------------------

def populate_lexicon_from_entries(conn: sqlite3.Connection) -> int:
    """Copy all CMU headwords into the lexicon table for word-validity lookups."""
    conn.execute(
        """
        INSERT INTO lexicon(word, word_lower, source, source_url)
        SELECT headword, headword_lower, 'cmudict', source_url
        FROM entry
        """
    )
    count = conn.execute("SELECT COUNT(*) FROM lexicon").fetchone()[0]
    conn.commit()
    return count


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    ap = argparse.ArgumentParser(description="Build Scholomance dictionary from CMU + OEWN.")
    ap.add_argument("--db", default=DEFAULT_DB_PATH, help="SQLite output path.")
    ap.add_argument("--overwrite", action="store_true", help="Overwrite existing DB.")
    ap.add_argument("--cmu_path", default=DEFAULT_CMU_PATH,
                     help="Path to CMU pronouncing dictionary file.")
    ap.add_argument("--oewn_path", required=True,
                     help="Path to OEWN XML file (.xml or .xml.gz).")

    args = ap.parse_args()

    if not os.path.exists(args.cmu_path):
        print(f"ERROR: CMU dict not found at: {args.cmu_path}")
        print(f"Current working directory: {os.getcwd()}")
        print(f"Directory contents of node_modules/cmudict/lib/cmu/:")
        try:
            print(os.listdir(os.path.dirname(args.cmu_path)))
        except Exception as e:
            print(f"  Could not list dir: {e}")
        sys.exit(1)

    if not os.path.exists(args.oewn_path):
        print(f"ERROR: OEWN XML not found at: {args.oewn_path}")
        print(f"Current working directory: {os.getcwd()}")
        sys.exit(1)

    conn = init_db(args.db, overwrite=args.overwrite)
    try:
        conn.execute("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)",
                      ("schema_version", SCHEMA_VERSION))
        conn.execute("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)",
                      ("built_at", str(int(time.time()))))
        conn.execute("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)",
                      ("cmu_source", args.cmu_path))
        conn.execute("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)",
                      ("oewn_source", args.oewn_path))
        conn.commit()

        # Step 1: Ingest CMU pronouncing dictionary
        print("Step 1/4: Ingesting CMU pronouncing dictionary...")
        cmu_count = ingest_cmu_dict(conn, args.cmu_path)
        print(f"  Inserted {cmu_count:,} CMU entries with phonemes + rhyme index.")

        # Step 2: Ingest OEWN XML
        print("Step 2/4: Ingesting Open English WordNet XML...")
        syn_count, lemma_count, rel_count = ingest_oewn_xml(
            conn, args.oewn_path, source_url="https://en-word.net/",
        )
        print(f"  Inserted {syn_count:,} synsets, {lemma_count:,} lemmas, {rel_count:,} relations.")

        # Step 3: Cross-reference — enrich CMU entries with WordNet definitions
        print("Step 3/4: Enriching entries with WordNet definitions...")
        enriched = enrich_entries_from_wordnet(conn)
        print(f"  Enriched {enriched:,} entries with definitions and POS tags.")

        # Step 4: Populate lexicon table
        print("Step 4/4: Populating lexicon...")
        lex_count = populate_lexicon_from_entries(conn)
        print(f"  Lexicon: {lex_count:,} words.")

        # Optimize FTS index
        conn.execute("INSERT INTO entry_fts(entry_fts) VALUES ('optimize');")
        conn.commit()

    finally:
        conn.close()

    size_mb = os.path.getsize(args.db) / (1024 * 1024)
    print(f"\nDone. Built: {args.db} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
