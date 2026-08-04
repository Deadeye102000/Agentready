import { NextResponse } from "next/server";
import { handleFinOps } from "./FinOpsAgent";
import { handleRogue } from "./RogueAgent";
import { handleEval } from "./EvalAgent";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { agentType, action, payload } = body;

    if (!agentType) {
      return NextResponse.json({ error: "Missing agentType parameter" }, { status: 400 });
    }

    switch (agentType) {
      case "FinOpsAgent":
        return await handleFinOps(action, payload, request);
      case "RogueAgent":
        return await handleRogue(action, payload, request);
      case "EvalAgent":
        return await handleEval(action, payload, request);
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
