"use client";

import React from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Microscope, BarChart3, FileCheck, AlertTriangle, CheckCircle2 } from "lucide-react";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

const validationPillars = [
  {
    title: "NLP Evaluation Metrics",
    icon: <BarChart3 className="w-6 h-6 text-[#38bdf8]" />,
    desc: "Our diagnostic reasoning and triage outputs are rigorously evaluated against gold-standard clinical datasets using advanced NLP metrics including BERT-score and ROUGE, ensuring high semantic similarity to expert physician reasoning."
  },
  {
    title: "Deterministic Safety Floors",
    icon: <ShieldCheck className="w-6 h-6 text-amber-400" />,
    desc: "HealthPilot does not rely solely on LLM discretion. Hardcoded, deterministic safety floors evaluate all extracted data. If red flags (e.g., FAST stroke signs) are detected, the system automatically overrides the model and escalates to emergency triage."
  },
  {
    title: "Imbalanced Data Handling",
    icon: <Microscope className="w-6 h-6 text-purple-400" />,
    desc: "Medical datasets are inherently skewed. We utilize imbalanced-learn techniques alongside XGBoost to ensure our tabular models accurately predict rare but critical conditions without being biased by common presentations."
  },
  {
    title: "Continuous Fine-Tuning",
    icon: <FileCheck className="w-6 h-6 text-emerald-400" />,
    desc: "Our core LLMs are continuously fine-tuned on proprietary clinical Q&A datasets using Unsloth and QLoRA, optimizing the model's ability to conduct empathetic, highly relevant patient interviews."
  }
];

export default function ClinicalValidationPage() {
  return (
    <div className="flex flex-col min-h-screen bg-[#020617] text-slate-200 selection:bg-blue-500/30 relative overflow-x-hidden">
      <Nav />

      {/* BACKGROUND EFFECTS */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-20 pointer-events-none z-0" />
      <div className="absolute top-[20%] left-[50%] -translate-x-1/2 w-[60vw] h-[60vw] rounded-full bg-emerald-500/5 blur-[150px] pointer-events-none z-0" />

      <main className="relative z-10 flex-1 max-w-5xl mx-auto px-6 pt-32 pb-24 w-full">
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/30 border border-emerald-500/30 text-emerald-400 text-sm font-medium mb-6 shadow-lg">
            <ShieldCheck className="w-4 h-4" /> Patient Safety First
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold text-white mb-6 tracking-tight">
            Rigorous <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-[#38bdf8]">Clinical Validation</span>
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
            AI in healthcare requires zero compromise. HealthPilot is built on a foundation of strict evaluation metrics, deterministic safety nets, and peer-reviewed guidelines.
          </p>
        </motion.div>

        {/* Pillars Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
          {validationPillars.map((pillar, idx) => (
            <motion.div 
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1, duration: 0.5 }}
              className="p-8 rounded-2xl bg-slate-900/60 border border-slate-700 backdrop-blur-md shadow-xl hover:border-slate-600 transition-colors"
            >
              <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center border border-slate-700 mb-6 shadow-inner">
                {pillar.icon}
              </div>
              <h3 className="text-xl font-bold text-white mb-3">{pillar.title}</h3>
              <p className="text-slate-400 leading-relaxed text-sm">{pillar.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Safety Floor Banner */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="p-8 rounded-2xl bg-gradient-to-br from-amber-950/40 to-red-950/40 border border-amber-500/30 backdrop-blur-md shadow-2xl relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/10 blur-3xl rounded-full pointer-events-none" />
          
          <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
            <div className="w-20 h-20 shrink-0 rounded-full bg-amber-500/20 flex items-center justify-center border border-amber-500/50 shadow-[0_0_30px_rgba(245,158,11,0.3)]">
              <AlertTriangle className="w-10 h-10 text-amber-400" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white mb-2">The Emergency Backstop</h3>
              <p className="text-slate-300 mb-4">
                Our architecture guarantees that if the patient describes symptoms matching critical conditions (e.g., unresponsive, severe bleeding, anaphylaxis), the system bypasses standard diagnostic routing and immediately triggers an <strong>EMERGENCY_999</strong> or <strong>A_AND_E</strong> pathway.
              </p>
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-400">
                <CheckCircle2 className="w-4 h-4" /> Deterministic override active on all sessions
              </div>
            </div>
          </div>
        </motion.div>

      </main>

      <Footer />
    </div>
  );
}