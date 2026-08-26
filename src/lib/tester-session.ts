// lib/tester-session.ts
import { createHmac, timingSafeEqual } from "crypto";

const SECRET = process.env.SESSION_SECRET!; // long random string in .env.local
if (!SECRET) throw new Error("SESSION_SECRET is not set in the environment");

const approved = new Set(
    (process.env.APPROVED_TOKENS ?? "").split(",").map(t => t.trim()).filter(Boolean)
);

export function isApprovedToken(token?: string | null) {
    return !!token && approved.has(token);
}

export function signSession(payload: object) {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = createHmac("sha256", SECRET).update(body).digest("base64url");
    return `${body}.${sig}`;
}

export function verifySession(value?: string | null): { name: string } | null {
    if (!value) return null;
    const [body, sig] = value.split(".");
    if (!body || !sig) return null;
    const expected = createHmac("sha256", SECRET).update(body).digest("base64url");
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try { return JSON.parse(Buffer.from(body, "base64url").toString()); }
    catch { return null; }
}