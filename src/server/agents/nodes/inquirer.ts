import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { interrupt } from "@langchain/langgraph";
import { conversationalLLM } from "../llm";
import { inquirerPrompt } from "../prompts";
import { InquirySchema, type Inquiry } from "../schemas";
import { MAX_INQUIRY_ROUNDS, type HealthPilotStateType, type HealthPilotUpdate } from "../state";

const structured = conversationalLLM.withStructuredOutput(InquirySchema, { name: "inquiry" });

/**
 * InquirerAgent: q_t = I(H_t, Q_{t-1}, d̂_t)
 *
 * Generates one discriminating question, then INTERRUPTS the graph to wait for the
 * patient. Execution resumes at the recipient node with the patient's answer, closing
 * the Recipient <-> Inquirer feedback loop.
 *
 * Requires a checkpointer on the compiled graph — `interrupt()` persists state and
 * throws; the resume value arrives via `new Command({ resume: ... })`.
 */
export async function inquirerNode(
  state: HealthPilotStateType,
): Promise<HealthPilotUpdate> {
  const providedArtifacts = [
    state.xrayImageUrl ? "CHEST_XRAY" : null,
    state.ehrRecord ? "EHR" : null,
  ]
    .filter(Boolean)
    .join(", ") || "none";

  const inquiry: Inquiry = await structured.invoke(
    await inquirerPrompt.formatMessages({
      round: String(state.round),
      maxRounds: String(MAX_INQUIRY_ROUNDS),
      hpi: JSON.stringify(state.hpi, null, 2),
      candidates: (state.hpi?.candidateConditions ?? []).join(", ") || "(not yet established)",
      askedQuestions: state.askedQuestions.length
        ? state.askedQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")
        : "(none)",
      providedArtifacts,
    }),
  );

  if (inquiry.intakeComplete || !inquiry.question) {
    return { currentQuestion: null };
  }

  // Compose what the patient actually sees, including any artefact request.
  const artefactAsk = inquiry.requestedArtifacts
    .filter((a) => a !== "NONE")
    .map(artefactPrompt)
    .join(" ");

  const questionText = [inquiry.question, artefactAsk].filter(Boolean).join("\n\n");

  // ---- Pause the graph and hand control back to the UI ----
  const patientReply = interrupt<{ question: string; requests: string[] }, string>({
    question: questionText,
    requests: inquiry.requestedArtifacts.filter((a) => a !== "NONE"),
  });

  return {
    currentQuestion: inquiry.question,
    askedQuestions: [inquiry.question],
    messages: [new AIMessage(questionText), new HumanMessage(patientReply)],
  };
}

function artefactPrompt(a: string): string {
  switch (a) {
    case "CHEST_XRAY":
      return "If you've had a chest X-ray recently and can upload the image, I can look at it.";
    case "ECG":
      return "If you have an ECG report, sharing it would help.";
    case "BLOODS":
      return "If you have recent blood test results, please share them.";
    case "ECHO":
      return "If you have an echocardiogram report, please share it.";
    default:
      return "";
  }
}

/** Conditional edge: keep interviewing, or move to the diagnostic agent. */
export function shouldContinueInquiry(state: HealthPilotStateType): "inquirer" | "diagnostic" {
  if (state.round >= MAX_INQUIRY_ROUNDS) return "diagnostic";
  if (state.hpi?.intakeConfidence === "HIGH" && state.currentQuestion === null) return "diagnostic";
  // Hard red flag: stop interviewing, get to triage now.
  if ((state.hpi?.redFlagsIdentified.length ?? 0) > 0 && state.round >= 1) return "diagnostic";
  return "inquirer";
}
