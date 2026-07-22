/**
 * test_analyser.ts
 * ================
 * Two tests for the MedGemma-27B analyser, mirroring your working Python script.
 *
 *   npx tsx --env-file=.env src/server/ai/test_analyser.ts
 *
 * TEST 1 — raw connectivity: the exact equivalent of your Python chat_completion call.
 *          Confirms featherless-ai serves google/medgemma-27b-text-it conversationally.
 * TEST 2 — the REAL analyser: your ANALYSER_SYSTEM prompt + a realistic evidence bundle,
 *          then parse + Zod-validate the result exactly as analyserNode does. This is the
 *          one that tells you whether the diagnostic node actually works end to end.
 *
 * Env needed: HF_TOKEN   (and optionally HF_PROVIDER, defaults to featherless-ai)
 */
import { InferenceClient } from "@huggingface/inference";
import { ANALYSER_SYSTEM } from "./prompts";
import { AnalysisSchema } from "./validator";

const HF_TOKEN = process.env.HF_TOKEN;
const PROVIDER = (process.env.HF_PROVIDER ?? "featherless-ai") as never;
const MODEL = "google/medgemma-27b-text-it";

if (!HF_TOKEN) {
  console.error("HF_TOKEN not set. Put it in .env and run with --env-file=.env");
  process.exit(1);
}

const hf = new InferenceClient(HF_TOKEN);

/* ------------------------------------------------------------------ */
/* TEST 1 — raw connectivity (direct port of your Python script)       */
/* ------------------------------------------------------------------ */
async function testConnectivity() {
  console.log(`\n=== TEST 1: connectivity (${MODEL} via ${PROVIDER}) ===\n`);

  const stream = hf.chatCompletionStream({
    model: MODEL,
    provider: PROVIDER,
    messages: [
      {
        role: "system",
        content:
          "You are an advanced clinical AI assistant. Analyze the symptoms provided, " +
          "offer structured differential considerations, and state standard medical triage steps. " +
          "Always append a clear disclaimer that you are an AI and not a substitute for a real doctor.",
      },
      { role: "user", content: "Patient reports headache for 3 days with a fever of 38.5C." },
    ],
    max_tokens: 450,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) process.stdout.write(delta);
  }
  console.log("\n\n[TEST 1 passed — provider serves this model conversationally]\n");
}

/* ------------------------------------------------------------------ */
/* TEST 2 — the real analyser: prompt + evidence bundle + JSON parse   */
/* ------------------------------------------------------------------ */
// A realistic evidence bundle, shaped like the one analyser.ts builds from graph state.
const EVIDENCE_BUNDLE = `## STRUCTURED HISTORY OF PRESENT ILLNESS
{
  "chiefComplaint": "stabbing chest pain",
  "historyOfPresentIllness": "Intermittent stabbing chest pain for 2 years, episodes lasting days to weeks, most recent onset last night.",
  "symptoms": [{ "name": "chest pain", "onset": "last night", "duration": "recurrent over 2 years", "character": "stabbing", "severity": 6 }],
  "pastMedicalHistory": ["Chronic Obstructive Pulmonary Disease"],
  "medications": ["paracetamol", "ibuprofen", "salbutamol inhaler", "tiotropium", "nicotine patches"],
  "allergies": [],
  "patientProfile": { "ageYears": 57, "sex": "male", "smoker": true },
  "redFlagsIdentified": ["chest pain"],
  "candidateConditions": ["angina", "musculoskeletal chest pain", "COPD exacerbation", "GERD"]
}

## CHEST X-RAY
Not performed. Absence of imaging is NOT a negative finding. Do not treat it as reassurance.

## EHR / MEDICATION RISK MODEL (Hybrid MLP + BioClinical-ModernBERT-large)
Risk scores: Coronary Heart Disease 71.2%, Hypertension 40.1%, Chronic obstructive bronchitis 63.4%
Medication flags: none
Caveat: population-level priors, not individual predictions.

## RETRIEVED REFERENCE MATERIAL
[1] Stable angina (medical-encyclopaedia)
Chest pain triggered by exertion, relieved by rest, in patients with cardiovascular risk factors.

## TASK
Synthesise the above. Where the model outputs and the patient's history disagree, say so explicitly. Return the JSON object only.`;

function parseJsonBlock<T>(raw: string): T {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? raw).trim();
  const start = body.search(/[{[]/);
  if (start === -1) throw new Error("No JSON object found in model output");
  return JSON.parse(body.slice(start)) as T;
}

async function testAnalyser() {
  console.log(`\n=== TEST 2: real analyser (prompt + evidence + JSON parse) ===\n`);

  let full = "";
  const stream = hf.chatCompletionStream({
    model: MODEL,
    provider: PROVIDER,
    messages: [
      { role: "system", content: ANALYSER_SYSTEM },
      { role: "user", content: EVIDENCE_BUNDLE },
    ],
    max_tokens: 1536,
    temperature: 0.2,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) full += delta;
  }

  console.log("--- RAW OUTPUT ---\n");
  console.log(full);
  console.log("\n--- PARSE + VALIDATE ---\n");

  try {
    const parsed = parseJsonBlock<unknown>(full);
    const analysis = AnalysisSchema.parse(parsed);
    console.log("Zod validation PASSED. The analyser node would accept this.\n");
    console.log("Leading diagnosis :", analysis.primaryAssessment.condition,
      `(${(analysis.primaryAssessment.probability * 100).toFixed(0)}%, ${analysis.confidence})`);
    console.log("Suggested urgency :", analysis.suggestedUrgency);
    console.log("Red flags         :", analysis.redFlags.join(", ") || "none");
    console.log("Differentials     :", analysis.primaryAssessment.differentiatedFrom.join(", ") || "none");
  } catch (err) {
    console.error("PARSE/VALIDATION FAILED — this is what would trip the analyser's");
    console.error("fail-safe fallback in production:\n");
    console.error(String(err));
  }
}

/* ------------------------------------------------------------------ */
async function main() {
  try {
    await testConnectivity();
  } catch (err) {
    console.error("\n[TEST 1 FAILED]", String(err));
    console.error("If this says a task/provider isn't supported, fix HF_PROVIDER.\n");
    return; // no point running test 2 if connectivity is broken
  }

  try {
    await testAnalyser();
  } catch (err) {
    console.error("\n[TEST 2 FAILED]", String(err));
  }
}

main();