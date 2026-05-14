/**
 * Corpus Routes
 * Exposes the Scholomance Super Corpus for literary analysis and rituals.
 *
 * All errors use PB-ERR-v1 bytecode for AI-parsable diagnostics.
 */
import {
  BytecodeError,
  ERROR_CATEGORIES,
  ERROR_SEVERITY,
  MODULE_IDS,
  ERROR_CODES,
} from '../../core/pixelbrain/bytecode-error.js';
import { PhonemeEngine } from '../../core/phonology/phoneme.engine.js';
import { scoreNodeSimilarity } from '../../core/rhyme-astrology/similarity.js';
import { buildPhoneticSignature } from '../../core/rhyme-astrology/signatures.js';
import { VOWEL_FAMILY_TO_SCHOOL } from '../../core/constants/schools.js';

const MOD = MODULE_IDS.SHARED;

export async function corpusRoutes(fastify, options) {
  const { adapter, lexiconAdapter } = options;
  if (!adapter) {
    throw new BytecodeError(
      ERROR_CATEGORIES.STATE, ERROR_SEVERITY.CRIT, MOD,
      ERROR_CODES.INVALID_STATE,
      { reason: 'CorpusRoutes adapter is required', parameter: 'adapter' },
    );
  }

  // GET /api/corpus/search?q=query&limit=20
  fastify.get('/search', async (request, reply) => {
    const { q, limit } = request.query;
    if (!q) {
      return reply.status(400).send({ message: 'Query "q" is required' });
    }
    const results = adapter.searchSentences(q, limit ? parseInt(limit) : 20);
    return { query: q, results };
  });

  // GET /api/corpus/context/:id?window=2
  fastify.get('/context/:id', async (request, reply) => {
    const { id } = request.params;
    const { window } = request.query;
    const sentenceId = parseInt(id);
    if (isNaN(sentenceId)) {
      return reply.status(400).send({ message: 'Invalid sentence ID' });
    }
    const results = adapter.getSentenceContext(sentenceId, window ? parseInt(window) : 2);
    return { id: sentenceId, results };
  });

  // GET /api/corpus/semantic?word=X&limit=N
  // Phoneme-based semantic search: finds words with sound-meaning proximity
  // using CMU phoneme distance vectors — Scholomance's native semantic layer.
  fastify.get('/semantic', async (request, reply) => {
    const { word, limit } = request.query;
    const queryWord = String(word || '').trim();
    const resultLimit = Math.min(parseInt(limit) || 20, 100);

    if (!queryWord) {
      return reply.status(400).send({ message: 'Query "word" is required' });
    }

    // Analyze the query word
    const analysis = PhonemeEngine.analyzeWord(queryWord);
    if (!analysis.phonemes || analysis.phonemes.length === 0) {
      return { word: queryWord, results: [] };
    }

    // Build the phonetic signature for the query word
    const querySig = buildPhoneticSignature(analysis.phonemes);

    // Gather candidate words from the lexicon
    const candidates = new Set();

    // Get rhymes via lexicon adapter (same rhyme family)
    if (lexiconAdapter?.lookupRhymes) {
      const rhymeData = lexiconAdapter.lookupRhymes(queryWord, 500);
      if (rhymeData?.words) {
        for (const w of rhymeData.words) {
          if (w) candidates.add(String(w).toLowerCase());
        }
      }
    }

    // Score each candidate
    const scored = [];
    for (const candidateWord of candidates) {
      if (candidateWord === queryWord.toLowerCase()) continue;

      const candAnalysis = PhonemeEngine.analyzeWord(candidateWord);
      if (!candAnalysis.phonemes || candAnalysis.phonemes.length === 0) continue;

      const candSig = buildPhoneticSignature(candAnalysis.phonemes);
      const similarity = scoreNodeSimilarity(querySig, candSig);

      const school = VOWEL_FAMILY_TO_SCHOOL[candAnalysis.vowelFamily] || 'UNKNOWN';

      scored.push({
        word: candidateWord,
        phoneme_distance: 1 - similarity.overallScore,
        rhyme_key: candAnalysis.rhymeKey,
        school,
        score: similarity.overallScore,
      });
    }

    // Sort by overallScore descending (highest similarity first)
    scored.sort((a, b) => b.score - a.score);

    return {
      word: queryWord,
      query_phonemes: analysis.phonemes,
      query_vowel_family: analysis.vowelFamily,
      query_school: VOWEL_FAMILY_TO_SCHOOL[analysis.vowelFamily] || 'UNKNOWN',
      results: scored.slice(0, resultLimit),
    };
  });
}
