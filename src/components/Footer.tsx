import React from "react";
import { Activity, GraduationCap } from "lucide-react";

export default function Footer() {
  return (
    <footer className="relative z-20 border-t border-white/10 bg-[#020617]/80 backdrop-blur-xl shadow-[0_-4px_30px_rgba(0,0,0,0.5)] mt-auto">
      <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-2">
        
        {/* Brand Logo - Matched the exact glow from the header */}
        <div className="flex items-center gap-2 text-white font-bold text-base tracking-tight opacity-80 hover:opacity-100 transition-opacity cursor-default">
          <Activity className="w-4 h-4 text-[#38bdf8] drop-shadow-[0_0_10px_rgba(56,189,248,0.8)]" />
          HealthPilot
        </div>

        {/* Academic Credit */}
        <div className="flex flex-col sm:flex-row items-center gap-1.5 text-xs text-slate-400 font-medium text-center md:text-right">
          <GraduationCap className="w-3.5 h-3.5 text-slate-500 hidden sm:block" />
          <span>
            Group 9 Data Science Project 
            <span className="hidden sm:inline mx-2 text-slate-600">|</span>
            <span className="block sm:inline mt-0.5 sm:mt-0">University of Hertfordshire</span>
            <span className="hidden sm:inline mx-2 text-slate-600">|</span>
            <span className="block sm:inline mt-0.5 sm:mt-0 text-slate-500">2026</span>
          </span>
        </div>

      </div>
    </footer>
  );
}