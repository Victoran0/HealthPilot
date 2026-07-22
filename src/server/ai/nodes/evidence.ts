import { Index } from "@upstash/vector";
import type { ImagingResult, EhrResult, RagResult, HPI } from "../validator";
import { generateSoapNote } from "../Notegenerator";
import type { HealthPilotState } from "../agent";

/* ================================================================== */
/* ChestVision — ViT-B/16, NIH ChestX-ray14, 14 labels                 */
/* ================================================================== */
export async function chestVisionNode(state: HealthPilotState) {
  // Two conditions must BOTH hold for imaging to run:
  //  1. the presentation is cardiovascular/respiratory (else an X-ray is irrelevant), and
  //  2. the patient actually supplied an image.
  // Skipping returns {} — the analyser treats a missing imaging block as "not performed",
  // never as "normal".
  if (!state.hpi?.cardioRespRelevant) return {};
  if (!state.xrayImageUrl) return {};

  try {
    // The browser sends a base64 data URL ("data:image/jpeg;base64,..."), but the
    // ChestVision Space's /predict expects a MULTIPART FILE UPLOAD (file=@xray.png),
    // not JSON. Decode the data URL back to bytes and post it as form-data.
    const blob = dataUrlToBlob(state.xrayImageUrl);
    if (!blob) {
      return {
        imaging: {
          model: "ViT-B/16 (NIH ChestX-ray14)",
          labels: [],
          topFindings: [],
          note: "Uploaded image could not be decoded. Your X-ray was NOT assessed.",
        } satisfies ImagingResult,
      };
    }

    const form = new FormData();
    form.append("file", blob, "xray.jpg");

    // Same auth pattern as the EHR Space: INFERENCE_API_TOKEN, not HF_TOKEN.
    // Do NOT set Content-Type — fetch must set the multipart boundary itself.
    const headers: Record<string, string> = {};
    if (process.env.CHESTVISION_INFERENCE_TOKEN) {
      headers.Authorization = `Bearer ${process.env.INFERENCE_API_TOKEN}`;
    }

    const res = await fetch(`${process.env.CHESTVISION_ENDPOINT!.replace(/\/$/, "")}/predict`, {
      method: "POST",
      headers,
      body: form,
    });

    if (!res.ok) {
      return {
        imaging: {
          model: "ViT-B/16 (NIH ChestX-ray14)",
          labels: [],
          topFindings: [],
          note: `Imaging model unavailable (${res.status}). Your X-ray was NOT assessed — this is not a negative result.`,
        } satisfies ImagingResult,
      };
    }

    const raw = (await res.json()) as {
      findings?: Array<{ label: string; probability: number; predicted?: number }>;
      labels?: Record<string, number>;
    };

    const labels = raw.findings
      ? raw.findings.map((f) => ({ pathology: f.label, probability: f.probability }))
      : Object.entries(raw.labels ?? {}).map(([pathology, probability]) => ({ pathology, probability }));

    labels.sort((a, b) => b.probability - a.probability);

    // Prefer the Space's tuned-threshold flags over a flat 0.5 cut, same as the EHR node.
    const topFindings = raw.findings
      ? raw.findings.filter((f) => f.predicted === 1).map((f) => f.label)
      : labels.filter((l) => l.probability >= 0.5).map((l) => l.pathology);

    return {
      imaging: {
        model: "ViT-B/16 (NIH ChestX-ray14, 14 labels)",
        labels: labels.slice(0, 5),
        topFindings,
        note:
          topFindings.length === 0
            ? "Nothing exceeded the tuned decision threshold. This does NOT exclude disease — recall on rare labels is known to be poor."
            : "Screening signals only. Not a radiological report.",
      } satisfies ImagingResult,
    };
  } catch (err) {
    // Network failure (DNS, timeout, connection refused) — degrade, don't abort.
    // The note must NOT read as reassurance: a failed X-ray read is not a clear X-ray.
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

/** Decode a "data:image/...;base64,..." URL into a Blob for multipart upload. */
function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  
  const [, mime, b64] = match;

  if (!mime || !b64) return null;

  return new Blob([Buffer.from(b64, "base64")], { type: mime });
}

/* ================================================================== */
/* Hybrid EHR — tabular MLP + BioClinical-ModernBERT-large             */
/* ================================================================== */
export async function ehrNode(state: HealthPilotState) {
  if (!state.hpi) return {};

  // Build the two inputs server.py's /predict expects:
  //   note     : SOAP note generated to MATCH the training distribution (llama-3.1-8b,
  //              same system prompt as the notebook) — see noteGenerator.ts for why this
  //              matters. A style mismatch here weakens the text branch and lets the
  //              tabular branch dominate into base-rate predictions.
  //   features : dict of tabular values (server maps + reindexes + 0-fills).
  const note = await generateSoapNote(state.hpi);
  const features = buildTabularFeatures(state.hpi);

  try {
    // NOTE: the EHR Space auth token is INFERENCE_API_TOKEN (set in server.py), NOT your
    // HF_TOKEN. They're different secrets. If EHR_INFERENCE_TOKEN is unset we send no
    // Authorization header (works only if the Space runs with ALLOW_NO_AUTH=1).
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (process.env.EHR_INFERENCE_TOKEN) {
      headers.Authorization = `Bearer ${process.env.INFERENCE_API_TOKEN}`;
    }

    const res = await fetch(`${process.env.EHR_ENDPOINT!.replace(/\/$/, "")}/predict`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        features,
        note,
        top_k: 8, // server sorts by probability desc; we only surface the top few
      }),
    });

    if (!res.ok) {
      return {
        ehr: {
          model: "Hybrid MLP + BioClinical-ModernBERT-large",
          riskScores: [],
          medicationFlags: [],
          note:
            res.status === 401
              ? "EHR model auth failed (401). Check EHR_INFERENCE_TOKEN matches the Space's INFERENCE_API_TOKEN."
              : res.status === 503
                ? "EHR model still warming up or busy (503). Assessment proceeds without it."
                : `EHR model unavailable (${res.status}). Check EHR_ENDPOINT points at the *.hf.space root.`,
        } satisfies EhrResult,
      };
    }

    // server.py returns { conditions: [{ label, probability, threshold, predicted }] }.
    const raw = (await res.json()) as {
      conditions: Array<{ label: string; probability: number; threshold: number; predicted: number }>;
    };

    // Surface conditions the model flagged above their TUNED threshold first (predicted===1),
    // then fall back to the strongest sub-threshold signals. The tuned threshold matters —
    // your notebook did per-label threshold optimisation, so `predicted` is more meaningful
    // than a flat 0.5 cut.
    const conditions = raw.conditions ?? [];
    const flagged = conditions.filter((c) => c.predicted === 1);
    const chosen = (flagged.length ? flagged : conditions.slice(0, 5));

    return {
      ehr: {
        model: "Hybrid MLP + BioClinical-ModernBERT-large",
        riskScores: chosen.map((c) => ({ outcome: c.label, probability: c.probability })),
        medicationFlags: [],
        note: flagged.length
          ? "Conditions flagged above their individually-tuned decision thresholds. Risk priors, not a diagnosis."
          : "No condition crossed its tuned threshold; showing strongest signals only. Not a diagnosis.",
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


/**
 * Structured tabular features the patient disclosed, keyed for server-side mapping.
 *
 * Verified against model_metadata.pkl (80 features). Key facts that shape this:
 *  - Direct demographic columns: AGE, IS_FEMALE (both real column names).
 *  - Vitals/labs go under _vitals; the server maps them to the right *_hist_last column
 *    (there is NO Systolic..._recent, so a reported BP fills the historical-last slot).
 *  - Medications go under _medications; server maps to the 6 rx_* class flags that exist.
 *  - Allergies under _allergies; only "shellfish" maps (allergy_Shellfish allergy is the
 *    ONLY allergy column). Everything else still appears in the note.
 *  - PMH is deliberately NOT here: there are no hx_* columns. Past history reaches the
 *    model ONLY through the SOAP note's text branch. (So the note carrying PMH well
 *    is not cosmetic — it's the entire PMH signal path.)
 *  - Race/ethnicity are real one-hot columns; send them if the patient volunteers.
 */
function buildTabularFeatures(hpi: HPI): Record<string, unknown> {
  const p = hpi.patientProfile;
  const feats: Record<string, unknown> = {};

  // Direct columns (exact metadata names).
  if (p.ageYears !== null) feats.AGE = p.ageYears;
  if (p.sex !== null) feats.IS_FEMALE = p.sex === "female" ? 1 : 0;

  // Vitals/labs -> server maps each to its *_hist_last / recent column.
  const vitals: Record<string, number> = {};
  if (p.bmi !== null) vitals.bmi = p.bmi;
  if (p.systolicBP !== null) vitals.systolicBP = p.systolicBP;
  if (p.hba1c !== null) vitals.hba1c = p.hba1c;
  if (p.totalCholesterol !== null) vitals.totalCholesterol = p.totalCholesterol;
  if (Object.keys(vitals).length) feats._vitals = vitals;

  // Raw lists for server-side mapping. NOT _pmh — no tabular columns exist for it.
  feats._medications = hpi.medications;
  feats._allergies = hpi.allergies;

  // Real one-hot demographic columns — send only if volunteered.
  if (p.race !== null) feats._race = p.race;
  if (p.ethnicity !== null) feats._ethnicity = p.ethnicity;

  return feats;
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