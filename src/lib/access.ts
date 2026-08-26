// lib/access.ts
const approved = new Set(
    (process.env.APPROVED_TOKENS ?? "")
        .split(",").map(t => t.trim()).filter(Boolean)
);

export function isApprovedToken(token?: string | null) {
    return !!token && approved.has(token);
}