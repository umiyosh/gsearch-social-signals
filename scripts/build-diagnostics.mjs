#!/usr/bin/env node

import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { execFileSync, spawnSync } from "node:child_process"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const diagnosticsName = "GSearch With Social Signals Diagnostics"

export function createDiagnosticsManifest(manifest, commitSha) {
  return {
    ...manifest,
    name: diagnosticsName,
    version_name: `${manifest.version} diagnostics ${commitSha}`
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "inherit",
    shell: false,
    ...options
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

export function buildDiagnostics() {
  const repoRoot = process.cwd()
  const outDir = resolve(repoRoot, "dist-diagnostics")
  const commitSha = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8"
  }).trim()
  const dirty =
    execFileSync("git", ["status", "--porcelain"], { cwd: repoRoot, encoding: "utf8" }).trim()
      .length > 0
  const buildRevision = dirty ? `${commitSha}-dirty` : commitSha

  rmSync(outDir, { recursive: true, force: true })
  run("npm", ["run", "build:ts"], {
    env: {
      ...process.env,
      GSPLUS_DIAGNOSTICS: "1",
      GSPLUS_OUT_DIR: "dist-diagnostics",
      GSPLUS_COMMIT_SHA: buildRevision
    }
  })

  mkdirSync(outDir, { recursive: true })
  const publicDir = resolve(repoRoot, "public")
  for (const entry of readdirSync(publicDir)) {
    cpSync(resolve(publicDir, entry), resolve(outDir, entry), { recursive: true })
  }

  const manifestPath = resolve(outDir, "manifest.json")
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  writeFileSync(
    manifestPath,
    `${JSON.stringify(createDiagnosticsManifest(manifest, buildRevision), null, 2)}\n`
  )
}

const currentFile = fileURLToPath(import.meta.url)
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : ""
if (currentFile === invokedFile) {
  buildDiagnostics()
}
