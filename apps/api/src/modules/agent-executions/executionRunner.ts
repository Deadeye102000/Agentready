/**
 * ExecutionRunner — the seam between "accepting a request" and "performing work".
 *
 * The route layer creates an AgentExecution record (status=QUEUED), then calls
 * runner.enqueue(). The runner is responsible for:
 *   - transitioning the execution to RUNNING
 *   - enforcing timeoutMs (if set)
 *   - tracking attemptCount
 *   - eventually transitioning to SUCCEEDED, FAILED, or CANCELLED
 *
 * Current implementation: InProcessExecutionRunner — runs in the same process
 * immediately after the HTTP response is sent.
 *
 * TODO(WORKER-READY): To move execution off the API process:
 *   1. Create apps/worker (a separate Node process / container).
 *   2. Implement QueuedExecutionRunner that pushes ExecutionContext to a job
 *      queue (BullMQ / SQS / pg-boss / Inngest / etc.).
 *   3. The worker process calls InProcessExecutionRunner.run() after dequeuing.
 *   4. Swap the runner binding in agentExecutionRoutes.ts — that is the only
 *      required API-layer change.
 */

export interface ExecutionContext {
  /** The AgentExecution record ID. */
  id: string;
  /** Organization scope — required for tenancy-safe service calls. */
  organizationId: string;
  /** The agent that owns this execution. */
  agentId: string;
  /**
   * Optional wall-clock timeout in milliseconds.
   * If set and the execution is still RUNNING when this elapses, the runner
   * transitions it to FAILED with failureReason="TIMEOUT".
   */
  timeoutMs?: number | null;
  /** Maximum allowed attempts (from AgentExecution.maxAttempts). */
  maxAttempts: number;
  /** How many times this execution has already been attempted. */
  attemptCount: number;
}

export interface ExecutionRunner {
  /**
   * Accept an execution for processing.
   *
   * This method MUST return promptly (it should not block the calling request).
   * The actual work is performed asynchronously.
   *
   * TODO(WORKER-READY): Replace the in-process implementation body with:
   *   await jobQueue.add("run-execution", context, { jobId: context.id })
   */
  enqueue(context: ExecutionContext): Promise<void>;
}
