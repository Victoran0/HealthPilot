import { AIMessage } from "@langchain/core/messages";
import { patientVoiceLLM } from "../llm";
import { triagePrompt } from "../prompts";
import { TriageDecisionSchema, type TriageDecision } from "../schemas";
import { evaluateSafetyFloor, applyFloor } from "../safety";
import type { HealthPilotStateType, HealthPilotUpdate } from "../state";

const structured = patientVoiceLLM.withStructuredOutput(TriageDecisionSchema, { name: "triage" });

/**
 * TriageAgent.
 *
 * Order of operations matters and is the core safety property of the system:
 *   1. Compute the deterministic floor from rules (LLM has no input here).
 *   2. Take MedGemma's advisory urgency.
 *   3. Final urgency = max(floor, advisory). The LLM can escalate, never de-escalate.
 *   4. Only THEN does an LLM get involved — purely to phrase the already-fixed decision.
 *
 * This is the inversion of Cheng et al.'s advisory guidance mechanism, and it is what
 * makes the system defensible for a patient-facing UK deployment.
 */
export async function triageNode(state: HealthPilotStateType): Promise<HealthPilotUpdate> {
  const transcript = state.messages
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .join("\n");

  // (1) Deterministic layer
  const { floor, firedRules } = evaluateSafetyFloor(state.hpi, state.analysis, transcript);

  // (2)+(3) Reconcile
  const advisory = state.analysis?.suggestedUrgency ?? "NHS_111";
  const { urgency, overridden } = applyFloor(advisory, floor);

  const overrideReason = overridden
    ? firedRules.map((r) => `${r.id}: ${r.reason}`).join("; ")
    : null;

  if (overridden) {
    console.warn(
      `[SAFETY OVERRIDE] LLM said ${advisory}, rules enforced ${urgency}. Rules: ${overrideReason}`,
    );
  }

  // (4) Phrase it
  const decision: TriageDecision = await structured.invoke(
    await triagePrompt.formatMessages({
      urgency,
      decidedBy: overridden ? "deterministic safety rules (LLM was overridden)" : "clinical analysis",
      overrideReason: overrideReason ?? "n/a",
      analysis: JSON.stringify(state.analysis, null, 2),
      hpi: JSON.stringify(state.hpi, null, 2),
    }),
  );

  // Belt and braces: the phrasing model does not get to change the level.
  decision.urgency = urgency;
  decision.overriddenByRules = overridden;
  decision.overrideReason = overrideReason;

  return {
    triage: decision,
    messages: [new AIMessage(decision.patientMessage)],
  };
}
