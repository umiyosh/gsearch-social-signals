import { execFileSync } from "node:child_process"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const outDir = join(rootDir, "docs", "assets", "store")
const tmpDir = join(outDir, ".tmp-svg")

mkdirSync(outDir, { recursive: true })
mkdirSync(tmpDir, { recursive: true })

const colors = {
  blue: "#1a73e8",
  text: "#202124",
  muted: "#5f6368",
  line: "#dadce0",
  bg: "#ffffff",
  hatena: "#00a4de",
  hn: "#ff6600"
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function text(x, y, value, options = {}) {
  const size = options.size ?? 20
  const weight = options.weight ?? 400
  const fill = options.fill ?? colors.text
  const anchor = options.anchor ?? "start"
  return `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${escapeXml(value)}</text>`
}

function rect(x, y, width, height, options = {}) {
  const fill = options.fill ?? colors.bg
  const stroke = options.stroke ? ` stroke="${options.stroke}"` : ""
  const strokeWidth = options.strokeWidth ? ` stroke-width="${options.strokeWidth}"` : ""
  const radius = options.radius ? ` rx="${options.radius}" ry="${options.radius}"` : ""
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"${stroke}${strokeWidth}${radius}/>`
}

function line(x1, y1, x2, y2, options = {}) {
  const stroke = options.stroke ?? colors.line
  const width = options.width ?? 1
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}"/>`
}

function hatenaBadge(x, y, label = "24 users") {
  return `
    <g transform="translate(${x} ${y})">
      ${rect(0, 0, 102, 26, { fill: "#eef8fc", stroke: "#b7e5f3", radius: 13 })}
      ${rect(10, 6, 14, 14, { fill: colors.hatena, radius: 3 })}
      ${text(17, 18, "B!", { size: 9, weight: 700, fill: "#ffffff", anchor: "middle" })}
      ${text(31, 18, label, { size: 14, weight: 700, fill: colors.hatena })}
    </g>`
}

function hnBadge(x, y, label = "HN 128 pts") {
  return `
    <g transform="translate(${x} ${y})">
      ${rect(0, 0, 112, 26, { fill: "#fff3ea", stroke: "#ffd3b4", radius: 13 })}
      ${rect(10, 6, 14, 14, { fill: colors.hn, radius: 2 })}
      ${text(17, 18, "Y", { size: 10, weight: 700, fill: "#ffffff", anchor: "middle" })}
      ${text(31, 18, label, { size: 14, weight: 700, fill: colors.hn })}
    </g>`
}

function promoSmall() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="440" height="280" viewBox="0 0 440 280">
      ${rect(0, 0, 440, 280, { fill: "#ffffff" })}
      ${rect(26, 26, 388, 228, { fill: "#f8fafd", stroke: "#dfe3ea", radius: 18 })}
      ${text(52, 73, "Google検索 with", { size: 22, weight: 700 })}
      ${text(52, 101, "ソーシャルシグナル", { size: 22, weight: 700 })}
      ${rect(52, 124, 300, 38, { fill: "#ffffff", stroke: "#dadce0", radius: 19 })}
      ${text(74, 149, "public web research", { size: 15, fill: colors.muted })}
      ${hatenaBadge(64, 184, "24 users")}
      ${hnBadge(185, 184, "HN 128 pts")}
    </svg>`
}

function promoMarquee() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="1400" height="560" viewBox="0 0 1400 560">
      ${rect(0, 0, 1400, 560, { fill: "#ffffff" })}
      ${rect(80, 70, 1240, 420, { fill: "#f8fafd", stroke: "#dfe3ea", radius: 28 })}
      ${text(150, 173, "Google検索 with ソーシャルシグナル", { size: 48, weight: 700 })}
      ${text(154, 230, "Hatena Bookmark counts and Hacker News points on Google Search results", { size: 25, fill: colors.muted })}
      ${rect(154, 285, 680, 70, { fill: "#ffffff", stroke: "#dadce0", radius: 35 })}
      ${text(196, 329, "browser extension social signals", { size: 24, fill: colors.muted })}
      ${hatenaBadge(890, 278, "24 users")}
      ${hnBadge(1024, 278, "HN 128 pts")}
      ${rect(154, 390, 850, 36, { fill: "#ffffff", stroke: "#e8eaed", radius: 8 })}
      ${text(178, 414, "Understanding social signals in search results", { size: 22, fill: "#1a0dab" })}
    </svg>`
}

const assets = [
  ["promo-small-440x280", promoSmall()],
  ["promo-marquee-1400x560", promoMarquee()]
]

for (const [name, svg] of assets) {
  const svgPath = join(tmpDir, `${name}.svg`)
  const pngPath = join(outDir, `${name}.png`)
  writeFileSync(svgPath, svg.trimStart())
  execFileSync("magick", [svgPath, pngPath], { stdio: "inherit" })
}

rmSync(tmpDir, { recursive: true, force: true })
