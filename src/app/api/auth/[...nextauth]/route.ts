import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// v2.10.20: Force dynamic — prevents Vercel prerendering error
export const dynamic = "force-dynamic";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
