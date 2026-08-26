import { betterAuth } from "better-auth";
import Database from "better-sqlite3";
import { testerPlugin } from "./tester-plugin";

const database = new Database("auth.db");

export const auth = betterAuth({
    database,
    baseURL: process.env.BETTER_AUTH_URL,
    emailAndPassword: { enabled: true },
    plugins: [testerPlugin()],
});