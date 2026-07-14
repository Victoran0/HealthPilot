import { StateGraph, START, END, MemorySaver } from "@langchain/langgraph";
import { HealthPilotState } from "./state";
import { recipientNode } from "./nodes/recipient";
import { inquirerNode, shouldContinueInquiry } from "./nodes/inquirer";
import { chestVisionNode, ehrNode, ragNode } from "./nodes/diagnostic/evidence";
import { analyserNode } from "./nodes/diagnostic/analyser";
import { triageNode } from "./nodes/triage";

/* ------------------------------------------------------------------ */
/* DiagnosticAgent — compiled as its own subgraph                       */
/* ------------------------------------------------------------------ */
/**
 *            ┌──> chestVision ──┐
 *  START ────┼──> ehr ──────────┼──> analyser (MedGemma-27B) ──> END
 *            └──> rag ──────────┘
 *
 * The three evidence nodes run in the same superstep (true parallelism), because
 * they write to disjoint state keys. The analyser has all three as predecessors, so
 * LangGraph will not schedule it until every branch settles.
 */
const diagnosticGraph = new StateGraph(HealthPilotState)
  .addNode("chestVision", chestVisionNode)
  .addNode("ehr", ehrNode)
  .addNode("rag", ragNode)
  .addNode("analyser", analyserNode)
  .addEdge(START, "chestVision")
  .addEdge(START, "ehr")
  .addEdge(START, "rag")
  .addEdge("chestVision", "analyser")
  .addEdge("ehr", "analyser")
  .addEdge("rag", "analyser")
  .addEdge("analyser", END)
  .compile();

/* ------------------------------------------------------------------ */
/* Top-level HealthPilot graph                                          */
/* ------------------------------------------------------------------ */
/**
 *  START ──> recipient ──> [shouldContinueInquiry?]
 *                │                    │
 *                │  "inquirer"        │ "diagnostic"
 *                ▼                    ▼
 *            inquirer            diagnostic (subgraph)
 *          (interrupts,               │
 *           waits for patient)        ▼
 *                │                 triage
 *                └──> recipient       │
 *                                     ▼
 *                                    END
 */
const workflow = new StateGraph(HealthPilotState)
  .addNode("recipient", recipientNode)
  .addNode("inquirer", inquirerNode)
  .addNode("diagnostic", diagnosticGraph)
  .addNode("triage", triageNode)
  .addEdge(START, "recipient")
  .addConditionalEdges("recipient", shouldContinueInquiry, {
    inquirer: "inquirer",
    diagnostic: "diagnostic",
  })
  // The inquirer's interrupt() supplies the patient's answer; we loop back to
  // the recipient to re-derive H_t from (D_t, q_{t-1}, H_{t-1}).
  .addEdge("inquirer", "recipient")
  .addEdge("diagnostic", "triage")
  .addEdge("triage", END);

/**
 * A checkpointer is REQUIRED — without it `interrupt()` cannot resume.
 * Swap MemorySaver for PostgresSaver / a Redis saver before you deploy;
 * Next.js serverless functions do not share memory between invocations.
 */
export const checkpointer = new MemorySaver();

export const healthPilotGraph = workflow.compile({ checkpointer });

export type HealthPilotGraph = typeof healthPilotGraph;
