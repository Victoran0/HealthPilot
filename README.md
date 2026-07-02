# 🏥 Multi-Modal Agentic AI System for Medical Diagnosis and Triage

> **University of Hertfordshire — Final Year Group Project**  
> An autonomous AI agent that diagnoses chest and cardiovascular conditions by sequentially analysing patient symptoms, chest X-ray images, and structured clinical records — then triages and books appropriate specialist appointments.
>
> **Week 8 update:** both models are now **deployed and queryable**. **ChestVision** (ViT-B/16) and **ClinicalFusion** (Hybrid EHR) each run as a **token-gated FastAPI service on a Hugging Face Space**, exposing `/predict`, `/metadata` and `/health` for the agent to call over HTTP — deployment code lives under **`models deployment/`**. With model serving in place, focus stays on the **application layer**: the **Next.js front-end pages** (in progress), then **LangGraph.js agent orchestration + Google Calendar triage integration**, ahead of the **Phase 7** end-to-end system evaluation.

---

## 📌 Project Status

| Phase   | Description                                                  | Status         |
| ------- | ------------------------------------------------------------ | -------------- |
| Phase 1 | Exploratory Data Analysis (EDA)                              | ✅ Complete    |
| Phase 2 | Data Preprocessing                                           | ✅ Complete    |
| Phase 3 | Feature Engineering                                          | ✅ Complete    |
| Phase 4 | Model Building — ChestVision (ViT-B/16)                      | ✅ Complete    |
| Phase 4 | Model Building — Hybrid EHR (ClinicalFusion)                 | ✅ Complete    |
| Phase 4 | Model Building — Response QA LLM (MedGemma-4B + few-shot)    | ✅ Complete    |
| Phase 4 | RAG Validation Layer (ChromaDB + Medical Encyclopedia)       | ✅ Complete    |
| Phase 5 | Model Evaluation & Optimisation (per-label threshold tuning) | ✅ Complete    |
| Phase 6 | Application — Model Serving (HuggingFace Spaces + FastAPI)   | ✅ Complete    |
| Phase 6 | Application — Front-end UI (Next.js + Vercel AI SDK)         | 🔄 In Progress |
| Phase 6 | Application — LangGraph.js Agent Orchestration               | ⏳ Pending     |
| Phase 6 | Application — Google Calendar / Gmail Triage Booking         | ⏳ Pending     |
| Phase 7 | End-to-End System Evaluation & Optimisation                  | ⏳ Pending     |

> **This week:** model serving complete — both models deployed as token-gated FastAPI services on Hugging Face Spaces; continuing the Next.js front-end pages (chat + upload + triage views).  
> **Next:** wire the LangGraph.js agent across all nodes so `xray_node` / `clinical_node` call the deployed model endpoints, and connect Google Calendar for severity-based appointment booking.  
> **Then:** evaluate and optimise the integrated system end-to-end on synthetic patient scenarios spanning every triage level.

---

## 👥 Team

| Name    | Role                    | GitHub                                                 | Technical Focus                                  |
| ------- | ----------------------- | ------------------------------------------------------ | ------------------------------------------------ |
| Austin  | Team Leader             | [@augustineakauba](https://github.com/augustineakauba) | Model 1 — ChestVision (ViT-B/16)                 |
| Girish  | Scrum Master            | [@GirishGowd](https://github.com/GirishGowd)           | Model 2 — ClinicalFusion training & evaluation   |
| Abishek | GitHub Document Manager | [@abhishek7112000](https://github.com/abhishek7112000) | Data pipeline, ONNX export & quantisation        |
| Israel  | Communications Lead     | [@AjayiIsrael](https://github.com/AjayiIsrael)         | RAG pipeline, ChromaDB, Medical Encyclopedia     |
| Victor  | Code Review Manager     | [@victoran0](https://github.com/victoran0)             | AI Agent — LangGraph.js orchestration            |
| Karan   | Test Plan Manager       | [@k-jay23](https://github.com/k-jay23)                 | Application — Next.js, Google Calendar/Gmail API |

> **Repository:** https://github.com/Professional-Project-Team-9/Week-8-Team-9

---

## 🏗️ System Architecture

```
Patient Input (symptoms + X-ray + clinical record)
        │
        ▼
┌──────────────────────────────────────────────────────────┐
│                  LangGraph.js Agent                       │
│  intake_node → route_node → xray_node + clinical_node    │
│  → synthesise_node (MedGemma-27B-IT)                     │
│  → [clarify_node if confidence < 0.60]                   │
│  → rag_node (ChromaDB) → response_node (MedGemma-4B QA)  │
│  → triage_node → appointment booking (Google Calendar)   │
└──────────────────────────────────────────────────────────┘
        │                    │
        ▼                    ▼
  Model 1               Model 2
  ChestVision           ClinicalFusion
  (ViT-B/16 ★)         (MLP + BioClinical-
  NIH CXR14             ModernBERT-large)
  14-label ONNX         EHR → 28 labels ONNX
```

> **Serving (Week 8):** Models 1 & 2 are deployed as **FastAPI microservices on Hugging Face Spaces**. The agent's `xray_node` and `clinical_node` call each service's `/predict` endpoint over HTTP, keeping the weights off the Next.js/Vercel layer so the application stays a thin orchestrator (see **Model Serving & Deployment** below).

### Model Stack

| Component                    | Technology                                | Dataset                                | Output                                   |
| ---------------------------- | ----------------------------------------- | -------------------------------------- | ---------------------------------------- |
| **Model 1 — ChestVision**    | ViT-B/16 fine-tuned (timm) ★              | NIH ChestX-ray14                       | 14-label X-ray classification (ONNX)     |
| **Model 2 — ClinicalFusion** | MLP + frozen BioClinical-ModernBERT-large | Synthea Synthetic EHR                  | 28-label condition prediction (ONNX)     |
| **Model 3 — Response QA**    | MedGemma-4B-IT + UK few-shot prompting ★  | ChatDoctor (HealthCareMagic + iCliniq) | Patient-facing triaged clinical response |
| **Agent LLM**                | MedGemma-27B-IT                           | —                                      | DiagnosisReport JSON synthesis           |
| **RAG Layer**                | ChromaDB + BioClinical embeddings         | A-Z Medical Encyclopedia               | Clinical QA enrichment                   |

---

## 🚀 Model Serving & Deployment (Week 8)

Both trained models are now served as standalone **FastAPI microservices on Hugging Face Spaces** (Docker SDK, free CPU tier). Each exposes a small HTTP API that the LangGraph.js agent calls over the network, so heavy model weights never touch the Next.js/Vercel layer — the application stays a thin orchestrator that simply awaits the Space responses.

Deployment code lives in the repo under **`models deployment/`** (one service per model).

### Live services

| Model                           | Space                                | Runtime                               | Direct endpoint                                       |
| ------------------------------- | ------------------------------------ | ------------------------------------- | ----------------------------------------------------- |
| **ChestVision** (ViT-B/16)      | `<user>/chestvision-vit` _(fill in)_ | Docker · timm + PyTorch (CPU)         | `https://<user>-chestvision-vit.hf.space`             |
| **ClinicalFusion** (Hybrid EHR) | `Victorano/healthPilot-hybrid-model` | Docker · PyTorch + Transformers (CPU) | `https://victorano-healthpilot-hybrid-model.hf.space` |

### API (both services)

| Route           | Auth   | Purpose                                                                  |
| --------------- | ------ | ------------------------------------------------------------------------ |
| `GET /health`   | open   | liveness + `loaded` flag (used for keep-warm pings and HF health checks) |
| `GET /metadata` | Bearer | class labels, tuned decision thresholds, preprocessing config            |
| `POST /predict` | Bearer | run inference                                                            |

- **ChestVision** — `POST /predict` takes a **multipart image upload** (`file=@xray.png`) and returns per-finding probabilities across the 14 pathologies (+ _No Finding_) with tuned-threshold flags. Preprocessing replicates the notebook's `val_transform` exactly (resize 224×224 + ImageNet mean/std). Weights (`ViT_B16_best.pth`) are committed via **Git LFS**, so the model is fully self-contained and nothing downloads at startup.
- **ClinicalFusion** — `POST /predict` takes **JSON** `{ "features": {...}, "note": "..." }` and returns 28 per-condition probabilities with tuned-threshold flags. The frozen **BioClinical-ModernBERT-large** encoder is pulled from the Hub at startup; only the trimmed trainable weights + scaler + metadata are committed.

### Hardening

- **Auth:** token-gated via `INFERENCE_API_TOKEN` (set as a Space **Secret**), checked with a constant-time compare. `/health` is left open for uptime/keep-warm pings.
- **Concurrency:** a single in-flight inference (`MAX_CONCURRENCY=1`, `TORCH_THREADS=2` on the 2-vCPU free tier) with a queue timeout that sheds overload as `503` rather than hanging past the caller's timeout.
- **Robustness:** `lifespan` model loader (loads once, stays warm), upload-size cap, invalid image / bad payload → `400`, generic `500` (no stack-trace leakage), and per-request timing in the logs.

### Test clients

Each service ships a `query_space.py` smoke-test client:

```bash
# ChestVision — pass a real chest X-ray (synthetic image used if omitted)
INFERENCE_API_TOKEN=... python "models deployment/chestvision/query_space.py" path/to/xray.png

# ClinicalFusion — builds a neutral dummy patient from the model's feature means
INFERENCE_API_TOKEN=... python "models deployment/clinicalfusion/query_space.py"
```

> **Deployment notes.** Both services run on the **free CPU tier**, which sleeps after 48 h of inactivity and cold-starts slowly — a lightweight keep-warm ping holds them awake during demos and evaluation. The Spaces are public but token-gated, and by design serve **only synthetic / de-identified inputs**, consistent with the project's ethical statement. ONNX export + INT8 quantisation remains a **parallel optimisation track** for a future serverless variant of each model.

---

## 📊 Model Results (Final — Evaluation Complete)

### Model 1 — ChestVision (NIH ChestX-ray14)

Three architectures trained and compared on 112,120 chest X-rays (78,566 train / 17,063 val / 16,491 test):

| Architecture                            | Training     | Val AUC (best) | Test AUC   | Test Macro-F1 | Status       |
| --------------------------------------- | ------------ | -------------- | ---------- | ------------- | ------------ |
| ResNet-50 (from scratch, baseline)      | 30 epochs    | 0.7955         | 0.7893     | 0.2439        | Baseline     |
| **ResNet50V2** (fine-tuned, timm)       | 20 ep (5+15) | 0.7685         | 0.7666     | 0.2517        | Comparison   |
| **EfficientNetV2B0** (fine-tuned, timm) | 20 ep (5+15) | 0.8014         | 0.7913     | 0.3000        | Comparison   |
| **ViT-B/16** (fine-tuned, timm) ★       | 20 ep (5+15) | **0.8253**     | **0.8175** | **0.3265**    | **Selected** |

> **ViT-B/16 selected** as the final deployed model — highest validation and test AUC across all four architectures. Strongest on the cardiovascular-relevant findings the system prioritises: **Cardiomegaly 0.91 · Edema 0.89 · Effusion 0.88**. Exported to ONNX with numerical-parity checks, and **deployed live as a FastAPI service on Hugging Face Spaces** (see above).

**Training configuration:**

- Loss: `BCEWithLogitsLoss` with per-class `pos_weight = (N⁻/N⁺)`, capped at 20
- Two-phase schedule: Phase 1 head-only `lr=1e-3` × 5 epochs → Phase 2 full fine-tune `lr=1e-5` × 15 epochs
- Augmentation: `RandomResizedCrop`, `HorizontalFlip`, `ColorJitter`, `RandomAffine`
- Optimiser: AdamW · Early stopping patience=6

---

### Model 2 — ClinicalFusion (Synthea EHR)

Hybrid model trained on 1,376 synthetic patients, 80 tabular features, 28 condition labels (patient-level 5-fold cross-validation):

| Metric                          | Score      |
| ------------------------------- | ---------- |
| **Best Val Macro AUC-ROC**      | **0.8524** |
| F1 Macro (threshold = 0.5)      | 0.4387     |
| **F1 Macro (tuned thresholds)** | **0.5709** |
| F1 Micro (threshold = 0.5)      | 0.4636     |
| **F1 Micro (tuned thresholds)** | **0.5952** |

> **Evaluation outcome (Phase 5):** per-label threshold tuning raised **macro-F1 from 0.4387 → 0.5709** and **micro-F1 from 0.4636 → 0.5952**. Remaining F1 headroom is bounded by heavy class imbalance (label density ≈ **11.6%**); AUC-ROC is the threshold-independent headline metric. Clinical-safety (false-low / high-severity miss-rate) is part of the **Phase 7** whole-system evaluation.

**Top per-label AUC-ROC** (strongest on the cardiovascular conditions the system prioritises):

| Condition                      | AUC-ROC |
| ------------------------------ | ------- |
| Coronary Heart Disease         | 1.0000  |
| Diabetes                       | 1.0000  |
| Normal Pregnancy               | 0.9902  |
| Neuropathy (T2DM)              | 0.9897  |
| Hypertension                   | 0.9849  |
| Prediabetes                    | 0.9845  |
| Chronic Obstructive Bronchitis | 0.9820  |
| Cardiac Arrest                 | 0.9350  |
| Stroke                         | 0.8861  |

> ⚠️ **Note on near-perfect AUCs:** Coronary Heart Disease and Diabetes reaching 1.00 partly reflects clean, strongly separable signal in the **synthetic** Synthea data; these are not a claim of real-world performance and will be stress-tested in the whole-system evaluation.

**Architecture:**

- Tabular MLP branch: 80 features → `Linear(512) → BN → ReLU → Dropout → Linear(256) → Linear(256) → Linear(256)`
- Text branch: BioClinical-ModernBERT-large (frozen) → 1024-dim CLS → projected 256-dim
- Fusion: `concat[256 ‖ 256]` = 512-dim → classification heads
- Clinical notes: SOAP-format summaries generated via Groq LLM, cached for training

---

### Model 3 — Response QA LLM (Fine-tune + Few-shot)

The patient-facing response node was the most iterated component of the project. Its job is to take the synthesised diagnosis report (from the upstream imaging, EHR, RAG and reasoning nodes) plus the patient's own description, and produce a clear, empathetic, **severity-calibrated** reply that triages the patient and, where needed, escalates to urgent care or appointment booking.

Three medical LLM families were evaluated before settling on the final choice:

| Stage | Model family                | Type                                      | Outcome                         | Why we moved on                                                                                                                                                                                                                                                                                                                                       |
| ----- | --------------------------- | ----------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | **OpenMed (SuperClinical)** | Encoder / token-classification (NER, PII) | ❌ Rejected                     | These are **extraction** models (disease NER, PII de-identification) — they label spans, they cannot _generate_ a free-text answer. Architecturally unable to perform the response task.                                                                                                                                                              |
| 2     | **Llama3-OpenBioLLM-8B**    | Decoder / causal LM (fine-tuned)          | ⚠️ Fine-tuned, then de-selected | A true generative medical model. We QLoRA-fine-tuned it on ChatDoctor with Unsloth. However, the fine-tune **degraded triage**: on a textbook heart-attack case it recommended a routine stress test, whereas the _base_ model correctly advised emergency care. The unfiltered ChatDoctor data overwrote the model's pretrained emergency instincts. |
| 3     | **MedGemma-4B-IT** ★        | Multimodal decoder (reasoning)            | ✅ **Selected**                 | Out-of-the-box it triaged the same emergency case **correctly**, produced the best-structured reasoning, and at 4B fits constrained GPUs comfortably (and offers a multimodal upgrade path). Paired with a UK-localised system prompt + few-shot prompting, it meets the response-node requirements **without** a destructive fine-tune.              |

**Key finding — fine-tuning is not always the answer.** Fine-tuning `OpenBioLLM-8B` on the raw ChatDoctor corpus _reduced_ clinical safety, because the forum-sourced answers model a non-emergency context (e.g. "book a stress test" for chest pain) and the model imitated that style rather than learning calibrated urgency. The base/instruction-tuned models already encode stronger emergency recognition from pretraining. We therefore favour **MedGemma's base behaviour steered by prompt engineering**, reserving any future fine-tuning for a **cleaned, triage-filtered** dataset so it _preserves_ rather than erodes emergency judgement.

**Final response-node configuration:**

- **Model:** `google/medgemma-1.5-4b-it` (4-bit, served via Unsloth fast inference)
- **Prompting:** UK system instruction (999 / A&E / NHS 111 / GP / pharmacist) + 3 few-shot exemplars, one per severity tier (mild → self-care/pharmacist, moderate → GP/NHS 111, emergency → call 999)
- **Fine-tuning method (OpenBioLLM experiments):** QLoRA (4-bit base + LoRA adapters, r=32) on a single Kaggle T4 via **Unsloth**, with response-only loss masking; checkpoints streamed to the HuggingFace Hub for crash-safe resume
- **Safety boundary:** the LLM **communicates**; it is **not** the escalation authority. The urgent/999/booking decision is made by a deterministic rule layer keyed to red-flag symptoms and upstream-node outputs, biased toward over-triage.

> ⚠️ **Data-governance note (ChatDoctor):** the ChatDoctor configs (HealthCareMagic, iCliniq) are **real** patient–doctor exchanges scraped from telemedicine forums. De-identification was automated and imperfect (residual ages, dates, and free-text detail remain), and there is no documented patient consent for ML reuse. It is treated as a **research/prototyping** asset only — not relied upon as a GDPR-compliant basis for production, and no real patient data is served by the deployed system.

---

## 🗂️ Datasets

### Dataset 1 — NIH ChestX-ray14

- **Source:** NIH Clinical Center
- **Size:** ~45 GB · 112,120 PNG chest X-rays · 30,805 patients
- **Labels:** 14 thoracic diseases (Cardiomegaly, Pneumonia, Effusion, Atelectasis, etc.)
- **Download:** https://nihcc.app.box.com/v/ChestXray-NIHCC
- **Licence:** NIH Public Use (free for research/education; cite Wang et al., 2017)
- **Ethics:** Fully de-identified (HIPAA Safe Harbor); no registration required

### Dataset 2 — Synthea Synthetic EHR

- **Source:** MITRE Synthea / Kaggle
- **Size:** ~500 MB compressed · 1,376 patients used
- **Tables:** patients, conditions, observations, medications, encounters, procedures, careplans, allergies, immunizations, claims
- **Download:** https://www.kaggle.com/datasets/imtkaggleteam/synthetic-medical-dataset
- **Licence:** Apache 2.0 (open source; no real patients)
- **Ethics:** Entirely synthetic — no GDPR obligations

### Dataset 3 — Medical QA (HuggingFace)

- **Source:** Malikeh1375 / HuggingFace Hub (a repackaging of ChatDoctor + Medical Meadow)
- **Configs used for the response model:** `chatdoctor_healthcaremagic` + `chatdoctor_icliniq` — real patient→doctor Q&A (the `all-processed` mix was deliberately avoided, as it blends in exam MCQs and literature summarisation that teach the wrong behaviour)
- **Access:** `load_dataset("Malikeh1375/medical-question-answering-datasets", "chatdoctor_healthcaremagic")`
- **Licence:** MIT (dataset card) — a _copyright_ licence only; it does **not** establish GDPR/data-protection lawfulness
- **Ethics:** ⚠️ **Real, scraped** forum data with automated (imperfect) de-identification and no documented patient consent. Used for **research/prototyping only**; see the data-governance note under _Model 3_. The deployed system serves **no** real patient data.

### Knowledge Base (RAG — not a training dataset)

- **Source:** A-Z Family Medical Encyclopedia (Internet Archive)
- **Usage:** Chunked → ChromaDB embeddings → RAG QA enrichment at runtime
- **Status:** ✅ Built — vector store indexed and wired as the `rag_node` validation step

---

## ⚙️ Setup & Installation

### Prerequisites

- Python 3.11+
- Node.js 20+
- CUDA-capable GPU (recommended for model training)
- 100 GB+ storage for datasets

### Python Environment

```bash
# Clone the repository
git clone https://github.com/Professional-Project-Team-9/Week-8-Team-9.git
cd Week-8-Team-9

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate          # Linux / macOS
# venv\Scripts\activate           # Windows

# Install dependencies
pip install -r requirements.txt
```

### Key Python Dependencies

```txt
torch>=2.2.0
torchvision>=0.17.0
timm>=0.9.16
transformers>=4.40.0
datasets>=2.19.0
xgboost>=2.0.0
lightgbm>=4.3.0
scikit-learn>=1.4.0
imbalanced-learn>=0.12.0
optuna>=3.6.0
pandas>=2.2.0
numpy>=1.26.0
matplotlib>=3.8.0
seaborn>=0.13.0
onnx>=1.16.0
onnxruntime>=1.18.0
chromadb>=0.5.0
groq>=0.5.0
fastapi>=0.110.0
uvicorn>=0.29.0
```

### Front-End (Next.js — in progress)

```bash
# From the app/ directory
cd app
npm install                       # Next.js 14 + Vercel AI SDK
cp .env.example .env.local        # set inference API + (later) Google API keys
npm run dev                       # http://localhost:3000
```

---

## 🚀 Running the Notebooks

### Model 1 — ChestVision (Image Classification)

```bash
# 1. Download NIH ChestX-ray14 to data/raw/nih_chestxray/
#    Place images in:  data/raw/nih_chestxray/images/
#    Place CSVs in:    data/raw/nih_chestxray/

# 2. Run ViT-B/16 fine-tuned (selected model)
jupyter notebook notebooks/ChestXray_Competition_timm_ViT_ResNet.ipynb

# 3. Run EfficientNetV2B0 (comparison model)
jupyter notebook notebooks/ChestXray_Competition_EfficientNet.ipynb

# 4. Run ResNet-50 from scratch (baseline)
jupyter notebook notebooks/ChestXray_Model_Training_ResNet_scratch.ipynb
```

### Model 2 — ClinicalFusion (EHR Hybrid Model)

```bash
# 1. Download Synthea dataset to data/raw/synthea/

# 2. Set your Groq API key (for clinical note generation)
export GROQ_API_KEY=your_key_here

# 3. Run the hybrid EHR model (training, evaluation + per-label threshold tuning)
jupyter notebook notebooks/hybrid_ehr_model.ipynb
```

> **Note:** Clinical notes are generated via Groq LLM and cached to `clinical_notes_cache.csv` on first run. Subsequent runs load from cache — no repeated API calls.

### Deployed Model Services (HuggingFace Spaces)

```bash
# Each service under "models deployment/" is a Docker Space (uvicorn on :7860).
# Local smoke test before pushing:
cd "models deployment/chestvision"
ALLOW_NO_AUTH=1 uvicorn server:app --port 7860        # then hit /health

# Query a live Space (token required):
INFERENCE_API_TOKEN=... python query_space.py path/to/xray.png
```

---

## 🧪 Training Details

### Model 1 — Two-Phase Fine-Tuning (timm)

```python
# Phase 1: Train classification head only
for param in model.parameters():
    param.requires_grad = False
for param in model.get_classifier().parameters():
    param.requires_grad = True
optimizer = AdamW(model.parameters(), lr=1e-3)
# Train for 5 epochs

# Phase 2: Full model fine-tuning
for param in model.parameters():
    param.requires_grad = True
optimizer = AdamW(model.parameters(), lr=1e-5)
scheduler = CosineAnnealingLR(optimizer, T_max=15)
# Train for 15 epochs
```

### Model 2 — Hybrid Architecture

```python
# Text branch: BioClinical-ModernBERT-large (frozen)
BIOCLINICAL_MODEL = 'thomas-sounack/BioClinical-ModernBERT-large'
# hidden_size = 1024 → projected to 256-dim

# Tabular branch: deep MLP
# Linear(80, 512) → BN → ReLU → Dropout(0.3) → Linear(512,256)
# → ReLU → Dropout(0.3) → Linear(256, 256) → Linear(256, 256)

# Fusion: concat[256 ‖ 256] = 512-dim → 28 label outputs
# Loss: BCE with per-label pos_weight + label smoothing
# Eval: macro AUC-ROC + per-label F1 with tuned decision thresholds
```

---

## 📈 Evaluation Targets (KPIs)

| Model                  | Metric                  | Target      | Achieved                                                          |
| ---------------------- | ----------------------- | ----------- | ----------------------------------------------------------------- |
| ChestVision (ViT-B/16) | Mean AUC-ROC            | ≥ 0.82      | ✅ **0.8175** (≈0.82 over 14 pathologies)                         |
| ChestVision (ViT-B/16) | Per-class AUC           | ≥ 0.75      | ✅ Evaluated (cardio findings 0.88–0.91; rarer findings lower)    |
| ChestVision (ViT-B/16) | ONNX export & parity    | parity pass | ✅ Exported & parity-checked (INT8 quantisation pending)          |
| ChestVision (ViT-B/16) | Live serving            | endpoint up | ✅ FastAPI on HF Space (token-gated, `/predict`)                  |
| ClinicalFusion         | Macro AUC-ROC           | ≥ 0.85      | ✅ **0.8524**                                                     |
| ClinicalFusion         | F1 Macro                | ≥ 0.80      | 🔄 **0.5709** (tuned, ↑ from 0.4387 — target not yet met)         |
| ClinicalFusion         | False-low rate (safety) | < 2%        | ⏳ Pending (Phase 7 whole-system safety evaluation)               |
| ClinicalFusion         | Live serving            | endpoint up | ✅ FastAPI on HF Space (token-gated, `/predict`)                  |
| Response QA            | Emergency-triage recall | 100%        | ✅ Correct on emergency test cases (MedGemma-4B base + UK prompt) |

---

## 🔄 Next Steps

- [x] Train & evaluate ChestVision (ViT-B/16) — test AUC **0.818**, exported to ONNX
- [x] Train & evaluate ClinicalFusion — val macro AUC **0.852**; per-label threshold tuning (macro-F1 **0.44 → 0.57**)
- [x] Build & evaluate the Response QA model — OpenMed → OpenBioLLM (QLoRA fine-tune) → **MedGemma-4B-IT + UK few-shot** (selected)
- [x] Build ChromaDB vector store from A-Z Medical Encyclopedia (RAG validation layer)
- [x] **Phase 5 — model evaluation & optimisation complete**
- [x] **Deploy ChestVision + ClinicalFusion as token-gated FastAPI services on Hugging Face Spaces** (`/predict` + `/metadata` + `/health`, with `query_space.py` test clients) — _Week 8_
- [ ] **Build the Next.js front-end pages** (chat, X-ray/record upload, triage result + booking views) on the Vercel AI SDK — _in progress_
- [ ] Implement the **LangGraph.js agent** with all nodes (intake → route → xray/clinical → synthesise → clarify → rag → response → triage), calling the deployed model endpoints
- [ ] Connect **Google Calendar / Gmail API** for severity-based appointment booking and emergency escalation
- [ ] Export ClinicalFusion to ONNX + INT8 quantisation for a future serverless serving variant
- [ ] Assemble a cleaned, triage-filtered QA set for any future safe fine-tune
- [ ] **Phase 7 — end-to-end system evaluation & optimisation**: run the full agent on synthetic patient scenarios across all triage levels; report per-demographic performance and clinical-safety metrics (high-severity miss-rate < 2%)
- [ ] Run full test plan (unit tests, model KPI gates, UAT)

---

## 🔐 Ethical Statement

This project uses only de-identified public data (NIH ChestX-ray14) and entirely synthetic records (Synthea, Medical QA). No real patient information is used at any stage. The system is a **decision-support tool only** — not a replacement for clinical judgement. All outputs include a confidence score and a disclaimer directing users to seek in-person evaluation.

The deployed inference services (Hugging Face Spaces) are **token-gated** and, in line with the above, are exercised only with **synthetic or de-identified inputs**; no real patient data is transmitted to or served by any endpoint.

| Dataset          | GDPR                                 | Permission                | Collected Ethically               |
| ---------------- | ------------------------------------ | ------------------------- | --------------------------------- |
| NIH ChestX-ray14 | ✅ De-identified (HIPAA Safe Harbor) | ✅ NIH Public Use Licence | ✅ IRB-approved (NIH, 1992–2015)  |
| Synthea EHR      | ✅ Synthetic — no real individuals   | ✅ Apache 2.0             | ✅ Computer-generated (MITRE)     |
| Medical QA       | ✅ Public NLP corpora                | ✅ Apache 2.0             | ✅ Public sources (PubMed, MedQA) |

---

## 📚 Key References

- Wang, X. et al. (2017). _ChestX-ray8: Hospital-scale Chest X-ray Database_. IEEE CVPR.
- Walonoski, J. et al. (2018). _Synthea: Synthetic patient data_. JAMIA, 25(3):230–238.
- Google Research (2025). _MedGemma Technical Report_. arXiv:2507.05201.
- Rajpurkar, P. et al. (2017). _CheXNet: Radiologist-level pneumonia detection_. arXiv:1711.05225.
- Strick, D. et al. (2025). _Reproducing and Improving CheXNet_. arXiv:2505.06646.
- Li, D. et al. (2024). _MEDIQ: Question-asking LLMs for medical QA_. NeurIPS 2024.
- Sounack, T. et al. (2025). _BioClinical ModernBERT: A State-of-the-Art Long-Context Encoder for Biomedical and Clinical NLP_. arXiv:2506.10896.
- Malikeh1375. (2023). Medical question answering datasets [Dataset]. HuggingFace. https://huggingface.co/datasets/Malikeh1375/medical-question-answering-datasets
- Ankit Pal & Malaikannan Sankarasubbu. (2024). _Llama3-OpenBioLLM-8B_ [Model]. HuggingFace, Saama AI Labs. https://huggingface.co/aaditya/Llama3-OpenBioLLM-8B
- Sellergren, A. et al. / Google Research & DeepMind. (2025). _MedGemma: Medical vision-language foundation models built on Gemma 3_. arXiv:2507.05201. Model: https://huggingface.co/google/medgemma-1.5-4b-it
- Li, Y. et al. (2023). _ChatDoctor: A Medical Chat Model Fine-Tuned on LLaMA Using Medical Domain Knowledge_. Cureus 15(6):e40895. (HealthCareMagic-100k & iCliniq source data) arXiv:2303.14070.
- OpenMed. (2025). _OpenMed NER / SuperClinical clinical entity & PII models_ [Models]. HuggingFace. https://huggingface.co/OpenMed
- Han, D., Han, M. & the Unsloth team. (2024–2025). _Unsloth: 2× faster, 70% less-memory LLM fine-tuning_ [Software]. https://github.com/unslothai/unsloth

---

## 🤝 Contributing

1. Branch off `develop`: `git checkout -b feature/your-feature develop`
2. Commit with prefix: `[DATA]`, `[MODEL]`, `[APP]`, `[DOCS]`, `[FIX]`
3. Open a Pull Request to `develop` — requires one reviewer sign-off (Victor — Code Review Manager)
4. All CI checks must be green before merge (formatting, linting, ONNX parity)

---

## 📄 Licence

Code: **MIT Licence** — see `LICENSE` file.  
Datasets retain their original licences (NIH Public Use; Apache 2.0).  
Model weights: subject to respective model provider terms of use.

---

<div align="center">
  <sub>University of Hertfordshire · Masters Project · 2025–2026 · Week 8</sub>
</div>
