import { Annotation, StateGraph, MemorySaver } from "@langchain/langgraph";
import { AIMessage, BaseMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";

// 1. Define the Graph State using Annotation
export const EvalState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => []
  }),
  status: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "QUEUED"
  }),
  targetAgent: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "sales_agent_v2"
  }),
  compareAgainst: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "baseline_v1"
  }),
  toolCallingCorrectness: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "0%"
  }),
  toolCallingDelta: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "0%"
  }),
  hallucinationRate: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "0%"
  })
});

// 2. Define the callLLM node (Planning Evaluation Run)
const callLLM = async (state: typeof EvalState.State) => {
  const aiMessage = new AIMessage({
    content: "Initiating Sales Agent v2.0 verification suite against baseline v1.0 parameters.",
    tool_calls: [
      {
        name: "run_eval_framework",
        args: { targetAgent: "sales_agent_v2", compareAgainst: "baseline_v1" },
        id: "call_eval_run_303",
        type: "tool_call"
      }
    ]
  });

  return {
    messages: [aiMessage],
    status: "RUNNING"
  };
};

// 3. Define the runEval node (Executing CI/CD Assertions)
const runEval = async (state: typeof EvalState.State) => {
  const lastMessage = state.messages[state.messages.length - 1];
  
  if (lastMessage instanceof AIMessage && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
    const toolCall = lastMessage.tool_calls[0];
    
    // Simulate computing scores and testing metrics
    const toolMessage = new ToolMessage({
      content: JSON.stringify({
        correctness: 0.98,
        hallucinationRate: 0.001,
        status: "PASSED"
      }),
      name: toolCall.name,
      tool_call_id: toolCall.id || ""
    });

    return {
      messages: [toolMessage],
      status: "SUCCEEDED",
      toolCallingCorrectness: "98%",
      toolCallingDelta: "+2%",
      hallucinationRate: "0.1%"
    };
  }

  return {
    status: "FAILED"
  };
};

// 4. Construct the LangGraph State Graph Workflow
const workflow = new StateGraph(EvalState)
  .addNode("callLLM", callLLM)
  .addNode("runEval", runEval)
  .addEdge("__start__", "callLLM")
  .addEdge("callLLM", "runEval")
  .addEdge("runEval", "__end__");

// 5. Compile the Graph
export const evalCheckpointer = new MemorySaver();
export const evalApp = workflow.compile({
  checkpointer: evalCheckpointer
});
