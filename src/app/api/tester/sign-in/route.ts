// app/api/tester/sign-in/route.ts   (your own route now, NOT under /api/auth)
import { cookies } from "next/headers";
import { isApprovedToken, signSession } from "@/lib/tester-session";

export async function POST(req: Request) {
    const { name, token } = await req.json();
    if (!isApprovedToken(token)) {
        return new Response("Invalid access token", { status: 401 });
    }
    (await cookies()).set("tester_session", signSession({ name, at: Date.now() }), {
        httpOnly: true, secure: true, sameSite: "lax", path: "/",
        maxAge: 60 * 60 * 24 * 30,
    });
    return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
    });
}