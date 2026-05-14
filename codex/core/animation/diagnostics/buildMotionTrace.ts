/**
 * Motion Trace Builder
 * 
 * Builds diagnostic traces for animation debugging and QA.
 * Provides human-readable and machine-parsable trace output.
 */

import { ResolvedMotionOutput, MotionWorkingState } from '../contracts/animation.types.ts';

// ─── Trace Entry Interface ──────────────────────────────────────────────────

export interface TraceEntry {
  timestamp: number;
  processorId: string;
  stage: string;
  changed: string[];
  values?: Record<string, unknown>;
}

// ─── Trace Builder ──────────────────────────────────────────────────────────

/**
 * Build a complete motion trace from working state
 */
export function buildMotionTrace(workingState: MotionWorkingState): TraceEntry[] {
  return workingState.trace.map(entry => ({
    timestamp: entry.timestamp,
    processorId: entry.processorId,
    stage: entry.stage,
    changed: entry.changed,
  }));
}

/**
 * Build trace from resolved output
 */
export function buildOutputTrace(output: ResolvedMotionOutput): TraceEntry[] {
  return output.trace.map(entry => ({
    timestamp: entry.timestamp,
    processorId: entry.processorId,
    stage: entry.stage,
    changed: entry.changed,
  }));
}

// ─── Trace Formatters ───────────────────────────────────────────────────────

/**
 * Format trace as human-readable string
 */
export function formatTraceHuman(trace: TraceEntry[]): string {
  const lines: string[] = [];
  lines.push('=== Motion Trace ===');
  lines.push('');
  
  let prevTimestamp = 0;
  
  for (const entry of trace) {
    const delta = entry.timestamp - prevTimestamp;
    prevTimestamp = entry.timestamp;
    
    const deltaStr = delta > 0 ? ` (+${delta.toFixed(1)}ms)` : '';
    lines.push(`[${entry.timestamp.toFixed(1)}ms${deltaStr}] ${entry.processorId}`);
    lines.push(`  Stage: ${entry.stage}`);
    if (entry.changed.length > 0) {
      lines.push(`  Changed: ${entry.changed.join(', ')}`);
    }
    lines.push('');
  }
  
  const totalTime = trace.at(-1)?.timestamp ?? 0;
  lines.push(`Total processing time: ${totalTime.toFixed(2)}ms`);
  lines.push(`Processor count: ${trace.length}`);
  
  return lines.join('\n');
}

/**
 * Format trace as JSON for machine parsing
 */
export function formatTraceJson(trace: TraceEntry[]): string {
  return JSON.stringify({
    entries: trace,
    summary: {
      totalProcessors: trace.length,
      totalTimeMs: trace.at(-1)?.timestamp ?? 0,
      stages: [...new Set(trace.map(e => e.stage))],
    },
  }, null, 2);
}

/**
 * Format trace as markdown table for documentation
 */
export function formatTraceMarkdown(trace: TraceEntry[]): string {
  const lines: string[] = [];
  
  lines.push('| Time (ms) | Δ (ms) | Processor | Stage | Changed |');
  lines.push('|-----------|--------|-----------|-------|---------|');
  
  let prevTimestamp = 0;
  
  for (const entry of trace) {
    const delta = entry.timestamp - prevTimestamp;
    prevTimestamp = entry.timestamp;
    
    lines.push(
      `| ${entry.timestamp.toFixed(1)} | ${delta.toFixed(1)} | ${entry.processorId} | ${entry.stage} | ${entry.changed.join(', ')} |`
    );
  }
  
  return lines.join('\n');
}

// ─── Trace Analysis ─────────────────────────────────────────────────────────

/**
 * Analyze trace for performance issues
 */
export function analyzeTracePerformance(trace: TraceEntry[]): {
  success: boolean;
  warnings: string[];
  errors: string[];
  metrics: {
    totalTimeMs: number;
    avgProcessorTimeMs: number;
    maxProcessorTimeMs: number;
    processorCount: number;
  };
} {
  const warnings: string[] = [];
  const errors: string[] = [];
  
  if (trace.length === 0) {
    return {
      success: true,
      warnings: ['No trace entries'],
      errors: [],
      metrics: {
        totalTimeMs: 0,
        avgProcessorTimeMs: 0,
        maxProcessorTimeMs: 0,
        processorCount: 0,
      },
    };
  }
  
  const totalTime = trace.at(-1)?.timestamp ?? 0;
  const processorCount = trace.length;
  
  // Calculate per-processor times
  let prevTimestamp = 0;
  const processorTimes: number[] = [];
  
  for (const entry of trace) {
    const processorTime = entry.timestamp - prevTimestamp;
    processorTimes.push(processorTime);
    prevTimestamp = entry.timestamp;
    
    // Check for slow processors
    if (processorTime > 8) {
      warnings.push(`Processor ${entry.processorId} took ${processorTime.toFixed(1)}ms (>8ms frame budget)`);
    }
  }
  
  const avgTime = processorTimes.reduce((a, b) => a + b, 0) / processorTimes.length;
  const maxTime = Math.max(...processorTimes);
  
  // Check total time
  if (totalTime > 16) {
    errors.push(`Total processing time ${totalTime.toFixed(1)}ms exceeds frame budget (16ms)`);
  } else if (totalTime > 8) {
    warnings.push(`Total processing time ${totalTime.toFixed(1)}ms exceeds half frame budget (8ms)`);
  }
  
  return {
    success: errors.length === 0,
    warnings,
    errors,
    metrics: {
      totalTimeMs: totalTime,
      avgProcessorTimeMs: avgTime,
      maxProcessorTimeMs: maxTime,
      processorCount,
    },
  };
}

/**
 * Find which processors changed a specific value
 */
export function findProcessorsForValue(trace: TraceEntry[], valueName: string): TraceEntry[] {
  return trace.filter(entry => entry.changed.includes(valueName));
}

/**
 * Get stage summary from trace
 */
export function getStageSummary(trace: TraceEntry[]): Record<string, {
  count: number;
  processors: string[];
  totalTimeMs: number;
}> {
  const summary: Record<string, { count: number; processors: string[]; totalTimeMs: number }> = {};
  
  let prevTimestamp = 0;
  
  for (const entry of trace) {
    if (!summary[entry.stage]) {
      summary[entry.stage] = {
        count: 0,
        processors: [],
        totalTimeMs: 0,
      };
    }
    
    summary[entry.stage].count++;
    summary[entry.stage].processors.push(entry.processorId);
    summary[entry.stage].totalTimeMs += entry.timestamp - prevTimestamp;
    prevTimestamp = entry.timestamp;
  }
  
  return summary;
}

// ─── Debug Output ───────────────────────────────────────────────────────────

/**
 * Print trace to console for debugging
 */
export function debugPrintTrace(trace: TraceEntry[]): void {
  console.log(formatTraceHuman(trace));
}

/**
 * Log performance analysis to console
 */
export function debugPrintPerformance(trace: TraceEntry[]): void {
  const analysis = analyzeTracePerformance(trace);
  
  console.group('Motion Performance Analysis');
  console.log(`Total time: ${analysis.metrics.totalTimeMs.toFixed(2)}ms`);
  console.log(`Processors: ${analysis.metrics.processorCount}`);
  console.log(`Avg processor time: ${analysis.metrics.avgProcessorTimeMs.toFixed(2)}ms`);
  console.log(`Max processor time: ${analysis.metrics.maxProcessorTimeMs.toFixed(2)}ms`);
  
  if (analysis.warnings.length > 0) {
    console.warn('Warnings:');
    analysis.warnings.forEach(w => console.warn(`  - ${w}`));
  }
  
  if (analysis.errors.length > 0) {
    console.error('Errors:');
    analysis.errors.forEach(e => console.error(`  - ${e}`));
  }
  
  console.groupEnd();
}
