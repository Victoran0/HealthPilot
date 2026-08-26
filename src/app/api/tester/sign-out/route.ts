// app/api/tester/sign-out/route.ts
import { cookies } from "next/headers";

export async function POST() {
    (await cookies()).delete("tester_session");
    return new Response(null, { status: 204 });
}