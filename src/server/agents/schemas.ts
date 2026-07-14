import { z } from "zod";

/** Urgency ladder. Ordered — index is the severity rank. */
export const URGENCY_LADDER = [
  "SELF_CARE",
  "PHARMACIST",
  "GP_ROUTINE",
  "GP_URGENT",
  "NHS_111",
  "A_AND_E",
  "EMERGENCY_999",
] as const;
export type Urgency = (typeof URGENCY_LADDER)[number];
export const UrgencyEnum = z.enum(URGENCY_LADDER);

/** RecipientAgent output — the structured History of Present Illness (H_t). */
export const HPISchema = z.object({
  chiefComplaint: z.string(),
  historyOfPresentIllness: z.string(),
  symptoms: z.array(
    z.object({
      name: z.string(),
      onset: z.string().nullable(),
      duration: z.string().nullable(),
      severity: z.number().min(0).max(10).nullable(),
      character: z.string().nullable(),
      radiation: z.string().nullable(),
      aggravating: z.string().nullable(),
      relieving: z.string().nullable(),
    }),
  ),
  relevantNegatives: z.array(z.string()),
  pastMedicalHistory: z.array(z.string()),
  medications: z.array(z.string()),
  allergies: z.array(z.string()),
  familyHistory: z.array(z.string()),
  socialHistory: z.array(z.string()),
  availableImaging: z.array(z.string()),
  availableLabs: z.array(z.string()),
  redFlagsIdentified: z.array(z.string()),
  informationStillNeeded: z.array(z.string()),
  intakeConfidence: z.enum(["HIGH", "MODERATE", "LOW"]),
  /** Candidate condition families the InquirerAgent should try to separate (≈ d̂_t). */
  candidateConditions: z.array(z.string()),
});
export type HPI = z.infer<typeof HPISchema>;

/** InquirerAgent output (q_t). */
export const InquirySchema = z.object({
  /** null => the inquirer believes intake is complete. */
  question: z.string().nullable(),
  rationale: z.string(),
  /** Artefacts to request from the patient this round, e.g. a chest X-ray upload. */
  requestedArtifacts: z.array(z.enum(["CHEST_XRAY", "ECG", "BLOODS", "ECHO", "NONE"])),
  intakeComplete: z.boolean(),
});
export type Inquiry = z.infer<typeof InquirySchema>;

/** ChestVision node. */
export const ImagingResultSchema = z.object({
  model: z.string(),
  labels: z.array(z.object({ pathology: z.string(), probability: z.number() })),
  topFindings: z.array(z.string()),
  note: z.string(),
});
export type ImagingResult = z.infer<typeof ImagingResultSchema>;

/** Hybrid EHR / medication node. */
export const EhrResultSchema = z.object({
  model: z.string(),
  riskScores: z.array(z.object({ outcome: z.string(), probability: z.number() })),
  medicationFlags: z.array(z.string()),
  note: z.string(),
});
export type EhrResult = z.infer<typeof EhrResultSchema>;

/** RAG (Orama + Gemini embeddings over medical encyclopaedia). */
export const RagResultSchema = z.object({
  query: z.string(),
  passages: z.array(
    z.object({ title: z.string(), snippet: z.string(), score: z.number(), source: z.string() }),
  ),
});
export type RagResult = z.infer<typeof RagResultSchema>;

/** MedGemma analyser node — the diagnostic verdict. */
export const AnalysisSchema = z.object({
  understanding: z.string(),
  considerations: z.array(
    z.object({
      condition: z.string(),
      likelihood: z.enum(["LIKELY", "POSSIBLE", "UNLIKELY", "CANNOT_EXCLUDE"]),
      supportingEvidence: z.array(z.string()),
      contradictingEvidence: z.array(z.string()),
    }),
  ),
  redFlags: z.array(z.string()),
  /** The LLM's *advisory* urgency. The deterministic safety layer may override it upward. */
  suggestedUrgency: UrgencyEnum,
  reasoning: z.string(),
  confidence: z.enum(["HIGH", "MODERATE", "LOW"]),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

/** Final triage output shown to the patient. */
export const TriageDecisionSchema = z.object({
  urgency: UrgencyEnum,
  headline: z.string(),
  actions: z.array(z.string()),
  safetyNetting: z.array(z.string()),
  overriddenByRules: z.boolean(),
  overrideReason: z.string().nullable(),
  patientMessage: z.string(),
});
export type TriageDecision = z.infer<typeof TriageDecisionSchema>;
