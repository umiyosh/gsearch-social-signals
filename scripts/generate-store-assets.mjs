import { execFileSync } from "node:child_process"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const outDir = join(rootDir, "docs", "assets", "store")
const tmpDir = join(outDir, ".tmp-svg")

function assertImageMagickAvailable() {
  try {
    execFileSync("magick", ["-version"], { stdio: "ignore" })
  } catch {
    throw new Error("ImageMagick `magick` command is required to generate store assets.")
  }
}

assertImageMagickAvailable()

mkdirSync(outDir, { recursive: true })
mkdirSync(tmpDir, { recursive: true })

const colors = {
  blue: "#1a73e8",
  text: "#202124",
  muted: "#5f6368",
  line: "#dadce0",
  bg: "#ffffff",
  hatena: "#00a4de",
  hn: "#ff6600",
  bluesky: "#0560c9"
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

function blueskyBadge(x, y, label = "12 posts") {
  return `
    <g transform="translate(${x} ${y})">
      ${rect(0, 0, 94, 26, { fill: "#eef5ff", stroke: "#b9d7ff", radius: 13 })}
      <g transform="translate(7 4) scale(.75)">
        <path fill="#006aff" d="M12 10.8C10.913 8.686 7.954 4.747 5.202 2.805 2.566.944 1.561 1.266.902 1.565.139 1.91 0 3.08 0 3.77c0 .69.378 5.65.624 6.478.815 2.736 3.713 3.66 6.383 3.364-4.637.687-8.764 2.376-3.358 8.394 5.947 6.157 8.148-1.32 8.351-2.89.203 1.57 2.404 9.047 8.351 2.89 5.406-6.018 1.279-7.707-3.358-8.394 2.67.296 5.568-.628 6.383-3.364C23.622 9.42 24 4.46 24 3.77c0-.69-.139-1.86-.902-2.205-.659-.299-1.664-.621-4.3 1.24C16.046 4.747 13.087 8.686 12 10.8Z"/>
      </g>
      ${text(31, 18, label, { size: 14, weight: 700, fill: colors.bluesky })}
    </g>`
}

function promoSmall() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="440" height="280" viewBox="0 0 440 280">
      ${rect(0, 0, 440, 280, { fill: "#ffffff" })}
      ${rect(26, 26, 388, 228, { fill: "#f8fafd", stroke: "#dfe3ea", radius: 18 })}
      ${text(52, 73, "GSearch With", { size: 22, weight: 700 })}
      ${text(52, 101, "Social Signals", { size: 22, weight: 700 })}
      ${rect(52, 124, 300, 38, { fill: "#ffffff", stroke: "#dadce0", radius: 19 })}
      ${text(74, 149, "public web research", { size: 15, fill: colors.muted })}
      ${hatenaBadge(64, 184, "24 users")}
      ${hnBadge(185, 184, "HN 128 pts")}
      ${blueskyBadge(311, 184, "12 posts")}
    </svg>`
}

function promoMarquee() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="1400" height="560" viewBox="0 0 1400 560">
      ${rect(0, 0, 1400, 560, { fill: "#ffffff" })}
      ${rect(80, 70, 1240, 420, { fill: "#f8fafd", stroke: "#dfe3ea", radius: 28 })}
      ${text(150, 173, "GSearch With Social Signals", { size: 48, weight: 700 })}
      ${text(154, 230, "Hatena, Hacker News, and Bluesky signals on search results", { size: 25, fill: colors.muted })}
      ${rect(154, 285, 680, 70, { fill: "#ffffff", stroke: "#dadce0", radius: 35 })}
      ${text(196, 329, "browser extension social signals", { size: 24, fill: colors.muted })}
      ${hatenaBadge(890, 278, "24 users")}
      ${hnBadge(1024, 278, "HN 128 pts")}
      ${blueskyBadge(1150, 278, "12 posts")}
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
