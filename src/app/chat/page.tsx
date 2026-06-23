"use client";

import React, { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { motion } from "framer-motion";
import { Activity, Send, User, ArrowLeft, ShieldAlert, StopCircle } from "lucide-react";
import Link from "next/link";

export default function ChatPage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");

  const { messages, status, stop, ...rest } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
  }) as any;

  const sendMessage = rest.sendMessage || ((msg: any) => rest.append({ role: "user", content: msg.text }));
  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  return (
    <div className="flex flex-col h-screen bg-[#020617] text-slate-200 overflow-hidden selection:bg-blue-500/30 relative">
      
      {/* FIXED GLASSMORPHISM: Added glowing background orbs so the backdrop-blur actually has something to blur! */}
      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-blue-600/20 blur-[120px] pointer-events-none z-0" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-teal-500/10 blur-[120px] pointer-events-none z-0" />

      {/* Header - Increased transparency to make the glass effect pop */}
      <header className="relative z-20 flex items-center justify-between px-6 py-4 bg-[#020617]/60 backdrop-blur-xl border-b border-white/10 shadow-lg">
        <div className="flex items-center gap-4">
          <Link 
            href="/" 
            className="p-2 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2 text-white font-bold text-xl tracking-tight">
            <Activity className="w-6 h-6 text-[#38bdf8] drop-shadow-[0_0_10px_rgba(56,189,248,0.8)]" />
            HealthPilot <span className="hidden sm:inline text-slate-500 font-normal text-sm ml-2">Triage Session</span>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
          <ShieldAlert className="w-3 h-3" />
          <span className="hidden sm:inline">Not for emergencies</span>
          <span className="sm:hidden">Non-emergency</span>
        </div>
      </header>

      {/* Chat Messages Area */}
      <main className="flex-1 overflow-y-auto p-6 relative z-10 scroll-smooth">
        <div className="max-w-3xl mx-auto space-y-8 pb-32 pt-4">
          
          {/* FIXED INITIAL MESSAGE: Hardcoded welcome message guarantees it shows up immediately */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="flex gap-4 justify-start"
          >
            <div className="w-8 h-8 shrink-0 rounded-lg bg-blue-900/40 border border-blue-500/50 flex items-center justify-center shadow-[0_0_15px_rgba(56,189,248,0.4)] mt-1">
              <Activity className="w-4 h-4 text-[#38bdf8]" />
            </div>
            <div className="max-w-[85%] space-y-1 text-left">
              <div className="text-xs text-slate-500 font-mono uppercase px-1">HealthPilot</div>
              <div className="rounded-2xl px-5 py-4 text-[15px] leading-relaxed shadow-lg bg-[#0f172a]/80 border border-white/10 text-slate-200 rounded-tl-sm backdrop-blur-md">
                Hello. I am HealthPilot, your clinical triage assistant. How can I help you with your symptoms or assessment today?
              </div>
            </div>
          </motion.div>

          {/* Dynamic Chat History */}
          {messages.map((m: any) => {
            const text = m.parts
              ? m.parts.filter((p: any) => p.type === "text").map((p: any) => p.text).join("")
              : m.content;

            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-4 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.role === 'assistant' && (
                  <div className="w-8 h-8 shrink-0 rounded-lg bg-blue-900/40 border border-blue-500/50 flex items-center justify-center shadow-[0_0_15px_rgba(56,189,248,0.4)] mt-1">
                    <Activity className="w-4 h-4 text-[#38bdf8]" />
                  </div>
                )}

                <div className={`max-w-[85%] space-y-1 ${m.role === "user" ? "text-right" : "text-left"}`}>
                  <div className="text-xs text-slate-500 font-mono uppercase px-1">
                    {m.role === "user" ? "You" : "HealthPilot"}
                  </div>
                  <div 
                    className={`rounded-2xl px-5 py-3.5 text-[15px] leading-relaxed shadow-lg ${
                      m.role === 'user' 
                        ? 'bg-blue-600 text-white rounded-tr-sm shadow-[0_0_15px_rgba(37,99,235,0.3)]' 
                        : 'bg-[#0f172a]/80 border border-white/10 text-slate-200 rounded-tl-sm backdrop-blur-md'
                    }`}
                  >
                    {text}
                  </div>
                </div>

                {m.role === 'user' && (
                  <div className="w-8 h-8 shrink-0 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center mt-1">
                    <User className="w-4 h-4 text-slate-300" />
                  </div>
                )}
              </motion.div>
            );
          })}

          {/* Loading Indicator */}
          {isLoading && messages.at(-1)?.role === "user" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-4 justify-start">
              <div className="w-8 h-8 shrink-0 rounded-lg bg-blue-900/40 border border-blue-500/50 flex items-center justify-center shadow-[0_0_15px_rgba(56,189,248,0.4)] mt-1">
                <Activity className="w-4 h-4 text-[#38bdf8] animate-pulse" />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-slate-500 font-mono uppercase px-1">HealthPilot</div>
                <div className="bg-[#0f172a]/80 border border-white/10 rounded-2xl rounded-tl-sm px-5 py-4 flex items-center gap-1.5 backdrop-blur-md shadow-lg">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </motion.div>
          )}
          
          <div ref={scrollRef} className="h-4" />
        </div>
      </main>

      {/* Input Area - Increased transparency for glass effect */}
      <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#020617] via-[#020617]/90 to-transparent z-20">
        <div className="max-w-3xl mx-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!input.trim() || isLoading) return;
              sendMessage({ text: input });
              setInput("");
            }}
            className="relative flex items-center gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading && status !== "streaming"}
              placeholder="Describe your symptoms..."
              className="w-full bg-black/40 border border-white/10 focus-visible:ring-2 focus-visible:ring-blue-500/50 h-14 pl-6 pr-14 rounded-full backdrop-blur-xl shadow-2xl text-white placeholder:text-slate-500 transition-all outline-none"
              autoComplete="off"
            />

            <div className="absolute right-2">
              {isLoading ? (
                <button
                  type="button"
                  onClick={stop}
                  className="h-10 w-10 flex items-center justify-center rounded-full text-blue-400 hover:bg-blue-500/20 transition-colors"
                >
                  <StopCircle size={20} />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="h-10 w-10 flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.6)] transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 disabled:shadow-none"
                >
                  <Send size={18} className="ml-0.5" />
                </button>
              )}
            </div>
          </form>

          <p className="text-center text-xs text-slate-500 mt-4">
            HealthPilot AI can make mistakes. Always consult a healthcare professional for medical advice.
          </p>
        </div>
      </div>
    </div>
  );
}