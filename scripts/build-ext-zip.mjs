#!/usr/bin/env node
// Rebuilds public/6degrees-extension.zip from chrome-extension/.
// Runs as part of the Vercel build so the download is always current.

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs"
import { join, relative } from "path"
import JSZip from "jszip"

const ROOT = new URL("..", import.meta.url).pathname
const EXT_DIR = join(ROOT, "chrome-extension")
const OUT_PATH = join(ROOT, "public", "6degrees-extension.zip")

function addDir(zip, dir, base) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue
    const full = join(dir, name)
    const arc  = relative(base, full)
    if (statSync(full).isDirectory()) {
      addDir(zip, full, base)
    } else {
      zip.file(arc, readFileSync(full))
    }
  }
}

const zip = new JSZip()
addDir(zip, EXT_DIR, EXT_DIR)

const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
writeFileSync(OUT_PATH, buf)

const { version } = JSON.parse(readFileSync(join(EXT_DIR, "manifest.json"), "utf8"))
console.log(`✓ Built public/6degrees-extension.zip  v${version}  (${buf.length} bytes)`)
