import {
  MemorySaver,
  StateSchema,
  MessagesValue,
  StateGraph,
  START,
  END,
  type GraphNode,
} from "@langchain/langgraph";
import { z } from "zod";
import { AIMessage } from "@langchain/core/messages";

import { conversationalLLM, patientVoiceLLM } from "./llm";
import { recipientPrompt, inquirerPrompt, triagePrompt } from "./prompts";
import { HPISchema, InquirySchema, type HPI, type Analysis, type TriageDecision } from "./validator";
import { evaluateSafetyFloor, applyFloor } from "./safety";
import { PATHWAYS } from "./pathways";
import { chestVisionNode, ehrNode, ragNode } from "./nodes/evidence";
import { analyserNode } from "./nodes/analyser";

export const MAX_ROUNDS = 4;

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */
/**
 * Same shape as your study project, with the clinical channels added.
 *
 * `messages` is the ONLY thing the UI sees as chat. Everything else (hpi, imaging,
 * ehr, rag, analysis, triage) is internal — the route lifts it out of on_chain_end
 * events and writes it as typed data parts.
 *
 * NOTE: if your LangGraph build's StateSchema won't take zod for the extra keys,
 * drop back to Annotation.Root — the semantics below are identical (last-write-wins
 * on every channel except `messages`).
 */
const State = new StateSchema({
  messages: MessagesValue,

  // Recipient output. Rewritten in full every round (H_t = R(D_t, q_{t-1}, H_{t-1})).
  hpi: z.custom<HPI | null>().default(() => null),

  // Inquirer memory. Q_{t-1} — enforces the no-repetition rule.
  askedQuestions: z.array(z.string()).default(() => []),
  round: z.number().default(() => 0),

  // Patient artefacts, carried on additional_kwargs of the incoming message.
  xrayImageUrl: z.custom<string | null>().default(() => null),
  ehrRecord: z.custom<Record<string, unknown> | null>().default(() => null),

  // Diagnostic agent — three parallel evidence nodes write disjoint keys.
  imaging: z.custom<unknown>().default(() => null),
  ehr: z.custom<unknown>().default(() => null),
  rag: z.custom<unknown>().default(() => null),
  analysis: z.custom<Analysis | null>().default(() => null),

  triage: z.custom<TriageDecision | null>().default(() => null),
});

export type HealthPilotState = typeof State.State;

/* ------------------------------------------------------------------ */
/* 1. RecipientAgent — runs on EVERY turn                              */
/* ------------------------------------------------------------------ */
const recipientNode: GraphNode<typeof State> = async (state) => {
  const last = state.messages[state.messages.length - 1];
  const patientMessage = last?.content as string;

  // Artefacts ride in on additional_kwargs, exactly like your `document` and `persona`.
  const xrayImageUrl = (last?.additional_kwargs?.xrayImageUrl as string) ?? state.xrayImageUrl;
  const ehrRecord = (last?.additional_kwargs?.ehrRecord as Record<string, unknown>) ?? state.ehrRecord;

  // q_{t-1}: the question we asked last turn is simply the previous AIMessage.
  const previousQuestion = state.askedQuestions.at(-1) ?? "(none — patient opened the conversation)";

  const structured = conversationalLLM.withStructuredOutput(HPISchema, { name: "build_hpi" });

  const hpi = await recipientPrompt.pipe(structured).invoke({
    previousHpi: state.hpi ? JSON.stringify(state.hpi, null, 2) : "(none — round 1)",
    previousQuestion,
    patientMessage,
  });

  if (xrayImageUrl && !hpi.availableImaging.some((i) => /x-?ray/i.test(i))) {
    hpi.availableImaging.push("Chest X-ray (uploaded)");
  }

  return { hpi, round: state.round + 1, xrayImageUrl, ehrRecord };
};

/* ------------------------------------------------------------------ */
/* 2. InquirerAgent — asks ONE question, then ENDS THE TURN            */
/* ------------------------------------------------------------------ */
/**
 * This is the change your point makes possible. No interrupt(), no Command({ resume }).
 *
 * The node returns an AIMessage and the graph hits END. The turn is over. The
 * checkpointer holds H_t, askedQuestions and round. When the patient replies, the next
 * POST re-enters at START, the recipient merges the answer into the existing HPI, and
 * the loop continues — Recipient <-> Inquirer, one HTTP request per round.
 *
 * The route picks the question up in on_chain_end (name === "inquirerNode"), exactly the
 * way your mcqNode's structured output is lifted out.
 */
const inquirerNode: GraphNode<typeof State> = async (state) => {
  const structured = conversationalLLM.withStructuredOutput(InquirySchema, { name: "next_question" });

  const inquiry = await inquirerPrompt.pipe(structured).invoke({
    round: String(state.round),
    maxRounds: String(MAX_ROUNDS),
    hpi: JSON.stringify(state.hpi, null, 2),
    candidates: state.hpi?.candidateConditions.join(", ") || "(not yet established)",
    askedQuestions: state.askedQuestions.length
      ? state.askedQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")
      : "(none)",
    providedArtifacts: state.xrayImageUrl ? "CHEST_XRAY" : "none",
  });

  const requests = inquiry.requestedArtifacts.filter((a) => a !== "NONE");
  const artefactAsk = requests.map(artefactPrompt).join(" ");
  const questionText = [inquiry.question, artefactAsk].filter(Boolean).join("\n\n");

  return {
    // additional_kwargs is how the route knows to render an upload widget rather than
    // a plain text bubble.
    messages: [new AIMessage({ content: questionText, additional_kwargs: { requests, phase: "intake" } })],
    askedQuestions: [...state.askedQuestions, inquiry.question ?? ""],
  };
};

function artefactPrompt(a: string): string {
  switch (a) {
    case "CHEST_XRAY": return "If you've had a chest X-ray recently and can upload it, I can take a look.";
    case "ECG": return "If you have an ECG report, sharing it would help.";
    case "BLOODS": return "If you have recent blood test results, please share them.";
    case "ECHO": return "If you have an echocardiogram report, please share it.";
    default: return "";
  }
}

/* ------------------------------------------------------------------ */
/* 3. TriageAgent — the only node that streams prose                   */
/* ------------------------------------------------------------------ */
const triageNode: GraphNode<typeof State> = async (state) => {
  const transcript = state.messages.map((m) => String(m.content ?? "")).join("\n");

  // Deterministic floor. No LLM input. Runs on the HPI text and the analyser's red flags,
  // NOT on the analyser's chosen urgency — a confidently-wrong model must not be able to
  // reason its way out of an escalation.
  const { floor, firedRules } = evaluateSafetyFloor(state.hpi, state.analysis, transcript);

  const advisory = state.analysis?.suggestedUrgency ?? "NHS_111";
  const { urgency, overridden } = applyFloor(advisory, floor);
  const overrideReason = overridden ? firedRules.map((r) => `${r.id}: ${r.reason}`).join("; ") : null;

  if (overridden) {
    console.warn(`[SAFETY OVERRIDE] LLM=${advisory} -> RULES=${urgency} :: ${overrideReason}`);
  }

  const pathway = PATHWAYS[urgency];

  // Streamed. This is the one call whose tokens are allowed to reach the patient —
  // the route matches on `tags`. Actions and safety-netting are NOT generated; they come
  // from the static PATHWAYS map and are rendered from the data part.
  const aiMsg = await triagePrompt
    .pipe(patientVoiceLLM)
    .withConfig({ tags: ["patient_facing"] })
    .invoke({
      urgency,
      headline: pathway.headline,
      actions: pathway.actions.join("\n- "),
      safetyNetting: pathway.safetyNetting.join("\n- "),
      decidedBy: overridden ? "deterministic safety rules (the model was overridden)" : "clinical analysis",
      overrideReason: overrideReason ?? "n/a",
      analysis: JSON.stringify(state.analysis, null, 2),
      hpi: JSON.stringify(state.hpi, null, 2),
    });

  const triage: TriageDecision = {
    urgency,
    headline: pathway.headline,
    actions: pathway.actions,
    safetyNetting: pathway.safetyNetting,
    overriddenByRules: overridden,
    overrideReason,
    patientMessage: String(aiMsg.content),
  };

  // The route reads `triage` off this node's on_chain_end output and writes it as a
  // data part — same lift as your mcqNode's JSON.stringify'd structured response.
  return {
    triage,
    messages: [new AIMessage({ content: String(aiMsg.content), additional_kwargs: { phase: "triage", urgency } })],
  };
};

/* ------------------------------------------------------------------ */
/* Routing                                                             */
/* ------------------------------------------------------------------ */
/**
 * Runs after the recipient, once H_t is fresh. Decides: another question, or diagnose?
 */
type Route = "inquirerNode" | ["chestVision", "ehr", "rag"];

const DIAGNOSE: Route = ["chestVision", "ehr", "rag"];

const routePhase = (state: HealthPilotState): Route => {
  // A conditional edge may return an ARRAY of node names — all of them run in the same
  // superstep. That is the fan-out; no dispatcher node needed.
  if (state.round >= MAX_ROUNDS) return DIAGNOSE;
  if ((state.hpi?.redFlagsIdentified.length ?? 0) > 0) return DIAGNOSE; // stop asking, escalate now
  if (state.hpi?.intakeConfidence === "HIGH") return DIAGNOSE;
  return "inquirerNode";
};

/* ------------------------------------------------------------------ */
/* Graph                                                               */
/* ------------------------------------------------------------------ */
/**
 *  START -> recipientNode -> ┬─ inquirerNode ──────────────────────> END   (turn ends,
 *                            │                                              patient replies)
 *                            └─ chestVision ─┐
 *                               ehr ─────────┼─> analyserNode -> triageNode -> END
 *                               rag ─────────┘
 *
 * Swap MemorySaver for PostgresSaver before deploying — serverless invocations don't
 * share memory, and here the checkpointer IS the intake loop's memory.
 */
const checkpointer = new MemorySaver();

export const graph = new StateGraph(State)
  .addNode("recipientNode", recipientNode)
  .addNode("inquirerNode", inquirerNode)
  .addNode("chestVision", chestVisionNode)
  .addNode("ehr", ehrNode)
  .addNode("rag", ragNode)
  .addNode("analyserNode", analyserNode)
  .addNode("triageNode", triageNode)

  .addEdge(START, "recipientNode")
  .addConditionalEdges("recipientNode", routePhase, [
    "inquirerNode",
    "chestVision",
    "ehr",
    "rag",
  ])
  .addEdge("inquirerNode", END)

  // Fan-in: analyser waits for all three.
  .addEdge("chestVision", "analyserNode")
  .addEdge("ehr", "analyserNode")
  .addEdge("rag", "analyserNode")
  .addEdge("analyserNode", "triageNode")
  .addEdge("triageNode", END)

  .compile({ checkpointer });
