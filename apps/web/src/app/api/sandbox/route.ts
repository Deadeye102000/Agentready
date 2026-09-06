import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApproveScenario } from "../../../lib/sandbox/scenarios/approve";
import { handleFinopsScenario } from "../../../lib/sandbox/scenarios/finops";
import { handleRogueScenario } from "../../../lib/sandbox/scenarios/rogue";
import { handleEvalScenario } from "../../../lib/sandbox/scenarios/eval";

const sandboxBodySchema = z
  .object({
    action: z.string().optional(),
    executionId: z.string().optional(),
    agentType: z.string().optional()
  })
  .superRefine((data, ctx) => {
    if (data.action === "approve") {
      if (!data.executionId || typeof data.executionId !== "string" || data.executionId.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["executionId"],
          message: "executionId is required and cannot be empty when action is 'approve'"
        });
      }
    } else if (data.action !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["action"],
        message: "Invalid action. Supported actions: 'approve'"
      });
    } else {
      if (!data.agentType) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["agentType"],
          message: "Missing agentType parameter"
        });
      } else if (!["finops", "rogue", "eval"].includes(data.agentType)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["agentType"],
          message: `Unknown agentType: ${data.agentType}. Supported values: 'finops', 'rogue', 'eval'`
        });
      }
    }
  });

export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body" },
      { status: 400 }
    );
  }

  const validationResult = sandboxBodySchema.safeParse(rawBody);
  if (!validationResult.success) {
    const errorDetails = validationResult.error.issues
      .map((issue) => issue.message)
      .join("; ");
    return NextResponse.json(
      { error: `Validation error: ${errorDetails}` },
      { status: 400 }
    );
  }

  const { agentType, action, executionId } = validationResult.data;

  try {
    if (action === "approve") {
      return await handleApproveScenario(request, executionId!);
    }

    switch (agentType) {
      case "finops":
        return await handleFinopsScenario(request);
      case "rogue":
        return await handleRogueScenario(request);
      case "eval":
        return await handleEvalScenario(request);
      default:
        return NextResponse.json({ error: `Unknown agentType: ${agentType}` }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to process sandbox request" },
      { status: 500 }
    );
  }
}
