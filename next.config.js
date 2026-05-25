const { execSync } = require("child_process")
const withPWA = require("@ducanh2912/next-pwa").default

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

module.exports = withPWA({
  dest: "public",
  // Disable service worker in development to avoid stale cache issues
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      // Cache LinkedIn CDN profile photos via the proxy endpoint.
      // The proxy already sets Cache-Control: public, max-age=604800, immutable
      // but the service worker provides cross-session persistence on both
      // mobile and desktop browsers.
      urlPattern: /^\/api\/proxy-image/,
      handler: "CacheFirst",
      options: {
        cacheName: "profile-photos",
        expiration: {
          maxEntries: 500,                 // ~500 photos max (≈40 MB at 80 KB/photo)
          maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days, matching the HTTP cache header
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    {
      // Cache Google Favicons used for company logos in the companies / dashboard pages.
      urlPattern: /^https:\/\/www\.google\.com\/s2\/favicons/,
      handler: "CacheFirst",
      options: {
        cacheName: "company-favicons",
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
  ],
})(nextConfig)
