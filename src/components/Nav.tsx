import { Activity } from 'lucide-react'
import React from 'react'

const Nav = () => {
  return (
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
          <button type='button' className="bg-[#38bdf8] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-white hover:text-[#38bdf8] transition-all shadow-[0_0_20px_rgba(37,99,235,0.4)] ">
            Request Demo
          </button>
        </div>
      </nav>
  )
}

export default Nav
