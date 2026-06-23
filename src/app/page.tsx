"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import MedicalCanvas from "@/components/MedicalCanvas";
import { Activity, Brain, Shield, Stethoscope, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function HealthPilotLanding() {
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });

  const yText = useTransform(scrollYProgress, [0, 1], [0, 300]);
  const opacityText = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

    // NEW: Features Section Parallax
  const featuresRef = useRef(null);
  const { scrollYProgress: featuresScroll } = useScroll({
    target: featuresRef,
    offset: ["start start", "end start"], // Tracks from when it hits the top, until it's covered
  });
  
  // As the next section slides over, move the features down slower, fade out, and shrink slightly
  const featuresY = useTransform(featuresScroll, [0, 1], [0, 250]); 
  const featuresOpacity = useTransform(featuresScroll, [0, 1], [1, 0.1]);
  const featuresScale = useTransform(featuresScroll, [0, 1], [1, 0.95]);

  const fadeIn = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
  };

  const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.2 },
    },
  };

  return (
    // Removed text-slate-900 from main wrapper so we can control dark/light sections
    <main ref={containerRef} className="relative min-h-screen overflow-hidden">
      
      <MedicalCanvas />

      {/* Navigation - Updated to dark theme */}
      <nav className="fixed top-0 w-full z-50 bg-slate-950/50 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white font-bold text-xl tracking-tight">
            <Activity className="w-6 h-6 text-[#38bdf8]" />
            HealthPilot
          </div>
          <div className="hidden md:flex gap-6 text-sm font-medium text-slate-300">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#technology" className="hover:text-white transition-colors">Technology</a>
            <a href="#clinical" className="hover:text-white transition-colors">Clinical Validation</a>
          </div>
          <button className="bg-[#38bdf8] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-white hover:text-[#38bdf8] transition-all shadow-[0_0_20px_rgba(37,99,235,0.4)] hover:text-[#38bdf8]">
            Request Demo
          </button>
        </div>
      </nav>

      {/* Hero Section - Updated to dark theme text */}
      {/* Hero Section - Updated for high contrast against 3D Bloom */}
      <section className="relative z-10 h-screen flex items-center justify-center px-6 pt-16">
        
        {/* ADDED: A subtle dark radial gradient behind the text. 
            This naturally dims the glowing DNA exactly where the text sits, without looking like a box. */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(2,6,23,0.6)_0%,transparent_50%)] pointer-events-none z-0" />

        <motion.div 
          style={{ y: yText, opacity: opacityText }}
          className="max-w-4xl mx-auto text-center z-10 relative"
        >
          {/* Badge - Darkened the background and added a blue glow so it stands out */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-950/80 border border-[#38bdf8]/50 text-[#38bdf8] text-sm font-medium mb-6 backdrop-blur-md shadow-[0_0_15px_rgba(37,99,235,0.3)] "
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#38bdf8] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#38bdf8]"></span>
            </span>
            System Online v2.4
          </motion.div>
          
          {/* H1 - Added heavy text shadows */}
          <motion.h1 
            initial="hidden" animate="visible" variants={fadeIn}
            className="text-5xl md:text-7xl font-extrabold tracking-tight text-white mb-6 [text-shadow:_0_4px_24px_rgb(0_0_0_/_80%)]"
          >
            Multimodal AI for <br className="hidden md:block" />
            
            {/* 
              CHANGED: 
              1. Matched button color (blue-600 to [#38bdf8] gradient)
              2. Added a crisp white outline (-webkit-text-stroke)
              3. Added a heavy black text shadow
            */}
            <span className="text-transparent bg-clip-text bg-gradient-to-r  [text-shadow:_0_4px_24px_rgb(0_0_0_/_80%)] from-[#38bdf8] to-teal-300">
              Clinical Triage
            </span>
          </motion.h1>
          
          {/* Paragraph - Made text slightly brighter (slate-200), thicker (font-medium), and added heavy shadow */}
          <motion.p 
            initial="hidden" animate="visible" variants={fadeIn}
            className="text-lg md:text-xl text-slate-200 font-medium mb-10 max-w-2xl mx-auto [text-shadow:_0_2px_10px_rgb(0_0_0_/_100%)]"
          >
            HealthPilot integrates medical imaging, genomics, and clinical notes to provide rapid, accurate disease diagnosis and prioritize patient care in real-time.
          </motion.p>
          
          <motion.div 
            initial="hidden" animate="visible" variants={fadeIn}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link
              href="/chat"
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#38bdf8] text-white px-8 py-3 rounded-md font-medium hover:bg-white hover:text-[#38bdf8] transition-all shadow-[0_0_20px_rgba(37,99,235,0.4)]"
            >
              Start Triage Assessment <ArrowRight className="w-4 h-4" />
            </Link>
            <button className="w-full sm:w-auto px-8 py-3 rounded-md font-medium border border-slate-600 bg-slate-900/80 text-white hover:bg-slate-800 backdrop-blur-md transition-colors shadow-[0_0_20px_rgba(0,0,0,0.5)]">
              View Clinical Documentation
            </button>
          </motion.div>
        </motion.div>

        {/* Transition Gradient */}
        <div className="absolute bottom-0 left-0 w-full h-18 bg-gradient-to-t from-white to-transparent pointer-events-none" />
      </section>

      {/* Features Section (Keep this exactly as you had it, ensuring it has bg-white and relative z-20) */}
      {/* Features Section - Parallax Wrapper */}
      <section 
        ref={featuresRef}
        id="features" 
        className="py-24 backdrop-blur-md shadow-[0_0_15px_rgba(37,99,235,0.3)] bg-slate-950/80 relative z-20 border-t border-slate-100"
      >
        {/* Sticky container locks to the screen */}
        <div className="max-w-7xl mx-auto px-6">
          
          {/* Motion div applies the parallax movement, fade, and scale */}
          <motion.div 
            style={{ y: featuresY, opacity: featuresOpacity, scale: featuresScale }}
            className="max-w-7xl mx-auto px-6 w-full"
          >
            <motion.div 
              initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={fadeIn}
              className="text-center mb-16"
            >
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Comprehensive Diagnostic Intelligence</h2>
              <p className="text-slate-300 max-w-2xl mx-auto">Our proprietary neural networks analyze multiple data modalities simultaneously, reducing diagnostic latency by up to 40%.</p>
            </motion.div>

            <motion.div 
              variants={staggerContainer}
              initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }}
              className="grid md:grid-cols-3 gap-8"
            >
              {features.map((feature, idx) => (
                <motion.div key={idx} variants={fadeIn} whileHover={{ y: -5 }} className="h-full">
                  <div className="h-full p-6 rounded-xl border border-slate-700 bg-slate-900/50 hover:bg-slate-800 hover:shadow-xl hover:shadow-blue-900/20 transition-all duration-300 backdrop-blur-sm">
                    <div className="w-12 h-12 rounded-lg bg-blue-900/50 border border-blue-500/30 text-[#38bdf8] flex items-center justify-center mb-6 shadow-[0_0_10px_rgba(56,189,248,0.2)]">
                      {feature.icon}
                    </div>
                    <h3 className="text-xl font-semibold text-white mb-3">{feature.title}</h3>
                    <p className="text-slate-400 leading-relaxed">{feature.description}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
        {/* Transition Gradient */}
        <div className="absolute bottom-0 left-0 w-full h-18 bg-gradient-to-t from-white to-transparent pointer-events-none" />
      </section>

      {/* Explainable AI Section - Slides OVER the parallax section */}
      <section className="py-24 text-white relative z-20 overflow-hidden backdrop-blur-md shadow-[0_0_15px_rgba(37,99,235,0.3)] bg-slate-950/80">
        <div className="max-w-7xl mx-auto px-6 relative z-10 flex flex-col lg:flex-row items-center gap-16 w-full">
          <motion.div 
            initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeIn}
            className="lg:w-1/2"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-6">Explainable AI for Clinicians</h2>
            <p className="text-slate-300 text-lg mb-8">
              HealthPilot doesn't just give a diagnosis; it shows its work. Our attention-mapping technology highlights the exact regions in X-rays and specific phrases in clinical notes that led to the triage decision.
            </p>
            <ul className="space-y-4">
              {['FDA Cleared Algorithms', 'HIPAA Compliant Infrastructure', 'EHR Integration (Epic, Cerner)'].map((item, i) => (
                <li key={i} className="flex items-center gap-3 text-slate-200">
                  <div className="w-6 h-6 rounded-full bg-teal-500/20 text-[#38bdf8] flex items-center justify-center">
                    <Shield className="w-3 h-3" />
                  </div>
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>
          
          {/* Abstract UI Mockup */}
          <motion.div 
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="lg:w-1/2 w-full"
          >
            <div className="relative rounded-2xl bg-slate-950 border border-slate-700 p-4 shadow-2xl shadow-black/80">
              <div className="flex gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
              </div>
              <div className="space-y-4">
                <div className="h-8 bg-slate-800 rounded w-1/3"></div>
                <div className="h-32 bg-slate-800 rounded w-full flex items-center justify-center text-slate-500 border border-slate-700/50">
                  [ Multimodal Analysis Visualization ]
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="h-20 bg-slate-800 rounded"></div>
                  <div className="h-20 bg-slate-800 rounded"></div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </main>
  );
}

const features = [
  {
    icon: <Brain className="w-6 h-6" />,
    title: "Multimodal Fusion",
    description: "Combines structured EHR data, unstructured clinical notes, and DICOM imaging into a single unified diagnostic vector."
  },
  {
    icon: <Activity className="w-6 h-6" />,
    title: "Real-time Triage",
    description: "Automatically stratifies patients by acuity, ensuring critical cases are flagged for immediate physician review."
  },
  {
    icon: <Stethoscope className="w-6 h-6" />,
    title: "Diagnostic Copilot",
    description: "Suggests differential diagnoses and recommends follow-up labs based on the latest peer-reviewed medical guidelines."
  }
];