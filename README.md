# 🏥 Multi-Modal Agentic AI System for Medical Diagnosis and Triage

> **University of Hertfordshire — Final Year Group Project**  
> An autonomous AI agent that diagnoses chest and cardiovascular conditions by sequentially analysing patient symptoms, chest X-ray images, and structured clinical records — then triages and books appropriate specialist appointments.
>
> **Week 10 update:** the **LangGraph.js agent is built and running end-to-end**. A four-agent graph (Recipient → Inquirer → Diagnostic fan-out → Triage) now drives a multi-turn clinical interview, calls both deployed model Spaces plus a hybrid RAG index, and hands the result to a **deterministic safety layer** that fixes the urgency level before any language model writes patient-facing text. The RAG layer moved from local ChromaDB to a **hosted Upstash Vector hybrid index** so it survives Vercel's serverless filesystem. Remaining work is **Google Calendar triage booking** and **Phase 7** end-to-end evaluation.

---

## 📌 Project Status

| Phase   | Description                                                  | Status                      |
| ------- | ------------------------------------------------------------ | --------------------------- |
| Phase 1 | Exploratory Data Analysis (EDA)                              | ✅ Complete                 |
| Phase 2 | Data Preprocessing                                           | ✅ Complete                 |
| Phase 3 | Feature Engineering                                          | ✅ Complete                 |
| Phase 4 | Model Building — ChestVision (ViT-B/16)                      | ✅ Complete                 |
| Phase 4 | Model Building — Hybrid EHR (ClinicalFusion)                 | ✅ Complete                 |
| Phase 4 | Model Building — Response QA LLM (MedGemma-4B + few-shot)    | ✅ Complete                 |
| Phase 4 | RAG Validation Layer (migrated → Upstash Vector hybrid)      | ✅ Complete                 |
| Phase 5 | Model Evaluation & Optimisation (per-label threshold tuning) | ✅ Complete                 |
| Phase 6 | Application — Model Serving (HuggingFace Spaces + FastAPI)   | ✅ Complete                 |
| Phase 6 | Application — Front-end UI (Next.js + Vercel AI SDK)         | ✅ Chat + streaming working |
| Phase 6 | Application — LangGraph.js Agent Orchestration               | 🔄 In Progress              |
| Phase 6 | Application — Google Calendar / Gmail Triage Booking         | ⏳ Pending                  |
| Phase 7 | End-to-End System Evaluation & Optimisation                  | ⏳ Pending                  |

> **This week:** the agent graph is wired across all nodes and streaming to the UI. Intake is now gated on **collecting the data the EHR model actually needs** rather than exiting early, and the clinical note sent to ClinicalFusion is generated to match its **training distribution**.  
> **Next:** Google Calendar booking on the triage output, then Phase 7 evaluation across all severity tiers.  
> **Known open issues** are listed honestly under _Current Limitations_ below — several are not yet solved.

---

## 👥 Team

| Name    | Role                    | GitHub                                                 | Technical Focus                                  |
| ------- | ----------------------- | ------------------------------------------------------ | ------------------------------------------------ |
| Austin  | Team Leader             | [@augustineakauba](https://github.com/augustineakauba) | Model 1 — ChestVision (ViT-B/16)                 |
| Girish  | Scrum Master            | [@GirishGowd](https://github.com/GirishGowd)           | Model 2 — ClinicalFusion training & evaluation   |
| Abishek | GitHub Document Manager | [@abhishek7112000](https://github.com/abhishek7112000) | Data pipeline, ONNX export & quantisation        |
| Israel  | Communications Lead     | [@AjayiIsrael](https://github.com/AjayiIsrael)         | RAG pipeline, vector store, Medical Encyclopedia |
| Victor  | Code Review Manager     | [@victoran0](https://github.com/victoran0)             | AI Agent — LangGraph.js orchestration            |
| Karan   | Test Plan Manager       | [@k-jay23](https://github.com/k-jay23)                 | Application — Next.js, Google Calendar/Gmail API |

> **Repository:** https://github.com/Professional-Project-Team-9/Week-10-Team-9

---

## 🏗️ System Architecture

The agent is a LangGraph.js `StateGraph` with a **turn-based intake loop**. Each interview round is one HTTP request: the Inquirer asks a question and the turn ends, the checkpointer holds the accumulated state, and the patient's reply re-enters the graph at `START`.

```
POST /api/chat  (patient message)
      │
   START ─→ recipientNode          builds/merges structured HPI
              │
        [ routePhase ]             ready for diagnosis?
         ╱          ╲
  inquirerNode    diagnose ─┬─ chestVision ─┐   (X-ray only if cardio-resp)
      │                     ├─ ehr ─────────┼─→ analyserNode ─→ triageNode ─→ END
     END                    └─ rag ─────────┘   (MedGemma-27B)  (safety layer)
  turn ends,
  patient replies
   → new POST
```

### The four agents

| Node              | Role                                                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **recipientNode** | Converts unstructured patient language into a structured HPI, merging with prior rounds. Never asks questions.                               |
| **inquirerNode**  | Asks **one** discriminating question per round. Enforces no-repetition, requests artefacts (X-ray/ECG/bloods) only when clinically relevant. |
| **diagnostic**    | Fan-out to three evidence nodes in parallel, joined by a MedGemma-27B analyser.                                                              |
| **triageNode**    | Applies the deterministic safety floor, selects a fixed UK pathway, then streams patient-facing prose.                                       |

### Intake completeness gate

The agent does **not** proceed to diagnosis until it has collected what ClinicalFusion actually needs: identity (age, sex), a characterised complaint (onset/duration), and the PMH / medications / allergies sweep. Red flags **raise urgency** through the safety layer but no longer skip data collection — an earlier version diagnosed on round 1 from a single sentence, which produced meaningless model input.

Chest X-ray is requested **only** when the presentation is cardiovascular or respiratory. Most complaints do not need one, and imaging is never blocking: if the patient has no X-ray, the pipeline proceeds and the analyser is explicitly told that _absent imaging is not a negative finding_.

### Deterministic safety layer

```
finalUrgency = max(ruleFloor, modelAdvisory)
```

`safety.ts` computes an urgency **floor** from red-flag rules keyed on the HPI text and the analyser's red-flag list — deliberately **not** on the analyser's chosen urgency, so a confidently-wrong model cannot reason its way out of an escalation. MedGemma may escalate above the floor; it can never drop below it.

The action list and safety-netting text for each tier (999 / A&E / NHS 111 / GP urgent / GP routine / pharmacist / self-care) are **static strings**, not generated. The LLM's only job is the empathetic bridging prose. This is a deliberate divergence from the advisory-guidance design in Cheng et al. (2025), whose rule layer only _advises_ the decision model.

### Streaming

Built on the Vercel AI SDK (`createUIMessageStream`). Only the triage call is tagged `patient_facing`; the route allow-lists that tag before writing any `text-delta`, so the Recipient's and Inquirer's structured-output tokens can never leak raw JSON into the chat bubble. Structured node outputs are lifted from `on_chain_end` and written as typed `data-*` parts (HPI sidebar, X-ray upload widget, urgency banner, triage card).

### Model Stack

| Component                    | Technology                                | Dataset                                | Output                                       |
| ---------------------------- | ----------------------------------------- | -------------------------------------- | -------------------------------------------- |
| **Model 1 — ChestVision**    | ViT-B/16 fine-tuned (timm) ★              | NIH ChestX-ray14                       | 14-label X-ray classification                |
| **Model 2 — ClinicalFusion** | MLP + frozen BioClinical-ModernBERT-large | Synthea Synthetic EHR                  | 28-label condition prediction                |
| **Model 3 — Response QA**    | MedGemma-4B-IT + UK few-shot prompting ★  | ChatDoctor (HealthCareMagic + iCliniq) | Patient-facing triaged clinical response     |
| **Agent LLM**                | MedGemma-27B-IT (HF Inference Providers)  | —                                      | Diagnostic synthesis JSON                    |
| **Intake / triage prose**    | gpt-oss-120b (Groq)                       | —                                      | HPI structuring, questions, patient text     |
| **Clinical note generation** | llama-3.1-8b-instant (Groq)               | —                                      | SOAP note for the ClinicalFusion text branch |
| **RAG Layer**                | Upstash Vector hybrid + BM25              | A-Z Medical Encyclopedia               | Clinical reference enrichment                |

---

## 🚀 Model Serving & Deployment

Both trained models are served as **FastAPI microservices on Hugging Face Spaces** (Docker SDK, free CPU tier), so model weights never touch the Next.js/Vercel layer.

### Live services

| Model                           | Runtime                               | Endpoint                                                 |
| ------------------------------- | ------------------------------------- | -------------------------------------------------------- |
| **ChestVision** (ViT-B/16)      | Docker · timm + PyTorch (CPU)         | `https://<user>-chestvision-vit.hf.space`                |
| **ClinicalFusion** (Hybrid EHR) | Docker · PyTorch + Transformers (CPU) | `https://victorano-healthpilot-hybridehr-model.hf.space` |

### API (both services)

| Route           | Auth   | Purpose                                                                  |
| --------------- | ------ | ------------------------------------------------------------------------ |
| `GET /health`   | open   | liveness + `loaded` flag (used for keep-warm pings and HF health checks) |
| `GET /metadata` | Bearer | class labels, tuned decision thresholds, feature columns                 |
| `POST /predict` | Bearer | run inference                                                            |

### Agent → ClinicalFusion contract (Week 10)

`POST /predict` takes `{ "features": {...}, "note": "..." }`. Two additions were needed to make the agent's data usable by the model:

**1. Server-side feature mapping (`feature_mapping.py`).** The agent sends raw clinical facts (`_medications`, `_allergies`, `_vitals`, `_race`); the Space translates them into the model's real training columns before inference. This mapping lives beside the model because it is a **training artifact** that must change in lockstep with `feature_columns`. Verified against `model_metadata.pkl`:

- Medications map to the **six** `rx_*` class columns that exist (`analgesic, antibiotic, antidiabetic, nitrate, inhaled_corticosteroid, bisphosphonate`). Statins and antihypertensives have no column and reach the model through the note only.
- The only allergy column is `allergy_Shellfish allergy`.
- **There are no `hx_*` columns.** Past medical history is _entirely_ a text-branch signal — which is why note quality matters so much.
- Patient-reported vitals fill the `*_hist_last` / `*_recent_mean` slots.

**2. Training-distribution note generation (`noteGenerator.ts`).** The text branch was trained on SOAP notes written by `llama-3.1-8b-instant` under a specific system prompt. Inference now reproduces that pipeline verbatim — same system prompt, same user-prompt structure, same model, same `temperature=0.2`. Using a hand-built template instead produced weak embeddings and let the tabular branch dominate into base-rate predictions.

### Keep-warm

A `wakeSpaces()` utility polls each Space's `/health` until `loaded: true`, run concurrently on page load. The free CPU tier sleeps after inactivity and cold-starts slowly.

---

## 📊 Model Results (Final — Evaluation Complete)

### Model 1 — ChestVision (NIH ChestX-ray14)

| Architecture                            | Training     | Val AUC (best) | Test AUC   | Test Macro-F1 | Status       |
| --------------------------------------- | ------------ | -------------- | ---------- | ------------- | ------------ |
| ResNet-50 (from scratch, baseline)      | 30 epochs    | 0.7955         | 0.7893     | 0.2439        | Baseline     |
| **ResNet50V2** (fine-tuned, timm)       | 20 ep (5+15) | 0.7685         | 0.7666     | 0.2517        | Comparison   |
| **EfficientNetV2B0** (fine-tuned, timm) | 20 ep (5+15) | 0.8014         | 0.7913     | 0.3000        | Comparison   |
| **ViT-B/16** (fine-tuned, timm) ★       | 20 ep (5+15) | **0.8253**     | **0.8175** | **0.3265**    | **Selected** |

> Strongest on the cardiovascular findings the system prioritises: **Cardiomegaly 0.91 · Edema 0.89 · Effusion 0.88**.

### Model 2 — ClinicalFusion (Synthea EHR)

1,376 synthetic patients · 80 tabular features · 28 condition labels · patient-level 5-fold CV.

| Metric                          | Score      |
| ------------------------------- | ---------- |
| **Best Val Macro AUC-ROC**      | **0.8524** |
| F1 Macro (threshold = 0.5)      | 0.4387     |
| **F1 Macro (tuned thresholds)** | **0.5709** |
| F1 Micro (threshold = 0.5)      | 0.4636     |
| **F1 Micro (tuned thresholds)** | **0.5952** |

Tuned thresholds span **0.35–0.90** (mean 0.69) and **none** sit at 0.5, so the agent surfaces the server's `predicted` flag rather than applying its own cutoff.

> ⚠️ **Note on near-perfect AUCs:** Coronary Heart Disease and Diabetes reaching 1.00 partly reflects clean, strongly separable signal in the **synthetic** Synthea data. These are not a claim of real-world performance.

---

## ⚠️ Current Limitations

Recorded honestly ahead of Phase 7 rather than deferred.

**1. Tabular branch dominance on sparse patients.** Live testing showed that when the tabular vector is mostly zero-filled (a young patient with no history — i.e. most triage users), rankings collapse toward a base-rate prior. An ankle-sprain test case ranked _Seizure disorder_ at 0.73 while _Sprain of ankle_ sat at 0.38. The note-generation fix addresses part of this; the residue is a training-data property.

**2. Domain shift.** ClinicalFusion was trained on Synthea **follow-up visit** records (chronic disease management), not **acute symptom presentations**. The agent asks patients about a new complaint. Even with matched note style, the model is generalising outside its training distribution. This is the single biggest threat to Phase 7 numbers and cannot be prompt-engineered away.

**3. Vercel free tier constraints.** Hobby functions cap at **60 s**; MedGemma-27B cold starts can exceed that and get killed mid-stream. `MemorySaver` also does not persist across serverless invocations, so a network-backed checkpointer is required before any multi-turn demo.

**4. F1 target not met.** ClinicalFusion macro-F1 is 0.5709 against a 0.80 target, bounded by label density ≈11.6%.

**5. Clinical-safety metrics outstanding.** False-low rate and high-severity miss-rate are Phase 7 work and are not yet measured.

---

## 🗂️ Datasets

### Dataset 1 — NIH ChestX-ray14

- **Source:** NIH Clinical Center · ~45 GB · 112,120 PNG chest X-rays · 30,805 patients
- **Labels:** 14 thoracic diseases (Cardiomegaly, Pneumonia, Effusion, Atelectasis, etc.)
- **Download:** https://nihcc.app.box.com/v/ChestXray-NIHCC
- **Licence:** NIH Public Use (cite Wang et al., 2017) · Fully de-identified (HIPAA Safe Harbor)

### Dataset 2 — Synthea Synthetic EHR

- **Source:** MITRE Synthea / Kaggle · ~500 MB compressed · 1,376 patients used
- **Tables:** patients, conditions, observations, medications, encounters, procedures, careplans, allergies, immunizations, claims
- **Download:** https://www.kaggle.com/datasets/imtkaggleteam/synthetic-medical-dataset
- **Licence:** Apache 2.0 · Entirely synthetic, no GDPR obligations

### Dataset 3 — Medical QA (HuggingFace)

- **Source:** Malikeh1375 / HuggingFace Hub (repackaging of ChatDoctor + Medical Meadow)
- **Configs used:** `chatdoctor_healthcaremagic` + `chatdoctor_icliniq`
- **Ethics:** ⚠️ **Real, scraped** forum data with automated (imperfect) de-identification and no documented patient consent. **Research/prototyping only.** The deployed system serves no real patient data.

### Knowledge Base (RAG — not a training dataset)

- **Source:** A-Z Family Medical Encyclopedia (Internet Archive)
- **Pipeline:** PDF → 800-char chunks (100 overlap) → **Upstash Vector hybrid index**
- **Retrieval:** dense (`text-embedding-3-small`) + sparse (BM25), fused with Reciprocal Rank Fusion
- **Why hybrid:** dense handles patient phrasing ("my chest feels tight"); sparse pins exact clinical terminology ("troponin", "Wells score") that dense models conflate across clinically distinct conditions.

> **Migration note:** the RAG store moved from local ChromaDB to hosted Upstash Vector. Vercel serverless functions have an ephemeral, read-only filesystem, so a persist-to-disk index cannot survive between invocations. Ingestion runs **offline**; the PDF never ships to production.

---

## ⚙️ Setup & Installation

### Prerequisites

- Python 3.11+ · Node.js 20+ · CUDA GPU (for training) · 100 GB+ storage for datasets

### Python Environment

```bash
git clone https://github.com/Professional-Project-Team-9/Week-10-Team-9.git
cd Week-10-Team-9

python -m venv venv
source venv/bin/activate          # Linux / macOS
# venv\Scripts\activate           # Windows

pip install -r requirements.txt
```

### Front-End + Agent

```bash
cd app
npm install
cp .env.example .env.local
npm run dev                       # http://localhost:3000
```

**Required environment variables:**

```env
GROQ_API_KEY=                 # gpt-oss-120b (intake/triage) + llama-3.1-8b (notes)
HF_TOKEN=                     # MedGemma-27B via Inference Providers
HF_PROVIDER=featherless-ai    # must be a featherless-ai
UPSTASH_VECTOR_REST_URL=      # RAG hybrid index
UPSTASH_VECTOR_REST_TOKEN=
CHESTVISION_ENDPOINT=         # Space root
EHR_ENDPOINT=                 # Space root (agent appends /predict)
EHR_INFERENCE_TOKEN=          # matches the Space's INFERENCE_API_TOKEN, NOT HF_TOKEN
```

### RAG ingestion (run once, locally)

```bash
npm i @upstash/vector @langchain/textsplitters pdf-parse
npm i -D tsx
npx tsx --env-file=.env scripts/ingest-encyclopaedia.ts
```

> Upstash free tier caps at 10,000 writes/day. The script has a `START_FROM` offset so a partial run can resume the next day. Chunk IDs are deterministic, so re-running is idempotent.

> **Windows note:** keep the project on a short path (e.g. `C:\dev\health_pilot`). Deep nested folders with spaces trigger `MAX_PATH` failures in Turbopack and ESM module resolution.

---

## 🚀 Running the Notebooks

### Model 1 — ChestVision

```bash
jupyter notebook notebooks/ChestXray_Competition_timm_ViT_ResNet.ipynb   # selected
jupyter notebook notebooks/ChestXray_Competition_EfficientNet.ipynb      # comparison
jupyter notebook notebooks/ChestXray_Model_Training_ResNet_scratch.ipynb # baseline
```

### Model 2 — ClinicalFusion

```bash
export GROQ_API_KEY=your_key_here
jupyter notebook notebooks/hybrid_ehr_model.ipynb
```

> Clinical notes are generated via Groq and cached to `clinical_notes_cache.csv`. The same system prompt is now reused at inference time so training and serving distributions match.

### Testing the deployed EHR service

```bash
export EHR_ENDPOINT=https://victorano-healthpilot-hybridehr-model.hf.space
export EHR_INFERENCE_TOKEN=...
python "models deployment/clinicalfusion/test_ehr_inference.py"

# or test the local python stack directly:
python test_ehr_inference.py --local
```

Four dummy patients spanning different regions of the 28-label space, sent through the **full agent contract** (raw clinical facts + SOAP note), so it exercises `feature_mapping.py` and `inference.predict` together rather than the model in isolation.

---

## 📈 Evaluation Targets (KPIs)

| Model                  | Metric                  | Target                                  | Achieved                                              |
| ---------------------- | ----------------------- | --------------------------------------- | ----------------------------------------------------- |
| ChestVision (ViT-B/16) | Mean AUC-ROC            | ≥ 0.82                                  | ✅ **0.8175** (≈0.82 over 14 pathologies)             |
| ChestVision (ViT-B/16) | Per-class AUC           | ≥ 0.75                                  | ✅ Cardio findings 0.88–0.91; rarer findings lower    |
| ChestVision (ViT-B/16) | Live serving            | endpoint up                             | ✅ FastAPI on HF Space (token-gated)                  |
| ClinicalFusion         | Macro AUC-ROC           | ≥ 0.85                                  | ✅ **0.8524**                                         |
| ClinicalFusion         | F1 Macro                | ≥ 0.80                                  | ❌ **0.5709** (tuned, ↑ from 0.4387 — target not met) |
| ClinicalFusion         | False-low rate (safety) | < 2%                                    | ⏳ Pending (Phase 7)                                  |
| ClinicalFusion         | Live serving            | endpoint up                             | ✅ FastAPI on HF Space (token-gated)                  |
| Response QA            | Emergency-triage recall | 100%                                    | ✅ Correct on emergency test cases                    |
| **Agent**              | Intake completeness     | model inputs collected before diagnosis | ✅ Gated on identity + complaint + PMH/meds/allergies |
| **Agent**              | Safety-layer override   | LLM cannot de-escalate                  | ✅ `max(ruleFloor, modelAdvisory)` enforced           |
| **Agent**              | End-to-end latency      | < 60 s (Vercel Hobby)                   | ⚠️ At risk on MedGemma cold starts                    |

---

## 🔄 Next Steps

- [x] Train & evaluate ChestVision (ViT-B/16) — test AUC **0.818**
- [x] Train & evaluate ClinicalFusion — val macro AUC **0.852**; threshold tuning (macro-F1 **0.44 → 0.57**)
- [x] Build & evaluate the Response QA model — **MedGemma-4B-IT + UK few-shot** selected
- [x] Build the RAG vector store (migrated ChromaDB → **Upstash Vector hybrid**)
- [x] **Phase 5 — model evaluation & optimisation complete**
- [x] Deploy ChestVision + ClinicalFusion as token-gated FastAPI Spaces
- [x] Build the Next.js front-end chat page with Vercel AI SDK streaming
- [x] **Implement the LangGraph.js agent** — Recipient / Inquirer / Diagnostic fan-out / Triage, with deterministic safety layer and intake-completeness gating — _Week 10_
- [x] Align the ClinicalFusion inference contract (server-side feature mapping + training-distribution note generation)
- [ ] Swap `MemorySaver` for a network-backed checkpointer so multi-turn state survives serverless
- [ ] Connect **Google Calendar / Gmail API** for severity-based appointment booking
- [ ] Address tabular-branch dominance on sparse patients (see _Current Limitations_)
- [ ] Export ClinicalFusion to ONNX + INT8 for a serverless serving variant
- [ ] **Phase 7 — end-to-end evaluation:** run the full agent on synthetic scenarios across all triage levels; report per-demographic performance and high-severity miss-rate (< 2%)
- [ ] Run full test plan (unit tests, model KPI gates, UAT)

---

## 🔐 Ethical Statement

This project uses only de-identified public data (NIH ChestX-ray14) and entirely synthetic records (Synthea). No real patient information is used at any stage. The system is a **decision-support tool only** — not a replacement for clinical judgement.

The agent's design reflects this. The language model **communicates**; it is **not** the escalation authority. Urgency is set by a deterministic rule layer biased toward over-triage, and the model cannot lower it. Patient-facing text always states that the output is guidance, not a diagnosis, and that HealthPilot is not a doctor. Failure modes fail **loud, never reassuring**: if a model call dies, the patient is told the assessment could not be completed and is directed to NHS 111 or 999, rather than receiving a falsely calm result.

The deployed inference services are **token-gated** and exercised only with **synthetic or de-identified inputs**.

| Dataset          | GDPR                                 | Permission                | Collected Ethically                          |
| ---------------- | ------------------------------------ | ------------------------- | -------------------------------------------- |
| NIH ChestX-ray14 | ✅ De-identified (HIPAA Safe Harbor) | ✅ NIH Public Use Licence | ✅ IRB-approved (NIH, 1992–2015)             |
| Synthea EHR      | ✅ Synthetic — no real individuals   | ✅ Apache 2.0             | ✅ Computer-generated (MITRE)                |
| Medical QA       | ⚠️ Real scraped forum data           | ✅ MIT (copyright only)   | ⚠️ No documented consent — research use only |

---

## 📚 Key References

- Wang, X. et al. (2017). _ChestX-ray8: Hospital-scale Chest X-ray Database_. IEEE CVPR.
- Walonoski, J. et al. (2018). _Synthea: Synthetic patient data_. JAMIA, 25(3):230–238.
- Cheng, H. et al. (2025). _Collaborative Medical Triage under Uncertainty: A Multi-Agent Dynamic Matching Approach_. arXiv:2507.22504.
- Google Research (2025). _MedGemma Technical Report_. arXiv:2507.05201.
- Rajpurkar, P. et al. (2017). _CheXNet: Radiologist-level pneumonia detection_. arXiv:1711.05225.
- Strick, D. et al. (2025). _Reproducing and Improving CheXNet_. arXiv:2505.06646.
- Li, D. et al. (2024). _MEDIQ: Question-asking LLMs for medical QA_. NeurIPS 2024.
- Sounack, T. et al. (2025). _BioClinical ModernBERT_. arXiv:2506.10896.
- Lu, M. et al. (2024). _TriageAgent: Multi-Agent Collaborations for LLM-Based Clinical Triage_. Findings of EMNLP 2024.
- Li, Y. et al. (2023). _ChatDoctor_. Cureus 15(6):e40895. arXiv:2303.14070.
- Han, D., Han, M. & the Unsloth team. (2024–2025). _Unsloth_. https://github.com/unslothai/unsloth

> **On Cheng et al. (2025):** the agent adapts their Recipient/Inquirer architecture and the `H_t = R(D_t, q_{t-1}, H_{t-1})` intake formulation, but replaces the DepartmentAgent (62-way Chinese hospital routing) with urgency-based UK triage, and **inverts** their guidance mechanism from advisory to hard-override.

---

## 🤝 Contributing

1. Branch off `develop`: `git checkout -b feature/your-feature develop`
2. Commit with prefix: `[DATA]`, `[MODEL]`, `[APP]`, `[AGENT]`, `[DOCS]`, `[FIX]`
3. Open a Pull Request to `develop` — requires one reviewer sign-off (Victor — Code Review Manager)
4. All CI checks must be green before merge (formatting, linting, ONNX parity)

---

## 📄 Licence

Code: **MIT Licence** — see `LICENSE` file.  
Datasets retain their original licences (NIH Public Use; Apache 2.0).  
Model weights: subject to respective model provider terms of use.

---

<div align="center">
  <sub>University of Hertfordshire · Masters Project · 2025–2026 · Week 10</sub>
</div>
