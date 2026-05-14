import { collabService } from '../codex/server/collab/collab.service.js';
import { execSync } from 'node:child_process';

const DAEMON_ID = 'system-daemon';
const POLL_INTERVAL = 30000; // 30 seconds

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runDaemon() {
    console.log('🌙 Scholomance Nightly Autonomy Daemon Ignited.');
    
    let isExecuting = true;
    while (isExecuting) {
        try {
            const status = collabService.getStatus();
            const tasks = collabService.listTasks();
            const agents = collabService.listAgents().filter(a => a.status !== 'offline');

            console.log(`[DAEMON] Status: ${status.active_tasks} active, ${status.online_agents} agents online.`);

            // 1. Auto-Assignment Logic
            const backlog = tasks.filter(t => t.status === 'backlog');
            for (const task of backlog) {
                const availableAgent = agents.find(a => 
                    a.status === 'online' && 
                    !tasks.some(t => t.assigned_agent === a.id && t.status !== 'done')
                );

                if (availableAgent) {
                    console.log(`[DAEMON] Assigning Task "${task.title}" to ${availableAgent.id}`);
                    await collabService.assignTask({
                        task_id: task.id,
                        agent_id: availableAgent.id,
                        note: 'Auto-assigned by Nightly Daemon.'
                    });
                }
            }

            // 2. Auto-Verification Logic
            const forReview = tasks.filter(t => t.status === 'review' || t.status === 'testing');
            for (const task of forReview) {
                if (task.status === 'review') {
                    console.log(`[DAEMON] Triggering Verification for Task: ${task.title}`);
                    // Simulate calling the verification tool
                    try {
                        // In a real scenario, this would trigger the actual test runner
                        // For the daemon, we update the status to 'testing'
                        await collabService.updateTask({
                            id: task.id,
                            status: 'testing',
                            note: 'Verification ritual initiated by Daemon.'
                        });
                    } catch (e) {
                        console.error(`[DAEMON] Verification failed to start: ${e.message}`);
                    }
                }
            }

            // 3. Cleanup stale locks
            // The service already handles this via heartbeat timing, but we can log it.
            
        } catch (error) {
            console.error(`[DAEMON] Error in loop: ${error.message}`);
        }

        await sleep(POLL_INTERVAL);
    }
}

runDaemon().catch(err => {
    console.error('DAEMON CRASHED:', err);
    process.exit(1);
});
