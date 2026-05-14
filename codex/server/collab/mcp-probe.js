import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..', '..');
const DEFAULT_ENV_FILE = path.join(ROOT, '.env');
const DEFAULT_BRIDGE_PATH = path.join(ROOT, 'codex', 'server', 'collab', 'mcp-bridge.js');
const DEFAULT_TIMEOUT_MS = 4000;
const DEFAULT_STATUS_URI = 'collab://status';
const DEFAULT_CLIENT_INFO = {
    name: 'Scholomance MCP Probe',
    version: '1.0.0',
};

export function getCanonicalBridgeLaunchSpec(options = {}) {
    const command = options.command ?? process.execPath;
    const cwd = options.cwd ?? ROOT;
    const bridgePath = options.bridgePath ?? DEFAULT_BRIDGE_PATH;
    const envFile = options.envFile === undefined
        ? (fs.existsSync(DEFAULT_ENV_FILE) ? DEFAULT_ENV_FILE : null)
        : options.envFile;
    const args = options.args ?? [
        ...(envFile ? [`--env-file=${envFile}`] : []),
        bridgePath,
    ];

    return {
        command,
        args,
        cwd,
        env: {
            ...process.env,
            ...(options.env ?? {}),
        },
        stderr: options.stderr ?? 'pipe',
    };
}

function createTimeoutError(stage, timeoutMs) {
    const error = new Error(`${stage} timed out after ${timeoutMs}ms`);
    error.code = 'MCP_PROBE_TIMEOUT';
    error.stage = stage;
    return error;
}

async function withTimeout(promise, timeoutMs, stage) {
    let timer;

    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(createTimeoutError(stage, timeoutMs)), timeoutMs);
                timer.unref?.();
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

function createStderrCollector(maxChars = 20000) {
    let buffer = '';

    return {
        attach(stream) {
            if (!stream || typeof stream.on !== 'function') return;
            stream.on('data', (chunk) => {
                const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
                buffer += text;
                if (buffer.length > maxChars) {
                    buffer = buffer.slice(-maxChars);
                }
            });
        },
        getText() {
            return buffer.trim();
        },
        getLines() {
            return buffer
                .split(/\r?\n/)
                .map((line) => line.trimEnd())
                .filter(Boolean);
        },
    };
}

function roundMs(value) {
    return Number(value.toFixed(2));
}

function normalizeError(error) {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            code: error.code ?? null,
            stage: error.stage ?? null,
        };
    }

    return {
        name: 'Error',
        message: String(error),
        code: null,
        stage: null,
    };
}

export function classifyProbeFailure({ stage, error, stderrText }) {
    const message = `${error?.message ?? ''} ${stderrText ?? ''}`.toLowerCase();

    if (stage === 'initialize' && /\b(timeout|timed out|closed|connection closed|initialize response)\b/.test(message)) {
        return 'transport_handshake_failure';
    }

    if (/\bfailed to ignite\b|\bsyntaxerror\b|\breferenceerror\b|\btypeerror\b/.test(message)) {
        return 'bridge_startup_failure';
    }

    if (stage === 'readStatusResource' || stage === 'listResources' || stage === 'listTools') {
        return 'bridge_runtime_failure';
    }

    return 'unknown_failure';
}

export function buildProbeGuidance({ failureClassification, stderr }) {
    const hasStderr = Array.isArray(stderr) ? stderr.length > 0 : Boolean(stderr);

    switch (failureClassification) {
        case 'transport_handshake_failure':
            return hasStderr
                ? 'The bridge process started but did not complete the initialize handshake. Inspect stderr first, then compare against a raw shell-pipe initialize to separate bridge failures from host transport failures.'
                : 'The bridge process launched but did not answer initialize. If a raw shell-pipe initialize succeeds, treat this as a spawned-child stdio transport problem in the current host rather than a repo-local bridge failure.';
        case 'bridge_startup_failure':
            return 'The bridge failed before the MCP handshake completed. Inspect stderr for startup errors and fix those before retrying any editor-hosted MCP client.';
        case 'bridge_runtime_failure':
            return 'Initialize succeeded, but a follow-up MCP operation failed. Inspect the failing stage and its stderr output to isolate the broken resource or tool surface.';
        default:
            return 'Probe failure was not classified cleanly. Compare the probe result with a raw shell-pipe initialize and capture stderr before changing the bridge implementation.';
    }
}

function safeParseResourceText(text) {
    if (typeof text !== 'string' || text.length === 0) return null;

    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

async function closeProbeClient(client, transport) {
    await Promise.allSettled([
        typeof client?.close === 'function' ? client.close() : Promise.resolve(),
        typeof transport?.close === 'function' ? transport.close() : Promise.resolve(),
    ]);
}

export async function runCollabMcpProbe(options = {}) {
    const timeoutMs = Number(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const readStatusResource = options.readStatusResource ?? true;
    const statusUri = options.statusUri ?? DEFAULT_STATUS_URI;
    const launchSpec = getCanonicalBridgeLaunchSpec(options.launch);
    const stderrCollector = createStderrCollector(options.maxStderrChars ?? 20000);
    const client = options.clientFactory
        ? options.clientFactory(DEFAULT_CLIENT_INFO)
        : new Client(DEFAULT_CLIENT_INFO);
    const transport = options.transportFactory
        ? options.transportFactory(launchSpec)
        : new StdioClientTransport(launchSpec);
    const report = {
        ok: false,
        stage: 'initialize',
        transport: {
            command: launchSpec.command,
            args: [...launchSpec.args],
            cwd: launchSpec.cwd,
            pid: null,
        },
        timeout_ms: timeoutMs,
        server: null,
        capabilities: null,
        counts: {
            resources: 0,
            resource_templates: 0,
            tools: 0,
        },
        timings_ms: {
            initialize: null,
            list_resources: null,
            list_resource_templates: null,
            list_tools: null,
            read_status_resource: null,
            total: null,
        },
        resources: [],
        resource_templates: [],
        tools: [],
        status_resource: null,
        stderr: [],
        failure_classification: null,
        guidance: null,
        error: null,
    };
    const totalStart = performance.now();

    stderrCollector.attach(transport.stderr);

    try {
        let stepStart = performance.now();
        await withTimeout(client.connect(transport), timeoutMs, 'initialize');
        report.timings_ms.initialize = roundMs(performance.now() - stepStart);
        report.transport.pid = transport.pid ?? null;
        report.server = client.getServerVersion?.() ?? null;
        report.capabilities = client.getServerCapabilities?.() ?? null;

        report.stage = 'listResources';
        stepStart = performance.now();
        const resourceResult = await withTimeout(client.listResources(), timeoutMs, 'listResources');
        report.timings_ms.list_resources = roundMs(performance.now() - stepStart);
        report.resources = (resourceResult.resources ?? []).map((resource) => resource.uri);
        report.counts.resources = report.resources.length;

        report.stage = 'listResourceTemplates';
        stepStart = performance.now();
        const resourceTemplateResult = await withTimeout(
            client.listResourceTemplates(),
            timeoutMs,
            'listResourceTemplates',
        );
        report.timings_ms.list_resource_templates = roundMs(performance.now() - stepStart);
        report.resource_templates = (resourceTemplateResult.resourceTemplates ?? []).map((resource) => resource.uriTemplate);
        report.counts.resource_templates = report.resource_templates.length;

        report.stage = 'listTools';
        stepStart = performance.now();
        const toolResult = await withTimeout(client.listTools(), timeoutMs, 'listTools');
        report.timings_ms.list_tools = roundMs(performance.now() - stepStart);
        report.tools = (toolResult.tools ?? []).map((tool) => tool.name);
        report.counts.tools = report.tools.length;

        if (readStatusResource) {
            report.stage = 'readStatusResource';
            stepStart = performance.now();
            const statusResult = await withTimeout(
                client.readResource({ uri: statusUri }),
                timeoutMs,
                'readStatusResource',
            );
            report.timings_ms.read_status_resource = roundMs(performance.now() - stepStart);
            report.status_resource = safeParseResourceText(statusResult.contents?.[0]?.text ?? null);
        }

        // Phase 6.5: Tool Execution Probe
        if (options.probeToolExecution) {
            report.stage = 'probeToolExecution';
            stepStart = performance.now();
            const toolResult = await withTimeout(
                client.callTool({ name: 'collab_status_get', arguments: {} }),
                timeoutMs,
                'probeToolExecution'
            );
            report.timings_ms.probe_tool_execution = roundMs(performance.now() - stepStart);
            report.tool_probe = {
                tool: 'collab_status_get',
                ok: !toolResult.isError,
                content: toolResult.content?.[0]?.text ?? null,
            };
            if (toolResult.isError) {
                throw new Error(`Tool execution probe failed: ${report.tool_probe.content}`);
            }
        }

        report.ok = true;
        report.stage = 'complete';
        return report;
    } catch (error) {
        report.error = normalizeError(error);
        report.failure_classification = classifyProbeFailure({
            stage: report.stage,
            error: report.error,
            stderrText: stderrCollector.getText(),
        });
        report.guidance = buildProbeGuidance({
            failureClassification: report.failure_classification,
            stderr: stderrCollector.getLines(),
        });
        return report;
    } finally {
        report.timings_ms.total = roundMs(performance.now() - totalStart);
        report.transport.pid = transport.pid ?? report.transport.pid ?? null;
        report.stderr = stderrCollector.getLines();
        await closeProbeClient(client, transport);
    }
}

export function formatProbeReport(report) {
    const lines = [
        'Scholomance MCP Probe',
        `status: ${report.ok ? 'PASS' : 'FAIL'}`,
        `stage: ${report.stage}`,
    ];

    if (report.server) {
        lines.push(`server: ${report.server.name} ${report.server.version}`);
    }

    if (report.transport?.pid) {
        lines.push(`pid: ${report.transport.pid}`);
    }

    lines.push(
        `timings_ms: initialize=${report.timings_ms.initialize ?? 'n/a'} listResources=${report.timings_ms.list_resources ?? 'n/a'} listResourceTemplates=${report.timings_ms.list_resource_templates ?? 'n/a'} listTools=${report.timings_ms.list_tools ?? 'n/a'} readStatus=${report.timings_ms.read_status_resource ?? 'n/a'} total=${report.timings_ms.total ?? 'n/a'}`,
    );
    lines.push(
        `counts: resources=${report.counts.resources} templates=${report.counts.resource_templates} tools=${report.counts.tools}`,
    );

    if (report.error) {
        lines.push(`error: ${report.error.message}`);
    }

    if (report.failure_classification) {
        lines.push(`classification: ${report.failure_classification}`);
    }

    if (report.guidance) {
        lines.push(`guidance: ${report.guidance}`);
    }

    if (report.stderr.length > 0) {
        lines.push('stderr:');
        lines.push(...report.stderr.map((line) => `  ${line}`));
    }

    return lines.join('\n');
}
