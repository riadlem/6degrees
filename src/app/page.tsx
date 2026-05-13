import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import SignInPage from "./signin"

export default async function Home() {
  const session = await getServerSession(authOptions)
  if (session) redirect("/contacts")
  return <SignInPage />
}
