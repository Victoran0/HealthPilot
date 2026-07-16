/**
 * Fallback State definition using Annotation.Root.
 *
 * Use this ONLY if `StateSchema` rejects your zod schemas — which happens when your
 * installed `zod` resolves to v3 (StateSchema validates against zod v4's standard-schema
 * interface). Annotation.Root has no zod dependency and has been stable for far longer.
 *
 * To switch: in agent.ts, replace the `new StateSchema({...})` block with an import of
 * `HealthPilotAnnotation` from here and pass it to `new StateGraph(HealthPilotAnnotation)`.
 * Node signatures change from `GraphNode<typeof State>` to
 * `(state: typeof HealthPilotAnnotation.State) => Promise<...>`.
 *
 * Semantics are identical to the StateSchema version:
 *   - every key overwrites (last-value) EXCEPT messages (append+dedupe) and
 *     askedQuestions (append).
 */
import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";
import type { HPI, Analysis, TriageDecision, ImagingResult, EhrResult, RagResult } from "./validator";

export const HealthPilotAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),

  hpi: Annotation<HPI | null>({ reducer: (_p, n) => n, default: () => null }),

  askedQuestions: Annotation<string[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  round: Annotation<number>({ reducer: (_p, n) => n ?? _p, default: () => 0 }),

  xrayImageUrl: Annotation<string | null>({ reducer: (_p, n) => n, default: () => null }),
  ehrRecord: Annotation<Record<string, unknown> | null>({
    reducer: (_p, n) => n,
    default: () => null,
  }),

  imaging: Annotation<ImagingResult | null>({ reducer: (_p, n) => n, default: () => null }),
  ehr: Annotation<EhrResult | null>({ reducer: (_p, n) => n, default: () => null }),
  rag: Annotation<RagResult | null>({ reducer: (_p, n) => n, default: () => null }),
  analysis: Annotation<Analysis | null>({ reducer: (_p, n) => n, default: () => null }),

  triage: Annotation<TriageDecision | null>({ reducer: (_p, n) => n, default: () => null }),
});

export type HealthPilotStateAnnotated = typeof HealthPilotAnnotation.State;