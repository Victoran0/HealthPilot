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

  /**
   * Structured fields the hybrid EHR model's TABULAR branch needs. The recipient fills
   * these as the patient reveals them; `null` means "not yet asked / not provided".
   * The intake gate (isReadyForDiagnosis) checks these directly — this is what tells
   * the graph whether it has enough to actually run the model, vs. needing another
   * inquirer round.
   */
  patientProfile: z.object({
    ageYears: z.number().nullable(),
    sex: z.enum(["male", "female"]).nullable(),
    // Vitals/labs the patient may know. All optional — the model tolerates missing
    // values (trained with 0-fill), but we want to ASK for the common, high-signal ones.
    bmi: z.number().nullable(),
    systolicBP: z.number().nullable(),
    hba1c: z.number().nullable(),
    totalCholesterol: z.number().nullable(),
    smoker: z.boolean().nullable(),
    // Real one-hot features in the model (RACE_white/black, ETHNICITY_*). Only collect if
    // the patient volunteers — never infer. null when unstated.
    race: z.enum(["white", "black"]).nullable(),
    ethnicity: z.enum(["french", "italian", "chinese", "african", "german"]).nullable(),
  }),

  /**
   * Does the presentation involve cardiovascular / respiratory features that would make
   * a chest X-ray informative? Only then does the inquirer request one and only then
   * does chestVision run. Set by the recipient from the symptom picture.
   */
  cardioRespRelevant: z.boolean(),
});
export type HPI = z.infer<typeof HPISchema>;

/** InquirerAgent output (q_t). */
export const InquirySchema = z.object({
  /** null => the inquirer believes intake is complete. */
  question: z.string().nullable(),
  rationale: z.string().default(""),
  /**
   * Artefacts to request this round. Defaulted to [] because Groq's JSON mode sometimes
   * omits empty arrays entirely — without the default the node crashes on undefined.
   */
  requestedArtifacts: z
    .array(z.enum(["CHEST_XRAY", "ECG", "BLOODS", "ECHO", "NONE"]))
    .default([]),
  intakeComplete: z.boolean().default(false),
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

/** MedGemma analyser node — the diagnostic assessment. */
export const AnalysisSchema = z.object({
  understanding: z.string(),
  /**
   * The leading diagnosis. This is the system's primary research output — Phase 7 scores
   * diagnostic accuracy against this field, so it must always be populated. When the
   * evidence genuinely cannot separate candidates, the analyser says so in `reasoning`
   * and lists them in `differentiatedFrom` rather than leaving this blank.
   */
  primaryAssessment: z.object({
    condition: z.string(),
    probability: z.number().min(0).max(1),
    reasoning: z.string(),
    /** Conditions actively considered and ranked below the primary. */
    differentiatedFrom: z.array(z.string()),
  }),
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
  /**
   * The diagnostic result, carried through to the UI so it can be rendered as a distinct
   * card alongside the urgency banner. Copied from Analysis.primaryAssessment — the
   * triage LLM phrases it but cannot change it.
   */
  diagnosis: z
    .object({
      condition: z.string(),
      probability: z.number().min(0).max(1),
      confidence: z.enum(["HIGH", "MODERATE", "LOW"]),
      differentials: z.array(z.string()),
    })
    .nullable(),
});
export type TriageDecision = z.infer<typeof TriageDecisionSchema>;