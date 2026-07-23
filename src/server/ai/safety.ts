import { URGENCY_LADDER, type Urgency, type HPI, type Analysis } from "./validator";

/**
 * NARROW SAFETY BACKSTOP
 * ======================
 * This layer used to override the diagnostic models on any mention of "chest pain",
 * which defeated the point of the system: the analyser would correctly reason that a
 * 2-year intermittent pattern is not acute, diagnose stable angina, and then get
 * overridden to 999 anyway. That makes the output incoherent AND makes triage accuracy
 * unmeasurable in evaluation, because the rules decide everything.
 *
 * HealthPilot is a DIAGNOSIS-AND-TRIAGE research system. The models are the decision
 * makers. This layer now fires ONLY for presentations where no diagnostic reasoning could
 * responsibly conclude anything other than "emergency" — the cases where the patient is
 * describing an event in progress, not a condition to be diagnosed.
 *
 * Everything else — including chest pain — is the analyser's call.
 */

export interface SafetyRule {
  id: string;
  floor: Urgency;
  reason: string;
  matches: (text: string) => boolean;
}

const kw = (...terms: string[]) => (text: string) => terms.some((t) => text.includes(t));

/**
 * Rules describe EVENTS IN PROGRESS, not diagnoses. Each one is something where waiting
 * for a model's opinion would itself be the error.
 */
export const SAFETY_RULES: SafetyRule[] = [
  {
    id: "UNRESPONSIVE",
    floor: "EMERGENCY_999",
    reason: "Someone is unresponsive or cannot be woken",
    matches: kw(
      "unresponsive", "won't wake", "wont wake", "can't wake", "cant wake",
      "not breathing", "unconscious", "collapsed and", "passed out and won't",
    ),
  },
  {
    id: "STROKE_FAST",
    floor: "EMERGENCY_999",
    reason: "Possible stroke in progress (FAST positive)",
    matches: (t) =>
      kw("face droop", "facial droop", "face has dropped")(t) ||
      (kw("sudden")(t) && kw("slurred speech", "can't speak", "cannot speak", "arm weakness", "one side", "numbness on one")(t)),
  },
  {
    id: "ANAPHYLAXIS",
    floor: "EMERGENCY_999",
    reason: "Possible anaphylaxis",
    matches: (t) =>
      kw("anaphyla", "throat closing", "throat is closing", "tongue swelling", "tongue is swelling")(t),
  },
  {
    id: "SEVERE_BLEEDING",
    floor: "EMERGENCY_999",
    reason: "Severe uncontrolled bleeding",
    matches: kw(
      "won't stop bleeding", "wont stop bleeding", "uncontrolled bleeding",
      "bleeding heavily", "vomiting blood", "coughing up blood",
    ),
  },
  {
    id: "CANNOT_BREATHE",
    floor: "EMERGENCY_999",
    reason: "Severe respiratory distress in progress",
    matches: kw(
      "can't breathe", "cant breathe", "cannot breathe", "struggling to breathe",
      "gasping", "blue lips", "turning blue",
    ),
  },
  {
    id: "SELF_HARM_INTENT",
    floor: "EMERGENCY_999",
    reason: "Immediate risk of self-harm",
    matches: kw("kill myself", "end my life", "going to hurt myself", "suicidal"),
  },
];

export const rank = (u: Urgency) => URGENCY_LADDER.indexOf(u);

export interface SafetyVerdict {
  floor: Urgency;
  firedRules: SafetyRule[];
}

/**
 * Compute the hard floor. Runs on the patient's own words — deliberately NOT on the
 * analyser's output, so a model cannot talk itself out of an in-progress emergency.
 */
export function evaluateSafetyFloor(
  hpi: HPI | null,
  _analysis: Analysis | null,
  transcript: string,
): SafetyVerdict {
  const haystack = [transcript, hpi ? JSON.stringify(hpi) : ""].join(" ").toLowerCase();

  const fired = SAFETY_RULES.filter((r) => r.matches(haystack));
  const floor = fired.reduce<Urgency>(
    (acc, r) => (rank(r.floor) > rank(acc) ? r.floor : acc),
    "SELF_CARE",
  );
  return { floor, firedRules: fired };
}

/**
 * INSUFFICIENT-DATA ESCALATION
 *
 * Separate from the emergency rules, and the ONLY other reason to override the models.
 * If intake could not gather enough to run a meaningful diagnosis, we must not present a
 * confident-looking low-urgency result. We escalate to clinician contact AND say plainly
 * that the escalation is because of missing information, not because of a finding.
 */
export function insufficientDataFloor(opts: {
  intakeSufficient: boolean;
  analysisUsable: boolean;
}): { floor: Urgency; reason: string | null } {
  if (opts.intakeSufficient && opts.analysisUsable) {
    return { floor: "SELF_CARE", reason: null }; // no floor imposed
  }
  if (!opts.analysisUsable) {
    return {
      floor: "NHS_111",
      reason:
        "The diagnostic models could not complete an assessment, so this recommendation " +
        "is based on incomplete analysis rather than on a clinical finding.",
    };
  }
  return {
    floor: "NHS_111",
    reason:
      "Not enough information was gathered to run a reliable assessment, so this " +
      "recommendation is cautious by default rather than based on a diagnosis.",
  };
}

/** The models may escalate above the floor. They may never go below it. */
export function applyFloor(
  modelUrgency: Urgency,
  floor: Urgency,
): { urgency: Urgency; overridden: boolean } {
  if (rank(modelUrgency) >= rank(floor)) {
    return { urgency: modelUrgency, overridden: false };
  }
  return { urgency: floor, overridden: true };
}