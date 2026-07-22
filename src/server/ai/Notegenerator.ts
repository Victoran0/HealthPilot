import { noteLLM } from "./llm";
import type { HPI } from "./validator";

/**
 * Clinical note generation for the EHR model's TEXT branch.
 *
 * CRITICAL: the hybrid model's BioClinical-ModernBERT encoder was trained on notes written
 * by llama-3.1-8b using a SPECIFIC system prompt (notebook cells 37 + 39). If the inference
 * note style drifts from that distribution, the text-branch embedding is weak, the tabular
 * branch dominates, and thin-data patients collapse to base-rate predictions (the exact
 * failure seen on the ankle-sprain / sore-throat test cases).
 *
 * So we reproduce the training pipeline at inference: same SYSTEM_PROMPT, same user-prompt
 * structure (build_patient_prompt), same model family, same low temperature. This is not a
 * stylistic nicety — it is what makes the text branch actually contribute.
 */

// VERBATIM from notebook cell 39. Do not paraphrase — the encoder learned this style.
const SYSTEM_PROMPT =
  "You are a Clinical Informatics Specialist. Your task is to synthesize structured data " +
  "into a high-density SOAP note for downstream NLP extraction. " +
  "1. TERMINOLOGY: Use standard clinical shorthand (e.g., PMH, NKDA, WNL, HTN, DM2). " +
  "2. HEALTHY PATIENTS: If a patient has no documented chronic conditions and labs are " +
  "within normal limits, explicitly state 'No acute clinical concerns' in the Assessment. " +
  "3. SPARSE DATA: If a section is empty, do not say 'None'; use 'Unremarkable', 'Non-contributory', " +
  "or 'Routine health maintenance' to provide clinical context. " +
  "4. SYNTHESIS: Critically evaluate laboratory/vital signs. If labs are abnormal but not listed " +
  "in the history, include the clinical impression in the 'Assessment' section. " +
  "5. FORMAT: Output plain text only. No markdown, no bolding, no headers like '###'. " +
  "Use a single line break between SOAP sections.";

// NOTE: training notes were generated with llama-3.1-8b, but Groq deprecated that model
// (June 2026). noteLLM (gpt-oss-20b in the registry) is the closest available substitute.
// This is a real train/inference distribution gap — if EHR text-branch quality drops,
// that mismatch is the first suspect. See llm.ts to retune the note model.

/**
 * Build the user prompt in the SAME shape as the notebook's build_patient_prompt().
 * We only have what the patient told us — but the STRUCTURE (Demographics / PMH / Meds /
 * Allergies / Labs / Procedures + the S/O/A/P instructions) must match training.
 */
function buildPatientPrompt(hpi: HPI): string {
  const p = hpi.patientProfile;

  const demo =
    p.ageYears !== null && p.sex !== null
      ? `${Math.round(p.ageYears)}yo ${p.sex}${p.race ? `, ${p.race}` : ""}`
      : "adult, demographics not stated";

  const pmh = hpi.pastMedicalHistory.length ? hpi.pastMedicalHistory.join("; ") : "Non-contributory";
  const meds = hpi.medications.length ? hpi.medications.join("; ") : "No active medications";
  const allergies = hpi.allergies.length ? hpi.allergies.join("; ") : "NKDA";

  const labLines: string[] = [];
  if (p.bmi !== null) labLines.push(`Body Mass Index: ${p.bmi} kg/m2`);
  if (p.systolicBP !== null) labLines.push(`Systolic Blood Pressure: ${p.systolicBP} mmHg`);
  if (p.hba1c !== null) labLines.push(`Hemoglobin A1c: ${p.hba1c} %`);
  if (p.totalCholesterol !== null) labLines.push(`Total Cholesterol: ${p.totalCholesterol} mg/dL`);
  const labs = labLines.length ? labLines.map((l) => "  " + l).join("\n") : "Vitals and labs unremarkable";

  // The presenting complaint is HealthPilot-specific (the training data was EHR follow-ups,
  // not acute presentations) — we fold it into the S: guidance so the note reflects why the
  // patient is actually here, while keeping the trained structure.
  const symptomSummary = hpi.symptoms
    .map((s) =>
      [s.name, s.onset && `onset ${s.onset}`, s.duration && `for ${s.duration}`, s.severity != null && `severity ${s.severity}/10`]
        .filter(Boolean)
        .join(", "),
    )
    .join("; ");

  const isHealthy = hpi.pastMedicalHistory.length === 0 && hpi.medications.length === 0 && labLines.length === 0;

  return `Generate a professional SOAP note for the following patient data:

PATIENT DATA:
- Demographics: ${demo}
- Presenting complaint: ${hpi.chiefComplaint}${symptomSummary ? ` (${symptomSummary})` : ""}
- PMH: ${pmh}
- Meds: ${meds}
- Allergies: ${allergies}
- Labs/Vitals:
${labs}
- Procedures: None

INSTRUCTIONS:
- S: Summarize demographics, the presenting complaint, and history.
- O: List objective findings.
- A: Assessment. ${
    isHealthy
      ? 'If no acute concern is evident, state "No acute clinical concerns".'
      : "Synthesize findings. If labs (like BP or BMI) are abnormal, list the clinical impression here."
  }
- P: Note 'Continue current management' or specific follow-ups.
- Keep the total length under 250 words for optimal BERT encoding.`;
}

/**
 * Generate the SOAP note via Groq, matching the training distribution.
 * Falls back to a deterministic template ONLY if the LLM call fails — a degraded note is
 * better than no EHR inference, and the tabular branch still runs.
 */
export async function generateSoapNote(hpi: HPI): Promise<string> {
  try {
    const res = await noteLLM.invoke([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildPatientPrompt(hpi) },
    ]);
    const raw = typeof res.content === "string" ? res.content : "";
    const note = stripReasoning(raw).trim();
    if (note.length > 20) return note;
    throw new Error("Empty note from LLM");
  } catch (err) {
    console.error("[HealthPilot] SOAP note generation failed, using template fallback:", err);
    return templateFallback(hpi);
  }
}

/**
 * Safety net for reasoning models. reasoning_effort:"none" should prevent this, but if a
 * Qwen preview build leaks a <think>...</think> block anyway, it must not end up in the
 * note the BioClinical encoder reads. Strip the wrapper and keep the answer after it.
 */
function stripReasoning(text: string): string {
  // Remove a <think>...</think> block if present.
  let out = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  // If an opening tag was emitted without a close (truncation), drop everything up to the
  // last recognisable SOAP start.
  if (/<think>/i.test(out)) {
    const soapStart = out.search(/S:\s/);
    if (soapStart !== -1) out = out.slice(soapStart);
  }
  return out;
}

/** Deterministic fallback. Structurally similar, but not the trained distribution. */
function templateFallback(hpi: HPI): string {
  const p = hpi.patientProfile;
  const demo = p.ageYears !== null && p.sex !== null ? `${Math.round(p.ageYears)}yo ${p.sex}` : "adult";
  const pmh = hpi.pastMedicalHistory.length ? hpi.pastMedicalHistory.join("; ") : "Non-contributory";
  const meds = hpi.medications.length ? hpi.medications.join("; ") : "No active medications";
  const allergies = hpi.allergies.length ? hpi.allergies.join("; ") : "NKDA";
  return [
    `S: ${demo} presents with ${hpi.chiefComplaint}. ${hpi.historyOfPresentIllness} PMH: ${pmh}. Meds: ${meds}. ${allergies}.`,
    `O: Vitals and labs unremarkable.`,
    `A: ${hpi.chiefComplaint}; ${hpi.candidateConditions.join(", ") || "assessment in progress"}.`,
    `P: Routine health maintenance and follow-up.`,
  ].join("\n");
}