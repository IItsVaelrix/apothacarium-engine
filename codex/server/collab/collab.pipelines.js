/**
 * Pipeline definitions for multi-agent collaboration workflows.
 * Each pipeline is a sequence of stages, where each stage has a role
 * that determines which agent type should handle it.
 *
 * role = null means the stage can be assigned to any agent (or auto-assigned by file ownership).
 */

export const PIPELINE_DEFINITIONS = {
    code_review_test: {
        name: 'Code -> Review -> Test',
        description: 'Standard workflow: implement a change, have it reviewed, then tested.',
        stages: [
            { name: 'implement', role: null, description: 'Implement the code change' },
            { name: 'review', role: 'backend', description: 'Review code for correctness and architectural patterns' },
            { name: 'test', role: 'qa', description: 'Write and run tests for the change' },
        ],
    },
    schema_change: {
        name: 'Schema Change Notification',
        description: 'Schema update flow: implement change, update consuming UI, test end-to-end.',
        stages: [
            { name: 'implement', role: 'backend', description: 'Implement schema change in codex/core' },
            { name: 'update_ui', role: 'ui', description: 'Update UI to consume the new schema' },
            { name: 'test', role: 'qa', description: 'Test schema change end-to-end' },
        ],
    },
    bug_fix: {
        name: 'Bug Report -> Diagnose -> Fix -> Verify',
        description: 'Bug workflow: reproduce with failing test, fix, verify fix passes.',
        stages: [
            { name: 'diagnose', role: 'qa', description: 'Write a failing test that reproduces the bug' },
            { name: 'fix', role: null, description: 'Fix the bug (assigned by file ownership)' },
            { name: 'verify', role: 'qa', description: 'Verify the fix passes the failing test' },
        ],
    },
    ui_feature: {
        name: 'UI Feature -> Backend Support -> Test',
        description: 'UI-first feature: build UI, add backend support if needed, test.',
        stages: [
            { name: 'implement_ui', role: 'ui', description: 'Build the UI component/page' },
            { name: 'implement_backend', role: 'backend', description: 'Add backend support (API, logic)' },
            { name: 'test', role: 'qa', description: 'Write integration and visual tests' },
        ],
    },
};

/**
 * File ownership boundaries from AI_ARCHITECTURE_V2.md Contract 6.
 * Used to validate task assignment and auto-assign pipeline stages.
 */
export const OWNERSHIP_MAP = {
    ui: [
        'src/pages/',
        'src/components/',
        'src/App.jsx',
        'src/main.jsx',
        'src/index.css',
    ],
    backend: [
        'AGENTS.md',
        'ARCH_CONTRACT_OVERLAY_INTEGRITY.md',
        'CLAUDE.md',
        'CODEX.md',
        'CURSOR.md',
        'ENGINEERING_RULEBOOK.md',
        'GEMINI.md',
        'SHARED_PREAMBLE.md',
        'SCHEMA_CONTRACT.md',
        'UNITY.md',
        'VAELRIX_LAW.md',
        'codex/',
        'docs/',
        'src/lib/',
        'src/hooks/',
        'src/data/',
        'scripts/',
    ],
    qa: [
        'tests/',
        'playwright.config.js',
        '.github/',
    ],
};

/**
 * Check if a file path falls within an agent role's ownership boundary.
 * Uses simple prefix matching against OWNERSHIP_MAP entries.
 */
export function isPathAllowedForRole(filePath, role) {
    const normalized = filePath.replace(/\\/g, '/');
    const allowedPrefixes = OWNERSHIP_MAP[role];
    if (!allowedPrefixes) return false;

    // CSS files are always allowed for UI role
    if (role === 'ui' && normalized.endsWith('.css')) return true;

    return allowedPrefixes.some(prefix => normalized.startsWith(prefix));
}

/**
 * Determine which role should own a file based on its path.
 * Returns the role string or null if no match.
 */
export function getRoleForPath(filePath) {
    for (const [role] of Object.entries(OWNERSHIP_MAP)) {
        if (isPathAllowedForRole(filePath, role)) return role;
    }
    return null;
}

/**
 * Validate that all file paths in a task can be handled by the given agent role.
 * Returns { valid: true } or { valid: false, conflicts: [...] }.
 */
export function validateFileOwnership(filePaths, role) {
    const conflicts = [];
    for (const fp of filePaths) {
        if (!isPathAllowedForRole(fp, role)) {
            const owner = getRoleForPath(fp);
            conflicts.push({ file: fp, assigned_role: role, owner_role: owner });
        }
    }
    return conflicts.length === 0
        ? { valid: true, conflicts: [] }
        : { valid: false, conflicts };
}
