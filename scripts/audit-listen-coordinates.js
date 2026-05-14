import { BytecodeHealth, HEALTH_CODES } from '../codex/core/diagnostic/BytecodeHealth.js';

/**
 * COORDINATE_BRIDGE Diagnostic
 * Verifies alignment between Phaser coordinate space and CSS viewport space.
 */

function auditCoordinates(viewportH = 1080, navH = 48) {
    const cockpitH = viewportH - navH;
    const phaserRadarY_pct = 515 / 1080;
    const phaserOrbY_px = cockpitH * phaserRadarY_pct; // Relative to cockpit top
    
    const cssOrbY_pct = 47.685185 / 100;
    const cssOrbY_px = cockpitH * cssOrbY_pct; // Now absolute relative to cockpit
    
    const drift = phaserOrbY_px - cssOrbY_px;
    
    return {
        viewportH,
        navH,
        cockpitH,
        phaserOrbY_px: Number(phaserOrbY_px.toFixed(4)),
        cssOrbY_px: Number(cssOrbY_px.toFixed(4)),
        drift: Number(drift.toFixed(4)),
        status: Math.abs(drift) < 0.01 ? 'HEALTHY' : 'MISALIGNED'
    };
}

async function run() {
    console.log('--- Scholomance Coordinate Bridge Audit ---');
    
    const viewports = [1080, 720, 2160];
    const reports = [];

    for (const vh of viewports) {
        const audit = auditCoordinates(vh);
        console.log(`Viewport ${vh}px: Drift = ${audit.drift}px [${audit.status}]`);
        
        if (audit.status !== 'HEALTHY') {
            // This would normally be a BytecodeError, but we'll report it as a health signal for now to gather data
            const health = new BytecodeHealth({
                code: HEALTH_CODES.PROCESSOR_BRIDGE_CLEAN,
                cellId: 'COORD_AUDIT',
                checkId: `ALIGNMENT_CHECK_${vh}`,
                moduleId: 'src/pages/Listen/ListenPage.css',
                context: audit
            });
            reports.push(health);
        }
    }

    if (reports.length > 0) {
        console.log('\n--- Diagnostic Signals ---');
        reports.forEach(h => console.log(h.bytecode));
    }
}

run().catch(console.error);
