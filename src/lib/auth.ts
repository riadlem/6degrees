import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import prisma from "./prisma"
import { storeAuthError } from "./auth-error-store"
import { verifyPassword } from "@/lib/password"

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as NextAuthOptions["adapter"],
  session: { strategy: "jwt" },
  providers: [
    CredentialsProvider({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        const user = await (prisma.user as any).findUnique({ where: { email: credentials.email.toLowerCase() } }) as { id: string; name: string | null; email: string | null; image: string | null; password: string | null } | null
        if (!user?.password) return null
        if (!verifyPassword(credentials.password, user.password)) return null
        return { id: user.id, name: user.name, email: user.email, image: user.image }
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) token.id = user.id
      return token
    },
    session: async ({ session, token }) => ({
      ...session,
      user: { ...session.user, id: token.id as string },
    }),
  },
  pages: { signIn: "/" },
  logger: {
    error(code, metadata) {
      storeAuthError(String(code), metadata)
      const msg = metadata instanceof Error ? metadata.message : JSON.stringify(metadata)
      console.error(`[next-auth] ${code}: ${msg}`)
    },
  },
}

declare module "next-auth" {
  interface Session {
    user: { id: string; name?: string | null; email?: string | null; image?: string | null }
  }
}

declare module "next-auth/jwt" {
  interface JWT { id: string }
}
