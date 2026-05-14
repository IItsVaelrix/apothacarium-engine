import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../../');
const SIGNALS_DIR = path.join(ROOT, '.codex/signals');
const APOPTOSIS_LOG = path.join(SIGNALS_DIR, 'apoptosis.jsonl');

/**
 * Apoptosis Listener
 * 
 * Listens for domain self-signaling events and persists them to the 
 * .codex/signals/apoptosis.jsonl log for CI and forensic auditing.
 */
export function initApoptosisListener() {
  if (!fs.existsSync(SIGNALS_DIR)) {
    fs.mkdirSync(SIGNALS_DIR, { recursive: true });
  }

  const handleSignal = (signal) => {
    try {
      const logEntry = JSON.stringify({
        ...signal,
        received_at: new Date().toISOString()
      });
      fs.appendFileSync(APOPTOSIS_LOG, logEntry + '\n');
    } catch (e) {
      console.error('[APOPTOSIS-LISTENER] Failed to write signal:', e.message);
    }
  };

  // Listen on system process for high-integrity capture
  if (typeof globalThis.process?.on === 'function') {
    globalThis.process.on('codex:apoptosis', handleSignal);
  }
}

// Auto-init if imported in a runtime context
if (typeof process !== 'undefined') {
  initApoptosisListener();
}
