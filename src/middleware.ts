// middleware.ts  — optimistic existence check
import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
    if (!req.cookies.get("tester_session")?.value) {
        return NextResponse.redirect(new URL("/sign-in", req.url));
    }
    return NextResponse.next();
}
export const config = { matcher: ["/assessment/:path*"] };