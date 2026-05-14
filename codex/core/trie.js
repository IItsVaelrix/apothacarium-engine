/**
 * TrieNode structure for efficient prefix lookup and N-gram frequency storage.
 */
class TrieNode {
  constructor() {
    this.children = {}; // Map of character -> TrieNode
    this.isEndOfWord = false;
    this.frequency = 0;
    this.word = null; // Stores the full word at the leaf
    this.ngrams = new Map(); // Map of nextWord -> frequency
  }
}

/**
 * Trie-based Predictive Model
 */
export class TriePredictor {
  constructor() {
    this.root = new TrieNode();
  }

  normalizeWord(word) {
    return String(word || '').trim().toLowerCase();
  }

  normalizeWeight(weight) {
    const numericWeight = Number(weight);
    if (!Number.isFinite(numericWeight)) return 1;
    return Math.max(1, Math.trunc(numericWeight));
  }

  /**
   * Inserts a word into the trie and optionally updates its N-gram follow-set.
   * @param {string} word
   * @param {string|null} nextWord
   * @param {number} [weight=1]
   */
  insert(word, nextWord = null, weight = 1) {
    const normalizedWord = this.normalizeWord(word);
    if (!normalizedWord) return;

    const normalizedNextWord = nextWord ? this.normalizeWord(nextWord) : null;
    const normalizedWeight = this.normalizeWeight(weight);

    let node = this.root;
    for (const char of normalizedWord) {
      if (!node.children[char]) {
        node.children[char] = new TrieNode();
      }
      node = node.children[char];
    }
    node.isEndOfWord = true;
    node.frequency += normalizedWeight;
    node.word = normalizedWord;

    if (normalizedNextWord) {
      const nextFreq = node.ngrams.get(normalizedNextWord) || 0;
      node.ngrams.set(normalizedNextWord, nextFreq + normalizedWeight);
    }
  }

  /**
   * Finds the node matching a prefix.
   * @param {string} prefix 
   * @returns {TrieNode|null}
   */
  findNode(prefix) {
    let node = this.root;
    for (const char of prefix.toLowerCase()) {
      if (!node.children[char]) return null;
      node = node.children[char];
    }
    return node;
  }

  /**
   * Predicts words starting with the prefix, sorted by frequency.
   * @param {string} prefix 
   * @param {number} limit 
   * @returns {string[]}
   */
  predict(prefix, limit = 5) {
    const node = this.findNode(prefix);
    if (!node) return [];

    const results = [];
    this.traverse(node, results);

    return results
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, limit)
      .map(item => item.word);
  }

  /**
   * Predicts words starting with the prefix and keeps frequency metadata.
   * @param {string} prefix
   * @param {number} limit
   * @returns {Array<{word: string, frequency: number}>}
   */
  predictEntries(prefix, limit = 5) {
    const node = this.findNode(prefix);
    if (!node) return [];

    const results = [];
    this.traverse(node, results);

    return results
      .sort((a, b) => b.frequency - a.frequency || a.word.localeCompare(b.word))
      .slice(0, limit)
      .map((item) => ({ word: item.word, frequency: item.frequency }));
  }

  /**
   * Predicts the next word based on an exact word match (Bigram).
   * @param {string} word 
   * @param {number} limit 
   * @returns {string[]}
   */
  predictNext(word, limit = 5) {
    const node = this.findNode(word);
    if (!node || !node.isEndOfWord) return [];

    return Array.from(node.ngrams.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(entry => entry[0]);
  }

  /**
   * Predicts the next word and keeps N-gram weight metadata.
   * @param {string} word
   * @param {number} limit
   * @returns {Array<{word: string, weight: number}>}
   */
  predictNextEntries(word, limit = 5) {
    const node = this.findNode(word);
    if (!node || !node.isEndOfWord) return [];

    return Array.from(node.ngrams.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([nextWord, weight]) => ({ word: nextWord, weight }));
  }

  traverse(node, results) {
    if (node.isEndOfWord) {
      results.push({ word: node.word, frequency: node.frequency });
    }
    for (const char in node.children) {
      this.traverse(node.children[char], results);
    }
  }
}
