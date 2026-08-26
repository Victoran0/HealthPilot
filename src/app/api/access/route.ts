// app/api/access/route.ts
import { cookies } from "next/headers";
import { isApprovedToken } from "@/lib/access";

export async function POST(req: Request) {
    const { token } = await req.json();
    if (!isApprovedToken(token)) {
        return new Response("Invalid token", { status: 401 });
    }
    (await cookies()).set("tester_token", token, {
        httpOnly: true, secure: true, sameSite: "lax",
        path: "/", maxAge: 60 * 60 * 24 * 30, // 30 days
    });
    return new Response("ok");
}