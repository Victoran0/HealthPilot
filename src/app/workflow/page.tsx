"use client";

import React from "react";
import { motion } from "framer-motion";
import { 
  ArrowLeft, Activity, BrainCircuit, MessageSquareText, 
  ImageIcon, Database, BookOpen, ShieldCheck, Stethoscope, Network
} from "lucide-react";
import Link from "next/link";
import Footer from "@/components/Footer";

const workflowSteps = [
  {
    id: "01",
    title: "Dynamic Clinical Interview",
    agents: "Recipient & Inquirer Agents",
    icon: <MessageSquareText className="w-6 h-6 text-blue-400" />,
    color: "from-blue-600 to-blue-400",
    borderColor: "border-blue-500/30",
    bg: "bg-blue-950/20",
    description: "The system conducts a dynamic, non-repeating interview. The Recipient Agent extracts structured HPI (History of Present Illness), while the Inquirer Agent determines the next most clinically relevant question to ask.",
    details: [
      "Extracts Chief Complaint, PMH, Medications, and Allergies.",
      "Deterministically requests Chest X-Rays for cardiorespiratory presentations.",
      "Stops asking questions once the minimum viable diagnostic threshold is met."
    ]
  },
  {
    id: "02",
    title: "Multimodal Evidence Gathering",
    agents: "Parallel Processing Nodes",
    icon: <Network className="w-6 h-6 text-purple-400" />,
    color: "from-purple-600 to-purple-400",
    borderColor: "border-purple-500/30",
    bg: "bg-purple-950/20",
    description: "Once the interview is complete, the system fans out to gather evidence from multiple modalities simultaneously, ensuring no diagnostic delay.",
    details: [
      "ChestVision: Analyzes uploaded DICOM/JPEG X-Rays for focal consolidations or abnormalities.",
      "EHR Node: Pulls historical patient data and lab baselines.",
      "RAG Node: Retrieves the latest peer-reviewed clinical guidelines."
    ]
  },
  {
    id: "03",
    title: "Diagnostic Synthesis",
    agents: "Analyser Agent",
    icon: <BrainCircuit className="w-6 h-6 text-emerald-400" />,
    color: "from-emerald-600 to-emerald-400",
    borderColor: "border-emerald-500/30",
    bg: "bg-emerald-950/20",
    description: "The Analyser Agent acts as the attending physician. It waits for all multimodal evidence to arrive, then synthesizes it against the patient's HPI to formulate a diagnosis.",
    details: [
      "Generates a primary assessment with calculated probability.",
      "Provides a list of differential diagnoses.",
      "Outputs explainable clinical reasoning for its decision."
    ]
  },
  {
    id: "04",
    title: "Safety & Triage Routing",
    agents: "Triage Agent & Safety Floors",
    icon: <ShieldCheck className="w-6 h-6 text-amber-400" />,
    color: "from-amber-600 to-amber-400",
    borderColor: "border-amber-500/30",
    bg: "bg-amber-950/20",
    description: "Before any output reaches the patient, deterministic safety floors evaluate the data. If red flags (e.g., FAST stroke signs, anaphylaxis) are detected, the model's urgency is overridden and escalated.",
    details: [
      "Maps the final decision to standard clinical pathways (e.g., A&E, NHS 111, GP Routine).",
      "Generates actionable next steps and strict safety-netting advice.",
      "Streams the final, safe response back to the patient interface."
    ]
  }
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.3 } }
};

const itemVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.6, ease: "easeOut" } }
};

export default function WorkflowPage() {
  return (
    <div className="flex flex-col bg-[#020617]">
    <div className="min-h-screen bg-[#020617] text-slate-200 selection:bg-blue-500/30 relative overflow-x-hidden pb-24">
      
      {/* BACKGROUND EFFECTS */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-20 pointer-events-none z-0" />
      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none z-0" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-teal-500/10 blur-[120px] pointer-events-none z-0" />

      {/* HEADER */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 border-b border-white/10 backdrop-blur-xl shadow-[0_4px_30px_rgba(0,0,0,0.5)] bg-[#020617]/80">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2 text-white font-bold text-xl tracking-tight">
            <Activity className="w-6 h-6 text-[#38bdf8] drop-shadow-[0_0_10px_rgba(56,189,248,0.8)]" />
            HealthPilot <span className="hidden sm:inline text-slate-500 font-normal text-sm ml-2">Architecture</span>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="relative z-10 max-w-5xl mx-auto px-6 pt-16">
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-700 text-slate-300 text-sm font-medium mb-6 shadow-lg">
            <Network className="w-4 h-4 text-[#38bdf8]" /> LangGraph Multi-Agent System
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-6 tracking-tight">
            How HealthPilot <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#38bdf8] to-teal-300">Thinks</span>
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
            HealthPilot is not a single chatbot. It is a deterministic, state-driven graph of specialized AI agents and safety floors working in parallel to ensure clinical accuracy.
          </p>
        </motion.div>

        {/* WORKFLOW TIMELINE */}
        <motion.div 
          variants={containerVariants} 
          initial="hidden" 
          animate="visible" 
          className="relative space-y-12 before:absolute before:inset-0 before:ml-8 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-blue-500/50 before:via-purple-500/50 before:to-amber-500/50"
        >
          {workflowSteps.map((step, index) => (
            <motion.div key={step.id} variants={itemVariants} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              
              {/* Timeline Node / Icon */}
              <div className="flex items-center justify-center w-16 h-16 rounded-full border-4 border-[#020617] bg-slate-900 shadow-[0_0_20px_rgba(0,0,0,0.5)] shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 relative">
                <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${step.color} opacity-20 blur-md`} />
                {step.icon}
              </div>
              
              {/* Content Card */}
              <div className="w-[calc(100%-5rem)] md:w-[calc(50%-3rem)] p-6 rounded-2xl bg-slate-900/60 border border-white/10 backdrop-blur-md shadow-xl hover:border-white/20 transition-colors relative overflow-hidden">
                {/* Subtle background tint based on agent color */}
                <div className={`absolute top-0 right-0 w-32 h-32 ${step.bg} blur-3xl rounded-full pointer-events-none`} />
                
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`text-xs font-bold uppercase tracking-wider text-transparent bg-clip-text bg-gradient-to-r ${step.color}`}>
                      Step {step.id}
                    </span>
                    <span className="text-xs font-mono text-slate-500 px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
                      {step.agents}
                    </span>
                  </div>
                  
                  <h3 className="text-2xl font-bold text-white mb-3">{step.title}</h3>
                  <p className="text-slate-300 text-sm leading-relaxed mb-5">
                    {step.description}
                  </p>
                  
                  <ul className="space-y-2">
                    {step.details.map((detail, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-400">
                        <div className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${step.color} mt-1.5 shrink-0`} />
                        {detail}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

            </motion.div>
          ))}
        </motion.div>

      </main>
    </div>
    <Footer />
    </div>
  );
}