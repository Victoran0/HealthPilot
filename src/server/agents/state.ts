import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";
import type {
  HPI,
  ImagingResult,
  EhrResult,
  RagResult,
  Analysis,
  TriageDecision,
} from "./schemas";

/**
 * Single shared state object threaded through every agent.
 *
 * Design notes:
 *  - `hpi` is the equivalent of Cheng et al.'s H_t: the RecipientAgent rewrites it
 *    every round from (patient utterance, previous question, previous HPI).
 *  - `askedQuestions` is Q_{t-1}: passed to the InquirerAgent to enforce no-repetition.
 *  - Diagnostic node outputs are separate slots so the three evidence nodes can run
 *    in parallel (fan-out) and the analyser joins them (fan-in) without write conflicts.
 */
export const HealthPilotState = Annotation.Root({
  // Conversation transcript (patient <-> system)
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),

  // ---- Intake loop ----
  hpi: Annotation<HPI | null>({
    reducer: (_prev, next) => next, // RecipientAgent fully rewrites each round
    default: () => null,
  }),
  currentQuestion: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  askedQuestions: Annotation<string[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  round: Annotation<number>({
    reducer: (prev, next) => next ?? prev,
    default: () => 0,
  }),

  // ---- Patient-supplied artefacts ----
  xrayImageUrl: Annotation<string | null>({
    reducer: (_p, n) => n,
    default: () => null,
  }),
  ehrRecord: Annotation<Record<string, unknown> | null>({
    reducer: (_p, n) => n,
    default: () => null,
  }),

  // ---- Diagnostic agent node outputs (parallel writes, distinct keys) ----
  imaging: Annotation<ImagingResult | null>({
    reducer: (_p, n) => n,
    default: () => null,
  }),
  ehr: Annotation<EhrResult | null>({
    reducer: (_p, n) => n,
    default: () => null,
  }),
  rag: Annotation<RagResult | null>({
    reducer: (_p, n) => n,
    default: () => null,
  }),
  analysis: Annotation<Analysis | null>({
    reducer: (_p, n) => n,
    default: () => null,
  }),

  // ---- Triage output ----
  triage: Annotation<TriageDecision | null>({
    reducer: (_p, n) => n,
    default: () => null,
  }),
});

export type HealthPilotStateType = typeof HealthPilotState.State;
export type HealthPilotUpdate = typeof HealthPilotState.Update;

export const MAX_INQUIRY_ROUNDS = 4; // Cheng et al. use 4; accuracy plateaus after that
