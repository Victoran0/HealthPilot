// lib/tester-plugin.ts
import { createAuthEndpoint, APIError } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { BetterAuthPlugin } from "better-auth";
import { z } from "zod";
import { createHash } from "crypto";

const approved = new Set(
    (process.env.APPROVED_TOKENS ?? "").split(",").map(t => t.trim()).filter(Boolean)
);

export const testerPlugin = () => ({
    id: "tester",
    endpoints: {
        signIn: createAuthEndpoint(
            "/tester/sign-in",
            { method: "POST", body: z.object({ name: z.string().min(1), token: z.string().min(1) }) },
            async (ctx) => {
                const { name, token } = ctx.body;

                if (!approved.has(token)) {
                    throw new APIError("UNAUTHORIZED", { message: "Invalid access token" });
                }

                const email = `tester-${createHash("sha256").update(token).digest("hex").slice(0, 16)}@testers.local`;

                const found = await ctx.context.internalAdapter.findUserByEmail(email);
                let user = found?.user;

                if (!user) {
                    user = await ctx.context.internalAdapter.createUser(
                        { email, name, emailVerified: true },
                        { method: "email-password" }   // source is an object in 1.7.1
                    );
                }

                const session = await ctx.context.internalAdapter.createSession(user.id); // no request arg
                await setSessionCookie(ctx, { session, user });

                return ctx.json({ ok: true });
            }
        ),
    },
} satisfies BetterAuthPlugin);