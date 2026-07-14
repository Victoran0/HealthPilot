import { medgemmaComplete, parseJsonBlock } from "../../llm";
import { ANALYSER_SYSTEM } from "../../prompts";
import { AnalysisSchema, type Analysis } from "../../schemas";
import type { HealthPilotStateType, HealthPilotUpdate } from "../../state";

/**
 * Fourth node of the DiagnosticAgent. Joins the three evidence branches.
 *
 * LangGraph fan-in: because chestVision / ehr / rag all write to distinct state keys,
 * they can run concurrently and this node is scheduled only once all three have
 * completed the superstep.
 *
 * MedGemma-27B is the only model in the pipeline doing clinical synthesis. It is still
 * NOT the final authority — its `suggestedUrgency` is advisory and passes through the
 * deterministic safety floor in the triage node.
 */
export async function analyserNode(
  state: HealthPilotStateType,
): Promise<HealthPilotUpdate> {
  const user = buildEvidenceBundle(state);

  let analysis: Analysis;
  try {
    const raw = await medgemmaComplete({ system: ANALYSER_SYSTEM, user, temperature: 0.2 });
    analysis = AnalysisSchema.parse(parseJsonBlock<unknown>(raw));
  } catch (err) {
    // Fail SAFE, not silent. If the analyser dies we escalate to a human channel
    // rather than returning a reassuring default.
    analysis = {
      understanding:
        "The automated assessment could not be completed for your symptoms.",
      considerations: [],
      redFlags: state.hpi?.redFlagsIdentified ?? [],
      suggestedUrgency: (state.hpi?.redFlagsIdentified.length ?? 0) > 0 ? "A_AND_E" : "NHS_111",
      reasoning: `Analyser failure: ${String(err)}. Defaulting to human clinical review.`,
      confidence: "LOW",
    };
  }

  return { analysis };
}

function buildEvidenceBundle(state: HealthPilotStateType): string {
  const sections: string[] = [];

  sections.push(`## STRUCTURED HISTORY OF PRESENT ILLNESS\n${JSON.stringify(state.hpi, null, 2)}`);

  sections.push(
    state.imaging
      ? `## CHEST X-RAY CLASSIFIER (${state.imaging.model})\n` +
          `Top probabilities: ${state.imaging.labels
            .map((l) => `${l.pathology} ${(l.probability * 100).toFixed(1)}%`)
            .join(", ")}\n` +
          `Above threshold: ${state.imaging.topFindings.join(", ") || "none"}\n` +
          `Caveat: ${state.imaging.note}`
      : `## CHEST X-RAY\nNot performed. Absence of imaging is NOT a negative finding — do not treat it as reassurance.`,
  );

  sections.push(
    state.ehr
      ? `## EHR / MEDICATION RISK MODEL (${state.ehr.model})\n` +
          `Risk scores: ${state.ehr.riskScores
            .map((r) => `${r.outcome} ${(r.probability * 100).toFixed(1)}%`)
            .join(", ")}\n` +
          `Medication flags: ${state.ehr.medicationFlags.join(", ") || "none"}\n` +
          `Caveat: ${state.ehr.note}`
      : `## EHR MODEL\nNo structured record available.`,
  );

  sections.push(
    state.rag && state.rag.passages.length
      ? `## RETRIEVED REFERENCE MATERIAL\n` +
          state.rag.passages
            .map((p, i) => `[${i + 1}] ${p.title} (${p.source})\n${p.snippet}`)
            .join("\n\n")
      : `## REFERENCE MATERIAL\nNo relevant passages retrieved.`,
  );

  sections.push(
    `## TASK\nSynthesise the above. Where the model outputs and the history disagree, say so explicitly. Return the JSON object only.`,
  );

  return sections.join("\n\n");
}
