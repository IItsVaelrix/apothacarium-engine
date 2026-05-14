#!/usr/bin/env node

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const args = process.argv.slice(2);
const toolName = args[0];
const toolArgs = args[1] ? JSON.parse(args[1]) : {};

if (!toolName) {
    console.error('Usage: node scripts/call-mcp-tool.js <tool_name> [tool_args_json]');
    process.exit(1);
}

const cwd = process.cwd();
const client = new Client({
    name: 'Scholomance Tool Caller',
    version: '1.0.0',
});
const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
        `--env-file=${cwd}/.env`,
        `${cwd}/codex/server/collab/mcp-bridge.js`,
    ],
    cwd,
    env: { ...process.env },
    stderr: 'pipe',
});

try {
    await client.connect(transport);
    const result = await client.callTool({
        name: toolName,
        arguments: toolArgs,
    });

    console.log(JSON.stringify(result, null, 2));
} catch (error) {
    console.error('Tool call failed:', error);
    process.exitCode = 1;
} finally {
    await Promise.allSettled([
        typeof client.close === 'function' ? client.close() : Promise.resolve(),
        typeof transport.close === 'function' ? transport.close() : Promise.resolve(),
    ]);
}
