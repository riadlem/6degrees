/**
 * tests/scraper/run.mjs
 *
 * Scraper regression test — verifies that content.js correctly scrapes
 * name, company, and photo from saved LinkedIn profile snapshots.
 *
 * Usage:
 *   node --test tests/scraper/run.mjs
 *
 * Fixtures live in tests/scraper/fixtures/*.json.  Each fixture is a JSON
 * object with:
 *   name        – human label for the test
 *   slug        – LinkedIn vanity URL slug (used as window.location.pathname)
 *   title       – <title> string (e.g. "Keith Morrison - Fintech | LinkedIn")
 *   mainHtml    – innerHTML of the <main> element captured from the real page
 *   expected    – { firstName, lastName, company?, hasPhoto?, photoIdContains? }
 *
 * Capture a fixture:
 *   1. Open any LinkedIn /in/ profile while logged in.
 *   2. Open the 6Degrees extension popup → click "Copy fixture".
 *   3. Paste the JSON into tests/scraper/fixtures/<name>.json.
 *   4. Edit the "expected" section if the current scrape result is wrong.
 *
 * How it works:
 *   - Uses Node's built-in test runner (no extra dependencies).
 *   - Runs the scraper in a real Chromium browser via Playwright so that
 *     getBoundingClientRect(), image layout, and CSS are all authentic.
 *   - Chrome extension APIs (chrome.runtime, chrome.storage) are mocked.
 *   - The page is served from a local HTTP route matching /in/<slug> so
 *     that slugFromUrl() returns the correct value.
 */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.join(__dirname, "fixtures")
const CONTENT_JS_PATH = path.join(__dirname, "../../chrome-extension/content.js")

// ── Load fixtures ─────────────────────────────────────────────────────────────
const fixtureFiles = fs.existsSync(FIXTURES_DIR)
  ? fs.readdirSync(FIXTURES_DIR).filter(f => f.endsWith(".json"))
  : []

if (fixtureFiles.length === 0) {
  console.error(`
No fixtures found in ${FIXTURES_DIR}

To add a fixture:
  1. Install the extension and open a LinkedIn /in/ profile.
  2. Open the 6Degrees popup → click "Copy fixture" in the debug panel.
  3. Paste into tests/scraper/fixtures/<person-name>.json
  4. Edit "expected" if the current scrape is wrong.
`)
  process.exit(0)
}

const fixtures = fixtureFiles.map(f => ({
  file: f,
  ...JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, f), "utf8")),
}))

const contentJs = fs.readFileSync(CONTENT_JS_PATH, "utf8")

// ── Playwright runner ─────────────────────────────────────────────────────────

let playwright, chromium
try {
  ;({ chromium } = await import("playwright"))
} catch {
  console.error("Playwright is not installed. Run:  npm install --save-dev playwright")
  process.exit(1)
}

const browser = await chromium.launch({ headless: true })

// ── Test each fixture ─────────────────────────────────────────────────────────

describe("LinkedIn scraper regression", () => {
  for (const fixture of fixtures) {
    it(fixture.name ?? fixture.file, async () => {
      const slug = fixture.slug || "test-profile"
      const context = await browser.newContext()
      const page = await context.newPage()

      // Serve fixture HTML when the page navigates to /in/<slug>
      await page.route(`**/${slug}*`, route => {
        route.fulfill({
          status: 200,
          contentType: "text/html; charset=utf-8",
          body: buildPage(fixture),
        })
      })

      // Mock chrome extension APIs before any scripts run
      await page.addInitScript(() => {
        window.chrome = {
          runtime: {
            getURL: p => `chrome-extension://test/${p}`,
            onMessage: { addListener: () => {} },
            sendMessage: () => {},
            lastError: null,
          },
          storage: { local: { get: (keys, cb) => cb && cb({}) } },
          tabs: { query: (opts, cb) => cb && cb([]), sendMessage: () => {} },
        }
      })

      await page.goto(`http://localhost/in/${slug}`, { waitUntil: "domcontentloaded" })

      // Inject content.js with a test hook that exposes scrapeProfile globally.
      // We wrap the IIFE so that after it runs, scrapeProfile is accessible.
      const testableCode = contentJs.replace(
        "if (path.startsWith(\"/in/\")) init()",
        // Replace the init() call: expose scrapeProfile instead
        "window.__sd_scrapeProfile = scrapeProfile;"
      )
      await page.addScriptTag({ content: testableCode })

      // Run the scraper
      const result = await page.evaluate(() => {
        if (typeof window.__sd_scrapeProfile !== "function") {
          throw new Error("__sd_scrapeProfile not found — test hook injection failed")
        }
        return window.__sd_scrapeProfile()
      })

      const exp = fixture.expected

      // ── Assertions ────────────────────────────────────────────────────────
      if (exp.firstName !== undefined) {
        assert.strictEqual(
          result.firstName?.toLowerCase(),
          exp.firstName.toLowerCase(),
          `firstName: got "${result.firstName}", expected "${exp.firstName}"`
        )
      }
      if (exp.lastName !== undefined) {
        assert.strictEqual(
          result.lastName?.toLowerCase(),
          exp.lastName.toLowerCase(),
          `lastName: got "${result.lastName}", expected "${exp.lastName}"`
        )
      }
      if (exp.company !== undefined) {
        assert.strictEqual(
          (result.company ?? "").toLowerCase(),
          exp.company.toLowerCase(),
          `company: got "${result.company}", expected "${exp.company}"`
        )
      }
      if (exp.hasPhoto) {
        assert.ok(result.photoUrl, `photoUrl should be non-null`)
      }
      if (exp.photoIdContains) {
        assert.ok(
          (result.photoUrl ?? "").includes(exp.photoIdContains),
          `photoUrl should contain "${exp.photoIdContains}", got: "${result.photoUrl}"`
        )
      }

      await context.close()
    })
  }
})

// Close browser after all tests
process.on("exit", () => browser.close())

// ── HTML page builder ─────────────────────────────────────────────────────────

function buildPage(fixture) {
  const title = fixture.title ?? `${fixture.name} | LinkedIn`
  const mainHtml = fixture.mainHtml ?? ""
  // LinkedIn profiles always load on /in/<slug>; scrapeProfile reads pathname.
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${escHtml(title)}</title>
</head>
<body>
  <main>${mainHtml}</main>
</body>
</html>`
}

function escHtml(s) {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
