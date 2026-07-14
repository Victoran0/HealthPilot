import { create, search, insertMultiple, type AnyOrama } from "@orama/orama";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import type { HealthPilotStateType, HealthPilotUpdate } from "../../state";
import type { ImagingResult, EhrResult, RagResult } from "../../schemas";

/* ================================================================== */
/* NODE 1: ChestVision — multi-label chest X-ray classifier            */
/* ================================================================== */
/**
 * Your ViT-B/16 fine-tune on NIH ChestX-ray14, served behind a HF Space / endpoint.
 * Returns 14 pathology probabilities.
 *
 * IMPORTANT: this node is a no-op unless the patient actually uploaded an image.
 * It must never fabricate a "normal" result from absence — the analyser is told to
 * treat a missing imaging block as "not performed", not as "negative".
 */
export async function chestVisionNode(
  state: HealthPilotStateType,
): Promise<HealthPilotUpdate> {
  if (!state.xrayImageUrl) return {}; // skip cleanly

  const res = await fetch(process.env.CHESTVISION_ENDPOINT!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.HF_TOKEN}`,
    },
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

  // Per-pathology thresholds beat a single fixed 0.5 — see your macro-F1 findings.
  const THRESHOLD = 0.5;
  const topFindings = labels.filter((l) => l.probability >= THRESHOLD).map((l) => l.pathology);

  return {
    imaging: {
      model: "ViT-B/16 (NIH ChestX-ray14, 14 labels)",
      labels: labels.slice(0, 5),
      topFindings,
      note:
        topFindings.length === 0
          ? "No pathology exceeded the decision threshold. This does NOT exclude disease — the model has known low recall on rare labels."
          : "Probabilities are screening signals only, not radiological reports.",
    } satisfies ImagingResult,
  };
}

/* ================================================================== */
/* NODE 2: Hybrid EHR / medication model                               */
/* ================================================================== */
/**
 * Tabular MLP branch + BioClinical-ModernBERT text encoder, fused.
 * Consumes the structured HPI (as the text branch) plus any structured EHR record.
 */
export async function ehrNode(state: HealthPilotStateType): Promise<HealthPilotUpdate> {
  if (!state.hpi) return {};

  const res = await fetch(process.env.EHR_ENDPOINT!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.HF_TOKEN}`,
    },
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

  const raw = (await res.json()) as {
    risks: Record<string, number>;
    medication_flags?: string[];
  };

  return {
    ehr: {
      model: "Hybrid MLP + BioClinical-ModernBERT-large",
      riskScores: Object.entries(raw.risks).map(([outcome, probability]) => ({
        outcome,
        probability,
      })),
      medicationFlags: raw.medication_flags ?? [],
      note: "Risk scores are population-level priors, not individual predictions.",
    } satisfies EhrResult,
  };
}

/* ================================================================== */
/* NODE 3: RAG over the medical encyclopaedia (Orama + Gemini embeds)  */
/* ================================================================== */
const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: process.env.GOOGLE_API_KEY,
  model: "text-embedding-004",
  taskType: "RETRIEVAL_QUERY" as never,
});

let oramaDb: AnyOrama | null = null;

/** Lazily build/attach the Orama index. In production, persist and restore it. */
async function getIndex(): Promise<AnyOrama> {
  if (oramaDb) return oramaDb;
  oramaDb = await create({
    schema: {
      title: "string",
      content: "string",
      source: "string",
      embedding: "vector[768]",
    } as const,
  });
  // await insertMultiple(oramaDb, await loadEncyclopaediaChunks());
  return oramaDb;
}

export async function ragNode(state: HealthPilotStateType): Promise<HealthPilotUpdate> {
  if (!state.hpi) return {};

  // Query from the *structured* complaint + candidates, not the raw transcript.
  const query = [
    state.hpi.chiefComplaint,
    ...state.hpi.symptoms.map((s) => s.name),
    ...state.hpi.candidateConditions,
  ].join(", ");

  const db = await getIndex();
  const vector = await embeddings.embedQuery(query);

  const results = await search(db, {
    mode: "hybrid",
    term: query,
    vector: { value: vector, property: "embedding" },
    similarity: 0.7,
    limit: 6,
  });

  return {
    rag: {
      query,
      passages: results.hits.map((h) => ({
        title: String((h.document as Record<string, unknown>).title ?? ""),
        snippet: String((h.document as Record<string, unknown>).content ?? "").slice(0, 600),
        score: h.score,
        source: String((h.document as Record<string, unknown>).source ?? "medical-encyclopaedia"),
      })),
    } satisfies RagResult,
  };
}
