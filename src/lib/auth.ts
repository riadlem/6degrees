import { NextAuthOptions } from "next-auth"
import LinkedInProvider from "next-auth/providers/linkedin"
import { PrismaAdapter } from "@auth/prisma-adapter"
import prisma from "./prisma"
import { storeAuthError } from "./auth-error-store"

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as NextAuthOptions["adapter"],
  providers: [
    LinkedInProvider({
      clientId: process.env.LINKEDIN_CLIENT_ID!,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET!,
      client: { token_endpoint_auth_method: "client_secret_post" },
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name ?? `${profile.given_name} ${profile.family_name}`,
          email: profile.email,
          image: profile.picture,
        }
      },
    }),
  ],
  callbacks: {
    session: async ({ session, user }) => ({
      ...session,
      user: { ...session.user, id: user.id },
    }),
  },
  pages: {
    signIn: "/",
  },
  logger: {
    error(code, metadata) {
      storeAuthError(String(code), metadata)
      const msg = metadata instanceof Error ? metadata.message : JSON.stringify(metadata)
      console.error(`[next-auth] ${code}: ${msg}`)
    },
  },
  debug: process.env.NODE_ENV === "development",
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
    }
  }
}
