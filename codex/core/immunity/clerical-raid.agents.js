/**
 * Clerical RAID — Phase 3 agent integration hooks (PDR §7).
 * Import from agent runtimes to route bug reports through RAID with charter context.
 */

import { AGENT_INDEX } from './clerical-raid.schema.js';
import { autoTrainFromMerlinReport } from './clerical-raid.learning.js';

/** Short playbooks aligned with CLERICAL_RAID_PDR.md §7 */
export const AGENT_HOOK_PLAYBOOK = Object.freeze({
  codex:
    'Codex: For codex/core and codex/services — ask if this is a Scoring or Schema pattern. ' +
    'CONFIRMED → auto-fix with test; NEEDS_MERLIN → full Merlin report.',
  claude:
    'Claude: For src/hooks, pages, components — ask if this is UI state or XSS. ' +
    'CONFIRMED → auto-fix with regression; NEEDS_MERLIN → full Merlin report.',
  gemini:
    'Gemini: For mechanics / balance / world-law — ask if weave or rule violation. ' +
    'CONFIRMED → suggest rule fix; NEEDS_MERLIN → mechanic analysis.',
  merlin:
    'Merlin (Blackbox): When verdict is NEEDS_MERLIN or NOVEL — run full Merlin Data Protocol, ' +
    'then extract pattern and train the library.'
});

function normPaths(filePaths = []) {
  return filePaths.map(p => String(p).toLowerCase());
}

/**
 * Whether this agent charter should actively gate a report (path heuristic).
 * @param {'codex'|'claude'|'gemini'|'merlin'} agentKey
 * @param {string[]} filePaths
 */
export function agentHookApplies(agentKey, filePaths) {
  const paths = normPaths(filePaths);
  const joined = paths.join('\n');
  switch (String(agentKey).toLowerCase()) {
    case 'codex':
      return paths.some(p => p.includes('codex/core') || p.includes('codex/services') || p.includes('src/lib'));
    case 'claude':
      return paths.some(
        p =>
          p.includes('src/hooks') ||
          p.includes('src/pages') ||
          p.includes('src/components') ||
          p.includes('/ui/')
      );
    case 'gemini':
      return /game|mechanic|balance|world-law|world_law|simulation/.test(joined);
    case 'merlin':
    case 'blackbox':
      return true;
    default:
      return false;
  }
}

/**
 * Map string agent name to AGENT_INDEX for owner hints.
 * @param {string} agentKey
 */
export function resolveAgentIndex(agentKey) {
  const k = String(agentKey).toLowerCase();
  if (k === 'codex') return AGENT_INDEX.CODEX;
  if (k === 'claude') return AGENT_INDEX.CLAUDE;
  if (k === 'gemini') return AGENT_INDEX.GEMINI;
  if (k === 'merlin' || k === 'blackbox') return AGENT_INDEX.BLACKBOX;
  return AGENT_INDEX.UNKNOWN;
}

/**
 * Run RAID from an agent context: same query plus charter playbook and applicability bit.
 * @param {import('./clerical-raid.core.js').ClericalRAID} raid
 * @param {'codex'|'claude'|'gemini'|'merlin'} agentKey
 * @param {Parameters<import('./clerical-raid.core.js').ClericalRAID['query']>[0]} bugReport
 */
export function agentHookQuery(raid, agentKey, bugReport) {
  const key = String(agentKey).toLowerCase();
  const filePaths = bugReport.filePaths ?? [];
  const applies = agentHookApplies(key, filePaths);
  const result = raid.query(bugReport);
  const playbook = AGENT_HOOK_PLAYBOOK[key] || AGENT_HOOK_PLAYBOOK.merlin;
  return {
    ...result,
    agent: key,
    hookApplies: applies,
    playbook,
    suggestedOwnerIndex: resolveAgentIndex(key)
  };
}

/**
 * Merlin pipeline: diagnose from a stored/API-shaped report; optionally train on NOVEL.
 * @param {import('./clerical-raid.core.js').ClericalRAID} raid
 * @param {Record<string, unknown>} merlinReport
 * @param {{ train?: boolean }} [options]
 */
export function merlinAutoTrainPipeline(raid, merlinReport, options = {}) {
  return autoTrainFromMerlinReport(raid, merlinReport, options);
}
