/**
 * Scholomance MCP Bridge
 *
 * Transmutes the collab control plane into a formal Model Context Protocol
 * server without bypassing the authoritative orchestration layer.
 */

import path from 'path';
import fs from 'node:fs';
import { fileURLToPath } from 'url';
import { execSync } from 'node:child_process';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as schemas from './collab.schemas.js';
import {
  BytecodeError,
  ERROR_CATEGORIES,
  ERROR_SEVERITY,
  MODULE_IDS,
  ERROR_CODES,
} from '../../core/pixelbrain/bytecode-error.js';
import { analyzeDesignIntent } from '../../core/grimdesign/intentAnalyzer.js';
import { resolveDesignDecisions } from '../../core/grimdesign/decisionEngine.js';

const MOD = MODULE_IDS.SHARED;
import { CollabServiceError, collabService } from './collab.service.js';
import { collabDiagnostic } from './collab.diagnostic.js';
import {
  getLatestReport as diagnosticGetLatestReport,
  getReportById as diagnosticGetReportById,
  queryViolations as diagnosticQueryViolations,
  queryHealth as diagnosticQueryHealth,
  runCells as diagnosticRunCells,
  summary as diagnosticSummary,
  getRecoveryHints as diagnosticGetRecoveryHints,
  triggerFullScan as diagnosticTriggerFullScan,
} from './diagnostic.mcp.js';
import { 
    searchCodebase, 
    forensicSearch, 
    searchHybrid, 
    getFileNeighbors, 
    listIndexedFiles 
} from '../services/codebaseSearch.service.js';
import { createRaidWithSeeds } from '../../core/immunity/clerical-raid.bootstrap.js';
import { agentHookQuery, merlinAutoTrainPipeline } from '../../core/immunity/clerical-raid.agents.js';
import {
    merlinReportToBugReport,
    extractVectorFromMerlinReport,
    clusterPatternsBySimilarity,
    deprecateStalePatterns,
    findNearDuplicatePatterns,
    patternEffectivenessScore,
} from '../../core/immunity/clerical-raid.learning.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..', '..');

/** In-memory Clerical RAID library for MCP session (Phase 3–4 hooks). */
let clericalRaidMcp = null;
function getClericalRaidMcp() {
    if (!clericalRaidMcp) clericalRaidMcp = createRaidWithSeeds();
    return clericalRaidMcp;
}

function toJsonText(value) {
    return JSON.stringify(value, null, 2);
}

function createResourcePayload(uri, value) {
    return {
        contents: [{
            uri,
            mimeType: 'application/json',
            text: toJsonText(value),
        }],
    };
}

function createToolSuccess(tool, result) {
    return {
        content: [{
            type: 'text',
            text: toJsonText({
                ok: true,
                tool,
                result,
            }),
        }],
    };
}

function createToolError(error) {
    if (error instanceof CollabServiceError) {
        return {
            content: [{
                type: 'text',
                text: toJsonText({
                    ok: false,
                    code: error.code,
                    error: error.message,
                    details: error.details,
                }),
            }],
            isError: true,
        };
    }

    return {
        content: [{
            type: 'text',
            text: toJsonText({
                ok: false,
                code: 'INTERNAL_ERROR',
                error: error instanceof Error ? error.message : 'Unknown MCP bridge error',
            }),
        }],
        isError: true,
    };
}

function registerJsonResource(server, name, uri, reader) {
    server.resource(name, uri, async () => createResourcePayload(uri, await reader()));
}

function registerJsonResourceTemplate(server, name, uriTemplate, reader) {
    server.resource(
        name,
        new ResourceTemplate(uriTemplate, {}),
        async (uri, variables) => createResourcePayload(uri.href, await reader(variables)),
    );
}

function registerSingleTool(server, name, inputSchema, handler) {
    server.tool(name, inputSchema, async (params) => {
        try {
            return createToolSuccess(name, await handler(params));
        } catch (error) {
            return createToolError(error);
        }
    });
}

function registerTool(server, name, inputSchema, handler) {
    registerSingleTool(server, name, inputSchema, handler);

    const collabPrefix = 'mcp_scholomance_collab_';
    if (name.startsWith(collabPrefix)) {
        registerSingleTool(server, `collab_${name.slice(collabPrefix.length)}`, inputSchema, handler);
    }
}

// ── GrimDesign spec builder ───────────────────────────────────────────────────

function toKebab(str) {
    return String(str || 'grim-component')
        .replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`)
        .replace(/^-/, '')
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-');
}

function buildAnimKeyframes(animationClass, durationMs) {
    const dur = durationMs || 2400;
    const frames = {
        'grim-pulse': `@keyframes grim-pulse {
  0%, 100% { opacity: 0.8; box-shadow: var(--grim-glow); }
  50%       { opacity: 1.0; box-shadow: var(--grim-glow), 0 0 calc(var(--grim-glow-radius, 8px) * 1.5) var(--grim-color); }
}`,
        'grim-breathe': `@keyframes grim-breathe {
  0%, 100% { transform: scale(1.000); box-shadow: none; }
  50%       { transform: scale(1.015); box-shadow: var(--grim-glow); }
}`,
        'grim-shimmer': `@keyframes grim-shimmer {
  0%, 100% { filter: hue-rotate(0deg)   brightness(1.00); }
  50%       { filter: hue-rotate(20deg)  brightness(1.15); }
}`,
    };
    const keyframe = frames[animationClass] || '';
    if (!keyframe) return '';
    return `@media (prefers-reduced-motion: no-preference) {\n  ${keyframe.replace(/\n/g, '\n  ')}\n}`;
}

/**
 * Renders a full GrimDesign output spec block from a signal + decisions pair.
 */
function buildGrimSpec(intent, signal, decisions, componentName) {
    const name    = componentName || 'GrimComponent';
    const kebab   = toKebab(name);
    const { dominantSchool, effectClass, provenance } = signal;
    const {
        color, glowRadius, glowColor, borderAlpha,
        animationClass, animationDurationMs,
        atmosphereLevel, scanlines,
        componentComplexity, transitionMs,
        fontSizeRem, fontWeight, worldLawReason, cssVars,
    } = decisions;

    const { h, s, l } = signal.blendedHsl;
    const lMuted       = Math.min(75, l + 15);
    const glowLine     = glowRadius > 0 ? `0 0 ${glowRadius}px ${glowColor}` : 'none';
    const borderLine   = `1px solid hsla(${h}, ${s}%, ${lMuted}%, ${borderAlpha})`;
    const animLine     = animationClass ? `${animationClass} ${animationDurationMs}ms ease-in-out` : 'none';
    const atmLine      = `${atmosphereLevel}${scanlines ? ' + scanlines' : ''}`;

    const complexityDesc = {
        1: 'single surface, no sub-layers',
        2: 'header + body',
        3: 'header + body + footer/meta row',
        4: 'full card with multiple sections',
    }[componentComplexity] || 'single surface';

    const provenanceBlock = (Array.isArray(provenance) ? provenance : [])
        .map((line) => `  ${line}`)
        .join('\n');

    const cssVarsInline = Object.entries(cssVars || {})
        .map(([k, v]) => `  ${k}: ${v};`)
        .join('\n');

    const animKeyframes = animationClass ? buildAnimKeyframes(animationClass, animationDurationMs) : '';

    const jsxSkeleton = `function ${name}({ children, className = '' }) {
  return (
    <div
      className={\`${kebab} \${className}\`}
      role="region"
      aria-label="${name}"
    >
      {children}
    </div>
  );
}`;

    const cssDelta = `.${kebab} {
${cssVarsInline}
  color: var(--grim-color);
  border: var(--grim-border);
  box-shadow: var(--grim-glow);
  font-size: var(--grim-font-size);
  font-weight: var(--grim-font-weight);
  transition: color var(--grim-transition), box-shadow var(--grim-transition), border-color var(--grim-transition);
}

${animKeyframes ? animKeyframes + '\n\n' : ''}.${kebab} {
  animation: ${animLine};
}`.trim();

    return `## ${name} — GrimDesign Output

CLASSIFICATION: new component
WHY: ${worldLawReason}
WORLD-LAW CONNECTION: ${dominantSchool} effectClass ${effectClass} via phonemic signal in "${intent}"

SIGNAL PROVENANCE:
${provenanceBlock || '  (no provenance)'}

DESIGN DECISIONS:
  color:        ${color}
  glow:         ${glowLine}
  border:       ${borderLine}
  animation:    ${animLine}
  atmosphere:   ${atmLine}
  complexity:   ${componentComplexity} (${complexityDesc})
  transition:   ${transitionMs}ms

CODE:
${jsxSkeleton}

CSS DELTA:
${cssDelta}

HANDOFF TO BLACKBOX:
  Update visual regression baselines in tests/visual/ that include ${name}.

QA CHECKLIST:
- [ ] No logic imported from codex/ or src/lib/
- [ ] State via hooks/context only
- [ ] ARIA labels present
- [ ] Reduced motion respected (prefers-reduced-motion disables ${animationClass || 'animation'})
- [ ] School CSS variables consumed, not hardcoded
- [ ] No inline styles for state
- [ ] dangerouslySetInnerHTML sanitized if used`;
}

export function registerCollabMcpBridge(server, service = collabService) {
    registerJsonResource(server, 'agents', 'collab://agents', () => service.listAgents());
    registerJsonResource(server, 'tasks', 'collab://tasks', () => service.listTasks());
    registerJsonResource(server, 'locks', 'collab://locks', () => service.listLocks());
    registerJsonResource(server, 'activity', 'collab://activity', () => service.listActivity({ limit: 50 }));
    registerJsonResource(server, 'pipelines', 'collab://pipelines', () => service.listPipelines());
    registerJsonResource(server, 'bugs', 'collab://bugs', () => service.listBugReports());
    registerJsonResource(server, 'status', 'collab://status', () => service.getStatus());
    registerJsonResource(server, 'memories', 'collab://memories', () => service.listMemories());

    registerJsonResourceTemplate(server, 'agent-memories', 'collab://agents/{id}/memories', async ({ id }) => {
        return service.listMemories(id);
    });

    registerJsonResourceTemplate(server, 'task-notes', 'collab://tasks/{id}/notes', async ({ id }) => {
        const task = await service.getTask(id);
        return task?.notes || [];
    });

    registerJsonResourceTemplate(server, 'bug-report', 'collab://bugs/{id}', async ({ id }) => {
        return service.getBugReport(id);
    });

    // --- Official Protocol Tools (mcp_scholomance_collab_ prefix) ---

    registerTool(server, 'mcp_scholomance_collab_bug_report_create', {
        title: z.string().describe('Short title of the bug'),
        summary: z.string().optional().describe('Detailed summary'),
        source_type: z.enum(['human', 'runtime', 'qa', 'pipeline', 'agent']).describe('Source of the report'),
        reporter_agent_id: z.string().optional().describe('Agent ID filing the report'),
        priority: z.number().int().min(0).max(3).optional().default(1).describe('Priority (0-3)'),
        bytecode: z.string().optional().describe('PixelBrain bytecode error string'),
        repro_steps: z.array(z.string()).optional().describe('Steps to reproduce'),
        observed_behavior: z.string().optional().describe('What actually happened'),
        expected_behavior: z.string().optional().describe('What should have happened'),
    }, params => service.createBugReport(params));

    registerTool(server, 'mcp_scholomance_collab_bug_report_update', {
        id: z.string().describe('Bug report ID'),
        status: z.string().optional().describe('New status (triaged, fixed, etc)'),
        priority: z.number().int().min(0).max(3).optional(),
        assigned_agent_id: z.string().optional().nullable(),
        summary: z.string().optional(),
    }, params => service.updateBugReport(params));

    registerTool(server, 'mcp_scholomance_collab_bug_report_list', {
        status: z.string().optional(),
        severity: z.string().optional(),
        assigned_agent_id: z.string().optional(),
    }, params => service.listBugReports(params));

    registerTool(server, 'mcp_scholomance_collab_bug_report_get', {
        id: z.string().describe('Bug report ID'),
    }, ({ id }) => service.getBugReport(id));

    registerTool(server, 'mcp_scholomance_collab_bug_report_parse_bytecode', {
        bytecode: z.string().describe('Raw bytecode to parse and verify'),
    }, ({ bytecode }) => service.parseBytecode(bytecode));

    registerTool(server, 'mcp_scholomance_collab_bug_report_create_task', {
        id: z.string().describe('Bug report ID to convert to task'),
        actor_agent_id: z.string().optional(),
    }, ({ id, actor_agent_id }) => service.createTaskFromBug(id, actor_agent_id));

    registerTool(server, 'mcp_scholomance_collab_agent_list', {}, () => service.listAgents());

    registerTool(server, 'mcp_scholomance_collab_agent_register', {
        id: z.string().describe('Unique agent ID (e.g. merlin-cli)'),
        name: z.string().describe('Display name'),
        role: schemas.AgentRole.describe('Agent role'),
        capabilities: z.array(z.string()).optional().default([]).describe('List of agent capabilities'),
        metadata: z.record(z.string(), z.unknown()).optional().describe('Opaque agent metadata'),
    }, params => service.registerAgent(params));

    registerTool(server, 'mcp_scholomance_collab_agent_heartbeat', {
        id: z.string().describe('Agent ID'),
        status: z.enum(['online', 'busy', 'offline']).optional().default('online').describe('Heartbeat status'),
        current_task_id: z.string().nullable().optional().describe('Currently active task, if any'),
    }, params => service.heartbeatAgent(params));

    registerTool(server, 'mcp_scholomance_collab_agent_delete', {
        id: z.string().describe('Agent ID to remove from the control plane (terminates presence)'),
    }, ({ id }) => service.deleteAgent(id));

    registerTool(server, 'mcp_scholomance_collab_task_list', {
        status: schemas.TaskStatus.optional(),
        agent: z.string().optional(),
        priority: z.number().int().min(0).max(3).optional(),
    }, params => service.listTasks(params));

    registerTool(server, 'mcp_scholomance_collab_task_create', {
        title: z.string().describe('Task ritual title'),
        description: z.string().optional().describe('Detailed task purpose'),
        note: z.string().optional().describe('Initial status note for the task'),
        priority: z.number().int().min(0).max(3).optional().default(1).describe('Priority level (0-3)'),
        file_paths: z.array(z.string()).optional().default([]).describe('Relevant file substrates'),
        depends_on: z.array(z.string()).optional().default([]).describe('Task dependencies'),
        created_by: z.string().optional().default('human').describe('Origin of the task'),
        pipeline_run_id: z.string().optional().describe('Owning pipeline run, if any'),
    }, params => service.createTask(params));

    registerTool(server, 'mcp_scholomance_collab_task_get', {
        id: z.string().describe('Task ID'),
    }, ({ id }) => service.getTask(id));

    registerTool(server, 'mcp_scholomance_collab_task_assign', {
        task_id: z.string().describe('Task ID'),
        agent_id: z.string().describe('Agent ID'),
        override: z.boolean().optional().default(false).describe('Bypass ownership checks'),
    }, params => service.assignTask(params));

    registerTool(server, 'mcp_scholomance_collab_task_update', {
        id: z.string().describe('Task ID'),
        actor_agent_id: z.string().optional().describe('Agent performing the update'),
        note: z.string().describe('REQUIRED: Note of what was performed (Call Center Style)'),
        title: z.string().optional(),
        description: z.string().optional(),
        status: schemas.TaskStatus.optional(),
        priority: z.number().int().min(0).max(3).optional(),
        result: z.record(z.string(), z.unknown()).optional(),
    }, params => service.updateTask(params));

    registerTool(server, 'mcp_scholomance_collab_task_delete', {
        id: z.string().describe('Task ID to remove from the ritual record'),
        actor_agent_id: z.string().optional().describe('Agent performing the deletion'),
    }, params => service.deleteTask(params));

    registerTool(server, 'mcp_scholomance_collab_lock_acquire', {
        file_path: z.string().describe('Path to the file substrate to lock'),
        agent_id: z.string().describe('Agent acquiring the lock'),
        task_id: z.string().optional().describe('Related task, if any'),
        ttl_minutes: z.number().int().min(1).max(480).optional().default(30).describe('Lock duration in minutes'),
    }, params => service.acquireLock(params));

    registerTool(server, 'mcp_scholomance_collab_lock_release', {
        file_path: z.string().describe('Path to the file substrate to unlock'),
        agent_id: z.string().describe('Lock owner releasing the lock'),
    }, params => service.releaseLock(params));

    registerTool(server, 'mcp_scholomance_collab_pipeline_create', {
        pipeline_type: schemas.PipelineType.describe('Pipeline type'),
        trigger_task_id: z.string().optional().describe('Trigger task for file context'),
        actor_agent_id: z.string().optional().describe('Agent starting the pipeline'),
    }, params => service.createPipeline(params));

    registerTool(server, 'mcp_scholomance_collab_pipeline_list', {
        status: schemas.PipelineRunStatus.optional(),
    }, params => service.listPipelines(params));

    registerTool(server, 'mcp_scholomance_collab_pipeline_get', {
        id: z.string().describe('Pipeline ID'),
    }, ({ id }) => service.getPipeline(id));

    registerTool(server, 'mcp_scholomance_collab_pipeline_advance', {
        id: z.string().describe('Pipeline ID'),
        agent_id: z.string().optional().describe('Agent advancing the pipeline'),
        result: z.record(z.string(), z.unknown()).optional().default({}).describe('Stage result payload'),
    }, ({ id, agent_id, result }) => service.advancePipeline({
        id,
        actor_agent_id: agent_id ?? null,
        result,
    }));

    registerTool(server, 'mcp_scholomance_collab_pipeline_fail', {
        id: z.string().describe('Pipeline ID'),
        agent_id: z.string().optional().describe('Agent failing the pipeline'),
        reason: z.string().min(1).max(1024).describe('Failure reason'),
    }, ({ id, agent_id, reason }) => service.failPipeline({
        id,
        actor_agent_id: agent_id ?? null,
        reason,
    }));

    registerTool(server, 'mcp_scholomance_collab_activity_list', {
        agent: z.string().optional(),
        action: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional().default(50),
    }, params => service.listActivity(params));

    registerTool(server, 'mcp_scholomance_collab_status_get', {}, () => service.getStatus());

    registerTool(server, 'mcp_scholomance_collab_memory_set', {
        agent_id: z.string().min(1).nullable().optional().default(null).describe('Agent ID for specific memory, or null for global'),
        key: z.string().min(1).max(128).describe('Unique key for the memory'),
        value: z.any().describe('Value to persist (JSON-serializable)'),
    }, (params) => service.setMemory(params));

    registerTool(server, 'mcp_scholomance_collab_memory_get', {
        agent_id: z.string().min(1).nullable().optional().default(null).describe('Agent ID for specific memory, or null for global'),
        key: z.string().min(1).max(128).describe('Key to retrieve'),
    }, (params) => service.getMemory(params));

    registerTool(server, 'mcp_scholomance_collab_memory_delete', {
        agent_id: z.string().min(1).nullable().optional().default(null).describe('Agent ID for specific memory, or null for global'),
        key: z.string().min(1).max(128).describe('Key to delete'),
    }, (params) => service.deleteMemory(params));

    registerTool(server, 'mcp_scholomance_collab_fs_list', {
        directory: z.string().optional().default('.').describe('The relative directory substrate to list (relative to project root)'),
        recursive: z.boolean().optional().default(false).describe('Whether to descend recursively into sub-archives'),
    }, async ({ directory, recursive }) => {
        const absDir = path.resolve(ROOT, directory);
        if (!absDir.startsWith(ROOT)) throw new BytecodeError(
            ERROR_CATEGORIES.RANGE, ERROR_SEVERITY.CRIT, MOD,
            ERROR_CODES.OUT_OF_BOUNDS,
            { reason: 'Out of bounds access attempt to external substrates', requestedPath: absDir, rootPath: ROOT },
        );
        if (!fs.existsSync(absDir)) return [];

        const results = [];
        const maxDepth = 3;

        function walk(currentPath, depth) {
            if (depth > maxDepth) return;
            const entries = fs.readdirSync(currentPath, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;

                const fullPath = path.join(currentPath, entry.name);
                const relPath = path.relative(ROOT, fullPath);

                if (entry.isDirectory()) {
                    results.push(relPath + '/');
                    if (recursive) {
                        walk(fullPath, depth + 1);
                    }
                } else {
                    results.push(relPath);
                }
            }
        }

        try {
            walk(absDir, 0);
            return results;
        } catch (e) {
            throw new BytecodeError(
                ERROR_CATEGORIES.STATE, ERROR_SEVERITY.WARN, MOD,
                ERROR_CODES.INVALID_STATE,
                { reason: 'Failed to list substrate', originalError: e.message },
            );
        }
    });

    registerTool(server, 'mcp_scholomance_collab_fs_read', {
        path: z.string().describe('The relative path of the file substrate to read'),
    }, async ({ path: filePath }) => {
        const absPath = path.resolve(ROOT, filePath);
        if (!absPath.startsWith(ROOT)) throw new BytecodeError(
            ERROR_CATEGORIES.RANGE, ERROR_SEVERITY.CRIT, MOD,
            ERROR_CODES.OUT_OF_BOUNDS,
            { reason: 'Out of bounds read attempt', requestedPath: absPath, rootPath: ROOT },
        );
        if (!fs.existsSync(absPath)) throw new BytecodeError(
            ERROR_CATEGORIES.VALUE, ERROR_SEVERITY.CRIT, MOD,
            ERROR_CODES.INVALID_VALUE,
            { reason: 'File substrate does not exist at the requested path', requestedPath: absPath },
        );
        
        try {
            return fs.readFileSync(absPath, 'utf8');
        } catch (e) {
            throw new BytecodeError(
                ERROR_CATEGORIES.STATE, ERROR_SEVERITY.WARN, MOD,
                ERROR_CODES.INVALID_STATE,
                { reason: 'Failed to read substrate', originalError: e.message },
            );
        }
    });

    registerTool(server, 'mcp_scholomance_collab_execute_verification', {
        suite: z.enum(['e2e', 'qa', 'visual', 'stasis']).describe('The test ritual to execute'),
        task_id: z.string().optional().describe('Task ID to link this verification to'),
    }, async ({ suite, task_id }) => {
        const commandMap = {
            e2e: 'npm run test:e2e',
            qa: 'npm run test:qa',
            visual: 'npm run test:visual',
            stasis: 'npm run test:qa:stasis',
        };

        const command = commandMap[suite];
        console.error(`[MCP] Executing Verification Ritual: ${command}`);

        try {
            service.logActivity({
                agent_id: null,
                action: 'verification_started',
                target_type: 'test_suite',
                target_id: suite,
                details: { task_id, command }
            });

            const output = execSync(command, { encoding: 'utf8', stdio: 'pipe', timeout: 300000 });
            
            service.logActivity({
                agent_id: null,
                action: 'verification_completed',
                target_type: 'test_suite',
                target_id: suite,
                details: { task_id, status: 'pass' }
            });

            return {
                status: 'PASS',
                suite,
                message: `Ritual of Verification complete for ${suite}.`,
                summary: output.slice(-500)
            };
        } catch (error) {
            const errorMessage = error.stderr || error.stdout || error.message;
            
            service.logActivity({
                action: 'verification_failed',
                target_type: 'test_suite',
                target_id: suite,
                details: { task_id, status: 'fail', error: errorMessage.slice(0, 200) }
            });

            return {
                status: 'FAIL',
                suite,
                message: `Ritual of Verification failed for ${suite}.`,
                error: errorMessage.slice(-500)
            };
        }
    });

    registerTool(server, 'mcp_scholomance_collab_diagnostic_scan', {}, () => collabDiagnostic.scan());

    // ========================
    //  DIAGNOSTIC SUBSTRATE — Phase 3 (cells/reports/health/violations)
    // ========================

    registerTool(
        server,
        'mcp_scholomance_collab_diagnostic_get_latest_report',
        {},
        () => diagnosticGetLatestReport(),
    );

    registerTool(
        server,
        'mcp_scholomance_collab_diagnostic_get_report_by_id',
        {
            reportId: z.string().describe('Report ID in PB-DIAG-v1-{timestamp}-{rand4} format'),
        },
        ({ reportId }) => diagnosticGetReportById({ reportId }),
    );

    registerTool(
        server,
        'mcp_scholomance_collab_diagnostic_query_violations',
        {
            cell: z.string().optional().describe('Filter by cellId (or layer name) — e.g. IMMUNITY_SCAN, LAYER_BOUNDARY, bridge'),
            severity: z.enum(['FATAL', 'CRIT', 'WARN', 'INFO']).optional().describe('Filter by severity'),
            layer: z.string().optional().describe('Filter by context.layer (e.g. innate, adaptive, bridge, fixture, coverage)'),
            ruleId: z.string().optional().describe('Filter by context.ruleId (e.g. QUANT-0101, LING-0F03)'),
            limit: z.number().default(100).describe('Maximum results returned'),
        },
        (params) => diagnosticQueryViolations(params),
    );

    registerTool(
        server,
        'mcp_scholomance_collab_diagnostic_query_health',
        {
            cellId: z.string().optional().describe('Filter by emitting cell'),
            checkId: z.string().optional().describe('Filter by check name'),
            moduleId: z.string().optional().describe('Filter by module path'),
            limit: z.number().default(100).describe('Maximum results returned'),
        },
        (params) => diagnosticQueryHealth(params),
    );

    registerTool(
        server,
        'mcp_scholomance_collab_diagnostic_run_cells',
        {
            files: z.array(z.object({
                path: z.string(),
                content: z.string(),
            })).describe('Files to scan (in-memory, not persisted)'),
            cellFilter: z.array(z.string()).optional().describe('Run only these cell IDs'),
            commitHash: z.string().optional().describe('Optional commit hash to embed in the report'),
            trigger: z.string().optional().describe('Trigger label (default: "mcp")'),
        },
        (params) => diagnosticRunCells(params),
    );

    registerTool(
        server,
        'mcp_scholomance_collab_diagnostic_get_recovery_hints',
        {
            category: z.string().describe('Error category (e.g. TYPE, LINGUISTIC)'),
            errorCode: z.string().describe('4-digit hex error code (e.g. 0105)'),
            context: z.record(z.string(), z.unknown()).optional().describe('Additional error context'),
        },
        (params) => diagnosticGetRecoveryHints(params),
    );

    registerTool(
        server,
        'mcp_scholomance_collab_diagnostic_trigger_full_scan',
        {
            trigger: z.string().optional().default('mcp').describe('Trigger source identifier'),
        },
        (params) => diagnosticTriggerFullScan(params),
    );

    registerTool(
        server,
        'mcp_scholomance_collab_diagnostic_summary',
        {},
        () => diagnosticSummary(),
    );

    registerTool(server, 'mcp_scholomance_collab_search_codebase', {
        query: z.string().min(1).describe('The semantic search query for the codebase'),
    }, ({ query }) => searchCodebase(query));

    registerTool(server, 'mcp_scholomance_collab_forensic_search', {
        query: z.string().min(1).describe('The literal string or regex pattern to find'),
        isRegex: z.boolean().default(false).describe('Whether the query is a regular expression'),
        caseSensitive: z.boolean().default(false).describe('Whether the search should be case-sensitive'),
        includePattern: z.string().optional().describe('Glob pattern for files to include (e.g. "*.js")'),
        excludePattern: z.string().optional().describe('Glob pattern for files to exclude'),
        limit: z.number().default(20).describe('Maximum number of matches to return'),
    }, ({ query, ...options }) => {
        console.error(`[MCP] Executing Forensic Search: "${query}"`);
        return forensicSearch(query, options);
    });

    // ========================
    //  ARCHIVE OF DOMINANCE
    // ========================

    registerTool(server, 'mcp_scholomance_collab_archive_board', {
        actor_agent_id: z.string().optional().describe('Agent ID performing the ritual'),
    }, ({ actor_agent_id }) => service.archiveAllTasks(actor_agent_id));

    registerTool(server, 'mcp_scholomance_collab_codebase_list_files', {}, () => listIndexedFiles());

    registerTool(server, 'mcp_scholomance_collab_codebase_hybrid_search', {
        query: z.string().min(1).describe('Search query for literal, semantic, and phonetic matching'),
    }, ({ query }) => searchHybrid(query));

    registerTool(server, 'mcp_scholomance_collab_codebase_get_neighbors', {
        file_path: z.string().min(1).describe('Target file to find neighbors for'),
    }, ({ file_path }) => getFileNeighbors(file_path));

    // ========================
    //  IMMUNE SYSTEM
    // ========================

    registerTool(server, 'mcp_scholomance_collab_immunity_scan_file', {
        content: z.string().describe('File content to scan'),
        file_path: z.string().describe('Path of the file being scanned'),
    }, async ({ content, file_path }) => {
        const scanResult = await service.scanFileImmunity(content, file_path);
        
        // Generate a human-readable report for the user
        let report = `### IMMUNE SYSTEM REPORT: ${file_path}\n`;
        const total = scanResult.innate.length + scanResult.adaptive.length;
        
        if (total === 0) {
            report += "✅ **CLEAN.** No known pathogens or structural violations detected.\n";
        } else {
            report += `❌ **VIOLATIONS DETECTED: ${total}**\n\n`;
            
            if (scanResult.innate.length > 0) {
                report += "#### Innate Layer Violations:\n";
                scanResult.innate.forEach(v => {
                    report += `*   **${v.name}** (${v.ruleId}) - SEVERITY: ${v.severity}\n`;
                    report += `    *REPAIR:* ${v.repair.title}\n`;
                    v.repair.suggestions.forEach(s => report += `    - ${s}\n`);
                    report += `    *BYTECODE:* \`${v.bytecode}\`\n\n`;
                });
            }
            
            if (scanResult.adaptive.length > 0) {
                report += "#### Adaptive Layer Violations:\n";
                scanResult.adaptive.forEach(v => {
                    report += `*   **${v.name}** - Similarity score: ${v.score.toFixed(2)}\n`;
                    report += `    *PATHOGEN ID:* ${v.pathogenId}\n`;
                    report += `    *ENCYCLOPEDIA:* ${v.entry}\n\n`;
                });
            }
        }

        return {
            status: total === 0 ? 'CLEAN' : 'VIOLATED',
            report,
            raw: scanResult
        };
    });

    registerTool(server, 'mcp_scholomance_collab_immunity_get_status', {}, () => service.getImmunityStatus());

    // ========================
    //  CLERICAL RAID (Phase 3–4)
    // ========================

    registerTool(server, 'mcp_scholomance_collab_clerical_raid_query', {
        symptoms: z.array(z.string()).min(1).describe('Symptom lines or error descriptions'),
        file_paths: z.array(z.string()).optional().describe('Affected paths'),
        error_messages: z.array(z.string()).optional(),
        layer_hint: z.string().optional(),
        agent_role: z.enum(['codex', 'claude', 'gemini', 'merlin']).optional()
            .describe('When set, attaches charter playbook + hook applicability'),
    }, ({ symptoms, file_paths, error_messages, layer_hint, agent_role }) => {
        const raid = getClericalRaidMcp();
        const bugReport = {
            symptoms,
            filePaths: file_paths ?? [],
            errorMessages: error_messages ?? [],
            layerHint: layer_hint ?? null,
            timestamp: Date.now(),
        };
        if (agent_role) {
            return agentHookQuery(raid, agent_role, bugReport);
        }
        return raid.query(bugReport);
    });

    registerTool(server, 'mcp_scholomance_collab_clerical_raid_merlin_ingest', {
        merlin_report: z.record(z.string(), z.unknown()).describe('Collab bug row or Merlin JSON'),
        train: z.boolean().optional().describe('Auto-train when verdict is NOVEL or NEEDS_MERLIN (default true)'),
        train_needs_merlin: z.boolean().optional()
            .describe('When false, train only on NOVEL (default true = train on NEEDS_MERLIN too)'),
    }, ({ merlin_report, train, train_needs_merlin }) => {
        const raid = getClericalRaidMcp();
        const payload = merlinAutoTrainPipeline(raid, merlin_report, {
            train: train !== false,
            trainNeedsMerlin: train_needs_merlin !== false,
        });
        return {
            ...payload,
            vectorPreview16: Array.from(extractVectorFromMerlinReport(merlin_report).slice(0, 16)),
        };
    });

    registerTool(server, 'mcp_scholomance_collab_clerical_raid_feedback', {
        pattern_id: z.string().min(1),
        positive: z.boolean().describe('True = confirm hit; false = false positive'),
    }, ({ pattern_id, positive }) => {
        const raid = getClericalRaidMcp();
        if (positive) {
            raid.confirm(pattern_id);
        } else {
            raid.feedbackNegative(pattern_id);
        }
        const p = raid.patterns.find(x => x.id === pattern_id);
        return {
            ok: !!p,
            pattern_id,
            confidence: p?.confidence,
            hitCount: p?.hitCount,
            missCount: p?.missCount,
            effectiveness: p ? patternEffectivenessScore(p) : null,
        };
    });

    registerTool(server, 'mcp_scholomance_collab_clerical_raid_learning', {
        action: z.enum(['clusters', 'duplicates', 'deprecate', 'scores', 'bug_from_merlin']),
        min_similarity: z.number().min(0).max(1).optional(),
        merlin_report: z.record(z.string(), z.unknown()).optional(),
    }, ({ action, min_similarity, merlin_report }) => {
        const raid = getClericalRaidMcp();
        if (action === 'bug_from_merlin') {
            if (!merlin_report) {
                return { ok: false, error: 'merlin_report required' };
            }
            return { ok: true, bugReport: merlinReportToBugReport(merlin_report) };
        }
        if (action === 'clusters') {
            const thr = min_similarity ?? 0.92;
            return { clusters: clusterPatternsBySimilarity(raid, thr) };
        }
        if (action === 'duplicates') {
            const thr = min_similarity ?? 0.97;
            return { pairs: findNearDuplicatePatterns(raid, thr) };
        }
        if (action === 'deprecate') {
            const ids = deprecateStalePatterns(raid);
            return { deprecatedIds: ids, stats: raid.getStats() };
        }
        const scores = raid.patterns
            .filter(p => !p.deprecated)
            .map(p => ({
                id: p.id,
                confidence: p.confidence,
                effectiveness: patternEffectivenessScore(p),
                hits: p.hitCount ?? 0,
                misses: p.missCount ?? 0,
            }));
        return { scores };
    });

    // ========================
    //  HEARTBEAT ALERTS
    // ========================

    registerTool(server, 'mcp_scholomance_collab_alerts_pull', {
        agent_id: z.string().describe('Calling agent ID'),
    }, ({ agent_id }) => service.pullAlerts(agent_id));

    registerTool(server, 'mcp_scholomance_collab_alert_respond', {
        alert_id: z.string().describe('Target alert ID'),
        agent_id: z.string().describe('Calling agent ID (must match recipient)'),
        payload: z.record(z.string(), z.any()).optional().describe('Optional response payload (bytecode, text, etc)'),
    }, params => service.respondToAlert(params.alert_id, params.agent_id, { payload: params.payload }));

    registerTool(server, 'mcp_scholomance_collab_alert_list', {
        agent_id: z.string().optional().describe('Filter by recipient ID'),
        status: z.string().optional().describe('Filter by status (pending, acknowledged, expired)'),
    }, params => service.listAlerts(params));

    // ========================
    //  SKILLS & AUDITS
    // ========================

    registerTool(server, 'mcp_scholomance_collab_skill_vaelrix_law_audit', {
        target_file: z.string().optional().describe('Specific file to audit against Vaelrix Law'),
        intent: z.string().optional().describe('Proposed change intent for pre-emptive audit'),
    }, async ({ target_file, intent }) => {
        return {
            verdict: 'PENDING',
            bytecode: 'SCHOL-AUDIT-V1-INIT',
            reason: 'Audit ritual initiated via MCP Bridge.',
            focus: target_file || 'global',
        };
    });

    registerTool(server, 'mcp_scholomance_collab_skill_scholomance_feedback', {
        subject: z.string().describe('The implementation, PDR, or concept to review'),
        context: z.string().optional().describe('Additional context for the feedback'),
    }, async ({ subject, context }) => {
        return {
            grade: 'A',
            feedback: `Scholomance feedback loop established for: ${subject}`,
            bytecode: 'SCHOL-FEEDBACK-V1-ACK',
        };
    });

    // ── Messaging Tools ───────────────────────────────────────────────────────

    registerTool(server, 'mcp_scholomance_collab_message_send', {
        sender_id: z.string().min(1).max(64),
        target_id: z.string().min(1).max(64).optional().default('all'),
        glyph: z.string().max(8).optional().default('✦'),
        text: z.string().max(4096),
        bytecode: z.string().max(16384).optional(),
        metadata: z.record(z.string(), z.any()).optional(),
    }, params => service.sendMessage(params, params.sender_id));

    registerTool(server, 'mcp_scholomance_collab_message_list', {
        sender: z.string().optional(),
        target: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional().default(50),
        offset: z.number().int().min(0).optional().default(0),
    }, params => service.listMessages(params, params));

    registerTool(server, 'mcp_scholomance_collab_message_delete', {
        id: z.coerce.number().int().describe('Message ID to delete'),
        agent_id: z.string().optional().describe('Agent performing the deletion'),
    }, ({ id, agent_id }) => service.deleteMessage(id, agent_id));

    // ── GrimDesign ──────────────────────────────────────────────────────────────

    registerTool(server, 'mcp_scholomance_grimdesign_analyze', {
        intent: z.string().min(1).max(500).describe(
            'Natural-language description of the UI component or surface to design.'
        ),
        component_name: z.string().max(64).optional().describe(
            'Optional PascalCase component name for the spec.'
        ),
    }, async ({ intent, component_name }) => {
        const signal    = await analyzeDesignIntent(intent);
        const decisions = resolveDesignDecisions(signal);
        const spec      = buildGrimSpec(intent, signal, decisions, component_name || null);
        return { signal, decisions, spec };
    });
}

export function createCollabMcpServer(service = collabService) {
    const server = new McpServer({
        name: 'Scholomance Collab',
        version: '1.4.0',
    });

    registerCollabMcpBridge(server, service);
    return server;
}

function holdProcessOpenForStdio() {
    const interval = setInterval(() => {}, 60_000);
    return () => clearInterval(interval);
}

export async function main() {
    const server = createCollabMcpServer();
    const transport = new StdioServerTransport();
    const releaseKeepAlive = holdProcessOpenForStdio();

    await server.connect(transport);
    process.stdin.resume();

    // Bootstrap collab service (alerts, reapers)
    void collabService.bootstrap().catch(err => {
        console.error('[MCP] Failed to bootstrap CollabService:', err.message);
    });

    // Auto-connect ritual for agents
    if (process.env.AGENT_ID) void (async () => {
        try {
            const role = process.env.AGENT_ROLE || 
                        (process.env.AGENT_ID.includes('ui') ? 'ui' :
                         process.env.AGENT_ID.includes('qa') ? 'qa' : 'backend');
            
            await collabService.registerAgent({
                id: process.env.AGENT_ID,
                name: process.env.AGENT_NAME || process.env.AGENT_ID,
                role: role,
                capabilities: (process.env.AGENT_CAPS || '').split(',').filter(Boolean),
            });
            console.error(`[MCP] Auto-registered agent: ${process.env.AGENT_ID} (${role})`);
        } catch (e) {
            // If already registered, send heartbeat to go online
            try {
                await collabService.heartbeatAgent({ id: process.env.AGENT_ID, status: 'online' });
                console.error(`[MCP] Heartbeat/Auto-connect for agent: ${process.env.AGENT_ID}`);
            } catch (hErr) {
                console.error(`[MCP] Auto-connect ritual failed: ${hErr.message}`);
            }
        }
    })();

    const cleanup = async () => {
        releaseKeepAlive();
        if (process.env.AGENT_ID) {
            await collabService.heartbeatAgent({ id: process.env.AGENT_ID, status: 'offline' }).catch(() => {});
        }
        await server.close().catch(() => {});
    };

    process.once('SIGINT', () => {
        void cleanup().finally(() => process.exit(0));
    });
    process.once('SIGTERM', () => {
        void cleanup().finally(() => process.exit(0));
    });
    process.once('exit', () => {
        releaseKeepAlive();
    });

    console.error('Scholomance Collab MCP Bridge initialized over stdio.');
}

const isDirectExecution = process.argv[1]
    ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
    : false;

if (isDirectExecution) {
    main().catch((error) => {
        console.error('MCP Bridge failed to ignite:', error);
        process.exit(1);
    });
}
