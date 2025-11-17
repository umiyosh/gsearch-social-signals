const GOOGLE_HOST_FRAGMENT = ".google."

export const DATA_ATTR = "data-gsplus-hatebu"

const HTTP_PROTOCOLS = new Set(["http:", "https:"])

export function normalizeUrl(rawUrl: string): string | null {
  try {
    const normalized = new URL(rawUrl)
    if (!HTTP_PROTOCOLS.has(normalized.protocol)) {
      return null
    }
    normalized.hash = ""
    return normalized.toString()
  } catch {
    return null
  }
}

function isGoogleRedirect(url: URL): boolean {
  return url.hostname.includes(GOOGLE_HOST_FRAGMENT) && url.pathname === "/url"
}

function isGoogleProperty(url: URL): boolean {
  return url.hostname.includes(GOOGLE_HOST_FRAGMENT)
}

export function extractExternalUrlFromHref(href: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(href)
  } catch {
    return normalizeUrl(href)
  }

  if (isGoogleRedirect(parsed)) {
    const actual = parsed.searchParams.get("q") ?? parsed.searchParams.get("url")
    if (!actual) {
      return null
    }
    return normalizeUrl(actual)
  }

  if (isGoogleProperty(parsed)) {
    return null
  }

  return normalizeUrl(parsed.toString())
}

export function buildHatenaEntryUrl(targetUrl: string): string {
  const normalized = normalizeUrl(targetUrl)
  if (!normalized) {
    return "https://b.hatena.ne.jp/"
  }

  const target = new URL(normalized)
  const schemeSegment = target.protocol === "https:" ? "s" : "http"
  const basePath = `${target.hostname}${target.pathname}`
  const search = target.search ?? ""
  return `https://b.hatena.ne.jp/entry/${schemeSegment}/${basePath}${search}`
}

export function normalizeForComparison(url: string): string {
  const normalized = normalizeUrl(url)
  if (!normalized) {
    return url
  }

  const parsed = new URL(normalized)
  const scheme = parsed.protocol === "https:" ? "https://" : "http://"
  const hostname = parsed.hostname.toLowerCase()
  const pathname = parsed.pathname || "/"
  const search = parsed.search ?? ""
  return `${scheme}${hostname}${pathname}${search}`
}

export function stripQueryString(normalizedUrl: string): string {
  const queryIndex = normalizedUrl.indexOf("?")
  if (queryIndex === -1) {
    return normalizedUrl
  }
  return normalizedUrl.slice(0, queryIndex)
}
