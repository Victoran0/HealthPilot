"use client";

import React from "react";
import { motion } from "framer-motion";
import { 
  Activity, ArrowLeft, Printer, Download, FileText, 
  User, Clock, AlertTriangle, Stethoscope, Pill, 
  History, ShieldAlert, ImageIcon, Database, BookOpen 
} from "lucide-react";
import Link from "next/link";

// --- MOCK DATA (Mirrors your agent.ts state) ---
const reportData = {
  id: "HP-2026-8912",
  timestamp: "July 23, 2026 - 17:21 GMT",
  patient: { age: 45, sex: "Male", id: "MRN-49201" },
  triage: {
    urgency: "GP_URGENT",
    label: "See your GP today",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    headline: "Requires urgent outpatient evaluation to rule out secondary complications.",
  },
  hpi: {
    chiefComplaint: "Severe chest tightness and productive cough.",
    symptoms: ["Chest tightness (Onset: 3 days ago)", "Productive cough (Yellow sputum)", "Low-grade fever"],
    relevantNegatives: ["No hemoptysis", "No lower extremity edema", "No recent travel"],
    pmh: ["Asthma (Childhood)", "Hypertension"],
    medications: ["Lisinopril 10mg", "Albuterol PRN"],
    allergies: ["Penicillin (Hives)"],
    redFlags: ["Tachycardia reported by patient wearable"],
  },
  analysis: {
    primary: { condition: "Acute Exacerbation of Asthma / Bronchitis", probability: 0.82, confidence: "High" },
    differentials: ["Community-Acquired Pneumonia", "COVID-19", "Pulmonary Embolism (Low probability)"],
    reasoning: "Patient presents with classic bronchospastic symptoms superimposed on a likely viral/bacterial URI. The productive cough and fever suggest an infectious trigger. X-ray shows no focal consolidation, making pneumonia less likely but not impossible.",
  },
  evidence: {
    xrayUrl: "https://images.unsplash.com/photo-1559706164-c1770b5dfaed?q=80&w=1000&auto=format&fit=crop", // Placeholder X-Ray
    ehrSynced: true,
    ragSources: 2,
  }
};

// --- ANIMATION VARIANTS ---
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } }
};

export default function ClinicalDocumentationPage() {
  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 selection:bg-blue-500/30 relative overflow-x-hidden pb-24">
      
      {/* BACKGROUND EFFECTS */}
      {/* Subtle grid for a "data/clinical" feel */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-20 pointer-events-none z-0" />
      {/* Glowing Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none z-0" />
      <div className="absolute top-[20%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-teal-500/10 blur-[120px] pointer-events-none z-0" />

      {/* HEADER */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 border-b border-white/10 backdrop-blur-xl shadow-[0_4px_30px_rgba(0,0,0,0.5)] bg-[#020617]/80">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2 text-white font-bold text-xl tracking-tight">
            <Activity className="w-6 h-6 text-[#38bdf8] drop-shadow-[0_0_10px_rgba(56,189,248,0.8)]" />
            HealthPilot <span className="hidden sm:inline text-slate-500 font-normal text-sm ml-2">Clinical Report</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm font-medium transition-colors">
            <Printer className="w-4 h-4" /> Print
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#38bdf8] hover:bg-blue-400 text-slate-950 text-sm font-bold transition-colors shadow-[0_0_15px_rgba(56,189,248,0.4)]">
            <Download className="w-4 h-4" /> Export EHR
          </button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 pt-10">
        
        {/* Report Meta */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Triage & Diagnostic Summary</h1>
            <p className="text-slate-400 flex items-center gap-2 text-sm">
              <FileText className="w-4 h-4" /> Report ID: <span className="font-mono text-slate-300">{reportData.id}</span>
              <span className="mx-2">•</span>
              <Clock className="w-4 h-4" /> {reportData.timestamp}
            </p>
          </div>
          <div className={`px-4 py-2 rounded-lg border ${reportData.triage.border} ${reportData.triage.bg} flex items-center gap-2`}>
            <ShieldAlert className={`w-5 h-5 ${reportData.triage.color}`} />
            <span className={`font-bold ${reportData.triage.color}`}>Acuity: {reportData.triage.label}</span>
          </div>
        </motion.div>

        <motion.div 
          variants={containerVariants} 
          initial="hidden" 
          animate="visible" 
          className="grid grid-cols-1 lg:grid-cols-3 gap-6"
        >
          
          {/* LEFT COLUMN: Patient & HPI */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Patient Demographics */}
            <motion.section variants={itemVariants} className="p-6 rounded-2xl bg-slate-900/60 border border-white/10 backdrop-blur-md shadow-lg">
              <div className="flex items-center gap-2 mb-4 text-[#38bdf8] font-semibold uppercase tracking-wider text-xs">
                <User className="w-4 h-4" /> Patient Profile
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-slate-500 text-xs mb-1">Age</div>
                  <div className="text-lg font-medium text-white">{reportData.patient.age} yrs</div>
                </div>
                <div>
                  <div className="text-slate-500 text-xs mb-1">Sex</div>
                  <div className="text-lg font-medium text-white">{reportData.patient.sex}</div>
                </div>
                <div>
                  <div className="text-slate-500 text-xs mb-1">MRN</div>
                  <div className="text-lg font-mono text-white">{reportData.patient.id}</div>
                </div>
              </div>
            </motion.section>

            {/* History of Present Illness */}
            <motion.section variants={itemVariants} className="p-6 rounded-2xl bg-slate-900/60 border border-white/10 backdrop-blur-md shadow-lg">
              <div className="flex items-center gap-2 mb-4 text-[#38bdf8] font-semibold uppercase tracking-wider text-xs">
                <Activity className="w-4 h-4" /> History of Present Illness
              </div>
              
              <div className="mb-6">
                <div className="text-slate-500 text-xs mb-2">Chief Complaint</div>
                <div className="text-lg text-white font-medium">{reportData.hpi.chiefComplaint}</div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="text-slate-500 text-xs mb-2">Reported Symptoms</div>
                  <ul className="space-y-2">
                    {reportData.hpi.symptoms.map((sym, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" /> {sym}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-slate-500 text-xs mb-2">Relevant Negatives</div>
                  <ul className="space-y-2">
                    {reportData.hpi.relevantNegatives.map((neg, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-600 mt-1.5 shrink-0" /> {neg}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {reportData.hpi.redFlags.length > 0 && (
                <div className="mt-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-red-400 text-xs font-bold uppercase mb-1">Red Flags Identified</div>
                    <div className="text-sm text-red-200">{reportData.hpi.redFlags.join(", ")}</div>
                  </div>
                </div>
              )}
            </motion.section>

            {/* Medical History (PMH, Meds, Allergies) */}
            <motion.section variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-5 rounded-2xl bg-slate-900/60 border border-white/10 backdrop-blur-md">
                <div className="flex items-center gap-2 mb-3 text-slate-400 text-xs uppercase font-bold">
                  <History className="w-4 h-4" /> PMH
                </div>
                <div className="flex flex-wrap gap-2">
                  {reportData.hpi.pmh.map((item, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 text-xs border border-slate-700">{item}</span>
                  ))}
                </div>
              </div>
              <div className="p-5 rounded-2xl bg-slate-900/60 border border-white/10 backdrop-blur-md">
                <div className="flex items-center gap-2 mb-3 text-slate-400 text-xs uppercase font-bold">
                  <Pill className="w-4 h-4" /> Medications
                </div>
                <div className="flex flex-wrap gap-2">
                  {reportData.hpi.medications.map((item, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 text-xs border border-slate-700">{item}</span>
                  ))}
                </div>
              </div>
              <div className="p-5 rounded-2xl bg-slate-900/60 border border-white/10 backdrop-blur-md">
                <div className="flex items-center gap-2 mb-3 text-slate-400 text-xs uppercase font-bold">
                  <AlertTriangle className="w-4 h-4" /> Allergies
                </div>
                <div className="flex flex-wrap gap-2">
                  {reportData.hpi.allergies.map((item, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-md bg-red-900/30 text-red-300 text-xs border border-red-800/50">{item}</span>
                  ))}
                </div>
              </div>
            </motion.section>

          </div>

          {/* RIGHT COLUMN: AI Analysis & Evidence */}
          <div className="space-y-6">
            
            {/* Diagnostic Analysis */}
            <motion.section variants={itemVariants} className="p-6 rounded-2xl bg-blue-950/20 border border-blue-500/30 backdrop-blur-md shadow-[0_0_30px_rgba(37,99,235,0.1)] relative overflow-hidden">
              {/* Decorative background glow */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-3xl rounded-full pointer-events-none" />
              
              <div className="flex items-center gap-2 mb-6 text-[#38bdf8] font-semibold uppercase tracking-wider text-xs">
                <Stethoscope className="w-4 h-4" /> AI Diagnostic Analysis
              </div>

              <div className="mb-6">
                <div className="text-slate-400 text-xs mb-1">Primary Assessment</div>
                <div className="text-lg font-bold text-white mb-3">{reportData.analysis.primary.condition}</div>
                
                {/* Probability Bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Probability</span>
                    <span className="text-[#38bdf8] font-mono">{reportData.analysis.primary.probability * 100}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }} 
                      animate={{ width: `${reportData.analysis.primary.probability * 100}%` }} 
                      transition={{ duration: 1, delay: 0.5 }}
                      className="h-full bg-gradient-to-r from-blue-600 to-[#38bdf8] rounded-full"
                    />
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <div className="text-slate-400 text-xs mb-2">Differential Diagnoses</div>
                <ul className="space-y-2">
                  {reportData.analysis.differentials.map((diff, i) => (
                    <li key={i} className="text-sm text-slate-300 flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-slate-500" /> {diff}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-4 border-t border-white/10">
                <div className="text-slate-400 text-xs mb-2">Clinical Reasoning</div>
                <p className="text-sm text-slate-300 leading-relaxed italic">
                  "{reportData.analysis.reasoning}"
                </p>
              </div>
            </motion.section>

            {/* Multimodal Evidence */}
            <motion.section variants={itemVariants} className="p-6 rounded-2xl bg-slate-900/60 border border-white/10 backdrop-blur-md shadow-lg">
              <div className="flex items-center gap-2 mb-4 text-slate-300 font-semibold uppercase tracking-wider text-xs">
                <Database className="w-4 h-4" /> Multimodal Evidence
              </div>

              <div className="space-y-3">
                {/* X-Ray Evidence */}
                <div className="flex items-center gap-4 p-3 rounded-xl bg-slate-800/50 border border-slate-700">
                  <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-slate-600 relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={reportData.evidence.xrayUrl} alt="X-Ray" className="object-cover w-full h-full opacity-80" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <ImageIcon className="w-4 h-4 text-white" />
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">Chest X-Ray</div>
                    <div className="text-xs text-emerald-400">Analyzed by ChestVision</div>
                  </div>
                </div>

                {/* EHR Evidence */}
                <div className="flex items-center gap-4 p-3 rounded-xl bg-slate-800/50 border border-slate-700">
                  <div className="w-12 h-12 rounded-lg bg-blue-900/30 border border-blue-500/30 flex items-center justify-center shrink-0">
                    <Database className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">EHR Integration</div>
                    <div className="text-xs text-emerald-400">Synced with Epic Systems</div>
                  </div>
                </div>

                {/* RAG Evidence */}
                <div className="flex items-center gap-4 p-3 rounded-xl bg-slate-800/50 border border-slate-700">
                  <div className="w-12 h-12 rounded-lg bg-purple-900/30 border border-purple-500/30 flex items-center justify-center shrink-0">
                    <BookOpen className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">Clinical Guidelines</div>
                    <div className="text-xs text-slate-400">{reportData.evidence.ragSources} sources referenced</div>
                  </div>
                </div>
              </div>
            </motion.section>

          </div>
        </motion.div>
      </main>
    </div>
  );
}