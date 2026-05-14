#!/usr/bin/env node

import {
    formatProbeReport,
    runCollabMcpProbe,
} from '../codex/server/collab/mcp-probe.js';

function parseArgs(argv) {
    const options = {};

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (!token.startsWith('--')) continue;

        const key = token.slice(2);
        const next = argv[index + 1];

        if (!next || next.startsWith('--')) {
            options[key] = true;
            continue;
        }

        options[key] = next;
        index += 1;
    }

    return options;
}

function printUsage() {
    console.log(`
Scholomance MCP Bridge Probe

Usage:
  npm run mcp:probe
  npm run mcp:probe -- --json
  npm run mcp:probe -- --timeout-ms 8000

Options:
  --json              Emit the full probe result as JSON
  --timeout-ms <ms>   Per-step timeout in milliseconds (default: 4000)
  --no-read-status    Skip the collab://status read after listResources/listTools
  --help              Show this message
`.trim());
}

async function main() {
    const options = parseArgs(process.argv.slice(2));

    if (options.help) {
        printUsage();
        return;
    }

    const timeoutMs = options['timeout-ms'] ? Number(options['timeout-ms']) : undefined;
    if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
        throw new Error(`Invalid --timeout-ms value: ${options['timeout-ms']}`);
    }

    const report = await runCollabMcpProbe({
        timeoutMs,
        readStatusResource: !options['no-read-status'],
    });

    if (options.json) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        console.log(formatProbeReport(report));
    }

    process.exit(report.ok ? 0 : 1);
}

main().catch((error) => {
    console.error('MCP probe failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
});
