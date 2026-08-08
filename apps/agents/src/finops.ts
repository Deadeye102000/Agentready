import { Annotation, StateGraph, MemorySaver } from "@langchain/langgraph";
import { AIMessage, BaseMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";

// 1. Define the Graph State using Annotation
export const FinOpsState = Annotation.Root({
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

// 2. Define the callLLM node (Agent Reasoning)
const callLLM = async (state: typeof FinOpsState.State) => {
  const lastMessage = state.messages[state.messages.length - 1];
  
  // Simulate autonomous decision to issue a refund based on user complaint
  const aiMessage = new AIMessage({
    content: "The billing complaint is valid. I will issue a customer refund of $10,000.",
    tool_calls: [
      {
        name: "issue_refund",
        args: { customerId: "cust_8829", amount: 10000 },
        id: "call_refund_101",
        type: "tool_call"
      }
    ]
  });

  return {
    messages: [aiMessage],
    status: "RUNNING",
    riskScore: 85
  };
};

// 3. Define the callTool node (Tool Execution)
const callTool = async (state: typeof FinOpsState.State) => {
  const lastMessage = state.messages[state.messages.length - 1];
  
  if (lastMessage instanceof AIMessage && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
    const toolCall = lastMessage.tool_calls[0];
    
    // Simulate successful execution of refund
    const toolMessage = new ToolMessage({
      content: JSON.stringify({ success: true, transactionId: "tx_sandbox_101", refundedAmount: 10000 }),
      name: toolCall.name,
      tool_call_id: toolCall.id || ""
    });

    return {
      messages: [toolMessage],
      status: "SUCCEEDED"
    };
  }

  return {
    status: "FAILED"
  };
};

// 4. Construct the LangGraph State Graph Workflow
const workflow = new StateGraph(FinOpsState)
  .addNode("callLLM", callLLM)
  .addNode("callTool", callTool)
  .addEdge("__start__", "callLLM")
  .addEdge("callLLM", "callTool")
  .addEdge("callTool", "__end__");

// 5. Compile the Graph with an in-memory checkpointer and a breakpoint before calling the tool
export const finOpsCheckpointer = new MemorySaver();
export const finOpsApp = workflow.compile({
  checkpointer: finOpsCheckpointer,
  interruptBefore: ["callTool"]
});
