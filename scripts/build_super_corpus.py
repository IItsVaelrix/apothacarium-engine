#!/usr/bin/env python3
"""
build_super_corpus.py

Build a massive literary corpus for Scholomance in SQLite.
Combines:
- DATA-SET 1.md (Ritual/Occult/Lyric data)
- Project Gutenberg (Selected classics)
- WordNet Examples (from scholomance_dict.sqlite)
- Wikipedia Sample (Optional/Future)

Output:
- scholomance_corpus.sqlite with FTS5 for lightning fast literary lookups.
"""

import argparse
import os
import re
import sqlite3
import urllib.request
import time
import json

DEFAULT_DB_PATH = "scholomance_corpus.sqlite"
DEFAULT_DICT_PATH = "scholomance_dict.sqlite"
MANUAL_CORPUS_PATH = "docs/references/DATA-SET 1.md"

# Expanded Gutenberg IDs (1850-1923 Prominent Authors)
GUTENBERG_SEEDS = [
    84, 43, 1533, 100, 2701, 11, 1342, 1661, 2591, 1524, 1112, # Original seeds
    1400, 1023, 564, # Dickens (Great Expectations, Bleak House, Mystery of Edwin Drood)
    174, 1002, 110, # Wilde (Dorian Gray, Happy Prince, Importance of Being Earnest)
    76, 74, 86, # Twain (Huckleberry Finn, Tom Sawyer, Connecticut Yankee)
    2600, 1032, 689, # Tolstoy (War and Peace, Anna Karenina, 23 Tales)
    2554, 2632, 600, # Dostoevsky (Crime and Punishment, The Idiot, Notes from Underground)
    71865, 30229, 1245, # Woolf (Mrs Dalloway, To the Lighthouse, A Room of One's Own - via IDs)
    4300, 2814, 2805, # Joyce (Ulysses, Dubliners, Portrait of the Artist)
    5200, 7837, # Kafka (Metamorphosis, The Trial)
    1322, # Whitman (Leaves of Grass)
    12242, # Dickinson (Poems)
    17393, # Browning (Men and Women)
    610, # Tennyson (Idylls of the King)
    41, 42, # Mary Shelley (The Last Man, etc)
    205, # Thoreau (Walden)
    345, # Stoker (Dracula)
    158, # Jane Austen (Emma)
]

def init_db(db_path, overwrite=False):
    if os.path.exists(db_path) and overwrite:
        os.remove(db_path)
    
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    
    conn.executescript("""
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

        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT
        );
    """)
    return conn

def clean_text(text):
    # Remove Gutenberg headers/footers roughly
    start_markers = [
        "*** START OF THIS PROJECT GUTENBERG EBOOK",
        "*** START OF THE PROJECT GUTENBERG EBOOK",
    ]
    end_markers = [
        "*** END OF THIS PROJECT GUTENBERG EBOOK",
        "*** END OF THE PROJECT GUTENBERG EBOOK",
    ]
    
    start_idx = 0
    for marker in start_markers:
        idx = text.find(marker)
        if idx != -1:
            # Move to end of line
            eol = text.find("\n", idx)
            start_idx = eol if eol != -1 else idx
            break
            
    end_idx = len(text)
    for marker in end_markers:
        idx = text.find(marker)
        if idx != -1:
            end_idx = idx
            break
            
    return text[start_idx:end_idx].strip()

def split_sentences(text):
    # Basic sentence splitter
    # Handles: . ! ? followed by space and Capital
    sentences = re.split(r'(?<=[.!?])\s+', text)
    return [s.strip() for s in sentences if len(s.strip()) > 5]

def ingest_manual(conn, path):
    if not os.path.exists(path):
        print(f"Manual corpus not found: {path}")
        return
    
    print(f"Ingesting manual corpus: {path}")
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    cur = conn.cursor()
    cur.execute("INSERT OR IGNORE INTO source (title, type, external_id) VALUES (?, ?, ?)", 
                ("DATA-SET 1", "manual", "manual-001"))
    source_id = cur.execute("SELECT id FROM source WHERE external_id = ?", ("manual-001",)).fetchone()[0]
    
    sentences = split_sentences(content)
    for s in sentences:
        cur.execute("INSERT INTO sentence (source_id, text) VALUES (?, ?)", (source_id, s))
        sentence_id = cur.lastrowid
        cur.execute("INSERT INTO sentence_fts (rowid, text) VALUES (?, ?)", (sentence_id, s))
    
    conn.commit()
    print(f"  Inserted {len(sentences)} sentences from manual corpus.")

def ingest_gutenberg(conn, book_ids):
    cur = conn.cursor()
    for bid in book_ids:
        ext_id = f"gutenberg-{bid}"
        check = cur.execute("SELECT id FROM source WHERE external_id = ?", (ext_id,)).fetchone()
        if check:
            print(f"Skipping Gutenberg ID {bid} (already ingested)")
            continue
            
        url = f"https://www.gutenberg.org/cache/epub/{bid}/pg{bid}.txt"
        print(f"Downloading Gutenberg ID {bid}: {url}")
        try:
            with urllib.request.urlopen(url) as response:
                content = response.read().decode('utf-8')
        except Exception as e:
            print(f"  Failed to download {bid}: {e}")
            continue
            
        text = clean_text(content)
        # Try to find title/author in first few lines
        title_match = re.search(r"Title:\s*(.*)", content)
        author_match = re.search(r"Author:\s*(.*)", content)
        title = title_match.group(1).strip() if title_match else f"Gutenberg {bid}"
        author = author_match.group(1).strip() if author_match else "Unknown"
        
        cur.execute("INSERT INTO source (title, author, type, url, external_id) VALUES (?, ?, ?, ?, ?)",
                    (title, author, "gutenberg", url, ext_id))
        source_id = cur.lastrowid
        
        sentences = split_sentences(text)
        print(f"  Ingesting {len(sentences)} sentences...")
        
        batch = []
        fts_batch = []
        for s in sentences:
            # Basic sanity check to avoid junk lines
            if len(s) > 500 or len(s) < 10: continue
            batch.append((source_id, s))
            
        cur.executemany("INSERT INTO sentence (source_id, text) VALUES (?, ?)", batch)
        
        # In SQLite FTS5, we need to know the rowids we just inserted or use a separate loop
        # For simplicity, we'll re-query or use a more efficient insert pattern
        # But for this script, we'll just insert into sentence then populate FTS
        
        conn.commit()

def populate_fts(conn):
    print("Populating FTS index...")
    conn.execute("INSERT INTO sentence_fts(sentence_fts) VALUES('rebuild')")
    conn.execute("INSERT INTO sentence_fts (rowid, text) SELECT id, text FROM sentence WHERE id NOT IN (SELECT rowid FROM sentence_fts)")
    conn.commit()

def ingest_wordnet_examples(conn, dict_path):
    if not os.path.exists(dict_path):
        print(f"Dictionary not found: {dict_path}. Skipping WordNet examples.")
        return
        
    print(f"Ingesting WordNet examples from {dict_path}")
    dict_conn = sqlite3.connect(dict_path)
    examples = dict_conn.execute("SELECT examples_json FROM wordnet_synset WHERE examples_json != '[]'").fetchall()
    dict_conn.close()
    
    cur = conn.cursor()
    cur.execute("INSERT OR IGNORE INTO source (title, type, external_id) VALUES (?, ?, ?)", 
                ("WordNet Examples", "dictionary", "wordnet-examples"))
    source_id = cur.execute("SELECT id FROM source WHERE external_id = ?", ("wordnet-examples",)).fetchone()[0]
    
    count = 0
    for row in examples:
        ex_list = json.loads(row[0])
        for ex in ex_list:
            cur.execute("INSERT INTO sentence (source_id, text) VALUES (?, ?)", (source_id, ex))
            count += 1
            
    conn.commit()
    print(f"  Inserted {count} sentences from WordNet.")

def main():
    parser = argparse.ArgumentParser(description="Build Scholomance Super Corpus")
    parser.add_argument("--db", default=DEFAULT_DB_PATH, help="Path to output SQLite")
    parser.add_argument("--dict", default=DEFAULT_DICT_PATH, help="Path to input dictionary")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing DB")
    parser.add_argument("--seeds", type=int, nargs='+', help="Gutenberg IDs to ingest")
    
    args = parser.parse_args()
    
    db_path = args.db
    # On Render, we might want to use /var/data/
    if os.path.exists("/var/data") and not os.path.isabs(db_path):
        db_path = os.path.join("/var/data", db_path)
        
    conn = init_db(db_path, args.overwrite)
    
    # 1. Manual
    ingest_manual(conn, MANUAL_CORPUS_PATH)
    
    # 2. Dictionary examples
    ingest_wordnet_examples(conn, args.dict)
    
    # 3. Gutenberg
    seeds = args.seeds if args.seeds else GUTENBERG_SEEDS
    ingest_gutenberg(conn, seeds)
    
    # 4. Finalize FTS
    populate_fts(conn)
    
    conn.close()
    print(f"Super Corpus built at {db_path}")

if __name__ == "__main__":
    main()
