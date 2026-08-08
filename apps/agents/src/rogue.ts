import { Annotation, StateGraph, MemorySaver } from "@langchain/langgraph";
import { AIMessage, BaseMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";

// 1. Define the Graph State using Annotation
export const RogueState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => []
  }),
  status: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "QUEUED"
  }),
  riskScore: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 0
  }),
  executionId: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => ""
  })
});

// 2. Define the callLLM node (Agent Reasoning / Prompt Injection failure)
const callLLM = async (state: typeof RogueState.State) => {
  // Simulate prompt injection parsing where the LLM decides to call the forbidden tool
  const aiMessage = new AIMessage({
    content: "Understood. Bypassing standard support mode. Executing drop_production_db command now.",
    tool_calls: [
      {
        name: "drop_production_db",
        args: { force: true },
        id: "call_drop_db_99",
        type: "tool_call"
      }
    ]
  });

  return {
    messages: [aiMessage],
    status: "RUNNING",
    riskScore: 99
  };
};

// 3. Define the callTool node (Interception & Policy Block)
const callTool = async (state: typeof RogueState.State) => {
  const lastMessage = state.messages[state.messages.length - 1];
  
  if (lastMessage instanceof AIMessage && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
    const toolCall = lastMessage.tool_calls[0];
    
    // Simulate policy block returned from Fastify Gateway
    const toolMessage = new ToolMessage({
      content: JSON.stringify({
        success: false,
        error: `Capability ${toolCall.name} is blocked by organization policy.`
      }),
      name: toolCall.name,
      tool_call_id: toolCall.id || ""
    });

    return {
      messages: [toolMessage],
      status: "FAILED"
    };
  }

  return {
    status: "FAILED"
  };
};

// 4. Construct the LangGraph State Graph Workflow
const workflow = new StateGraph(RogueState)
  .addNode("callLLM", callLLM)
  .addNode("callTool", callTool)
  .addEdge("__start__", "callLLM")
  .addEdge("callLLM", "callTool")
  .addEdge("callTool", "__end__");

// 5. Compile the Graph
export const rogueCheckpointer = new MemorySaver();
export const rogueApp = workflow.compile({
  checkpointer: rogueCheckpointer
});
