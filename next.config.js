const { execSync } = require("child_process")

function gitInfo() {
  try {
    const date = execSync("git log -1 --format=%cI", { timeout: 5000 }).toString().trim()
    const hash = execSync("git log -1 --format=%h",  { timeout: 5000 }).toString().trim()
    return { date, hash }
  } catch {
    // Vercel sets VERCEL_GIT_COMMIT_SHA automatically; fall back to build time
    const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? ""
    return { date: new Date().toISOString(), hash: sha.slice(0, 7) || "local" }
  }
}

const { date: BUILD_DATE, hash: BUILD_HASH } = gitInfo()

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "media.licdn.com" },
      { protocol: "https", hostname: "*.licdn.com" },
    ],
  },
  env: {
    NEXT_PUBLIC_BUILD_DATE: BUILD_DATE,
    NEXT_PUBLIC_BUILD_HASH: BUILD_HASH,
  },
}

module.exports = nextConfig
