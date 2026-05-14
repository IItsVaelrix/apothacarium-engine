#!/usr/bin/env node
/**
 * Clerical RAID CLI (PDR section 6)
 *
 * Usage:
 *   node scripts/cleri-raid.js scan "symptom string..."
 *   node scripts/cleri-raid.js diagnose --report ./bug.json
 *   node scripts/cleri-raid.js train --pattern ./pattern.json
 *   node scripts/cleri-raid.js stats
 *   node scripts/cleri-raid.js repl
 *   node scripts/cleri-raid.js rebuild-index   # re-quantize loaded patterns
 *   node scripts/cleri-raid.js agent-query codex --report ./bug.json   # Phase 3 hook
 *   node scripts/cleri-raid.js merlin-ingest --report ./merlin.json    # Phase 4 auto-train on NOVEL
 *   node scripts/cleri-raid.js cluster [--min-sim 0.92]
 *   node scripts/cleri-raid.js maintenance   # deprecate low-feedback patterns
 *
 * npm: npm run cleri -- scan "null pointer in combat hook"
 */

import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { createRaidWithSeeds } from '../codex/core/immunity/clerical-raid.bootstrap.js';
import { Pattern } from '../codex/core/immunity/clerical-raid.core.js';
import { AGENT_INDEX } from '../codex/core/immunity/clerical-raid.schema.js';
import { agentHookQuery } from '../codex/core/immunity/clerical-raid.agents.js';
import {
  autoTrainFromMerlinReport,
  clusterPatternsBySimilarity,
  deprecateStalePatterns,
  findNearDuplicatePatterns,
  patternEffectivenessScore,
  extractVectorFromMerlinReport
} from '../codex/core/immunity/clerical-raid.learning.js';

const OWNER_ALIASES = {
  codex: AGENT_INDEX.CODEX,
  claude: AGENT_INDEX.CLAUDE,
  gemini: AGENT_INDEX.GEMINI,
  blackbox: AGENT_INDEX.BLACKBOX,
  merlin: AGENT_INDEX.BLACKBOX,
  unknown: AGENT_INDEX.UNKNOWN
};

function resolveOwner(raw) {
  if (typeof raw === 'number' && raw >= 0 && raw <= 4) return raw;
  if (typeof raw === 'string') {
    const k = raw.toLowerCase();
    if (k in OWNER_ALIASES) return OWNER_ALIASES[k];
  }
  return AGENT_INDEX.UNKNOWN;
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--report' || a === '--pattern') {
      out[a.slice(2)] = argv[++i];
    } else if (a === '--min-sim') {
      out.minSim = Number(argv[++i]);
    } else if (a === '--no-train') {
      out.noTrain = true;
    } else if (a === '--confirm') {
      out.confirm = true;
    } else if (a === '--reject') {
      out.reject = true;
    } else if (!a.startsWith('-')) {
      out._.push(a);
    }
  }
  return out;
}

function normalizeBugReport(raw) {
  const symptoms = Array.isArray(raw.symptoms) ? raw.symptoms : [];
  const filePaths = Array.isArray(raw.filePaths) ? raw.filePaths : [];
  const errorMessages = [];
  if (raw.errorMessage) errorMessages.push(raw.errorMessage);
  if (Array.isArray(raw.errorMessages)) errorMessages.push(...raw.errorMessages);
  return {
    symptoms: symptoms.length ? symptoms : (raw.text ? [raw.text] : []),
    filePaths,
    layerHint: raw.layer ?? raw.layerHint ?? null,
    errorMessages,
    timestamp: raw.timestamp ?? Date.now()
  };
}

async function cmdScan(raid, text) {
  const result = raid.query({
    symptoms: [text],
    filePaths: [],
    timestamp: Date.now()
  });
  console.log(JSON.stringify(result, null, 2));
}

async function cmdDiagnose(raid, reportPath) {
  const abs = path.isAbsolute(reportPath) ? reportPath : path.join(process.cwd(), reportPath);
  const json = JSON.parse(await fs.readFile(abs, 'utf8'));
  const result = raid.query(normalizeBugReport(json));
  console.log(JSON.stringify(result, null, 2));
}

async function cmdTrain(raid, patternPath) {
  const abs = path.isAbsolute(patternPath) ? patternPath : path.join(process.cwd(), patternPath);
  const json = JSON.parse(await fs.readFile(abs, 'utf8'));
  const pattern = new Pattern(
    json.id,
    json.name,
    json.symptoms ?? [],
    json.filePaths ?? [],
    json.errorMessages ?? [],
    resolveOwner(json.owner),
    json.fixPath ?? '',
    json.confidence ?? 1.0
  );
  raid.train(pattern);
  console.log(JSON.stringify({ ok: true, id: pattern.id, patternCount: raid.patterns.length }, null, 2));
}

async function cmdStats(raid) {
  console.log(JSON.stringify(raid.getStats(), null, 2));
}

async function cmdRepl(raid) {
  const rl = readline.createInterface({ input, output });
  console.log('Clerical RAID REPL — enter symptom line, blank to exit.');
  for (;;) {
    const line = await rl.question('raid> ');
    if (!line.trim()) break;
    const result = raid.query({ symptoms: [line.trim()], filePaths: [], timestamp: Date.now() });
    console.log(JSON.stringify(result, null, 2));
  }
  rl.close();
}

async function cmdAgentQuery(raid, agentKey, reportPath) {
  const abs = path.isAbsolute(reportPath) ? reportPath : path.join(process.cwd(), reportPath);
  const json = JSON.parse(await fs.readFile(abs, 'utf8'));
  const result = agentHookQuery(raid, agentKey, normalizeBugReport(json));
  console.log(JSON.stringify(result, null, 2));
}

async function cmdMerlinIngest(raid, reportPath, train) {
  const abs = path.isAbsolute(reportPath) ? reportPath : path.join(process.cwd(), reportPath);
  const json = JSON.parse(await fs.readFile(abs, 'utf8'));
  const payload = autoTrainFromMerlinReport(raid, json, { train });
  const preview = extractVectorFromMerlinReport(json);
  console.log(
    JSON.stringify(
      {
        ...payload,
        vectorPreview16: Array.from(preview.slice(0, 16))
      },
      null,
      2
    )
  );
}

function cmdCluster(raid, minSim) {
  const clusters = clusterPatternsBySimilarity(raid, Number.isFinite(minSim) ? minSim : 0.92);
  console.log(JSON.stringify({ clusterCount: clusters.length, clusters }, null, 2));
}

function cmdDuplicates(raid, minSim) {
  const pairs = findNearDuplicatePatterns(raid, Number.isFinite(minSim) ? minSim : 0.97);
  console.log(JSON.stringify({ pairCount: pairs.length, pairs }, null, 2));
}

function cmdMaintenance(raid) {
  const deprecatedIds = deprecateStalePatterns(raid);
  const scores = raid.patterns
    .filter(p => !p.deprecated)
    .map(p => ({
      id: p.id,
      effectiveness: patternEffectivenessScore(p),
      hits: p.hitCount ?? 0,
      misses: p.missCount ?? 0
    }));
  console.log(JSON.stringify({ deprecatedIds, stats: raid.getStats(), effectiveness: scores }, null, 2));
}

function cmdFeedback(raid, patternId, confirm) {
  if (confirm) raid.confirm(patternId);
  else raid.feedbackNegative(patternId);
  const p = raid.patterns.find(x => x.id === patternId);
  console.log(
    JSON.stringify(
      {
        ok: !!p,
        patternId,
        confidence: p?.confidence,
        hitCount: p?.hitCount,
        missCount: p?.missCount,
        effectiveness: p ? patternEffectivenessScore(p) : null
      },
      null,
      2
    )
  );
}

async function main() {
  const argv = process.argv.slice(2);
  const [command, ...rest] = argv;
  const opts = parseArgs(rest);

  if (!command || command === 'help' || command === '--help') {
    console.log(
      `Clerical RAID — commands: scan | diagnose | train | stats | repl | rebuild-index | ` +
        `agent-query | merlin-ingest | cluster | duplicates | maintenance | feedback`
    );
    process.exit(command ? 0 : 1);
    return;
  }

  const raid = createRaidWithSeeds();

  switch (command) {
    case 'scan': {
      const text = opts._.join(' ').trim();
      if (!text) {
        console.error('Usage: cleri scan "symptom text"');
        process.exit(1);
      }
      await cmdScan(raid, text);
      break;
    }
    case 'diagnose': {
      const p = opts.report;
      if (!p) {
        console.error('Usage: cleri diagnose --report ./bug.json');
        process.exit(1);
      }
      await cmdDiagnose(raid, p);
      break;
    }
    case 'train': {
      const p = opts.pattern;
      if (!p) {
        console.error('Usage: cleri train --pattern ./pattern.json');
        process.exit(1);
      }
      await cmdTrain(raid, p);
      break;
    }
    case 'stats':
      await cmdStats(raid);
      break;
    case 'repl':
      await cmdRepl(raid);
      break;
    case 'rebuild-index':
      raid.rebuildIndex();
      console.log(JSON.stringify({ ok: true, ...raid.getStats() }, null, 2));
      break;
    case 'agent-query': {
      const agentKey = opts._[0];
      const rep = opts.report;
      if (!agentKey || !rep) {
        console.error('Usage: cleri agent-query <codex|claude|gemini|merlin> --report ./bug.json');
        process.exit(1);
      }
      await cmdAgentQuery(raid, agentKey, rep);
      break;
    }
    case 'merlin-ingest': {
      const rep = opts.report;
      if (!rep) {
        console.error('Usage: cleri merlin-ingest --report ./merlin.json [--no-train]');
        process.exit(1);
      }
      await cmdMerlinIngest(raid, rep, !opts.noTrain);
      break;
    }
    case 'cluster':
      cmdCluster(raid, opts.minSim);
      break;
    case 'duplicates':
      cmdDuplicates(raid, opts.minSim);
      break;
    case 'maintenance':
      cmdMaintenance(raid);
      break;
    case 'feedback': {
      const pid = opts.pattern;
      if (!pid || (!opts.confirm && !opts.reject) || (opts.confirm && opts.reject)) {
        console.error('Usage: cleri feedback --pattern PAT-001 --confirm | --reject');
        process.exit(1);
      }
      cmdFeedback(raid, pid, !!opts.confirm);
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
