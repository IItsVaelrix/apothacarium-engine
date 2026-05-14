import fs from 'node:fs';
import path from 'node:path';

/**
 * PixelBrain Entropy Oracle (Pre-flight Scanner)
 * Implements the heuristics defined in PIXELBRAIN_ENTROPY_ORACLE.md
 */

const STASIS_THRESHOLD = 0.60;
const REJECT_THRESHOLD = 0.85;

function analyzeFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`[PB-ORACLE] File not found: ${filePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  let baseScore = 0.10; // Base inherent complexity
  const risks = [];
  
  // Heuristic 1: useEffect Volatility
  const useEffectCount = (content.match(/useEffect\(/g) || []).length;
  if (useEffectCount > 0) {
    baseScore += Math.min(0.30, useEffectCount * 0.05);
    risks.push(`Contains ${useEffectCount} useEffect hooks (Temporal Freeze Risk)`);
  }

  // Heuristic 2: Global State Mutation
  if (content.includes('window.') || content.includes('document.')) {
    baseScore += 0.20;
    risks.push("Touches global window/document objects (Race Condition Risk)");
  }

  // Heuristic 3: Missing Dependencies (Exhaustive Deps overrides)
  const exhaustiveDepsCount = (content.match(/eslint-disable-next-line react-hooks\/exhaustive-deps/g) || []).length;
  if (exhaustiveDepsCount > 0) {
    baseScore += (0.15 * exhaustiveDepsCount);
    risks.push(`Contains ${exhaustiveDepsCount} ignored dependency arrays (State Rot Risk)`);
  }

  // Dependency Matrix (Mocked calculation based on imports)
  const importCount = (content.match(/import /g) || []).length;
  const exportCount = (content.match(/export /g) || []).length;
  
  // Risk Multiplier = 1.0 + (Inbound Edges * 0.05)
  // We approximate inbound edges for core files vs UI files
  const isCore = filePath.includes('codex/core') || filePath.includes('src/lib');
  const inboundEdges = isCore ? 15 : exportCount; 
  const dependencyMultiplier = 1.0 + (inboundEdges * 0.05);

  // PixelBrain Synthesis
  const finalScore = parseFloat((baseScore * dependencyMultiplier).toFixed(3));
  
  let recommendation = "PROCEED";
  if (finalScore > REJECT_THRESHOLD) recommendation = "REJECT";
  else if (finalScore > STASIS_THRESHOLD) recommendation = "REFACTOR";

  return {
    timestamp: Date.now(),
    filePath,
    volatilityScore: finalScore,
    thresholdExceeded: finalScore > STASIS_THRESHOLD,
    criticalRisks: risks,
    nodesAffected: [
      { 
        type: isCore ? "CoreModule" : "UISurface", 
        identifier: path.basename(filePath), 
        complexityScore: baseScore, 
        inboundEdges, 
        outboundEdges: importCount 
      }
    ],
    actionRecommendation: recommendation
  };
}

const targetFile = process.argv[2] || 'src/pages/Read/ReadPage.jsx';
const report = analyzeFile(targetFile);

console.log(JSON.stringify(report, null, 2));
