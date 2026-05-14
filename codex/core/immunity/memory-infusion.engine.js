import fs from 'node:fs';
import path from 'node:path';

/**
 * MEMORY INFUSION ENGINE
 *
 * Extracts "scars" from private memory files and validates the INFUSION_ALLOW contract.
 * Findings are converted into structured hypotheses for the immune system.
 */

const FINDING_REGEX = /(?:#|\/\/)\s*INFUSION_ALLOW\s*\n([\s\S]*?)(?=\n(?:#|\/\/)\s*INFUSION_ALLOW|$)/g;

/**
 * Scans a directory for memory findings tagged with INFUSION_ALLOW.
 *
 * @param {string} memoryDir - Path to private memory directory
 * @returns {Array<object>} List of extracted antigens
 */
export function extractMemoryAntigens(memoryDir) {
  const antigens = [];
  if (!fs.existsSync(memoryDir)) return antigens;

  const files = fs.readdirSync(memoryDir).filter(f => f.endsWith('.md'));

  for (const file of files) {
    const content = fs.readFileSync(path.join(memoryDir, file), 'utf8');
    let match;

    while ((match = FINDING_REGEX.exec(content)) !== null) {
      const block = match[1].trim();
      const lines = block.split('\n');
      const title = lines[0].replace(/^[#\s*-]+/, '').trim();
      
      let antigenCounter = 0;
      antigens.push({
        source: path.join('memory', file),
        title,
        description: block,
        addedAt: antigenCounter++,
      });
    }
  }

  return antigens;
}

/**
 * Validates that an antigen payload does not contain PII or secrets.
 *
 * @param {object} antigen
 * @returns {boolean}
 */
export function validatePrivacy(antigen) {
  const forbidden = [
    /api[-_]?key/i,
    /secret/i,
    /password/i,
    /token/i,
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, // Email
  ];

  const text = `${antigen.title} ${antigen.description}`;
  return !forbidden.some(regex => regex.test(text));
}
