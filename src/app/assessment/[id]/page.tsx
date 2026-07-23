"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { motion } from "framer-motion";
import { Activity, Send, User, ArrowLeft, ShieldAlert, StopCircle, Paperclip, X, Stethoscope, ListChecks, AlertTriangle } from "lucide-react";
import Link from "next/link";
import HeartbeatCanvas from "@/components/HeartBeatCanvas";
import { useParams } from "next/navigation";

async function fileToDownscaledDataUrl(file: File, maxEdge = 1024, quality = 0.85): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  return canvas.toDataURL("image/jpeg", quality);
}

const URGENCY_STYLE: Record<string, { bar: string; label: string }> = {
  EMERGENCY_999: { bar: "bg-red-600", label: "Emergency" },
  A_AND_E: { bar: "bg-red-500", label: "Go to A&E" },
  NHS_111: { bar: "bg-orange-500", label: "Urgent advice" },
  GP_URGENT: { bar: "bg-amber-500", label: "See your GP today" },
  GP_ROUTINE: { bar: "bg-blue-500", label: "GP request form" },
  PHARMACIST: { bar: "bg-emerald-600", label: "Pharmacist" },
  SELF_CARE: { bar: "bg-slate-500", label: "Self-care" },
};

function TriageCard({ triage }: { triage: any }) {
  if (!triage) return null;
  const style = URGENCY_STYLE[triage.urgency] ?? URGENCY_STYLE.NHS_111;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-3 space-y-3">
      <div className={`rounded-xl px-5 py-3 text-white font-semibold shadow-lg ${style?.bar}`}>
        <div className="text-[10px] uppercase tracking-wider opacity-80">{style?.label}</div>
        {triage.headline}
      </div>

      {triage.diagnosis?.condition && (
        <div className="rounded-xl border border-blue-500/30 bg-slate-900/70 p-4 backdrop-blur-md">
          <div className="mb-2 flex items-center gap-2 text-xs font-mono uppercase text-blue-300">
            <Stethoscope className="h-3.5 w-3.5" /> Assessment
          </div>
          <div className="text-[15px] font-medium text-white">{triage.diagnosis.condition}</div>
          <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
            <span>{Math.round((triage.diagnosis.probability ?? 0) * 100)}% probability</span>
            <span>·</span>
            <span>{triage.diagnosis.confidence} confidence</span>
          </div>
          {triage.diagnosis.differentials?.length > 0 && (
            <div className="mt-2 text-xs text-slate-400">
              Also considered: {triage.diagnosis.differentials.join(", ")}
            </div>
          )}
        </div>
      )}

      {triage.actions?.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4 backdrop-blur-md">
          <div className="mb-2 flex items-center gap-2 text-xs font-mono uppercase text-slate-400">
            <ListChecks className="h-3.5 w-3.5" /> What to do
          </div>
          <ol className="list-decimal space-y-1.5 pl-5 text-[14px] text-slate-200">
            {triage.actions.map((a: string, i: number) => <li key={i}>{a}</li>)}
          </ol>
        </div>
      )}

      {triage.safetyNetting?.length > 0 && (
        <div className="rounded-xl border-l-4 border-amber-400 bg-amber-500/10 p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-mono uppercase text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" /> When to get help sooner
          </div>
          <ul className="list-disc space-y-1 pl-5 text-[14px] text-amber-100/90">
            {triage.safetyNetting.map((snt: string, i: number) => <li key={i}>{snt}</li>)}
          </ul>
        </div>
      )}
    </motion.div>
  );
}

export default function AssessmentPage() {
  const mainRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [autoScroll, setAutoScroll] = useState(true);
  const prevCountRef = useRef(0);

  const [input, setInput] = useState("");
  const params = useParams();
  const assessmentId = params.id as string;

  const [xrayImageUrl, setXrayImageUrl] = useState<string | undefined>(undefined);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // --- NEW: State to track which images belong to which chat messages ---
  // state: keyed by user-message ordinal, not id
  const [attachedImages, setAttachedImages] = useState<Record<number, string>>({});
  // const pendingImageRef = useRef<string | null>(null);

  const { messages, status, stop, ...rest } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { consultId: assessmentId },
    }),
  }) as any;

  const sendMessage =
    rest.sendMessage || ((msg: any, opts?: any) => rest.append({ role: "user", content: msg.text }, opts));
  const isLoading = status === "submitted" || status === "streaming";

  const lastMessageText = useMemo(() => {
    const last = messages.at(-1);
    if (!last) return "";
    return last.parts
      ? last.parts.filter((p: any) => p.type === "text").map((p: any) => p.text).join("")
      : last.content ?? "";
  }, [messages]);

  const showLoading = useMemo(() => {
    if (!isLoading) return false;
    const last = messages.at(-1);
    if (!last) return false;
    
    if (last.role === "user") return true;
    
    if (last.role === "assistant") {
      const text = last.parts
        ? last.parts.filter((p: any) => p.type === "text").map((p: any) => p.text).join("")
        : last.content;
      return !text?.trim(); 
    }
    return false;
  }, [isLoading, messages]);

  // --- NEW: Attach the pending image to the newly created user message ---
  // useEffect(() => {
  //   if (pendingImageRef.current && messages.length > 0) {
  //     // The SDK appends the user message AND an empty assistant message almost simultaneously.
  //     // We must search backwards to find the actual user message we just sent.
  //     for (let i = messages.length - 1; i >= 0; i--) {
  //       if (messages[i].role === "user") {
  //         setAttachedImages((prev) => ({ ...prev, [messages[i].id]: pendingImageRef.current! }));
  //         pendingImageRef.current = null; // Clear the pending ref
  //         break;
  //       }
  //     }
  //   }
  // }, [messages]);

  useEffect(() => {
    if (!autoScroll) return;
    const el = mainRef.current;
    if (!el) return;

    const isNewMessage = messages.length !== prevCountRef.current;
    prevCountRef.current = messages.length;

    el.scrollTo({ top: el.scrollHeight, behavior: isNewMessage ? "smooth" : "auto" });
  }, [lastMessageText, messages.length, autoScroll, status]);

  const handleUserScroll = () => {
    const el = mainRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAutoScroll(distanceFromBottom < 120);
  };

  const jumpToLatest = () => {
    setAutoScroll(true);
    mainRef.current?.scrollTo({ top: mainRef.current.scrollHeight, behavior: "smooth" });
  };

  const awaitingXray = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const part = messages[i].parts?.find((p: any) => p.type === "data-artefact-request");
      if (part) return part.data?.requests?.includes("CHEST_XRAY") ?? false;
    }
    return false;
  }, [messages]);

  const showAttachButton = awaitingXray && !xrayImageUrl;

  const handlePaperclipClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; 
    if (!file) return;

    setUploadError(null);
    try {
      const dataUrl = await fileToDownscaledDataUrl(file);
      setXrayImageUrl(dataUrl);
    } catch {
      setUploadError("Could not read that image. Try a JPG or PNG.");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Allow submission if there is EITHER text OR an image
    if ((!input.trim() && !xrayImageUrl) || isLoading) return;

    // if (xrayImageUrl) {
    //   pendingImageRef.current = xrayImageUrl;
    // }

    if (xrayImageUrl) {
      const userOrdinal = messages.filter((m: any) => m.role === "user").length;
      const img = xrayImageUrl;
      setAttachedImages((prev) => ({ ...prev, [userOrdinal]: img }));
    }
    
    // If the user sends an image without typing anything, provide a default message
    const textToSend = input.trim() ? input : "I have attached my chest X-Ray for review.";

    sendMessage({ text: textToSend }, { body: { consultId: assessmentId, xrayImageUrl } });

    setInput("");
    setXrayImageUrl(undefined);
    setAutoScroll(true);
  };

  const imageByMessageId = useMemo(() => {
    const out: Record<string, string> = {};
    let idx = 0;
    for (const m of messages) {
      if (m.role === "user") {
        if (attachedImages[idx]) out[m.id] = attachedImages[idx] || "";
        idx++;
      }
    }
    return out;
  }, [messages, attachedImages]);

  return (
    <div className="fixed inset-0 bg-[#020617] text-slate-200 overflow-hidden selection:bg-blue-500/30">
      <HeartbeatCanvas />
      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-blue-600/20 blur-[120px] pointer-events-none z-0" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-teal-500/10 blur-[120px] pointer-events-none z-0" />

      <header className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 border-b border-white/10 backdrop-blur-sm shadow-[0_0_15px_rgba(37,99,235,0.6)] bg-slate-950/60">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
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

      <main
        ref={mainRef}
        onWheel={handleUserScroll}
        onTouchMove={handleUserScroll}
        className="absolute inset-0 overflow-y-auto px-6 pt-24 pb-48 z-10"
      >
        <div className="max-w-3xl mx-auto space-y-8">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }} className="flex gap-4 justify-start">
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

          {messages.map((m: any) => {
            const text = m.parts
              ? m.parts.filter((p: any) => p.type === "text").map((p: any) => p.text).join("")
              : m.content;

            const triage = m.parts?.find((p: any) => p.type === "data-triage")?.data;

            if (!text?.trim() && !triage && !attachedImages[m.id]) return null;

            return (
              <motion.div key={m.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex gap-4 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && (
                  <div className="w-8 h-8 shrink-0 rounded-lg bg-blue-900/40 border border-blue-500/50 flex items-center justify-center shadow-[0_0_15px_rgba(56,189,248,0.4)] mt-1">
                    <Activity className="w-4 h-4 text-[#38bdf8]" />
                  </div>
                )}
                <div className={`max-w-[85%] space-y-1 ${m.role === "user" ? "text-right" : "text-left"}`}>
                  <div className="text-xs text-slate-500 font-mono uppercase px-1">{m.role === "user" ? "You" : "HealthPilot"}</div>
                  
                  {/* Render the text bubble (and the image if it exists) */}
                  {(text?.trim() || imageByMessageId[m.id]) && (
                    <div className={`rounded-2xl px-5 py-3.5 text-[15px] leading-relaxed shadow-lg whitespace-pre-wrap ${m.role === "user" ? "bg-blue-600 text-white rounded-tr-sm shadow-[0_0_15px_rgba(37,99,235,0.3)]" : "bg-[#0f172a]/80 border border-white/10 text-slate-200 rounded-tl-sm backdrop-blur-md"}`}>
                      
                      {/* --- NEW: Render the attached image inside the chat bubble --- */}
                      {imageByMessageId[m.id] && (
                        <div className="mb-3 relative w-48 h-48 rounded-xl overflow-hidden border border-blue-400/30 shadow-inner bg-black/20">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={imageByMessageId[m.id]} alt="Attached X-Ray" className="object-cover w-full h-full" />
                        </div>
                      )}
                      
                      {text}
                    </div>
                  )}

                  {m.role === "assistant" && triage && <TriageCard triage={triage} />}
                </div>
                {m.role === "user" && (
                  <div className="w-8 h-8 shrink-0 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center mt-1">
                    <User className="w-4 h-4 text-slate-300" />
                  </div>
                )}
              </motion.div>
            );
          })}

          {showLoading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-4 justify-start">
              <div className="w-8 h-8 shrink-0 rounded-lg bg-blue-900/40 border border-blue-500/50 flex items-center justify-center shadow-[0_0_15px_rgba(56,189,248,0.4)] mt-1">
                <Activity className="w-4 h-4 text-[#38bdf8] animate-pulse" />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-slate-500 font-mono uppercase px-1">HealthPilot</div>
                <div className="bg-[#0f172a]/80 border border-white/10 rounded-2xl rounded-tl-sm px-5 py-4 flex items-center gap-1.5 backdrop-blur-md shadow-lg">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </motion.div>
          )}

          <div className="h-4" />
        </div>
      </main>

      <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#020617] via-[#020617]/90 to-transparent z-50">
        <div className="max-w-3xl mx-auto">
          {!autoScroll && isLoading && (
            <motion.button
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={jumpToLatest}
              className="mx-auto mb-3 flex items-center gap-2 rounded-full border border-blue-500/30 bg-slate-900/90 px-4 py-2 text-xs text-blue-300 shadow-lg backdrop-blur-md hover:bg-slate-800 transition-colors"
            >
              <Activity className="h-3 w-3 animate-pulse" />
              HealthPilot is responding — jump to latest
            </motion.button>
          )}

          {xrayImageUrl && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mb-3 flex items-center gap-3 bg-slate-900/80 border border-blue-500/30 w-fit p-1.5 pr-3 rounded-lg backdrop-blur-md shadow-lg">
              <div className="relative w-10 h-10 rounded-md overflow-hidden border border-slate-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={xrayImageUrl} alt="X-ray preview" className="object-cover w-full h-full" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-slate-200">X-ray attached</span>
                <span className="text-[10px] text-slate-400">Send a message to submit it</span>
              </div>
              <button
                type="button"
                onClick={() => setXrayImageUrl(undefined)}
                className="ml-2 p-1 rounded-full hover:bg-slate-800 text-slate-400 hover:text-red-400 transition-colors"
              >
                <X size={14} />
              </button>
            </motion.div>
          )}

          {uploadError && <p className="mb-2 text-xs text-red-400">{uploadError}</p>}

          <form onSubmit={handleSubmit} className="relative flex items-center gap-2">
            <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileChange} />

            {showAttachButton && (
              <motion.button
                type="button"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={handlePaperclipClick}
                className="absolute left-2 z-10 h-10 w-10 flex items-center justify-center rounded-full text-blue-400 ring-2 ring-blue-500/40 hover:text-blue-300 hover:bg-blue-500/10 transition-colors"
                title="Attach your chest X-ray"
              >
                <Paperclip size={20} />
              </motion.button>
            )}

            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading && status !== "streaming"}
              placeholder="Describe your symptoms..."
              className={`w-full bg-black/40 border border-white/10 focus-visible:ring-2 focus-visible:ring-blue-500/50 h-14 pr-14 rounded-full backdrop-blur-xl shadow-2xl text-white placeholder:text-slate-500 transition-all outline-none ${showAttachButton ? "pl-14" : "pl-6"}`}
              autoComplete="off"
            />

            <div className="absolute right-2">
              {isLoading ? (
                <button type="button" onClick={stop} className="h-10 w-10 flex items-center justify-center rounded-full text-blue-400 hover:bg-blue-500/20 transition-colors">
                  <StopCircle size={20} />
                </button>
              ) : (
                <button 
                  type="submit" 
                  // CHANGED: Button is now enabled if there is text OR an image
                  disabled={!input.trim() && !xrayImageUrl} 
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