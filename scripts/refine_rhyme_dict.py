#!/usr/bin/env python3
"""
refine_rhyme_dict.py

Processes the Scholomance SQLite database to build a pre-computed rhyme index.
1. Extracts IPA from entries.
2. Converts IPA to ARPAbet (logical mapping).
3. Identifies the primary rhyme family and terminal coda.
4. Populates a rhyme_index table for high-performance lookup.
"""

import sqlite3
import re
import json
from tqdm import tqdm

DB_PATH = "scholomance_dict.sqlite"

# Basic IPA to ARPAbet mapping (Simplified for core families)
IPA_TO_ARPABET = {
    'i': 'IY', 'ɪ': 'IH', 'eɪ': 'EY', 'ɛ': 'EH', 'æ': 'AE',
    'ɑ': 'AA', 'ɒ': 'AA', 'ɔ': 'AO', 'oʊ': 'OW', 'ʊ': 'UH',
    'u': 'UW', 'ʌ': 'AH', 'ə': 'AH', 'aɪ': 'AY', 'aʊ': 'AW',
    'ɔɪ': 'OY', 'ɝ': 'ER', 'ɚ': 'ER', 'uː': 'UW', 'iː': 'IY'
}

def clean_ipa(ipa_str):
    if not ipa_str: return None
    # Take first IPA if multiple (split by semicolon or slash)
    first = re.split(r'[;/]', ipa_str)[0]
    return first.strip(' /[]')

def map_ipa_to_rhyme_family(ipa):
    if not ipa: return "A"
    # Find longest matching diphthongs first
    for key in sorted(IPA_TO_ARPABET.keys(), key=len, reverse=True):
        if key in ipa:
            return IPA_TO_ARPABET[key]
    return "A"

def init_rhyme_table(conn):
    conn.executescript("""
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
    """)

def process():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    init_rhyme_table(conn)
    
    cursor = conn.cursor()
    entries = conn.execute("SELECT id, headword_lower, ipa FROM entry WHERE ipa IS NOT NULL").fetchall()
    
    batch = []
    print(f"Indexing rhymes for {len(entries)} words...")
    
    for row in tqdm(entries):
        word_id = row['id']
        word = row['headword_lower']
        ipa = clean_ipa(row['ipa'])
        
        family = map_ipa_to_rhyme_family(ipa)
        # Coda extraction from IPA is complex, so we'll store the family
        # and rely on the realtime engine for granular coda matching 
        # unless we find a robust way to extract it here.
        # For now, authority rhyme dictionary provides the "Anchor".
        
        rhyme_key = family # Simplified for authoritative grouping
        
        batch.append((word_id, word, family, "", rhyme_key))
        
        if len(batch) >= 1000:
            cursor.executemany("INSERT OR REPLACE INTO rhyme_index VALUES (?, ?, ?, ?, ?)", batch)
            conn.commit()
            batch.clear()
            
    if batch:
        cursor.executemany("INSERT OR REPLACE INTO rhyme_index VALUES (?, ?, ?, ?, ?)", batch)
        conn.commit()
        
    conn.close()
    print("Rhyme dictionary refinement complete.")

if __name__ == "__main__":
    process()
