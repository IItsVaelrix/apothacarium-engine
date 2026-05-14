/**
 * Collab Diagnostic Engine — "Disconnected Wiring" Detector
 * 
 * Phase 1: HotLint (Soap and Water) — Fast static analysis scan.
 * Phase 2: PixelBrain Diagnostic (Sanitizer) — Deep state and invariant check.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { collabPersistence } from './collab.persistence.js';
import * as schemas from './collab.schemas.js';
import { 
    encodeBytecodeError, 
    ERROR_CATEGORIES, 
    ERROR_SEVERITY, 
    MODULE_IDS, 
    ERROR_CODES 
} from '../../core/pixelbrain/bytecode-error.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..', '..');

const SRC_DIR = path.join(ROOT, 'src');
const CODEX_DIR = path.join(ROOT, 'codex');

const ENTRY_POINTS = [
    path.join(SRC_DIR, 'main.jsx'),
    path.join(CODEX_DIR, 'server/index.js'),
];

/**
 * Generate a formal PixelBrain Bytecode Error using the standard encoder
 */
function createPixelBrainError(category, severity, module, code, context) {
    // Convert hex string code to number for the standard encoder
    const numericCode = parseInt(code, 16);
    return encodeBytecodeError(category, severity, module, numericCode, context);
}

/**
 * Phase 1: HotLint — Static Analysis
 */
async function runHotLint() {
    const issues = [];
    const allFiles = [];
    
    function walk(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.name === 'node_modules' || entry.name.startsWith('.') || entry.name === 'dist') continue;
            if (entry.isDirectory()) walk(fullPath);
            else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) allFiles.push(fullPath);
        }
    }

    walk(SRC_DIR);
    walk(CODEX_DIR);

    const reachable = new Set();
    const queue = [...ENTRY_POINTS];

    function getImports(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const imports = [];
            const importRegex = /import\s+[\s\S]*?\s+from\s+['"](.*?)['"]/g;
            let match;
            while ((match = importRegex.exec(content)) !== null) {
                const imp = match[1];
                if (!imp.startsWith('.')) continue;
                
                const resolved = resolveImport(filePath, imp);
                if (resolved) imports.push(resolved);
                else {
                    issues.push({
                        type: 'BROKEN_IMPORT',
                        file: path.relative(ROOT, filePath),
                        target: imp,
                        severity: 'WARN'
                    });
                }
            }
            return imports;
        } catch (e) {
            return [];
        }
    }

    function resolveImport(sourceFile, importPath) {
        const sourceDir = path.dirname(sourceFile);
        const resolved = path.resolve(sourceDir, importPath);
        const extensions = ['', '.js', '.jsx', '.ts', '.tsx', '/index.js', '/index.jsx'];
        for (const ext of extensions) {
            const p = resolved + ext;
            if (fs.existsSync(p) && !fs.statSync(p).isDirectory()) return p;
        }
        return null;
    }

    while (queue.length > 0) {
        const current = queue.shift();
        if (reachable.has(current)) continue;
        reachable.add(current);
        const imports = getImports(current);
        imports.forEach(imp => {
            if (!reachable.has(imp)) queue.push(imp);
        });
    }

    const unreachable = allFiles.filter(f => !reachable.has(f));
    unreachable.forEach(f => {
        issues.push({
            type: 'UNREACHABLE_FILE',
            file: path.relative(ROOT, f),
            severity: 'INFO'
        });
    });

    return issues;
}

/**
 * Phase 2: PixelBrain Diagnostic — State & Invariants
 */
async function runPixelBrainDiagnostic() {
    const bytecodeErrors = [];

    // Invariant: Persistence Contract Completeness
    // We check this first to identify if the system is structurally broken
    const requiredMethods = [
        'agents.getAll', 'tasks.getAll', 'locks.getAll', 'bug_reports.getAll'
    ];
    
    requiredMethods.forEach(path => {
        const parts = path.split('.');
        let current = collabPersistence;
        for (const part of parts) current = current?.[part];
        if (typeof current !== 'function') {
            bytecodeErrors.push(createPixelBrainError(
                ERROR_CATEGORIES.TYPE, ERROR_SEVERITY.CRIT, MODULE_IDS.SHARED, '0001',
                { path, reason: 'Persistence method missing or not a function' }
            ));
        }
    });

    // If critical persistence methods are missing, we cannot proceed with further invariant checks
    if (bytecodeErrors.length > 0) return bytecodeErrors;

    const collections = await Promise.all([
        collabPersistence.tasks.getAll(),
        collabPersistence.agents.getAll(),
        collabPersistence.locks.getAll(),
        collabPersistence.bug_reports.getAll(),
    ]);
    const [tasks, agents, locks, bugs] = collections;
    const collectionNames = ['tasks', 'agents', 'locks', 'bugs'];

    collections.forEach((value, index) => {
        if (!Array.isArray(value)) {
            bytecodeErrors.push(createPixelBrainError(
                ERROR_CATEGORIES.TYPE, ERROR_SEVERITY.CRIT, MODULE_IDS.SHARED, '0001',
                {
                    path: `collabPersistence.${collectionNames[index]}.getAll`,
                    reason: 'Persistence collection did not resolve to an array',
                    received_type: typeof value,
                }
            ));
        }
    });

    if (bytecodeErrors.length > 0) return bytecodeErrors;
    
    const agentIds = new Set(agents.map(a => a.id));

    // Invariant: Tasks assigned to existing agents
    tasks.forEach(task => {
        if (task.assigned_agent && !agentIds.has(task.assigned_agent)) {
            bytecodeErrors.push(createPixelBrainError(
                ERROR_CATEGORIES.STATE, ERROR_SEVERITY.CRIT, MODULE_IDS.COORD, '0E02',
                { taskId: task.id, ghostAgent: task.assigned_agent, reason: 'Assigned agent does not exist in presence table.' }
            ));
        }
    });

    // Invariant: Locks held by existing agents
    locks.forEach(lock => {
        if (!agentIds.has(lock.agent_id)) {
            bytecodeErrors.push(createPixelBrainError(
                ERROR_CATEGORIES.STATE, ERROR_SEVERITY.WARN, MODULE_IDS.COORD, '0E03',
                { path: lock.file_path, ghostAgent: lock.agent_id, reason: 'Lock held by non-existent agent.' }
            ));
        }
    });

    // Invariant: Bug report bytecode integrity
    bugs.forEach(bug => {
        if (bug.bytecode && !bug.checksum_verified) {
            bytecodeErrors.push(createPixelBrainError(
                ERROR_CATEGORIES.VALUE, ERROR_SEVERITY.CRIT, MODULE_IDS.ARTIFACT, '0B01',
                { bugId: bug.id, reason: 'Bytecode checksum mismatch. Artifact integrity compromised.' }
            ));
        }
    });

    return bytecodeErrors;
}

export const collabDiagnostic = {
    async scan() {
        const startTime = Date.now();
        
        console.error('[DIAGNOSTIC] Initiating Codebase Wash (HotLint)...');
        const hotLintIssues = await runHotLint();
        
        console.error('[DIAGNOSTIC] Initiating Deep Sanitization (PixelBrain)...');
        const bytecodeErrors = await runPixelBrainDiagnostic();
        
        const duration = Date.now() - startTime;
        
        return {
            summary: {
                status: bytecodeErrors.length > 0 ? 'INFECTED' : (hotLintIssues.length > 0 ? 'DIRTY' : 'CLEAN'),
                duration_ms: duration,
                hotlint_issue_count: hotLintIssues.length,
                pixelbrain_error_count: bytecodeErrors.length,
            },
            hotlint: hotLintIssues,
            pixelbrain: bytecodeErrors,
            message: bytecodeErrors.length > 0 
                ? `System sanitization failed. ${bytecodeErrors.length} bytecode errors detected.`
                : `System sanitization complete. ${hotLintIssues.length} minor wiring issues found.`
        };
    }
};
