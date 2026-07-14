# HealthPilot — Multi-Agent Architecture

Adapted from Cheng et al. (2025), *Collaborative Medical Triage under Uncertainty*, in the same LangGraph + Vercel AI SDK shape as your study project.

```
src/server/ai/
  agent.ts            # StateSchema + StateGraph (the whole graph)
  validator.ts        # zod schemas — HPI, Inquiry, Analysis, TriageDecision
  prompts.ts          # Recipient / Inquirer / Analyser / Triage
  llm.ts              # Groq gpt-oss-120b + MedGemma-27B via HF
  safety.ts           # deterministic escalation rules   <-- the important file
  pathways.ts         # static UK pathway text (999 / A&E / 111 / GP / pharmacist)
  nodes/
    evidence.ts       # chestVision | ehr | rag  (parallel)
    analyser.ts       # MedGemma-27B fan-in
src/app/api/chat/route.ts
```

## Flow — one HTTP request per round

```
POST /api/chat  (patient's message)
      |
   START -> recipientNode          H_t = R(D_t, q_{t-1}, H_{t-1})
              |
        [ routePhase ]
         /          \
  inquirerNode    chestVision + ehr + rag   (fan-out, same superstep)
      |                    \  |  /
     END                  analyserNode      (MedGemma-27B, fan-in)
   turn ends,                  |
   patient replies         triageNode       (rules -> pathway -> streamed prose)
   -> new POST                 |
                              END
```

The intake loop is **turn-based**, not `interrupt()`-based. `inquirerNode` returns an `AIMessage` and hits `END`. The checkpointer holds `hpi`, `askedQuestions` and `round`; the patient's reply arrives as a fresh POST, re-enters at `START`, and the recipient merges it into the existing HPI. This is why the route only ever passes `messages.at(-1)` into the graph.

## Mapping to the paper

| Cheng et al. | HealthPilot | Change |
|---|---|---|
| RecipientAgent `H_t = R(D_t, q_{t-1}, H_{t-1})` | `recipientNode` | Same. Structures raw speech into an HPI, merging with the previous round. |
| InquirerAgent `q_t = I(H_t, Q_{t-1}, d̂_t)` | `inquirerNode` | Same, plus **artefact requests** (X-ray, ECG, bloods) — the paper has no imaging modality. |
| DepartmentAgent `(d_t, d̂_t) = A(H_t, C, G_k)` | `chestVision`/`ehr`/`rag` → `analyserNode` | **Replaced.** 62-way department routing is a Chinese hospital-structure problem; UK primary care routes by *urgency*, not department. The `d̂_t` candidate mechanism survives as `candidateConditions`, still feeding the Inquirer. |
| Inquiry / Classification Guidance (advisory) | `safety.ts` | **Inverted.** Their rules advise the LLM. Ours override it. |
| — | `triageNode` + `pathways.ts` | New. 999 / A&E / 111 / GP / pharmacist. |

## The safety inversion

```
finalUrgency = max(ruleFloor, medgemmaAdvisory)
```

`safety.ts` fires on the HPI text and the analyser's *red-flag list* — deliberately **not** on the analyser's chosen urgency, so a confidently-wrong model cannot reason its way out of an escalation. MedGemma can escalate above the floor; it can never drop below it. The triage LLM is then handed a fixed urgency and told its only job is wording.

`pathways.ts` is static text. The action list and safety-netting for a 999 presentation are the highest-stakes strings in the product and are identical for every patient at that level — there is no upside to letting a model paraphrase them, and an obvious downside.

## Two failure modes the code is explicit about

- **Missing imaging ≠ negative imaging.** `chestVisionNode` returns `{}` when no X-ray exists, and the analyser prompt states that absence is not reassurance.
- **A dead analyser escalates.** The catch block routes to `A_AND_E`/`NHS_111`, never to a reassuring default.

## Env

```env
GROQ_API_KEY=            # gpt-oss-120b — recipient, inquirer, triage prose
HF_TOKEN=                # MedGemma-27B + your two model endpoints
HF_PROVIDER=nebius       # pin it; "auto" gives you unpredictable cold starts
GOOGLE_API_KEY=          # Gemini text-embedding-004 for Orama
CHESTVISION_ENDPOINT=    # ViT-B/16 Space or Inference Endpoint
EHR_ENDPOINT=            # hybrid MLP + BioClinical-ModernBERT
```

## Test the rules first

They're pure functions — no LLM, no network, and they're the only part of this system you can actually prove:

```ts
expect(evaluateSafetyFloor(null, null,
  "crushing chest pain spreading to my left arm, feeling sweaty").floor
).toBe("EMERGENCY_999");

expect(applyFloor("GP_ROUTINE", "EMERGENCY_999").urgency).toBe("EMERGENCY_999");
```
