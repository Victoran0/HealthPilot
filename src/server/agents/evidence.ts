import { create, search, type AnyOrama } from "@orama/orama";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
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

  const res = await fetch(process.env.CHESTVISION_ENDPOINT!, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.HF_TOKEN}` },
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
}

/* ================================================================== */
/* Hybrid EHR — tabular MLP + BioClinical-ModernBERT-large             */
/* ================================================================== */
export async function ehrNode(state: HealthPilotState) {
  if (!state.hpi) return {};

  const res = await fetch(process.env.EHR_ENDPOINT!, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.HF_TOKEN}` },
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
}

/* ================================================================== */
/* RAG — Orama hybrid search, Gemini embeddings                        */
/* ================================================================== */
const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: process.env.GOOGLE_API_KEY,
  model: "text-embedding-004",
});

let db: AnyOrama | null = null;

async function getIndex(): Promise<AnyOrama> {
  if (db) return db;
  db = await create({
    schema: {
      title: "string",
      content: "string",
      source: "string",
      embedding: "vector[768]",
    } as const,
  });
  // await insertMultiple(db, await loadEncyclopaediaChunks());
  // In production: persist with @orama/plugin-data-persistence and restore here —
  // rebuilding the index per cold start will dominate your latency budget.
  return db;
}

export async function ragNode(state: HealthPilotState) {
  if (!state.hpi) return {};

  // Query the STRUCTURED complaint, not the raw transcript. "it hurts a bit when I
  // breathe in, been like it since Tuesday" is a terrible retrieval query;
  // "pleuritic chest pain, 5 days, candidate: pleurisy / PE / pneumonia" is a good one.
  const query = [
    state.hpi.chiefComplaint,
    ...state.hpi.symptoms.map((s) => s.name),
    ...state.hpi.candidateConditions,
  ].join(", ");

  const index = await getIndex();
  const vector = await embeddings.embedQuery(query);

  const results = await search(index, {
    mode: "hybrid",
    term: query,
    vector: { value: vector, property: "embedding" },
    similarity: 0.7,
    limit: 6,
  });

  return {
    rag: {
      query,
      passages: results.hits.map((h) => {
        const d = h.document as Record<string, unknown>;
        return {
          title: String(d.title ?? ""),
          snippet: String(d.content ?? "").slice(0, 600),
          score: h.score,
          source: String(d.source ?? "medical-encyclopaedia"),
        };
      }),
    } satisfies RagResult,
  };
}
