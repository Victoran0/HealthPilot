import { MemorySaver, StateGraph, START, END, Annotation, messagesStateReducer } from "@langchain/langgraph";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";

import { conversationalLLM, patientVoiceLLM } from "./llm";
import { recipientPrompt, inquirerPrompt, triagePrompt } from "./prompts";
import {
  HPISchema,
  InquirySchema,
  type HPI,
  type Analysis,
  type TriageDecision,
  type ImagingResult,
  type EhrResult,
  type RagResult,
} from "./validator";
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
 * Uses Annotation.Root rather than StateSchema. StateSchema validates each field against
 * zod v4's standard-schema output (it reads a `jsonSchema` prop); your project is on zod
 * 3.25.x, whose `"~standard"` has no such prop, so StateSchema rejects every zod field.
 * Annotation.Root has no zod dependency and sidesteps the whole problem. (If you later
 * move to zod v4, see OPTION_A_zod_v4.md to switch back to StateSchema.)
 *
 * `messages` is the ONLY thing the UI sees as chat. Everything else (hpi, imaging, ehr,
 * rag, analysis, triage) is internal — the route lifts it from on_chain_end events and
 * writes it as typed data parts.
 *
 * Reducers: every channel is last-value (overwrite) EXCEPT `messages` (append+dedupe on
 * id) and `askedQuestions` (append — a last-value channel would wipe the Inquirer's
 * no-repetition history after round 1).
 */
const State = Annotation.Root({
  // Prebuilt-style message channel: append + dedupe on id.
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),

  // Single-writer clinical channels — last value wins.
  hpi: Annotation<HPI | null>({ reducer: (_p, n) => n, default: () => null }),

  // Inquirer APPENDS. A last-value channel here would wipe the no-repetition history
  // after round 1 and the Inquirer would start re-asking. Reducer concatenates.
  askedQuestions: Annotation<string[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  round: Annotation<number>({ reducer: (_p, n) => n ?? _p, default: () => 0 }),

  // Carried context, re-sent by the client each request via additional_kwargs.
  xrayImageUrl: Annotation<string | null>({ reducer: (_p, n) => n, default: () => null }),
  ehrRecord: Annotation<Record<string, unknown> | null>({ reducer: (_p, n) => n, default: () => null }),

  // Diagnostic evidence — three nodes, disjoint keys, one write each.
  imaging: Annotation<ImagingResult | null>({ reducer: (_p, n) => n, default: () => null }),
  ehr: Annotation<EhrResult | null>({ reducer: (_p, n) => n, default: () => null }),
  rag: Annotation<RagResult | null>({ reducer: (_p, n) => n, default: () => null }),
  analysis: Annotation<Analysis | null>({ reducer: (_p, n) => n, default: () => null }),

  triage: Annotation<TriageDecision | null>({ reducer: (_p, n) => n, default: () => null }),
});

export type HealthPilotState = typeof State.State;

/* ------------------------------------------------------------------ */
/* 1. RecipientAgent — runs on EVERY turn                              */
/* ------------------------------------------------------------------ */
const recipientNode = async (state: HealthPilotState): Promise<Partial<HealthPilotState>> => {
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
const inquirerNode = async (state: HealthPilotState): Promise<Partial<HealthPilotState>> => {
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
const triageNode = async (state: HealthPilotState): Promise<Partial<HealthPilotState>> => {
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
 *
 * Returns a SINGLE node name — never an array. Array-returning conditional edges are
 * matched by-value against the path map and fail ("unknown or null destination") when
 * the array isn't itself a listed key. Instead we route to a single `diagnose` entry
 * node and fan out from there with static edges, which is version-robust.
 */
const routePhase = (state: HealthPilotState): "inquirerNode" | "diagnose" => {
  if (state.round >= MAX_ROUNDS) return "diagnose";
  if ((state.hpi?.redFlagsIdentified?.length ?? 0) > 0) return "diagnose"; // stop asking, escalate
  if (state.hpi?.intakeConfidence === "HIGH") return "diagnose";
  return "inquirerNode";
};

/**
 * Fan-out entry node. Does no work itself — it exists so the conditional edge can return
 * a single destination, and the three evidence nodes hang off it as static parallel edges.
 */
const diagnoseNode = async (): Promise<Partial<HealthPilotState>> => ({});

/* ------------------------------------------------------------------ */
/* Graph                                                               */
/* ------------------------------------------------------------------ */
/**
 *  START -> recipientNode -> ┬─ inquirerNode ──────────────────────────> END  (turn ends,
 *                            │                                                  patient replies)
 *                            └─ diagnose ─┬─ chestVision ─┐
 *                                         ├─ ehr ─────────┼─> analyserNode -> triageNode -> END
 *                                         └─ rag ─────────┘
 *
 * Swap MemorySaver for PostgresSaver before deploying — serverless invocations don't
 * share memory, and here the checkpointer IS the intake loop's memory.
 */
const checkpointer = new MemorySaver();

export const graph = new StateGraph(State)
  .addNode("recipientNode", recipientNode)
  .addNode("inquirerNode", inquirerNode)
  .addNode("diagnose", diagnoseNode)
  .addNode("chestVision", chestVisionNode)
  .addNode("ehrNode", ehrNode)
  .addNode("ragNode", ragNode)
  .addNode("analyserNode", analyserNode)
  .addNode("triageNode", triageNode)

  .addEdge(START, "recipientNode")
  .addConditionalEdges("recipientNode", routePhase, {
    // Object path map: router return value -> node name. Explicit and unambiguous.
    inquirerNode: "inquirerNode",
    diagnose: "diagnose",
  })
  .addEdge("inquirerNode", END)

  // Static fan-out: diagnose -> all three evidence nodes, in the same superstep.
  .addEdge("diagnose", "chestVision")
  .addEdge("diagnose", "ehrNode")
  .addEdge("diagnose", "ragNode")

  // Fan-in: analyser waits for all three.
  .addEdge("chestVision", "analyserNode")
  .addEdge("ehrNode", "analyserNode")
  .addEdge("ragNode", "analyserNode")
  .addEdge("analyserNode", "triageNode")
  .addEdge("triageNode", END)

  .compile({ checkpointer });