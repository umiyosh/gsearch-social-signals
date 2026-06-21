import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join, relative, sep } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const distDir = join(rootDir, "dist")
const packageDir = join(rootDir, "store-package")
const packageJsonPath = join(rootDir, "package.json")

export const forbiddenArchiveEntries = [
  ".git",
  ".env",
  "node_modules",
  "src",
  "tests",
  "coverage",
  ".DS_Store",
  "__MACOSX"
]

export function validateDistFiles(files) {
  const violations = files.filter((file) => isForbiddenArchiveEntry(file) || file.endsWith(".map"))
  if (violations.length > 0) {
    throw new Error(`dist contains files that must not be packaged: ${violations.join(", ")}`)
  }
}

export function validateArchiveEntries(entries) {
  if (!entries.includes("manifest.json")) {
    throw new Error("store package must contain manifest.json at the zip root")
  }

  const violations = entries.filter(
    (entry) => isForbiddenArchiveEntry(entry) || entry.endsWith(".map")
  )
  if (violations.length > 0) {
    throw new Error(`store package contains forbidden entries: ${violations.join(", ")}`)
  }
}

function isForbiddenArchiveEntry(entry) {
  const parts = entry.split("/").filter(Boolean)
  return parts.some(
    (part) =>
      forbiddenArchiveEntries.includes(part) || part.startsWith(".env.") || part.startsWith(".git")
  )
}

function listFiles(dir, baseDir = dir) {
  const files = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const relativePath = relative(baseDir, path).split(sep).join("/")
    if (statSync(path).isDirectory()) {
      files.push(...listFiles(path, baseDir))
    } else {
      files.push(relativePath)
    }
  }
  return files
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options
  })

  if (result.status !== 0) {
    const stderr = result.stderr ? `\n${result.stderr.trim()}` : ""
    throw new Error(`${command} ${args.join(" ")} failed${stderr}`)
  }

  return result.stdout.trim()
}

function archiveName() {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"))
  return `${packageJson.name}-${packageJson.version}.zip`
}

export function packageStore() {
  if (!existsSync(distDir)) {
    throw new Error("dist does not exist. Run npm run build before packaging.")
  }

  const distFiles = listFiles(distDir)
  validateDistFiles(distFiles)

  mkdirSync(packageDir, { recursive: true })
  const outputPath = join(packageDir, archiveName())

  run("zip", ["-r", "-FS", "-q", outputPath, ".", "-x", "*.map", ".DS_Store", "__MACOSX/*"], {
    cwd: distDir
  })

  const entries = run("unzip", ["-Z1", outputPath]).split("\n").filter(Boolean)
  validateArchiveEntries(entries)

  console.log(`Created ${relative(rootDir, outputPath)} with ${entries.length} entries`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  packageStore()
}
