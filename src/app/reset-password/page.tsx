"use client"

import { Suspense, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Loader2 } from "lucide-react"

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token") ?? ""
  const router = useRouter()

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)

  if (!token) {
    return (
      <div className="text-center space-y-3">
        <p className="text-sm text-red-600">Invalid reset link.</p>
        <Link href="/forgot-password" className="text-blue-600 hover:underline text-sm font-medium">
          Request a new one
        </Link>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError("Passwords don't match."); return }
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (res.ok) {
        setDone(true)
        setTimeout(() => router.push("/"), 2000)
      } else {
        setError(data.error ?? "Something went wrong.")
      }
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-green-600">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        </div>
        <p className="text-sm text-green-700 font-medium">Password updated! Redirecting…</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="New password"
        required
        minLength={8}
        autoFocus
        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <input
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Confirm new password"
        required
        minLength={8}
        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {error && (
        <p className="text-sm text-red-600 text-center">
          {error}{" "}
          {error.includes("expired") && (
            <Link href="/forgot-password" className="underline">Request a new link</Link>
          )}
        </p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
      >
        {loading && <Loader2 size={16} className="animate-spin" />}
        Set new password
      </button>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <span className="text-6xl font-black text-blue-600">6°</span>
          <h1 className="mt-3 text-2xl font-bold text-gray-900">Set new password</h1>
          <p className="mt-2 text-gray-500 text-sm">Choose a strong password for your account.</p>
        </div>
        <Suspense fallback={<div className="h-32 animate-pulse bg-gray-100 rounded-xl" />}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  )
}
