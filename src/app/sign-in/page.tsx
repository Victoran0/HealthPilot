"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Activity, User, Key, ArrowRight, ShieldAlert, Loader2 } from "lucide-react";
import Link from "next/link";
import Nav from "@/components/Nav";

export default function SignInPage() {
    const router = useRouter();
    const [name, setName] = useState("");
    const [token, setToken] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    async function submit(e?: React.FormEvent) {
        if (e) e.preventDefault();
        if (!name.trim() || !token.trim()) return;

        setIsLoading(true);
        setError("");

        try {
            const res = await fetch("/api/tester/sign-in", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, token }),
            });

            if (res.ok) {
                router.push("/assessment");
            } else {
                setError("Invalid access token");
                // setTimeout(() => router.replace("/"), 1500);
                setIsLoading(false);
            }
        } catch (err) {
            setError("Connection error. Please try again.");
            setIsLoading(false);
        }
    }

    return (
        <>
            <Nav />
            <div className="min-h-screen flex items-center justify-center bg-[#020617] text-slate-200 relative overflow-hidden selection:bg-blue-500/30 px-6">

                {/* BACKGROUND EFFECTS */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-20 pointer-events-none z-0" />
                <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-blue-600/20 blur-[120px] pointer-events-none z-0" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-teal-500/10 blur-[120px] pointer-events-none z-0" />

                {/* SIGN IN CARD */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className="w-full max-w-md relative z-10"
                >
                    <div className="p-8 rounded-2xl bg-slate-900/60 border border-white/10 backdrop-blur-xl shadow-[0_0_40px_rgba(0,0,0,0.5)]">

                        {/* Header */}
                        <div className="text-center mb-8">
                            <Link href="/" className="inline-flex items-center justify-center gap-2 text-white font-bold text-2xl tracking-tight mb-2 hover:opacity-80 transition-opacity">
                                <Activity className="w-8 h-8 text-[#38bdf8] drop-shadow-[0_0_10px_rgba(56,189,248,0.8)]" />
                                HealthPilot
                            </Link>
                            <p className="text-slate-400 text-sm">Authorized Access Only</p>
                        </div>

                        {/* Error Banner */}
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-3 text-red-400 text-sm font-medium"
                            >
                                <ShieldAlert className="w-5 h-5 shrink-0" />
                                {error}
                            </motion.div>
                        )}

                        {/* Form */}
                        <form onSubmit={submit} className="space-y-5">

                            {/* Name Input */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Name</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <User className="h-5 w-5 text-slate-500" />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Dr. Jane Doe"
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        disabled={isLoading}
                                        className="w-full bg-black/40 border border-white/10 focus-visible:ring-2 focus-visible:ring-blue-500/50 h-12 pl-11 pr-4 rounded-xl text-white placeholder:text-slate-600 transition-all outline-none disabled:opacity-50"
                                    />
                                </div>
                            </div>

                            {/* Token Input */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Access Token</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <Key className="h-5 w-5 text-slate-500" />
                                    </div>
                                    <input
                                        type="password"
                                        placeholder="••••••••••••"
                                        value={token}
                                        onChange={e => setToken(e.target.value)}
                                        disabled={isLoading}
                                        className="w-full bg-black/40 border border-white/10 focus-visible:ring-2 focus-visible:ring-blue-500/50 h-12 pl-11 pr-4 rounded-xl text-white placeholder:text-slate-600 transition-all outline-none disabled:opacity-50 font-mono tracking-widest"
                                    />
                                </div>
                            </div>

                            {/* Submit Button */}
                            <button
                                type="submit"
                                disabled={isLoading || !name.trim() || !token.trim()}
                                className="w-full h-12 mt-4 flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-[0_0_15px_rgba(37,99,235,0.4)] transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100 disabled:shadow-none"
                            >
                                {isLoading ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <>
                                        Authenticate <ArrowRight className="w-4 h-4" />
                                    </>
                                )}
                            </button>
                        </form>

                    </div>

                    {/* Footer Note */}
                    <p className="text-center text-xs text-slate-500 mt-6">
                        Secure connection established. All access attempts are logged.
                    </p>
                </motion.div>
            </div>
        </>
    );
}