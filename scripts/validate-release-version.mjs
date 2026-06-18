import fs from "node:fs"

const VERSION_PATTERN = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"))
}

export function normalizeVersion(value) {
  const match = VERSION_PATTERN.exec(value ?? "")
  if (!match) {
    throw new Error("Version must be semantic version like 0.1.0 or v0.1.0")
  }

  return `${match[1]}.${match[2]}.${match[3]}`
}

export function validateReleaseVersion({ tag, packageVersion, manifestVersion, lockVersion }) {
  const expectedVersion = normalizeVersion(tag)
  const mismatches = [
    ["package.json", packageVersion],
    ["public/manifest.json", manifestVersion],
    ["package-lock.json", lockVersion]
  ].filter(([, version]) => version !== expectedVersion)

  if (mismatches.length > 0) {
    const details = mismatches
      .map(([file, version]) => `${file} has ${version ?? "(missing)"}`)
      .join(", ")
    throw new Error(`Release version mismatch for v${expectedVersion}: ${details}`)
  }

  return expectedVersion
}

export function readReleaseVersions() {
  const packageJson = readJson("package.json")
  const manifestJson = readJson("public/manifest.json")
  const packageLockJson = readJson("package-lock.json")

  return {
    packageVersion: packageJson.version,
    manifestVersion: manifestJson.version,
    lockVersion: packageLockJson.packages?.[""]?.version ?? packageLockJson.version
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const tag = process.argv[2]
    const version = validateReleaseVersion({
      tag,
      ...readReleaseVersions()
    })
    console.log(`Release version v${version} is aligned`)
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}
