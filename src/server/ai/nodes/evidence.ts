import { Index } from "@upstash/vector";
import type { ImagingResult, EhrResult, RagResult } from "../validator";
import type { HealthPilotState } from "../agent";

/* ================================================================== */
/* ChestVision — ViT-B/16, NIH ChestX-ray14, 14 labels                 */
/* ================================================================== */
export async function chestVisionNode(state: HealthPilotState) {
  // No X-ray: return nothing. NOT a "normal" result.
  // The analyser prompt is told explicitly that a missing imaging block means
  // "not performed", never "negative". This distinction is the difference between
  // a safe system and a lethal one.
  if (!state.xrayImageUrl) return {};

  try {
    const res = await fetch(process.env.CHESTVISION_ENDPOINT!, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.INFERENCE_API_TOKEN}` },
      body: JSON.stringify({ image_url: state.xrayImageUrl }),
    });

    if (!res.ok) {
      return {
        imaging: {
          model: "ViT-B/16 (NIH ChestX-ray14)",
          labels: [],
          topFindings: [],
          note: `Imaging model unavailable (${res.status}). Assessment proceeds without it.`,
        } satisfies ImagingResult,
      };
    }

    const raw = (await res.json()) as { labels: Record<string, number> };
    const labels = Object.entries(raw.labels)
      .map(([pathology, probability]) => ({ pathology, probability }))
      .sort((a, b) => b.probability - a.probability);

    const topFindings = labels.filter((l) => l.probability >= 0.5).map((l) => l.pathology);

    return {
      imaging: {
        model: "ViT-B/16 (NIH ChestX-ray14, 14 labels)",
        labels: labels.slice(0, 5),
        topFindings,
        note:
          topFindings.length === 0
            ? "Nothing exceeded the decision threshold. This does NOT exclude disease — recall on rare labels is known to be poor."
            : "Screening signals only. Not a radiological report.",
      } satisfies ImagingResult,
    };
  } catch (err) {
    // Network failure (DNS, timeout, connection refused) — degrade, don't abort.
    // Crucially the note does NOT read as reassurance: a failed X-ray read is not a
    // clear X-ray.
    console.error("[HealthPilot] chestVisionNode failed:", err);
    return {
      imaging: {
        model: "ViT-B/16 (NIH ChestX-ray14)",
        labels: [],
        topFindings: [],
        note: "Imaging model could not be reached. Your X-ray was NOT assessed — this is not a negative result.",
      } satisfies ImagingResult,
    };
  }
}

/* ================================================================== */
/* Hybrid EHR — tabular MLP + BioClinical-ModernBERT-large             */
/* ================================================================== */
export async function ehrNode(state: HealthPilotState) {
  if (!state.hpi) return {};

  try {
    const res = await fetch(process.env.EHR_ENDPOINT!, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.INFERENCE_API_TOKEN}` },
      body: JSON.stringify({
        clinical_text: `${state.hpi.chiefComplaint}. ${state.hpi.historyOfPresentIllness}`,
        structured: state.ehrRecord ?? {},
        medications: state.hpi.medications,
        pmh: state.hpi.pastMedicalHistory,
      }),
    });

    if (!res.ok) {
      return {
        ehr: {
          model: "Hybrid MLP + BioClinical-ModernBERT-large",
          riskScores: [],
          medicationFlags: [],
          note: `EHR model unavailable (${res.status}).`,
        } satisfies EhrResult,
      };
    }

    const raw = (await res.json()) as { risks: Record<string, number>; medication_flags?: string[] };

    return {
      ehr: {
        model: "Hybrid MLP + BioClinical-ModernBERT-large",
        riskScores: Object.entries(raw.risks).map(([outcome, probability]) => ({ outcome, probability })),
        medicationFlags: raw.medication_flags ?? [],
        note: "Population-level priors, not individual predictions.",
      } satisfies EhrResult,
    };
  } catch (err) {
    console.error("[HealthPilot] ehrNode failed:", err);
    return {
      ehr: {
        model: "Hybrid MLP + BioClinical-ModernBERT-large",
        riskScores: [],
        medicationFlags: [],
        note: "EHR model could not be reached. Assessment proceeds without it.",
      } satisfies EhrResult,
    };
  }
}

/* ================================================================== */
/* RAG — Upstash Vector (hosted, built-in embedding)                   */
/* ================================================================== */
/**
 * The index is built OFFLINE by scripts/ingest-encyclopaedia.ts and lives in Upstash.
 * Upstash handles all embedding (text-embedding-3-small dense + BM25 sparse) server-side.
 * At runtime we pass the query string and get ranked passages back — one HTTP call,
 * no embedding client, no Google API key needed here. See RAG_SETUP.md.
 */
const vectorIndex = new Index({
  url: process.env.UPSTASH_VECTOR_REST_URL!,
  token: process.env.UPSTASH_VECTOR_REST_TOKEN!,
});

interface EncyclopaediaMeta {
  content: string;
  source: string;
  title: string;
}

export async function ragNode(state: HealthPilotState) {
  if (!state.hpi) return {};

  // Query from the STRUCTURED complaint, not the raw transcript.
  // "it hurts when I breathe in" is a poor retrieval query;
  // "pleuritic chest pain, tachycardia, candidate: PE / pleuritis" is a good one.
  const query = [
    state.hpi.chiefComplaint,
    ...state.hpi.symptoms.map((s) => s.name),
    ...state.hpi.candidateConditions,
  ].join(", ");

  // RAG is NON-CRITICAL: reference material, not the decision. If Upstash is
  // unreachable the assessment still proceeds to the safety layer and triage.
  // The analyser prompt treats "no passages retrieved" as a normal case.
  try {
    // `data` is all Upstash needs — it builds BOTH the dense (text-embedding-3-small)
    // and sparse (BM25) query vectors server-side and fuses them with RRF.
    const results = await vectorIndex.query({
      data: query,
      topK: 6,
      includeMetadata: true,
    });

    return {
      rag: {
        query,
        passages: results
          .filter((r) => r.metadata)
          .map((r) => {
            const m = r.metadata as unknown as EncyclopaediaMeta;
            return {
              title: m.title ?? "",
              snippet: (m.content ?? "").slice(0, 600),
              score: r.score,
              source: m.source ?? "medical-encyclopaedia",
            };
          }),
      } satisfies RagResult,
    };
  } catch (err) {
    console.error("[HealthPilot] ragNode failed, continuing without retrieval:", err);
    return {
      rag: { query, passages: [] } satisfies RagResult,
    };
  }
}