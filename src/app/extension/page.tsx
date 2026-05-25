"use client"

import { useState } from "react"
import { Download, Puzzle, Chrome, ArrowRight, Check, Globe, Users, BookOpen, Sparkles } from "lucide-react"
import EnrichContent from "@/components/EnrichContent"

const STEPS = [
  {
    n: 1,
    title: "Download & install",
    desc: "Download the ZIP, open chrome://extensions, enable Developer mode, click \"Load unpacked\" and select the unzipped folder.",
  },
  {
    n: 2,
    title: "Connect to 6Degrees",
    desc: "Click the extension icon in your toolbar. Paste your 6Degrees URL and your personal token from Settings.",
  },
  {
    n: 3,
    title: "Capture LinkedIn profiles",
    desc: "Visit any LinkedIn profile. A \"Save to 6Degrees\" button appears — click it to preview and save the contact.",
  },
]

const FEATURES = [
  { icon: Users, title: "Full profile capture", desc: "Name, photo, headline, location, mutual connections" },
  { icon: BookOpen, title: "Work & education history", desc: "Complete experience and education timeline from the profile" },
  { icon: Globe, title: "1st & beyond", desc: "Enrich existing contacts or add new ones beyond your 1st-degree network" },
]

export default function ExtensionPage() {
  const [downloaded, setDownloaded] = useState(false)

  function handleDownload() {
    setDownloaded(true)
    setTimeout(() => setDownloaded(false), 3000)
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      {/* Hero */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-blue-600 mb-6 shadow-lg shadow-blue-200">
          {/* Network graph icon — matches the Chrome extension icon */}
          <svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="22" cy="22" r="5.5" fill="white"/>
            <circle cx="8"  cy="8"  r="3.5" fill="white"/>
            <circle cx="36" cy="8"  r="3.5" fill="white"/>
            <circle cx="8"  cy="36" r="3.5" fill="white"/>
            <circle cx="36" cy="36" r="3.5" fill="white"/>
            <line x1="11"  y1="11"  x2="18.5" y2="18.5" stroke="rgba(255,255,255,0.65)" strokeWidth="2" strokeLinecap="round"/>
            <line x1="33"  y1="11"  x2="25.5" y2="18.5" stroke="rgba(255,255,255,0.65)" strokeWidth="2" strokeLinecap="round"/>
            <line x1="11"  y1="33"  x2="18.5" y2="25.5" stroke="rgba(255,255,255,0.65)" strokeWidth="2" strokeLinecap="round"/>
            <line x1="33"  y1="33"  x2="25.5" y2="25.5" stroke="rgba(255,255,255,0.65)" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-3">6Degrees for Chrome</h1>
        <p className="text-gray-500 text-lg max-w-xl mx-auto">
          Capture any LinkedIn profile — work history, education, mutual connections — and save it directly to your 6Degrees network.
        </p>
      </div>

      {/* Download card */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-3xl p-8 text-white mb-10 shadow-xl shadow-blue-200">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Chrome size={18} className="opacity-80" />
              <span className="text-sm font-medium opacity-80">Chrome Extension · Manifest V3</span>
            </div>
            <h2 className="text-2xl font-bold mb-1">6Degrees Extension</h2>
            <p className="text-blue-100 text-sm">v1.0 · Works on any LinkedIn profile page</p>
          </div>
          <a
            href="/6degrees-extension.zip"
            download="6degrees-extension.zip"
            onClick={handleDownload}
            className="flex items-center gap-2 bg-white text-blue-700 font-semibold px-5 py-3 rounded-xl hover:bg-blue-50 transition-colors shrink-0 shadow-md"
          >
            {downloaded ? <Check size={18} className="text-green-600" /> : <Download size={18} />}
            {downloaded ? "Downloaded!" : "Download ZIP"}
          </a>
        </div>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        {FEATURES.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center mb-3">
              <Icon size={18} className="text-blue-600" />
            </div>
            <p className="font-semibold text-gray-900 text-sm mb-1">{title}</p>
            <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      {/* Setup steps */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <Puzzle size={16} className="text-gray-400" />
          <h2 className="font-semibold text-gray-900">Setup in 3 steps</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {STEPS.map((step) => (
            <div key={step.n} className="px-6 py-5 flex items-start gap-4">
              <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                {step.n}
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm mb-0.5">{step.title}</p>
                <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Get token CTA */}
      <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-2xl px-6 py-5 mb-12">
        <div>
          <p className="font-semibold text-gray-900 text-sm">Need your token?</p>
          <p className="text-xs text-gray-500 mt-0.5">Generate one from your Settings page and paste it into the extension.</p>
        </div>
        <a
          href="/settings"
          className="flex items-center gap-1.5 text-sm text-blue-600 font-medium hover:text-blue-700 shrink-0"
        >
          Go to Settings <ArrowRight size={14} />
        </a>
      </div>

      {/* Enrich section */}
      <div className="border-t border-gray-100 pt-10">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={18} className="text-blue-600" />
          <h2 className="text-xl font-bold text-gray-900">Enrich contacts</h2>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Contacts that are missing LinkedIn data — visit their profiles with the Chrome extension to fill in the gaps.
        </p>
        <EnrichContent />
      </div>
    </div>
  )
}
