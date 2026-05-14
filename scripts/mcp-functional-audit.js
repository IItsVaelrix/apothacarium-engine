import { runCollabMcpProbe, formatProbeReport } from '../codex/server/collab/mcp-probe.js';

async function main() {
    console.log('--- MCP FUNCTIONAL AUDIT ---');
    console.log('Running probe with tool execution check...');
    
    const report = await runCollabMcpProbe({
        probeToolExecution: true,
        timeoutMs: 5000
    });
    
    console.log('\n' + formatProbeReport(report));
    
    if (report.tool_probe) {
        console.log(`\nTool Probe (${report.tool_probe.tool}): ${report.tool_probe.ok ? '✅ PASS' : '❌ FAIL'}`);
        if (report.tool_probe.content) {
            console.log('Result:', report.tool_probe.content);
        }
    }
    
    if (!report.ok) {
        process.exit(1);
    }
}

main().catch(err => {
    console.error('Audit crashed:', err);
    process.exit(1);
});
