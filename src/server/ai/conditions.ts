/**
 * The 28 conditions the hybrid EHR model predicts, verbatim from model_metadata.pkl
 * (target_conditions). The EHR node returns a subset of these as riskScores; the analyser
 * uses this list to understand that the model's output space is LIMITED — a condition not
 * in this list simply cannot be scored by the EHR model, and its absence from the scores
 * is not evidence of anything.
 */
export const EHR_TARGET_CONDITIONS = [
  "Viral sinusitis (disorder)",
  "Acute viral pharyngitis (disorder)",
  "Prediabetes",
  "Acute bronchitis (disorder)",
  "Hypertension",
  "Chronic sinusitis (disorder)",
  "Otitis media",
  "Normal pregnancy",
  "Streptococcal sore throat (disorder)",
  "Stroke",
  "Sprain of ankle",
  "Coronary Heart Disease",
  "Polyp of colon",
  "Diabetes",
  "Osteoporosis (disorder)",
  "History of appendectomy",
  "Appendicitis",
  "Sinusitis (disorder)",
  "Acute bacterial sinusitis (disorder)",
  "History of cardiac arrest (situation)",
  "Cardiac Arrest",
  "Osteoarthritis of knee",
  "History of single seizure (situation)",
  "Seizure disorder",
  "Chronic obstructive bronchitis (disorder)",
  "Concussion with no loss of consciousness",
  "Suspected lung cancer (situation)",
  "Neuropathy due to type 2 diabetes mellitus (disorder)",
] as const;

/**
 * The cardiovascular / cardiorespiratory conditions in the target set — the only ones for
 * which a chest X-ray is informative. Used to sanity-check whether imaging should have
 * been requested.
 */
export const CARDIORESP_CONDITIONS = [
  "Stroke",
  "Coronary Heart Disease",
  "Cardiac Arrest",
  "History of cardiac arrest (situation)",
  "Chronic obstructive bronchitis (disorder)",
  "Acute bronchitis (disorder)",
  "Suspected lung cancer (situation)",
] as const;
