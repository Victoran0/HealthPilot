"use client";

import React from "react";
import { motion } from "framer-motion";
import { Cpu, Database, Layers, Code, Network, Box, Server, Zap } from "lucide-react";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

const techStack = [
  {
    category: "Multi-Agent Orchestration",
    icon: <Network className="w-6 h-6 text-purple-400" />,
    color: "border-purple-500/30",
    bg: "bg-purple-500/10",
    items: [
      { name: "LangGraph", desc: "Deterministic, state-driven graph architecture for multi-agent routing." },
      { name: "Vercel AI SDK", desc: "High-performance streaming and UI state management." },
      { name: "Orama & Upstash", desc: "Vector search and RAG (Retrieval-Augmented Generation) for clinical guidelines." }
    ]
  },
  {
    category: "Deep Learning & Vision",
    icon: <BrainCircuitIcon className="w-6 h-6 text-blue-400" />,
    color: "border-blue-500/30",
    bg: "bg-blue-500/10",
    items: [
      { name: "PyTorch & TIMM", desc: "Core deep learning framework and vision models for X-Ray analysis." },
      { name: "Unsloth & QLoRA", desc: "Optimized 4-bit fine-tuning for 8B+ parameter LLMs on consumer hardware." },
      { name: "ONNX Runtime", desc: "Hardware-accelerated, low-latency model inference." }
    ]
  },
  {
    category: "Classical ML & Tabular",
    icon: <Database className="w-6 h-6 text-emerald-400" />,
    color: "border-emerald-500/30",
    bg: "bg-emerald-500/10",
    items: [
      { name: "XGBoost & LightGBM", desc: "Gradient boosting frameworks for structured EHR and demographic data." },
      { name: "Scikit-Learn", desc: "Classical machine learning pipelines and preprocessing." },
      { name: "Optuna", desc: "Automated hyperparameter optimization for maximum clinical accuracy." }
    ]
  },
  {
    category: "Frontend & Infrastructure",
    icon: <Layers className="w-6 h-6 text-amber-400" />,
    color: "border-amber-500/30",
    bg: "bg-amber-500/10",
    items: [
      { name: "Next.js 15 & React 19", desc: "The bleeding edge of web frameworks with Server Components." },
      { name: "T3 Stack (tRPC & Prisma)", desc: "End-to-end typesafe APIs and database ORM." },
      { name: "Three.js & WebGL", desc: "GPU-accelerated 3D clinical visualizations via React Three Fiber." }
    ]
  }
];

// Helper icon component
function BrainCircuitIcon(props: any) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M9 13a4.5 4.5 0 0 0 3-4"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M12 13h4"/><path d="M12 18h6a2 2 0 0 1 2 2v1"/><path d="M12 8h8"/><path d="M16 8V5a2 2 0 0 1 2-2"/><circle cx="16" cy="13" r=".5"/><circle cx="18" cy="3" r=".5"/><circle cx="20" cy="21" r=".5"/><circle cx="20" cy="8" r=".5"/></svg>;
}

export default function TechnologyPage() {
  return (
    <div className="flex flex-col min-h-screen bg-[#020617] text-slate-200 selection:bg-blue-500/30 relative overflow-x-hidden">
      <Nav />

      {/* BACKGROUND EFFECTS */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-20 pointer-events-none z-0" />
      <div className="absolute top-[10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none z-0" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-purple-500/10 blur-[120px] pointer-events-none z-0" />

      <main className="relative z-10 flex-1 max-w-7xl mx-auto px-6 pt-32 pb-24 w-full">
        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-700 text-slate-300 text-sm font-medium mb-6 shadow-lg">
            <Code className="w-4 h-4 text-[#38bdf8]" /> Full-Stack Architecture
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold text-white mb-6 tracking-tight">
            Powered by <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#38bdf8] to-blue-500">Cutting-Edge</span> Tech
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
            HealthPilot bridges the gap between high-performance web infrastructure and state-of-the-art machine learning, delivering real-time multimodal inference at scale.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {techStack.map((stack, idx) => (
            <motion.div 
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1, duration: 0.5 }}
              className={`p-8 rounded-2xl bg-slate-900/60 border ${stack.color} backdrop-blur-md shadow-xl hover:bg-slate-900/80 transition-colors`}
            >
              <div className="flex items-center gap-4 mb-6">
                <div className={`w-12 h-12 rounded-xl ${stack.bg} flex items-center justify-center border ${stack.color}`}>
                  {stack.icon}
                </div>
                <h2 className="text-2xl font-bold text-white">{stack.category}</h2>
              </div>
              <div className="space-y-6">
                {stack.items.map((item, i) => (
                  <div key={i}>
                    <h3 className="text-lg font-semibold text-slate-200 mb-1 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-slate-500" /> {item.name}
                    </h3>
                    <p className="text-sm text-slate-400 pl-6">{item.desc}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}