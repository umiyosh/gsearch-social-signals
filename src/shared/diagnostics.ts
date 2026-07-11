export interface EntryDiagnosticsRequest {
  requestId: string
  sentAtEpochMs: number
}

export interface HatenaEntryFetchTiming {
  fetchHeadersMs: number
  bodyParseMs: number
  filterMs: number
  totalMs: number
  responseHeaders: {
    xCache: string | null
    age: string | null
    xAmzCfPop: string | null
  }
}

export interface EntryDiagnosticsResponse {
  requestId: string
  backgroundReceivedDelayMs: number
  backgroundTotalMs: number
  fetch: HatenaEntryFetchTiming
}

declare const GSPLUS_DIAGNOSTICS: boolean
declare const GSPLUS_COMMIT_SHA: string

export const DIAGNOSTICS_ENABLED = typeof GSPLUS_DIAGNOSTICS !== "undefined" && GSPLUS_DIAGNOSTICS

export const BUILD_COMMIT_SHA =
  typeof GSPLUS_COMMIT_SHA !== "undefined" ? GSPLUS_COMMIT_SHA : "unknown"

export function isEntryDiagnosticsRequest(value: unknown): value is EntryDiagnosticsRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.requestId === "string" &&
    candidate.requestId.length > 0 &&
    typeof candidate.sentAtEpochMs === "number" &&
    Number.isFinite(candidate.sentAtEpochMs)
  )
}

export function sanitizeDiagnosticTarget(rawUrl: string): string {
  try {
    const url = new URL(rawUrl)
    return `${url.origin}${url.pathname}`
  } catch {
    return "invalid-url"
  }
}
