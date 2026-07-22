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

// Backstop only: if intake hasn't gathered enough by this many rounds, diagnose anyway
// with what we have. A full sweep (identity, complaint characterisation, PMH, meds,
// allergies, sometimes vitals) legitimately needs several turns, so this is higher than
// the paper's 4 — it's a safety ceiling, not the normal exit (that's isReadyForDiagnosis).
export const MAX_ROUNDS = 8;

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

  // Two-step protocol (see inquirerPrompt): requestedArtifacts is populated ONLY on the
  // upload turn, after the patient has confirmed they have the image. On the availability
  // turn it is empty, so the UI keeps the attach button hidden.
  //
  // If the patient already uploaded an X-ray, never ask again.
  const requests = state.xrayImageUrl
    ? []
    : inquiry.requestedArtifacts.filter((a) => a !== "NONE");

  // The LLM writes the full question text itself (including the "click the attach button"
  // instruction on the upload turn), so we do NOT append boilerplate here.
  const questionText = inquiry.question ?? "";

  return {
    // additional_kwargs.requests is what the route turns into the UI gate.
    messages: [new AIMessage({ content: questionText, additional_kwargs: { requests, phase: "intake" } })],
    askedQuestions: [...state.askedQuestions, inquiry.question ?? ""],
  };
};


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
      primaryAssessment: state.analysis?.primaryAssessment
        ? `${state.analysis.primaryAssessment.condition} ` +
          `(estimated probability ${(state.analysis.primaryAssessment.probability * 100).toFixed(0)}%, ` +
          `overall confidence ${state.analysis.confidence}). ` +
          `Reasoning: ${state.analysis.primaryAssessment.reasoning} ` +
          `Ranked below it: ${state.analysis.primaryAssessment.differentiatedFrom.join(", ") || "none"}.`
        : "No diagnostic assessment available (the analyser did not complete).",
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
    // The diagnostic result travels with the triage decision so the UI renders it as its
    // own card. The triage LLM phrases it; it cannot alter it.
    diagnosis: state.analysis?.primaryAssessment
      ? {
          condition: state.analysis.primaryAssessment.condition,
          probability: state.analysis.primaryAssessment.probability,
          confidence: state.analysis.confidence,
          differentials: state.analysis.primaryAssessment.differentiatedFrom,
        }
      : null,
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
 * INTAKE COMPLETENESS GATE
 *
 * The old rule ("any red flag -> diagnose immediately") was wrong: it skipped data
 * collection the moment a scary word appeared, so "my stomach hurts badly" jumped
 * straight to triage on round 1 with an empty profile. A red flag should raise URGENCY
 * (handled by the safety layer at the end), not SKIP the interview.
 *
 * The real question the gate must answer is: do we have enough to run the EHR model?
 * The hybrid model's tabular branch is trained to tolerate missing values, but a
 * prediction from age+sex alone is close to worthless. So we require the minimum set
 * that makes the model meaningful, and we let the inquirer keep asking until we have it
 * (or we hit the round cap, which is a safety backstop, not a target).
 */
function isReadyForDiagnosis(state: HealthPilotState): boolean {
  const hpi = state.hpi;
  if (!hpi) return false;

  const p = hpi.patientProfile;

  // Hard minimum for a meaningful EHR inference: who the patient is, plus a described
  // complaint with at least basic characterisation, plus the PMH/meds/allergy sweep
  // (these drive the tabular history + medication-class features).
  const hasIdentity = p.ageYears !== null && p.sex !== null;
  const hasComplaint = hpi.symptoms.length > 0 && hpi.symptoms.some((s) => s.onset || s.duration);
  const hasHistorySweep =
    // "asked and empty" is valid — an explicit [] after asking means we screened.
    // We treat informationStillNeeded as the source of truth for what's outstanding.
    !hpi.informationStillNeeded.some((n) =>
      /medication|allerg|past medical|pmh|history|onset|duration|age|sex/i.test(n),
    );

  // For cardio-resp presentations, an X-ray is informative — but it's OPTIONAL, not
  // blocking. If the patient has one we use it; if not, we proceed without it. We never
  // hold the whole pipeline waiting on an image the patient may not have.
  const identityAndComplaint = hasIdentity && hasComplaint;

  return identityAndComplaint && hasHistorySweep;
}

/**
 * Runs after the recipient, once H_t is fresh. Decides: keep interviewing, or diagnose?
 *
 * Returns a SINGLE node name — never an array. Array-returning conditional edges are
 * matched by-value against the path map and fail ("unknown or null destination") when
 * the array isn't itself a listed key. Instead we route to a single `diagnose` entry
 * node and fan out from there with static edges, which is version-robust.
 */
const routePhase = (state: HealthPilotState): "inquirerNode" | "diagnose" => {
  // Round cap is a hard backstop only — reaching it means "stop asking and do your best
  // with what you have", NOT the normal exit. Normal exit is the readiness gate below.
  if (state.round >= MAX_ROUNDS) return "diagnose";

  // The gate: only diagnose once we've collected what the EHR model actually needs.
  // Red flags do NOT short-circuit this — they're carried in hpi.redFlagsIdentified and
  // acted on by the deterministic safety layer in triageNode regardless of path.
  if (isReadyForDiagnosis(state)) return "diagnose";

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