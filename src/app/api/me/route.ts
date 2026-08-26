// app/api/me/route.ts
import { cookies } from "next/headers";
import { verifySession } from "@/lib/tester-session";

export async function GET() {
    const session = verifySession((await cookies()).get("tester_session")?.value);
    if (!session) return new Response("Unauthorized", { status: 401 });
    return Response.json({ name: session.name });
}