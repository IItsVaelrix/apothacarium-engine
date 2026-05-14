import { collabService } from '../codex/server/collab/collab.service.js';

const AGENT_ID = 'gemini-backend';
const INTERVAL = 30000; // 30 seconds

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    console.log(`💓 Initiating permanent heartbeat for ${AGENT_ID}...`);
    
    // Register if not already present
    try {
        await collabService.registerAgent({
            id: AGENT_ID,
            name: 'Gemini Mechanics',
            role: 'backend',
            capabilities: ['mechanics', 'balance', 'specs', 'systems']
        });
        console.log(`[HB] Agent ${AGENT_ID} registered/verified.`);
    } catch (e) {
        console.error(`[HB] Registration failed: ${e.message}`);
    }

    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            await collabService.heartbeatAgent({
                id: AGENT_ID,
                status: 'online'
            });
            // console.log(`[HB] Heartbeat sent at ${new Date().toISOString()}`);
        } catch (error) {
            console.error(`[HB] Heartbeat failed: ${error.message}`);
        }
        await sleep(INTERVAL);
    }
}

run().catch(err => {
    console.error('HEARTBEAT LOOP CRASHED:', err);
    process.exit(1);
});
