import { ChatGroq } from "@langchain/groq";
import { HfInference } from "@huggingface/inference";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

/** Structuring models (Recipient, Inquirer). These stream JSON — never surface their tokens. */
export const conversationalLLM = new ChatGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
    model: "gemini-3.5-Flash",
    temperature: 0.1,
    maxRetries: 2,
    // other params...
})



/** The ONLY model whose tokens are allowed to reach the patient. Tagged in triage.ts. */
export const patientVoiceLLM = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: "llama-3.1-8b-instant",
  temperature: 0.3,
  maxTokens: 1024,
});

const hf = new HfInference(process.env.HF_TOKEN);
export const MEDGEMMA_MODEL = "google/medgemma-27b-text-it";

/**
 * MedGemma-27B, streaming.
 *
 * The HF SDK is not a LangChain Runnable, so LangGraph's streamEvents will never see
 * inside it. `onToken` is how we bridge that gap — the analyser node forwards each
 * token out as a custom event.
 */
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
    // Valid providers include: hf-inference, groq, together, fireworks-ai, nscale,
    // novita, replicate, cerebras, deepinfra, ... "nebius" is NOT valid (that error you
    // saw). "auto" lets HF pick a provider that actually serves this model — safest
    // default. Pin a specific one only if you know it serves google/medgemma-27b-text-it.
    provider: (process.env.HF_PROVIDER as never) ?? "auto",
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

/** Non-streaming variant, used by the analyser node (its output is JSON, not prose). */
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