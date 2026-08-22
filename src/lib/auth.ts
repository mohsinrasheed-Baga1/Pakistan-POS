import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

// v2.10.20: Auto-detect NEXTAUTH_URL for Vercel deployment
// Vercel provides VERCEL_URL automatically
const NEXTAUTH_URL =
  process.env.NEXTAUTH_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

const NEXTAUTH_SECRET =
  process.env.NEXTAUTH_SECRET || "pakpos-fallback-secret-for-vercel-build";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // v2.10.20: Skip DB auth on Vercel (web uses Supabase instead)
        if (process.env.VERCEL === "1") {
          return null; // Web portal uses separate auth
        }
        if (!credentials?.email || !credentials?.password) return null;
        const user = await db.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });
        if (!user || !user.active) return null;
        const ok = await bcrypt.compare(credentials.password, user.password);
        if (!ok) return null;
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        } as any;
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  secret: NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
};
