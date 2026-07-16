import { URGENCY_LADDER, type Urgency, type HPI, type Analysis } from "./schemas";

/**
 * DETERMINISTIC SAFETY ESCALATION LAYER
 * =====================================
 * This is the one component in HealthPilot that an LLM cannot influence.
 *
 * In Cheng et al. the guidance mechanisms *advise* the DepartmentAgent — the LLM still
 * makes the final call. Here the relationship is inverted for the emergency band: these
 * rules are a hard floor. MedGemma can raise urgency above the floor; it can never lower it.
 *
 * Rules fire on the HPI and the analyser's red-flag list, NOT on the analyser's chosen
 * urgency — otherwise a confidently-wrong model could reason its way out of an escalation.
 */

export interface SafetyRule {
  id: string;
  /** Minimum urgency this rule enforces if it fires. */
  floor: Urgency;
  reason: string;
  matches: (text: string, hpi: HPI | null) => boolean;
}

const kw = (...terms: string[]) => (text: string) => terms.some((t) => text.includes(t));

export const SAFETY_RULES: SafetyRule[] = [
  {
    id: "ACS_CHEST_PAIN",
    floor: "EMERGENCY_999",
    reason: "Chest pain with features suggestive of acute coronary syndrome",
    matches: (t) =>
      kw("chest pain", "chest tightness", "chest pressure", "crushing chest")(t) &&
      kw("arm", "jaw", "sweat", "clammy", "nausea", "short of breath", "breathless", "radiat")(t),
  },
  {
    id: "CHEST_PAIN_ANY",
    floor: "NHS_111",
    reason: "Undifferentiated chest pain requires urgent assessment",
    matches: (t) => kw("chest pain", "chest tightness")(t),
  },
  {
    id: "STROKE_FAST",
    floor: "EMERGENCY_999",
    reason: "Possible stroke (FAST positive)",
    matches: (t) =>
      kw(
        "face droop", "facial droop", "slurred speech", "can't speak", "cannot speak",
        "arm weakness", "one-sided weakness", "sudden numbness", "sudden confusion",
        "sudden vision loss", "loss of vision",
      )(t),
  },
  {
    id: "SEVERE_BREATHLESSNESS",
    floor: "EMERGENCY_999",
    reason: "Severe respiratory distress",
    matches: (t) =>
      kw(
        "can't breathe", "cannot breathe", "struggling to breathe", "gasping",
        "blue lips", "cyanosis", "unable to speak in full sentences",
      )(t),
  },
  {
    id: "ANAPHYLAXIS",
    floor: "EMERGENCY_999",
    reason: "Possible anaphylaxis",
    matches: (t) =>
      kw("throat closing", "throat swelling", "tongue swelling", "anaphyla")(t) ||
      (kw("hives", "rash")(t) && kw("breathing", "swelling of the face", "wheeze")(t)),
  },
  {
    id: "SEPSIS",
    floor: "EMERGENCY_999",
    reason: "Possible sepsis",
    matches: (t) =>
      kw("sepsis", "septic")(t) ||
      (kw("fever", "temperature", "shivering", "rigors")(t) &&
        kw("confus", "mottled", "not passing urine", "very fast breathing", "blotchy", "rash that doesn't fade")(t)),
  },
  {
    id: "THUNDERCLAP_HEADACHE",
    floor: "EMERGENCY_999",
    reason: "Sudden severe headache — possible subarachnoid haemorrhage",
    matches: (t) =>
      kw("worst headache", "thunderclap", "sudden severe headache", "worst-ever headache")(t) ||
      (kw("headache")(t) && kw("sudden", "explosive")(t) && kw("vomit", "neck stiff", "photophob")(t)),
  },
  {
    id: "SEVERE_BLEEDING",
    floor: "EMERGENCY_999",
    reason: "Severe or uncontrolled bleeding",
    matches: (t) =>
      kw("heavy bleeding", "uncontrolled bleeding", "won't stop bleeding", "vomiting blood", "coughing up blood")(t),
  },
  {
    id: "LOSS_OF_CONSCIOUSNESS",
    floor: "A_AND_E",
    reason: "Syncope or loss of consciousness",
    matches: (t) => kw("passed out", "fainted", "blacked out", "lost consciousness", "unconscious", "syncope")(t),
  },
  {
    id: "SUICIDAL_IDEATION",
    floor: "EMERGENCY_999",
    reason: "Risk of self-harm — immediate support required",
    matches: (t) => kw("kill myself", "end my life", "suicidal", "want to die", "self-harm")(t),
  },
  {
    id: "PAEDIATRIC_FEVER",
    floor: "NHS_111",
    reason: "Fever in an infant under 3 months",
    matches: (t, hpi) => {
      const age = extractAgeMonths(hpi);
      return age !== null && age < 3 && kw("fever", "temperature")(t);
    },
  },
  {
    id: "PREGNANCY_BLEEDING",
    floor: "A_AND_E",
    reason: "Bleeding or severe abdominal pain in pregnancy",
    matches: (t) => kw("pregnan")(t) && kw("bleeding", "severe abdominal pain", "severe pain")(t),
  },
];

function extractAgeMonths(hpi: HPI | null): number | null {
  if (!hpi) return null;
  const blob = JSON.stringify(hpi).toLowerCase();
  const m = blob.match(/(\d+)\s*(?:month|week)s?\s*old/);
  if (!m) return null;
  const n = Number(m[1]);
  return blob.includes("week") ? Math.floor(n / 4) : n;
}

export interface SafetyVerdict {
  floor: Urgency;
  firedRules: SafetyRule[];
}

/** Compute the hard urgency floor from the HPI, the transcript and the analyser's red flags. */
export function evaluateSafetyFloor(
  hpi: HPI | null,
  analysis: Analysis | null,
  transcript: string,
): SafetyVerdict {
  const haystack = [
    transcript,
    hpi ? JSON.stringify(hpi) : "",
    analysis ? JSON.stringify(analysis.redFlags) + analysis.understanding : "",
  ]
    .join(" ")
    .toLowerCase();

  const fired = SAFETY_RULES.filter((r) => r.matches(haystack, hpi));
  const floor = fired.reduce<Urgency>(
    (acc, r) => (rank(r.floor) > rank(acc) ? r.floor : acc),
    "SELF_CARE",
  );
  return { floor, firedRules: fired };
}

export const rank = (u: Urgency) => URGENCY_LADDER.indexOf(u);

/** The LLM may escalate above the floor. It may never go below it. */
export function applyFloor(
  llmUrgency: Urgency,
  floor: Urgency,
): { urgency: Urgency; overridden: boolean } {
  if (rank(llmUrgency) >= rank(floor)) {
    return { urgency: llmUrgency, overridden: false };
  }
  return { urgency: floor, overridden: true };
}