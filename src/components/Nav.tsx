import { Activity } from 'lucide-react'
import { FaGithub } from "react-icons/fa";
import React, { useEffect, useState } from 'react'
import Link from 'next/link'

const Nav = () => {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    const fetchStars = async () => {
      try {
        const res = await fetch(
          "https://api.github.com/repos/Victoran0/HealthPilot"
        );

        if (!res.ok) throw new Error("Failed to fetch stars");

        const repo = await res.json();
        setStars(repo.stargazers_count);
      } catch (error) {
        console.error(error);
      }
    };

    fetchStars();
  }, []);

  return (
    <nav className="fixed top-0 w-full z-50 bg-slate-950/50 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-white font-bold text-xl tracking-tight">
            <Activity className="w-6 h-6 text-[#38bdf8]" />
            HealthPilot
          </Link>
          
          <div className="hidden md:flex gap-6 text-sm font-medium text-slate-300">
            <Link href="/#features" className="hover:text-white transition-colors">Features</Link>
            <Link href="/technology" className="hover:text-white transition-colors">Technology</Link>
            <Link href="/clinical" className="hover:text-white transition-colors">Clinical Validation</Link>
          </div>
          
          {/* CHANGED: Replaced Request Demo with Star on GitHub */}
          <a 
            href="https://github.com/Victoran0/HealthPilot" // Replace with your actual GitHub repo URL
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-[#38bdf8] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-white hover:text-[#38bdf8] transition-all shadow-[0_0_20px_rgba(37,99,235,0.4)]"
          >
            <FaGithub className="w-4 h-4" />
            Star on GitHub {stars !== null && `(${stars})`} 
          </a>
        </div>
      </nav>
  )
}

export default Nav