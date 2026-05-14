import type { MotionProcessor, MotionWorkingState, AnimationIntent } from '../contracts/animation.types';
import { DimensionCompiler, DimensionRuntime } from '../../pixelbrain/dimension-formula-compiler';
import { ViewportChannel } from '../../shared/truesight/compiler/viewportBytecode';

/**
 * DIMENSION MICROPROCESSOR (mp.layout.dimensions)
 *
 * Bridges the Layout Formula Compiler with Animation.
 * Allows animation targets to know their width/height before transforming.
 * Useful for "Slide 100% of width" or "Center based on canvas" logic.
 *
 * Integration: Uses ViewportChannel.getState() as the canonical source of truth.
 */
export class DimensionProcessor implements MotionProcessor {
  id = 'mp.layout.dimensions';
  stage = 'normalize' as const;
  
  private compiler = new DimensionCompiler();
  private runtime = new DimensionRuntime();

  supports(intent: AnimationIntent): boolean {
    return !!intent.constraints?.layoutConstraint;
  }

  run(state: MotionWorkingState): MotionWorkingState {
    const layout = state.intent.constraints?.layoutConstraint;
    if (!layout) return state;

    // Pull real-time viewport truth from the Bytecode Channel
    const viewport = ViewportChannel.getState();

    // Context resolution: state.intent.state overrides viewport truth if provided (manual override)
    // Fix: Default to 0 for parent dimensions if not provided, to avoid "spatial overflow" (hierarchy flattening)
    const context = {
      viewportWidth: (state.intent.state?.viewportWidth as number) || viewport.width,
      viewportHeight: (state.intent.state?.viewportHeight as number) || viewport.height,
      parentWidth: (state.intent.state?.parentWidth as number) || 0,
      parentHeight: (state.intent.state?.parentHeight as number) || 0,
      deviceClass: viewport.deviceClass,
      orientation: viewport.orientation,
      pixelRatio: viewport.pixelRatio,
    };

    try {
      const bytecode = this.compiler.compile(layout);
      const result = this.runtime.execute(bytecode, context);

      state.values.width = result.width;
      state.values.height = result.height;
      state.diagnostics.push(`LAYOUT_RESOLVED: ${result.width}x${result.height} [${viewport.deviceClass}/${viewport.orientation}]`);
      state.trace.push({ 
        processorId: this.id, 
        stage: this.stage,
        changed: ['width', 'height'],
        timestamp: performance.now(), // EXEMPT
      });
    } catch (err) {
      // Fix: Avoid orphaned state by ensuring width/height are NOT partially applied if resolution fails
      delete state.values.width;
      delete state.values.height;
      state.diagnostics.push(`LAYOUT_ERROR: ${(err as Error).message}`);
      state.trace.push({ 
        processorId: this.id, 
        stage: this.stage,
        changed: [], 
        timestamp: performance.now(), // EXEMPT
      }); // Explicitly log that this processor ran but changed nothing (failed)
    }

    return state;
  }
}
