import { ChatGroq } from "@langchain/groq";
import { InferenceClient } from "@huggingface/inference";

/**
 * PER-TASK MODEL REGISTRY
 * =======================
 * One model per job, not one model for everything. Two reasons:
 *  1. Rate limits are per-model on Groq's free tier, so spreading tasks across models
 *     multiplies effective throughput — one task hitting its limit no longer takes down
 *     the whole agent.
 *  2. Tasks have different needs — structuring JSON, writing prose, and clinical-note
 *     generation are not the same workload.
 *
 * All gpt-oss right now (reliable tool-calling + jsonSchema). Swap any single line without
 * touching the nodes. AVOID reasoning/preview models (qwen3.6-27b) for STRUCTURED tasks —
 * they fail both jsonSchema (open-oss only) and tool-calling.
 */

function groq(
  model: string,
  opts: { temperature?: number; maxTokens?: number; reasoningEffort?: "none" | "default" | "low" | "medium" | "high" } = {},
) {
  return new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model,
    temperature: opts.temperature ?? 0.1,
    maxTokens: opts.maxTokens ?? 2048,
    // Qwen3 accepts "none"/"default"; gpt-oss accepts "low"/"medium"/"high". Only set it
    // when asked, so we don't send an unsupported value to a model that rejects it.
    ...(opts.reasoningEffort ? { reasoningEffort: opts.reasoningEffort } : {}),
  });
}

/* ------------------------------------------------------------------ */
/* Task-specific models. Env overrides let you retune without a deploy. */
/* ------------------------------------------------------------------ */

// export const conversationalLLM = new ChatOpenRouter({
//   apiKey: process.env.OPENROUTER_API_KEY,
//   model: "nvidia/nemotron-3-super-120b-a12b:free",
//   temperature: 0.1,
//   maxTokens: 2056,
// });

/** RecipientAgent — structures the HPI (large JSON schema). Needs reliable structured output. */
export const recipientLLM = groq("openai/gpt-oss-20b", {
  temperature: 0.1,
  maxTokens: 2048,
});

/** InquirerAgent — one discriminating question (small JSON). Fast model is fine. */
export const inquirerLLM = groq("qwen/qwen3.6-27b", {
  temperature: 0.2,
  maxTokens: 1024,
  
  reasoningEffort: "none",
});

/** TriageAgent — patient-facing prose. Warmer, streamed. The ONLY patient-visible text. */
export const triageLLM = groq("qwen/qwen3.6-27b", {
  temperature: 0.3,
  maxTokens: 1024,
  reasoningEffort: "none",
});

/** Clinical SOAP note generation for the EHR text branch. Isolated rate limit so a note
 *  failure never blocks the interview. */
/** Clinical SOAP note generation — free-text prose, not structured, so a reasoning model
 *  is fine here and offloads work from the gpt-oss rate limits. reasoning_effort:"none"
 *  disables Qwen's reasoning tokens so they never leak into the note the encoder reads. */
export const noteLLM = groq("qwen/qwen3.6-27b", {
  temperature: 0.2,
  maxTokens: 512,
  reasoningEffort: "none",
});

/* ------------------------------------------------------------------ */
/* Backwards-compat aliases so existing imports keep working.          */
/* ------------------------------------------------------------------ */
export const conversationalLLM = recipientLLM;
export const patientVoiceLLM = triageLLM;

/* ------------------------------------------------------------------ */
/* MedGemma-27B — the primary diagnostic model, via HF (not Groq).     */
/* ------------------------------------------------------------------ */
const hf = new InferenceClient(process.env.HF_TOKEN);
export const MEDGEMMA_MODEL = "google/medgemma-27b-text-it";

export async function medgemmaStream(opts: {
  system: string;
  user: string;
  onToken?: (t: string) => void | Promise<void>;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  let full = "";
  const stream = hf.chatCompletionStream({
    model: MEDGEMMA_MODEL,
    // featherless-ai serves medgemma-27b conversationally (verified). Never "auto".
    provider: (process.env.HF_PROVIDER as never) ?? "featherless-ai",
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    max_tokens: opts.maxTokens ?? 1536,
    temperature: opts.temperature ?? 0.2,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) {
      full += delta;
      await opts.onToken?.(delta);
    }
  }
  return full;
}

export async function medgemmaComplete(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  return medgemmaStream(opts);
}

/** Strips markdown fences and parses. Throws on failure so the node can fail safe. */
export function parseJsonBlock<T>(raw: string): T {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? raw).trim();
  const start = body.search(/[{[]/);
  if (start === -1) throw new Error("No JSON object found in model output");
  return JSON.parse(body.slice(start)) as T;
}