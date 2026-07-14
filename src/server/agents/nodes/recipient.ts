import { HumanMessage } from "@langchain/core/messages";
import { conversationalLLM } from "../llm";
import { recipientPrompt } from "../prompts";
import { HPISchema, type HPI } from "../schemas";
import type { HealthPilotStateType, HealthPilotUpdate } from "../state";

const structured = conversationalLLM.withStructuredOutput(HPISchema, {
  name: "hpi",
});

/**
 * RecipientAgent: H_t = R(D_t, q_{t-1}, H_{t-1})
 *
 * Runs on every patient turn. This is the only node that writes `hpi`.
 * The ablation in Cheng et al. (Figure 6, +33.1% on hard cases) is the reason this
 * exists as a distinct node rather than just concatenating the raw dialogue —
 * downstream agents reason far better over structured HPI than over transcript.
 */
export async function recipientNode(
  state: HealthPilotStateType,
): Promise<HealthPilotUpdate> {
  const last = [...state.messages].reverse().find((m) => m instanceof HumanMessage);
  const patientMessage = (last?.content as string) ?? "";

  const hpi: HPI = await structured.invoke(
    await recipientPrompt.formatMessages({
      previousHpi: state.hpi ? JSON.stringify(state.hpi, null, 2) : "(none — this is round 1)",
      previousQuestion: state.currentQuestion ?? "(none — patient opened the conversation)",
      patientMessage,
    }),
  );

  // Keep artefact availability in sync with what the patient has actually uploaded.
  if (state.xrayImageUrl && !hpi.availableImaging.some((i) => /x-?ray/i.test(i))) {
    hpi.availableImaging.push("Chest X-ray (uploaded)");
  }

  return {
    hpi,
    round: state.round + 1,
  };
}
