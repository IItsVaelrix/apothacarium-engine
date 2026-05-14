#!/usr/bin/env python3
"""
serve_scholomance_dict.py

Development-only HTTP API for the Scholomance offline dictionary SQLite database.
Enhanced with a robust rhyme lookup layer and batch lookups for efficiency.

Do not expose this server directly in production.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, List
from urllib.parse import parse_qs, unquote, urlparse

DEFAULT_DB_PATH = "scholomance_dict.sqlite"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8787


def connect_db(path: str) -> sqlite3.Connection:
    if not os.path.exists(path):
        raise SystemExit(f"Dictionary DB not found: {path}")
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def parse_json(value: str | None) -> Any:
    if not value:
        return []
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return []


def extract_gloss(senses: List[Dict[str, Any]]) -> str | None:
    for sense in senses:
        if not isinstance(sense, dict):
            continue
        for key in ("glosses", "raw_glosses", "definitions"):
            if isinstance(sense.get(key), list):
                for item in sense[key]:
                    if isinstance(item, str) and item.strip():
                        return item.strip()
        for key in ("definition", "gloss"):
            if isinstance(sense.get(key), str) and sense[key].strip():
                return sense[key].strip()
    return None


def normalize_entry(row: sqlite3.Row) -> Dict[str, Any]:
    senses = parse_json(row["senses_json"])
    return {
        "id": row["id"],
        "headword": row["headword"],
        "pos": row["pos"],
        "ipa": row["ipa"],
        "etymology": row["etymology"],
        "senses": senses,
        "source": row["source"],
        "sourceUrl": row["source_url"],
    }


def lookup_entries(conn: sqlite3.Connection, word: str, limit: int = 5) -> List[Dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT id, headword, pos, ipa, etymology, senses_json, source, source_url
        FROM entry
        WHERE headword_lower = ?
        LIMIT ?
        """,
        (word.lower(), limit),
    ).fetchall()
    return [normalize_entry(row) for row in rows]

def lookup_rhymes(conn: sqlite3.Connection, word: str, limit: int = 50) -> Dict[str, Any]:
    row = conn.execute(
        "SELECT rhyme_family FROM rhyme_index WHERE word_lower = ?",
        (word.lower(),)
    ).fetchone()
    if not row: return {"family": None, "words": []}
    family = row["rhyme_family"]
    rhyme_rows = conn.execute(
        "SELECT word_lower FROM rhyme_index WHERE rhyme_family = ? AND word_lower != ? LIMIT ?",
        (family, word.lower(), limit)
    ).fetchall()
    return {"family": family, "words": [r["word_lower"] for r in rhyme_rows]}

def batch_lookup_families(conn: sqlite3.Connection, words: List[str]) -> Dict[str, Dict[str, Any]]:
    if not words: return {}
    placeholders = ', '.join('?' for _ in words)
    # We use rhyme_index for the family, and entry for the ipa (which stores arpabet)
    # Joining them to get authoritative data for both.
    rows = conn.execute(
        f"""
        SELECT ri.word_lower, ri.rhyme_family, e.ipa 
        FROM rhyme_index ri
        LEFT JOIN entry e ON e.headword_lower = ri.word_lower
        WHERE ri.word_lower IN ({placeholders})
        """,
        [w.lower() for w in words]
    ).fetchall()
    
    results = {}
    for row in rows:
        word_upper = row["word_lower"].upper()
        results[word_upper] = {
            "family": row["rhyme_family"],
            "phonemes": row["ipa"].split() if row["ipa"] else None
        }
    return results

def batch_validate_words(conn: sqlite3.Connection, words: List[str]) -> List[str]:
    normalized = sorted({word.strip().lower() for word in words if isinstance(word, str) and word.strip()})
    if not normalized: return []
    placeholders = ', '.join('?' for _ in normalized)
    rows = conn.execute(
        f"SELECT DISTINCT headword_lower FROM entry WHERE headword_lower IN ({placeholders})",
        normalized
    ).fetchall()
    return [row["headword_lower"] for row in rows]

def lookup_synonyms(conn: sqlite3.Connection, word: str, limit: int = 20) -> List[str]:
    rows = conn.execute(
        """
        SELECT l2.lemma AS lemma
        FROM wordnet_lemma l1
        JOIN wordnet_lemma l2 ON l1.synset_id = l2.synset_id
        WHERE l1.lemma_lower = ?
        LIMIT ?
        """,
        (word.lower(), limit + 10),
    ).fetchall()
    seen = set()
    results = []
    for row in rows:
        lemma = row["lemma"]
        if not isinstance(lemma, str): continue
        clean = lemma.strip()
        if not clean or clean.lower() == word.lower() or clean.lower() in seen: continue
        seen.add(clean.lower())
        results.append(clean)
        if len(results) >= limit: break
    return results

def lookup_antonyms(conn: sqlite3.Connection, word: str, limit: int = 20) -> List[str]:
    rows = conn.execute(
        """
        SELECT l2.lemma AS lemma
        FROM wordnet_lemma l1
        JOIN wordnet_rel r ON l1.synset_id = r.synset_id
        JOIN wordnet_lemma l2 ON r.target_synset_id = l2.synset_id
        WHERE l1.lemma_lower = ? AND r.rel = 'antonym'
        LIMIT ?
        """,
        (word.lower(), limit + 10),
    ).fetchall()
    seen = set()
    results = []
    for row in rows:
        lemma = row["lemma"]
        if not isinstance(lemma, str): continue
        clean = lemma.strip()
        if not clean or clean.lower() == word.lower() or clean.lower() in seen: continue
        seen.add(clean.lower())
        results.append(clean)
        if len(results) >= limit: break
    return results

def search_entries(conn: sqlite3.Connection, query: str, limit: int = 20) -> List[Dict[str, Any]]:
    try:
        rows = conn.execute(
            """
            SELECT e.id, e.headword, e.pos, e.ipa, e.etymology, e.senses_json, e.source, e.source_url
            FROM entry_fts f
            JOIN entry e ON e.id = f.rowid
            WHERE entry_fts MATCH ?
            LIMIT ?
            """,
            (query, limit),
        ).fetchall()
    except sqlite3.OperationalError: return []
    return [normalize_entry(row) for row in rows]

def suggest_entries(conn: sqlite3.Connection, prefix: str, limit: int = 10) -> List[Dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT headword, pos
        FROM entry
        WHERE headword_lower LIKE ?
        LIMIT ?
        """,
        (prefix.lower() + "%", limit),
    ).fetchall()
    return [{"headword": row["headword"], "pos": row["pos"]} for row in rows]

class DictionaryHandler(BaseHTTPRequestHandler):
    conn = None
    lock = threading.Lock()

    def send_json(self, status: int, payload: Dict[str, Any]) -> None:
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/lexicon/validate-batch":
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            try:
                data = json.loads(body)
                words = data.get("words", [])
                if not isinstance(words, list):
                    self.send_json(400, {"error": "words must be a list"})
                    return
                with self.lock:
                    valid = batch_validate_words(self.conn, words)
                self.send_json(200, {"valid": valid})
            except json.JSONDecodeError:
                self.send_json(400, {"error": "Invalid JSON"})
            return

        if parsed.path == "/api/lexicon/lookup-batch":
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            try:
                data = json.loads(body)
                words = data.get("words", [])
                if not isinstance(words, list):
                    self.send_json(400, {"error": "words must be a list"})
                    return
                with self.lock:
                    results = batch_lookup_families(self.conn, words)
                self.send_json(200, {"families": results})
            except json.JSONDecodeError:
                self.send_json(400, {"error": "Invalid JSON"})
            return
        self.send_json(404, {"error": "Not found"})

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)

        if path.startswith("/api/lexicon/lookup/"):
            word = unquote(path.replace("/api/lexicon/lookup/", "", 1)).strip()
            if not word:
                self.send_json(400, {"error": "Missing word"})
                return
            with self.lock:
                entries = lookup_entries(self.conn, word, limit=5)
                synonyms = lookup_synonyms(self.conn, word, limit=20)
                antonyms = lookup_antonyms(self.conn, word, limit=20)
                rhyme_data = lookup_rhymes(self.conn, word, limit=50)
            definition = None
            if entries:
                first = entries[0]
                gloss = extract_gloss(first.get("senses") or [])
                if gloss:
                    definition = {"text": gloss, "partOfSpeech": first.get("pos") or "", "source": first.get("source") or "scholomance"}
            payload = {"word": word, "definition": definition, "entries": entries, "synonyms": synonyms, "antonyms": antonyms, "rhymes": rhyme_data["words"], "rhymeFamily": rhyme_data["family"], "lore": {"seed": word.lower()}}
            self.send_json(200, payload)
            return

        if path == "/api/lexicon/search":
            query = (params.get("q") or [""])[0].strip()
            if not query: self.send_json(400, {"error": "Missing query"}); return
            limit = int((params.get("limit") or ["20"])[0])
            with self.lock: entries = search_entries(self.conn, query, limit=limit)
            results = [{"headword": e.get("headword"), "pos": e.get("pos"), "definition": extract_gloss(e.get("senses") or []), "source": e.get("source")} for e in entries]
            self.send_json(200, {"query": query, "results": results})
            return

        if path == "/api/lexicon/suggest":
            prefix = (params.get("prefix") or [""])[0].strip()
            if not prefix: self.send_json(400, {"error": "Missing prefix"}); return
            limit = int((params.get("limit") or ["10"])[0])
            with self.lock: results = suggest_entries(self.conn, prefix, limit=limit)
            self.send_json(200, {"prefix": prefix, "results": results})
            return

        self.send_json(404, {"error": "Not found"})

def main() -> None:
    ap = argparse.ArgumentParser(description="Serve Scholomance dictionary API")
    ap.add_argument("--db", default=DEFAULT_DB_PATH, help="Path to scholomance_dict.sqlite")
    ap.add_argument("--host", default=DEFAULT_HOST); ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = ap.parse_args()
    conn = connect_db(args.db); DictionaryHandler.conn = conn
    server = ThreadingHTTPServer((args.host, args.port), DictionaryHandler)
    print(f"Scholomance dictionary API running on http://{args.host}:{args.port}")
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close(); conn.close()

if __name__ == "__main__": main()
