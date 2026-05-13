"use client"

import { signIn } from "next-auth/react"

export default function SignInPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm text-center space-y-8">
        {/* Logo */}
        <div>
          <span className="text-6xl font-black text-blue-600">6°</span>
          <h1 className="mt-3 text-2xl font-bold text-gray-900">6Degrees</h1>
          <p className="mt-2 text-gray-500 text-sm leading-relaxed">
            Navigate your LinkedIn network — filter, organise and share
            your contacts by industry, role and location.
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-2 gap-3 text-left">
          {[
            ["🔍", "Search & filter", "By industry, role, location"],
            ["📋", "Create lists", "Curate targeted contact lists"],
            ["✍️", "Add notes", "Keep context on each contact"],
            ["🔗", "Share & export", "Web link or PDF export"],
          ].map(([icon, title, desc]) => (
            <div key={title} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <div className="text-xl mb-1">{icon}</div>
              <p className="text-xs font-semibold text-gray-900">{title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
            </div>
          ))}
        </div>

        {/* Sign in */}
        <button
          onClick={() => signIn("linkedin", { callbackUrl: "/contacts" })}
          className="w-full flex items-center justify-center gap-3 bg-[#0A66C2] hover:bg-[#004182] text-white font-semibold py-3.5 px-6 rounded-xl transition-colors shadow-sm"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
          </svg>
          Sign in with LinkedIn
        </button>

        <p className="text-xs text-gray-400 leading-relaxed">
          Requires the LinkedIn Member Data Portability API (EU/EEA members only).
          Your data stays in your own database.
        </p>
      </div>
    </div>
  )
}
