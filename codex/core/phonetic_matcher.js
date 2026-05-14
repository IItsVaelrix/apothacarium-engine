/**
 * Advanced Phonetic Matcher (Metaphone-inspired)
 * Reduces words to a phonetic skeleton for sound-alike comparisons.
 */
export class PhoneticMatcher {
  /**
   * Encodes a word into its phonetic representation.
   * Focused on Scholomance's core sounds (Vowels/Consonants).
   * @param {string} word 
   * @returns {string}
   */
  encode(word) {
    if (!word) return "";
    let encoded = word.toUpperCase();

    // 1. Initial transformations
    if (encoded.startsWith('KN')) encoded = encoded.slice(1);
    if (encoded.startsWith('PH')) encoded = 'F' + encoded.slice(2);

    // 2. Map "UI" and similar /u:/ sounds to a canonical 'U'
    encoded = encoded.replace(/UI/g, 'U');
    encoded = encoded.replace(/OO/g, 'U');
    encoded = encoded.replace(/EW/g, 'U');
    encoded = encoded.replace(/UE/g, 'U');

    // 3. Drop silent letters and simplify consonants
    // This is a simplified version of Double Metaphone logic
    encoded = encoded.replace(/MB$/g, 'M'); // silent B in lamb
    encoded = encoded.replace(/([^C])H/g, '$1'); // silent H unless CH
    encoded = encoded.replace(/CK/g, 'K');
    encoded = encoded.replace(/PH/g, 'F');
    encoded = encoded.replace(/TION/g, 'XN'); // standard phonetic shorthand
    encoded = encoded.replace(/SION/g, 'XN');
    encoded = encoded.replace(/CH/g, 'X');
    encoded = encoded.replace(/S/g, 'S');
    encoded = encoded.replace(/Z/g, 'S'); // Canonicalize Z to S

    // 5. Canonicalize vowels
    encoded = encoded.replace(/[AEIOY]/g, 'A');
    
    // 6. Handle trailing E
    if (encoded.endsWith('E')) encoded = encoded.slice(0, -1);
    
    // 7. Collapse adjacent identical letters
    let collapsed = "";
    for (let i = 0; i < encoded.length; i++) {
      if (encoded[i] !== encoded[i-1]) collapsed += encoded[i];
    }

    return collapsed;
  }

  /**
   * Compares two words for phonetic similarity.
   * @param {string} wordA 
   * @param {string} wordB 
   * @returns {boolean}
   */
  isSoundAlike(wordA, wordB) {
    return this.encode(wordA) === this.encode(wordB);
  }
}

export const phoneticMatcher = new PhoneticMatcher();
