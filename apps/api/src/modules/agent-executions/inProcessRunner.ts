/**
 * InProcessExecutionRunner
 *
 * The default ExecutionRunner implementation. Picks up QUEUED executions and
 * processes them in-process — no external queue or worker process required.
 *
 * Responsibilities:
 *   - Claim the execution (QUEUED → RUNNING, increment attemptCount)
 *   - Install a timeout guard if ExecutionContext.timeoutMs is set
 *   - Hand off to the agent harness (currently a stub — see TODO below)
 *   - On timeout: call service.markTimedOut()
 *   - On unhandled error: call service.markFailed()
 *
 * TODO(WORKER-READY): When splitting into apps/worker:
 *   1. Keep this class unchanged — it becomes the worker's runner.
 *   2. Create QueuedExecutionRunner in apps/api that pushes ExecutionContext
 *      to a job queue instead of calling setImmediate.
 *   3. The worker process dequeues jobs and calls inProcessRunner.run(context).
 *   4. Swap the binding in agentExecutionRoutes.ts.
 */

import type { AgentExecutionService } from "./agentExecutionService.js";
import type { ExecutionContext, ExecutionRunner } from "./executionRunner.js";

export class InProcessExecutionRunner implements ExecutionRunner {
  constructor(private readonly service: AgentExecutionService) {}

  /**
   * Enqueue the execution for immediate in-process handling.
   * Uses setImmediate so the HTTP response is sent before work begins.
   *
   * TODO(WORKER-READY): Replace setImmediate with a queue.add() call when
   * moving to apps/worker. The method signature must not change.
   */
  async enqueue(context: ExecutionContext): Promise<void> {
    // Guard: skip if already past first attempt limit to avoid double-claiming
    if (context.attemptCount >= context.maxAttempts) {
      return;
    }

    // TODO(WORKER-READY): Replace this block with:
    //   await jobQueue.add("run-execution", context, { jobId: context.id })
    setImmediate(() => {
      this.run(context).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[InProcessRunner] Unhandled error for execution ${context.id}: ${message}`
        );
      });
    });
  }

  /**
   * Perform the execution work.
   * Called by enqueue() (in-process) or by the worker process after dequeue.
   *
   * @internal — exposed as a non-private method so the future worker can call
   *   it directly after deserializing the job payload.
   */
  async run(context: ExecutionContext): Promise<void> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    try {
      // Step 1: Claim the execution — QUEUED → RUNNING, increment attemptCount.
      await this.service.claimForRun({
        organizationId: context.organizationId,
        id: context.id,
      });

      // Step 2: Install timeout guard if requested.
      if (context.timeoutMs && context.timeoutMs > 0) {
        timeoutHandle = setTimeout(async () => {
          // TODO(WORKER-READY): In a queue-based worker, cancel the job here
          // before marking timed out to avoid double-execution on retry.
          await this.service.markTimedOut({
            organizationId: context.organizationId,
            id: context.id,
          });
        }, context.timeoutMs);
      }

      // Step 3: Agent harness — invoke the agent's work.
      //
      // TODO(WORKER-READY): This is where agent SDK / tool harness calls go.
      // The runner should call the agent, receive tool-call instructions, and
      // record them via service.recordToolCall(). When the agent finishes,
      // call service.transition({ status: "SUCCEEDED" }).
      //
      // For now, the execution remains RUNNING after being claimed. External
      // tool-call traces (via POST /tool-call-traces) and approval reviews
      // drive it to its terminal state, exactly as in the current flow.

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // Only mark failed if the execution hasn't already reached a terminal
      // state (e.g., it was cancelled externally while we were starting).
      await this.service.markFailed({
        organizationId: context.organizationId,
        id: context.id,
        failureReason: "RUNNER_ERROR",
        errorMessage: message,
      }).catch(() => {
        // Best-effort: if the execution is already terminal, ignore.
      });
    } finally {
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
      }
    }
  }
}
