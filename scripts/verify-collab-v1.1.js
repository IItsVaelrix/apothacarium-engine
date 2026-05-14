
import { collabPersistence } from '../codex/server/collab/collab.persistence.js';

async function verify() {
    console.log('🧪 Starting Scholomance Collab V1.1 Verification...');

    // 1. Verify A2A Registration
    console.log('\n--- 1. A2A Registration ---');
    const agent = collabPersistence.agents.register({
        id: 'test-autogen',
        name: 'AutoGen Verifier',
        role: 'backend',
        framework_origin: 'autogen',
        capabilities: ['verification', 'docker']
    });
    console.log('Registered Agent:', agent);
    if (agent.framework_origin === 'autogen') {
        console.log('✅ Framework Origin correctly persisted.');
    } else {
        console.error('❌ Framework Origin mismatch:', agent.framework_origin);
    }

    // 2. Verify MCP Direct-Bind
    console.log('\n--- 2. MCP Direct-Bind ---');
    const filePath = 'src/pages/Collab/CollabPage.css';
    collabPersistence.locks.acquire({
        file_path: filePath,
        agent_id: agent.id,
        ttl_minutes: 5
    });
    
    const updated = collabPersistence.locks.updateMcp(filePath, agent.id, {
        active: true,
        stream: { type: 'write', throughput: 12.5 }
    });
    
    if (updated) {
        console.log('✅ MCP Lock update successful.');
        const locks = collabPersistence.locks.getAll();
        const myLock = locks.find(l => l.file_path === filePath);
        console.log('Active Lock with MCP:', myLock);
        if (myLock.mcp_active && myLock.mcp_stream?.type === 'write') {
            console.log('✅ MCP status correctly reflected in persistence.');
        } else {
            console.error('❌ MCP status missing in persistence.');
        }
    } else {
        console.error('❌ MCP Lock update failed.');
    }

    // 3. Verify Experience Bytecode Ledger (Corroboration)
    console.log('\n--- 3. Experience Bytecode Ledger ---');
    const skeletonHash = `h1-verification-${Date.now()}`;
    
    // Agent 1 ingest
    console.log('Ingesting from Agent 1...');
    const e1 = collabPersistence.ledger.ingest({
        skeleton_hash: skeletonHash,
        agent_id: 'agent-1',
        raw_trace_ref: 'trace-1'
    });
    console.log('Ledger state (1 agent):', e1.ledger_status, '(Count:', e1.corroboration_count, ')');
    
    // Agent 2 ingest (corroboration)
    console.log('Ingesting from Agent 2 (Corroborating)...');
    const e2 = collabPersistence.ledger.ingest({
        skeleton_hash: skeletonHash,
        agent_id: 'agent-2',
        raw_trace_ref: 'trace-2'
    });
    console.log('Ledger state (2 agents):', e2.ledger_status, '(Count:', e2.corroboration_count, ')');
    
    if (e2.ledger_status === 'active' && e2.corroboration_count === 2) {
        console.log('✅ Experience promoted to ACTIVE after 2 independent corroborations.');
    } else {
        console.error('❌ Ledger promotion logic failed. Status:', e2.ledger_status);
    }

    console.log('\n✨ Verification script completed.');
    process.exit(0);
}

verify().catch(err => {
    console.error('Verification failed:', err);
    process.exit(1);
});
