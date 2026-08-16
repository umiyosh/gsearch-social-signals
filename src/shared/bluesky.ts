import { createRequestQueue, HttpResponseError, retryTransientRequest } from "./request-queue"
import { normalizeRequestUrl } from "./url"

export interface BlueskySummary {
  hitsTotal: number
}

export const BLUESKY_SUMMARY_UNAVAILABLE = "unavailable" as const
export type BlueskySummaryResult = BlueskySummary | typeof BLUESKY_SUMMARY_UNAVAILABLE
export type BlueskySummaryMap = Record<string, BlueskySummaryResult>

export interface BlueskyFetchResult {
  summaries: BlueskySummaryMap
  retryAfterMs?: number
}

export const BLUESKY_REQUEST_TIMEOUT_MS = 5_000
export const BLUESKY_RATE_LIMIT_FALLBACK_MS = 60_000
export const BLUESKY_REQUEST_BATCH_SIZE = 40

const BLUESKY_ENDPOINT = "https://api.bsky.app/xrpc/app.bsky.feed.searchPosts"
const MAX_CONCURRENT_REQUESTS = 3
const BLUESKY_DIAGNOSTIC_PREFIX = "[GSearch Social Signals][Bluesky] "

type RateLimitResetSource =
  | "retry-after-seconds"
  | "retry-after-date"
  | "ratelimit-reset"
  | "x-ratelimit-reset"
  | "fallback"

type InvalidResponseReason = "invalid_posts" | "missing_hits_total" | "invalid_hits_total"
type HttpResponseBodyKind = "empty" | "json" | "html" | "text" | "unreadable"

interface ResetDelay {
  delayMs: number
  source: RateLimitResetSource
}

interface BlueskyFailureDetail {
  kind:
    | "rate_limit"
    | "circuit_open"
    | "http_error"
    | "timeout"
    | "network_error"
    | "invalid_json"
    | "invalid_response"
    | "unknown_error"
  status?: number
  retryAfterMs?: number
  resetSource?: RateLimitResetSource
  reason?: InvalidResponseReason
  errorName?: string
  request?: {
    host: string
    ordinal: number
  }
  response?: {
    bodyKind: HttpResponseBodyKind
    contentType?: string
    server?: string
    retryAfter?: string
    rateLimitRemaining?: string
    rateLimitReset?: string
    error?: string
    message?: string
    bodyMarker?: "cloudflare"
  }
}

interface BlueskySearchResponse {
  posts?: unknown
  hitsTotal?: unknown
}

interface BlueskyClientOptions {
  fetcher?: typeof fetch
  now?: () => number
}

export interface BlueskyClient {
  fetchSummaries: (urls: readonly string[]) => Promise<BlueskySummaryMap>
  fetchSummariesWithRetryInfo: (urls: readonly string[]) => Promise<BlueskyFetchResult>
}

class BlueskyRateLimitError extends Error {
  constructor(
    readonly retryAfterMs: number,
    readonly resetSource: RateLimitResetSource
  ) {
    super("Bluesky API rate limit reached")
    this.name = "BlueskyRateLimitError"
  }
}

class BlueskyCircuitOpenError extends Error {
  constructor(readonly retryAfterMs: number) {
    super("Bluesky API circuit is open")
    this.name = "BlueskyCircuitOpenError"
  }
}

class BlueskyInvalidJsonError extends Error {
  constructor() {
    super("Bluesky API returned invalid JSON")
    this.name = "BlueskyInvalidJsonError"
  }
}

class BlueskyInvalidResponseError extends Error {
  constructor(readonly reason: InvalidResponseReason) {
    super(`Bluesky API returned an invalid response: ${reason}`)
    this.name = "BlueskyInvalidResponseError"
  }
}

class BlueskyHttpResponseError extends HttpResponseError {
  constructor(
    status: number,
    readonly request: NonNullable<BlueskyFailureDetail["request"]>,
    readonly response: NonNullable<BlueskyFailureDetail["response"]>
  ) {
    super("Bluesky", status)
    this.name = "BlueskyHttpResponseError"
  }
}

function sanitizeDiagnosticText(value: string): string {
  return value
    .replace(/https?:\/\/[^\s"'<>)]*/gi, "[url]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240)
}

function optionalHeader(headers: Headers, name: string): string | undefined {
  return headers.get(name) ?? undefined
}

function collectHttpResponseHeaders(
  headers: Headers
): Omit<NonNullable<BlueskyFailureDetail["response"]>, "bodyKind"> {
  const contentType = optionalHeader(headers, "content-type")
  const server = optionalHeader(headers, "server")
  const retryAfter = optionalHeader(headers, "retry-after")
  const rateLimitRemaining =
    optionalHeader(headers, "ratelimit-remaining") ??
    optionalHeader(headers, "x-ratelimit-remaining")
  const rateLimitReset =
    optionalHeader(headers, "ratelimit-reset") ?? optionalHeader(headers, "x-ratelimit-reset")
  return {
    ...(contentType === undefined ? {} : { contentType }),
    ...(server === undefined ? {} : { server }),
    ...(retryAfter === undefined ? {} : { retryAfter }),
    ...(rateLimitRemaining === undefined ? {} : { rateLimitRemaining }),
    ...(rateLimitReset === undefined ? {} : { rateLimitReset })
  }
}

function inspectHttpErrorBody(
  bodyText: string,
  contentType?: string
): Pick<NonNullable<BlueskyFailureDetail["response"]>, "bodyKind" | "error" | "message"> {
  const trimmedBody = bodyText.trim()
  if (trimmedBody.length === 0) {
    return { bodyKind: "empty" }
  }
  if (contentType?.toLowerCase().includes("html") || trimmedBody.startsWith("<")) {
    return { bodyKind: "html" }
  }
  if (!contentType?.toLowerCase().includes("json") && !trimmedBody.startsWith("{")) {
    return { bodyKind: "text", message: sanitizeDiagnosticText(trimmedBody) }
  }

  try {
    const payload = JSON.parse(trimmedBody) as unknown
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      return { bodyKind: "json" }
    }
    const record = payload as Record<string, unknown>
    const error =
      typeof record.error === "string" ? sanitizeDiagnosticText(record.error) : undefined
    const message =
      typeof record.message === "string" ? sanitizeDiagnosticText(record.message) : undefined
    return {
      bodyKind: "json",
      ...(error === undefined ? {} : { error }),
      ...(message === undefined ? {} : { message })
    }
  } catch {
    return { bodyKind: "text", message: sanitizeDiagnosticText(trimmedBody) }
  }
}

async function inspectHttpErrorResponse(
  response: Response
): Promise<NonNullable<BlueskyFailureDetail["response"]>> {
  const headerEvidence = collectHttpResponseHeaders(response.headers)

  let bodyText: string
  try {
    bodyText = await response.text()
  } catch {
    return { bodyKind: "unreadable", ...headerEvidence }
  }

  const trimmedBody = bodyText.trim()
  const cloudflare =
    response.headers.has("cf-ray") ||
    headerEvidence.server?.toLowerCase().includes("cloudflare") === true ||
    trimmedBody.toLowerCase().includes("cloudflare")

  return {
    ...inspectHttpErrorBody(bodyText, headerEvidence.contentType),
    ...headerEvidence,
    ...(cloudflare ? { bodyMarker: "cloudflare" as const } : {})
  }
}

function parseResetDelay(headers: Headers, now: number): ResetDelay {
  const retryAfter = headers.get("retry-after")
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds) && seconds >= 0) {
      return { delayMs: seconds * 1_000, source: "retry-after-seconds" }
    }

    const retryAt = Date.parse(retryAfter)
    if (Number.isFinite(retryAt)) {
      return { delayMs: Math.max(0, retryAt - now), source: "retry-after-date" }
    }
  }

  const rateLimitReset = headers.get("ratelimit-reset")
  if (rateLimitReset) {
    const resetEpochSeconds = Number(rateLimitReset)
    if (Number.isFinite(resetEpochSeconds) && resetEpochSeconds >= 0) {
      return {
        delayMs: Math.max(0, resetEpochSeconds * 1_000 - now),
        source: "ratelimit-reset"
      }
    }
  }

  const xRateLimitReset = headers.get("x-ratelimit-reset")
  if (xRateLimitReset) {
    const resetEpochSeconds = Number(xRateLimitReset)
    if (Number.isFinite(resetEpochSeconds) && resetEpochSeconds >= 0) {
      return {
        delayMs: Math.max(0, resetEpochSeconds * 1_000 - now),
        source: "x-ratelimit-reset"
      }
    }
  }

  return { delayMs: BLUESKY_RATE_LIMIT_FALLBACK_MS, source: "fallback" }
}

function parseSummary(payload: BlueskySearchResponse): BlueskySummary {
  if (!Array.isArray(payload.posts)) {
    throw new BlueskyInvalidResponseError("invalid_posts")
  }

  if (payload.hitsTotal === undefined) {
    throw new BlueskyInvalidResponseError("missing_hits_total")
  }

  if (!Number.isInteger(payload.hitsTotal) || (payload.hitsTotal as number) < 0) {
    throw new BlueskyInvalidResponseError("invalid_hits_total")
  }

  return { hitsTotal: payload.hitsTotal as number }
}

function classifyFailure(error: unknown): BlueskyFailureDetail {
  if (error instanceof BlueskyRateLimitError) {
    return {
      kind: "rate_limit",
      status: 429,
      retryAfterMs: error.retryAfterMs,
      resetSource: error.resetSource
    }
  }
  if (error instanceof BlueskyCircuitOpenError) {
    return { kind: "circuit_open", retryAfterMs: error.retryAfterMs }
  }
  if (error instanceof BlueskyHttpResponseError) {
    return {
      kind: "http_error",
      status: error.status,
      request: error.request,
      response: error.response
    }
  }
  if (error instanceof HttpResponseError) {
    return { kind: "http_error", status: error.status }
  }
  if (error instanceof BlueskyInvalidJsonError) {
    return { kind: "invalid_json" }
  }
  if (error instanceof BlueskyInvalidResponseError) {
    return { kind: "invalid_response", reason: error.reason }
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  ) {
    return { kind: "timeout" }
  }
  if (error instanceof TypeError) {
    return { kind: "network_error" }
  }
  return {
    kind: "unknown_error",
    errorName:
      typeof error === "object" && error !== null && "name" in error
        ? String(error.name)
        : typeof error
  }
}

function logFailureDiagnostics(
  requestedCount: number,
  failures: readonly BlueskyFailureDetail[],
  retryAfterMs?: number
): void {
  const grouped = new Map<string, BlueskyFailureDetail & { count: number }>()
  failures.forEach((failure) => {
    const key = JSON.stringify(failure)
    const existing = grouped.get(key)
    grouped.set(key, { ...failure, count: (existing?.count ?? 0) + 1 })
  })
  const diagnostic = {
    event: "bluesky_fetch_failed",
    requestedCount,
    failedCount: failures.length,
    failures: [...grouped.values()],
    ...(retryAfterMs === undefined ? {} : { retryAfterMs })
  }
  console.error(`${BLUESKY_DIAGNOSTIC_PREFIX}${JSON.stringify(diagnostic)}`)
}

export function createBlueskyClient(options: BlueskyClientOptions = {}): BlueskyClient {
  const fetcher = options.fetcher ?? ((input, init) => fetch(input, init))
  const now = options.now ?? Date.now
  const enqueue = createRequestQueue(MAX_CONCURRENT_REQUESTS)
  let blockedUntil = 0
  let requestOrdinal = 0

  async function fetchSummary(normalizedUrl: string): Promise<BlueskySummary> {
    if (now() < blockedUntil) {
      throw new BlueskyCircuitOpenError(Math.max(0, blockedUntil - now()))
    }

    const endpoint = new URL(BLUESKY_ENDPOINT)
    endpoint.searchParams.set("q", normalizedUrl)
    endpoint.searchParams.set("url", normalizedUrl)
    endpoint.searchParams.set("limit", "1")
    endpoint.searchParams.set("sort", "top")
    requestOrdinal += 1
    const currentRequestOrdinal = requestOrdinal

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), BLUESKY_REQUEST_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetcher(endpoint.toString(), {
        method: "GET",
        cache: "no-cache",
        signal: controller.signal
      })
    } finally {
      clearTimeout(timeoutId)
    }

    if (response.status === 429) {
      const reset = parseResetDelay(response.headers, now())
      blockedUntil = Math.max(blockedUntil, now() + reset.delayMs)
      throw new BlueskyRateLimitError(reset.delayMs, reset.source)
    }
    if (!response.ok) {
      throw new BlueskyHttpResponseError(
        response.status,
        { host: new URL(normalizedUrl).hostname, ordinal: currentRequestOrdinal },
        await inspectHttpErrorResponse(response)
      )
    }

    let payload: BlueskySearchResponse
    try {
      payload = (await response.json()) as BlueskySearchResponse
    } catch {
      throw new BlueskyInvalidJsonError()
    }
    return parseSummary(payload)
  }

  async function fetchSummariesWithRetryInfo(urls: readonly string[]): Promise<BlueskyFetchResult> {
    const normalizedToOriginals = new Map<string, string[]>()
    urls.forEach((url) => {
      const normalized = normalizeRequestUrl(url)
      const originals = normalizedToOriginals.get(normalized) ?? []
      originals.push(url)
      normalizedToOriginals.set(normalized, originals)
    })

    const summaries: BlueskySummaryMap = {}
    let failedRequests = 0
    const failures: BlueskyFailureDetail[] = []
    let retryAfterMs: number | undefined

    await Promise.all(
      [...normalizedToOriginals.entries()].map(async ([normalized, originals]) => {
        let result: BlueskySummaryResult
        try {
          result = await enqueue(() => retryTransientRequest(() => fetchSummary(normalized)))
        } catch (error) {
          failedRequests += 1
          failures.push(classifyFailure(error))
          if (error instanceof BlueskyRateLimitError || error instanceof BlueskyCircuitOpenError) {
            retryAfterMs = Math.max(retryAfterMs ?? 0, Math.max(0, blockedUntil - now()))
          }
          result = BLUESKY_SUMMARY_UNAVAILABLE
        }
        originals.forEach((url) => {
          summaries[url] = result
        })
      })
    )

    if (failedRequests > 0) {
      logFailureDiagnostics(urls.length, failures, retryAfterMs)
    }

    return retryAfterMs === undefined ? { summaries } : { summaries, retryAfterMs }
  }

  async function fetchSummaries(urls: readonly string[]): Promise<BlueskySummaryMap> {
    return (await fetchSummariesWithRetryInfo(urls)).summaries
  }

  return { fetchSummaries, fetchSummariesWithRetryInfo }
}

export const fetchBlueskySummaries = createBlueskyClient().fetchSummariesWithRetryInfo
