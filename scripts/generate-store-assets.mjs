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

function resultBlock(y, options) {
  const badges = []
  let badgeX = 340
  if (options.hatena) {
    badges.push(hatenaBadge(badgeX, y - 29, options.hatena))
    badgeX += 114
  }
  if (options.hn) {
    badges.push(hnBadge(badgeX, y - 29, options.hn))
  }

  return `
    <g>
      ${rect(160, y - 54, 34, 34, { fill: options.iconFill ?? "#f1f3f4", radius: 17 })}
      ${text(177, y - 32, options.icon ?? "G", { size: 16, weight: 700, fill: "#ffffff", anchor: "middle" })}
      ${text(206, y - 40, options.site, { size: 16, weight: 600 })}
      ${text(206, y - 17, options.url, { size: 14, fill: colors.muted })}
      ${badges.join("")}
      ${text(160, y + 16, options.title, { size: 25, fill: "#1a0dab" })}
      ${text(160, y + 48, options.snippet1, { size: 17, fill: colors.text })}
      ${text(160, y + 74, options.snippet2, { size: 17, fill: colors.text })}
    </g>`
}

function serpFrame(content, title) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800">
      ${rect(0, 0, 1280, 800)}
      ${text(62, 76, "Google", { size: 40, weight: 700, fill: "#4285f4" })}
      ${rect(175, 34, 665, 56, { fill: "#ffffff", stroke: "#dadce0", radius: 28 })}
      ${text(215, 70, "browser extension social signals", { size: 20 })}
      ${text(802, 70, "⌕", { size: 25, fill: colors.muted })}
      ${text(1090, 68, "No account", { size: 15, fill: colors.muted })}
      ${line(0, 126, 1280, 126)}
      ${text(178, 165, "All", { size: 17, weight: 700 })}
      ${text(235, 165, "Images", { size: 17, fill: colors.muted })}
      ${text(320, 165, "News", { size: 17, fill: colors.muted })}
      ${text(390, 165, "Videos", { size: 17, fill: colors.muted })}
      ${line(170, 183, 214, 183, { stroke: colors.text, width: 3 })}
      ${text(160, 222, title, { size: 14, fill: colors.muted })}
      ${content}
      ${rect(918, 230, 220, 132, { fill: "#f8fafd", stroke: "#e8eaed", radius: 8 })}
      ${text(940, 263, "Extension preview", { size: 17, weight: 700 })}
      ${hatenaBadge(940, 285, "24 users")}
      ${hnBadge(940, 324, "HN 128 pts")}
    </svg>`
}

function screenshot(kind) {
  const first = {
    site: "Example Docs",
    url: "https://example.com › docs › extension-signals",
    title: "Understanding social signals in search results",
    snippet1: "A public example page used to show how bookmark counts and discussion scores",
    snippet2: "appear next to normal Google Search results.",
    icon: "E",
    iconFill: "#34a853"
  }
  const second = {
    site: "Open Web Guide",
    url: "https://open.example.org › guides › browser-tools",
    title: "Browser tools for researching public web pages",
    snippet1: "Compare public references without opening every result. This sample contains",
    snippet2: "no login state, personal data, or internal information.",
    icon: "W",
    iconFill: "#fbbc04"
  }
  const third = {
    site: "Developer Notes",
    url: "https://developer.example.net › articles › search-context",
    title: "Reading context from public search results",
    snippet1: "Short result snippets stay unchanged while GSPlusHatebu adds compact badges",
    snippet2: "for Hatena Bookmark and Hacker News activity.",
    icon: "D",
    iconFill: "#ea4335"
  }

  if (kind === "hatena") {
    first.hatena = "24 users"
  } else if (kind === "hn") {
    first.hn = "HN 128 pts"
  } else {
    first.hatena = "24 users"
    first.hn = "HN 128 pts"
  }
  second.hatena = "63 users"
  third.hn = "HN 42 pts"

  const overlay =
    kind === "hover"
      ? `
        <g filter="url(#shadow)">
          ${rect(340, 320, 318, 226, { fill: "#ffffff", radius: 8 })}
          ${text(364, 354, "sample_user", { size: 16, weight: 700, fill: colors.blue })}
          ${text(364, 380, "Public bookmark comment shown on hover.", { size: 15 })}
          ${line(364, 402, 634, 402)}
          ${text(364, 433, "reader_demo", { size: 16, weight: 700, fill: colors.blue })}
          ${text(364, 459, "Useful for checking discussion before opening.", { size: 15 })}
          ${line(364, 482, 634, 482)}
          ${text(364, 512, "web_researcher", { size: 16, weight: 700, fill: colors.blue })}
          ${text(364, 538, "Synthetic sample text for store screenshots.", { size: 15 })}
        </g>`
      : ""

  return serpFrame(
    `
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#000000" flood-opacity="0.2"/>
        </filter>
      </defs>
      ${resultBlock(286, first)}
      ${resultBlock(430, second)}
      ${resultBlock(574, third)}
      ${overlay}
    `,
    kind === "hover"
      ? "Hover overlay uses synthetic public comments"
      : "Sanitized store screenshot with synthetic public results"
  )
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
  ["screenshot-hatena-badge", screenshot("hatena")],
  ["screenshot-hn-badge", screenshot("hn")],
  ["screenshot-hatena-hn-badges", screenshot("both")],
  ["screenshot-hover-overlay", screenshot("hover")],
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
