#!/usr/bin/env python3
"""
Ingest curated Project Gutenberg criticism texts into Scholomance corpus SQLite.

Usage:
  python scripts/ingest_criticism_corpus.py --db scholomance_corpus.sqlite
"""

from __future__ import annotations

import argparse
import re
import sqlite3
import urllib.request
from pathlib import Path
from typing import Iterable

DEFAULT_DB_PATH = "scholomance_corpus.sqlite"

CRITICISM_SOURCES = [
    {
        "pg_id": 1974,
        "title": "Poetics",
        "author": "Aristotle",
    },
    {
        "pg_id": 2612,
        "title": "An Essay on Criticism",
        "author": "Alexander Pope",
    },
    {
        "pg_id": 1265,
        "title": "The Defence of Poesy",
        "author": "Sir Philip Sidney",
    },
    {
        "pg_id": 6081,
        "title": "On the Sublime",
        "author": "Longinus",
    },
    {
        "pg_id": 7700,
        "title": "Biographia Literaria",
        "author": "Samuel Taylor Coleridge",
    },
    {
        "pg_id": 5600,
        "title": "Preface to Lyrical Ballads",
        "author": "William Wordsworth",
    },
    {
        "pg_id": 5676,
        "title": "The Sacred Wood",
        "author": "T.S. Eliot",
    },
    {
        "pg_id": 64459,
        "title": "The Common Reader",
        "author": "Virginia Woolf",
    },
    {
        "pg_id": 41162,
        "title": "Instigations",
        "author": "Ezra Pound",
    },
    {
        "pg_id": 1459,
        "title": "Prufrock and Other Observations",
        "author": "T.S. Eliot",
    },
    {
        "pg_id": 3026,
        "title": "North of Boston",
        "author": "Robert Frost",
    }
]

START_MARKERS = [
    "*** START OF THIS PROJECT GUTENBERG EBOOK",
    "*** START OF THE PROJECT GUTENBERG EBOOK",
]

END_MARKERS = [
    "*** END OF THIS PROJECT GUTENBERG EBOOK",
    "*** END OF THE PROJECT GUTENBERG EBOOK",
]

SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS source (
            id INTEGER PRIMARY KEY,
            title TEXT,
            author TEXT,
            type TEXT,
            url TEXT,
            external_id TEXT UNIQUE
        );

        CREATE TABLE IF NOT EXISTS sentence (
            id INTEGER PRIMARY KEY,
            source_id INTEGER,
            text TEXT,
            FOREIGN KEY(source_id) REFERENCES source(id)
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS sentence_fts USING fts5(
            text,
            content='sentence',
            content_rowid='id'
        );
        """
    )


def clean_gutenberg_text(raw_text: str) -> str:
    text = raw_text

    start_index = 0
    for marker in START_MARKERS:
        idx = text.find(marker)
        if idx != -1:
            newline = text.find("\n", idx)
            start_index = newline if newline != -1 else idx
            break

    end_index = len(text)
    for marker in END_MARKERS:
        idx = text.find(marker)
        if idx != -1:
            end_index = idx
            break

    return text[start_index:end_index].strip()


def split_sentences(text: str) -> list[str]:
    candidates = SENTENCE_SPLIT_RE.split(text)
    sentences: list[str] = []
    for sentence in candidates:
        normalized = re.sub(r"\s+", " ", sentence).strip()
        if len(normalized) < 12:
            continue
        if len(normalized) > 700:
            continue
        sentences.append(normalized)
    return sentences


def download_gutenberg_text(pg_id: int) -> str:
    url = f"https://www.gutenberg.org/cache/epub/{pg_id}/pg{pg_id}.txt"
    req = urllib.request.Request(url, headers={"User-Agent": "ScholomanceCorpus/1.0"})
    with urllib.request.urlopen(req, timeout=30) as response:
        payload = response.read()

    for encoding in ("utf-8", "utf-8-sig", "latin-1"):
        try:
            return payload.decode(encoding)
        except UnicodeDecodeError:
            continue

    return payload.decode("utf-8", errors="replace")


def source_exists(conn: sqlite3.Connection, external_id: str) -> bool:
    row = conn.execute(
        "SELECT id FROM source WHERE external_id = ?",
        (external_id,),
    ).fetchone()
    return row is not None


def insert_source(conn: sqlite3.Connection, *, title: str, author: str, source_type: str, url: str, external_id: str) -> int:
    cursor = conn.execute(
        """
        INSERT INTO source (title, author, type, url, external_id)
        VALUES (?, ?, ?, ?, ?)
        """,
        (title, author, source_type, url, external_id),
    )
    return int(cursor.lastrowid)


def insert_sentences(conn: sqlite3.Connection, source_id: int, sentences: Iterable[str]) -> int:
    rows = [(source_id, sentence) for sentence in sentences]
    if not rows:
        return 0

    conn.executemany(
        "INSERT INTO sentence (source_id, text) VALUES (?, ?)",
        rows,
    )
    return len(rows)


def rebuild_fts(conn: sqlite3.Connection) -> None:
    conn.execute("INSERT INTO sentence_fts(sentence_fts) VALUES('rebuild')")


def ingest_criticism(conn: sqlite3.Connection) -> None:
    total_sentences = 0

    for source in CRITICISM_SOURCES:
        pg_id = int(source["pg_id"])
        title = str(source["title"])
        author = str(source["author"])
        external_id = f"gutenberg-criticism-{pg_id}"
        url = f"https://www.gutenberg.org/cache/epub/{pg_id}/pg{pg_id}.txt"

        if source_exists(conn, external_id):
            print(f"[skip] {pg_id} already ingested ({external_id})")
            continue

        print(f"[download] PG {pg_id}: {title}")
        try:
            raw_text = download_gutenberg_text(pg_id)
        except Exception as err:  # pragma: no cover - network failure path
            print(f"[error] Could not download PG {pg_id}: {err}")
            continue

        cleaned_text = clean_gutenberg_text(raw_text)
        sentences = split_sentences(cleaned_text)
        if not sentences:
            print(f"[warn] PG {pg_id} produced no usable sentences")
            continue

        source_id = insert_source(
            conn,
            title=title,
            author=author,
            source_type="criticism",
            url=url,
            external_id=external_id,
        )
        inserted = insert_sentences(conn, source_id, sentences)
        conn.commit()

        total_sentences += inserted
        print(f"[ok] Inserted {inserted} sentences from PG {pg_id}")

    if total_sentences > 0:
        print("[fts] Rebuilding sentence_fts index")
        rebuild_fts(conn)
        conn.commit()

    print(f"[done] Total criticism sentences inserted: {total_sentences}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest curated Project Gutenberg criticism texts")
    parser.add_argument("--db", default=DEFAULT_DB_PATH, help="Path to scholomance_corpus.sqlite")
    args = parser.parse_args()

    db_path = Path(args.db).expanduser().resolve()
    db_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(db_path))
    try:
        init_db(conn)
        ingest_criticism(conn)
    finally:
        conn.close()


if __name__ == "__main__":
    main()

