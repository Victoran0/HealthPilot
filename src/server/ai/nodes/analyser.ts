import { medgemmaComplete, parseJsonBlock } from "../llm";
import { ANALYSER_SYSTEM } from "../prompts";
import { AnalysisSchema, type Analysis } from "../validator";
import type { HealthPilotState } from "../agent";

/**
 * Fan-in node. Joins chestVision | ehr | rag and synthesises with MedGemma-27B
 * via HuggingFace Inference Providers.
 *
 * Not streamed. Its output is JSON and clinician-facing — the route lifts it from
 * on_chain_end as a `data-analysis` part. (If you want the reasoning visible, use
 * medgemmaStream + dispatchCustomEvent and render it collapsed; but the patient's
 * chat bubble should only ever contain the triage node's prose.)
 */
export async function analyserNode(state: HealthPilotState) {
  const user = buildEvidenceBundle(state);

  let analysis: Analysis;
  try {
    const raw = await medgemmaComplete({ system: ANALYSER_SYSTEM, user, temperature: 0.2 });
    analysis = AnalysisSchema.parse(parseJsonBlock<unknown>(raw));
  } catch (err) {
    // Fail SAFE. A dead analyser routes to a human; it never falls back to reassurance.
    analysis = {
      understanding: "The automated assessment could not be completed.",
      considerations: [],
      redFlags: state.hpi?.redFlagsIdentified ?? [],
      suggestedUrgency: (state.hpi?.redFlagsIdentified.length ?? 0) > 0 ? "A_AND_E" : "NHS_111",
      reasoning: `Analyser failure: ${String(err)}. Defaulting to human clinical review.`,
      confidence: "LOW",
    };
  }

  return { analysis };
}

function buildEvidenceBundle(state: HealthPilotState): string {
  const s: string[] = [];

  s.push(`## STRUCTURED HISTORY OF PRESENT ILLNESS\n${JSON.stringify(state.hpi, null, 2)}`);

  const imaging = state.imaging as
    | { model: string; labels: { pathology: string; probability: number }[]; topFindings: string[]; note: string }
    | null;

  s.push(
    imaging
      ? `## CHEST X-RAY CLASSIFIER (${imaging.model})\n` +
          `Top probabilities: ${imaging.labels.map((l) => `${l.pathology} ${(l.probability * 100).toFixed(1)}%`).join(", ")}\n` +
          `Above threshold: ${imaging.topFindings.join(", ") || "none"}\n` +
          `Caveat: ${imaging.note}`
      : `## CHEST X-RAY\nNot performed. Absence of imaging is NOT a negative finding. Do not treat it as reassurance.`,
  );

  const ehr = state.ehr as
    | { model: string; riskScores: { outcome: string; probability: number }[]; medicationFlags: string[]; note: string }
    | null;

  s.push(
    ehr
      ? `## EHR / MEDICATION RISK MODEL (${ehr.model})\n` +
          `Risk scores: ${ehr.riskScores.map((r) => `${r.outcome} ${(r.probability * 100).toFixed(1)}%`).join(", ")}\n` +
          `Medication flags: ${ehr.medicationFlags.join(", ") || "none"}\n` +
          `Caveat: ${ehr.note}`
      : `## EHR MODEL\nNo structured record available.`,
  );

  const rag = state.rag as { passages: { title: string; snippet: string; source: string }[] } | null;

  s.push(
    rag?.passages.length
      ? `## RETRIEVED REFERENCE MATERIAL\n` +
          rag.passages.map((p, i) => `[${i + 1}] ${p.title} (${p.source})\n${p.snippet}`).join("\n\n")
      : `## REFERENCE MATERIAL\nNo relevant passages retrieved.`,
  );

  s.push(`## TASK\nSynthesise the above. Where the model outputs and the patient's history disagree, say so explicitly. Return the JSON object only.`);

  return s.join("\n\n");
}