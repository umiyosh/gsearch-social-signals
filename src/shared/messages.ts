import { HATENA_COUNT_UNAVAILABLE, type HatenaBookmarkSummary, type HatenaCountMap } from "./hatena"
import { HACKER_NEWS_SUMMARY_UNAVAILABLE, type HackerNewsSummaryMap } from "./hackerNews"
import { BLUESKY_SUMMARY_UNAVAILABLE, type BlueskySummaryMap } from "./bluesky"
import {
  isEntryDiagnosticsRequest,
  type EntryDiagnosticsRequest,
  type EntryDiagnosticsResponse
} from "./diagnostics"

export const MESSAGE_TYPES = {
  COUNT_REQUEST: "GSPLUS_HATEBU_REQUEST_COUNTS",
  ENTRY_REQUEST: "GSPLUS_HATEBU_REQUEST_ENTRY",
  HN_REQUEST: "GSPLUS_HATEBU_REQUEST_HN",
  BLUESKY_REQUEST: "GSPLUS_HATEBU_REQUEST_BLUESKY"
} as const

export type HatenaCountsRequest = {
  type: typeof MESSAGE_TYPES.COUNT_REQUEST
  urls: string[]
}

export type HatenaEntryRequest = {
  type: typeof MESSAGE_TYPES.ENTRY_REQUEST
  url: string
  diagnostics?: EntryDiagnosticsRequest
}

export type HackerNewsRequest = {
  type: typeof MESSAGE_TYPES.HN_REQUEST
  urls: string[]
}

export type BlueskyRequest = {
  type: typeof MESSAGE_TYPES.BLUESKY_REQUEST
  urls: string[]
}

export type ExtensionRequest =
  | HatenaCountsRequest
  | HatenaEntryRequest
  | HackerNewsRequest
  | BlueskyRequest

export type Ok<T> = { ok: true; data: T }
export type Err = { ok: false; error: string }
export type ExtensionResponse<T> = Ok<T> | Err

export type HnSummaryMap = HackerNewsSummaryMap
export type BlueskySummaries = BlueskySummaryMap
export type BlueskyResponseData = {
  summaries: BlueskySummaries
  retryAfterMs?: number
}

export type HatenaCountsResponse = ExtensionResponse<HatenaCountMap>
export type HatenaEntryResponse = ExtensionResponse<HatenaBookmarkSummary[]> & {
  diagnostics?: EntryDiagnosticsResponse
}
export type HackerNewsResponse = ExtensionResponse<HnSummaryMap>
export type BlueskyResponse = ExtensionResponse<BlueskyResponseData>

export function ok<T>(data: T): Ok<T> {
  return { ok: true, data }
}

export function err(error: unknown): Err {
  return { ok: false, error: error instanceof Error ? error.message : String(error) }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

export function isHatenaCountsRequest(value: unknown): value is HatenaCountsRequest {
  return isRecord(value) && value.type === MESSAGE_TYPES.COUNT_REQUEST && isStringArray(value.urls)
}

export function isHatenaEntryRequest(value: unknown): value is HatenaEntryRequest {
  return (
    isRecord(value) &&
    value.type === MESSAGE_TYPES.ENTRY_REQUEST &&
    typeof value.url === "string" &&
    (value.diagnostics === undefined || isEntryDiagnosticsRequest(value.diagnostics))
  )
}

export function isHackerNewsRequest(value: unknown): value is HackerNewsRequest {
  return isRecord(value) && value.type === MESSAGE_TYPES.HN_REQUEST && isStringArray(value.urls)
}

export function isBlueskyRequest(value: unknown): value is BlueskyRequest {
  return (
    isRecord(value) && value.type === MESSAGE_TYPES.BLUESKY_REQUEST && isStringArray(value.urls)
  )
}

export function isExtensionRequest(value: unknown): value is ExtensionRequest {
  return (
    isHatenaCountsRequest(value) ||
    isHatenaEntryRequest(value) ||
    isHackerNewsRequest(value) ||
    isBlueskyRequest(value)
  )
}

export function isCountMap(value: unknown): value is HatenaCountMap {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (count) => count === null || count === HATENA_COUNT_UNAVAILABLE || typeof count === "number"
    )
  )
}

export function isBookmarkSummaryList(value: unknown): value is HatenaBookmarkSummary[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        typeof item.user === "string" &&
        typeof item.comment === "string" &&
        (item.timestamp === undefined || typeof item.timestamp === "string") &&
        (item.permalink === undefined || typeof item.permalink === "string")
    )
  )
}

export function isHnSummaryMap(value: unknown): value is HnSummaryMap {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (summary) =>
        summary === null ||
        summary === HACKER_NEWS_SUMMARY_UNAVAILABLE ||
        (isRecord(summary) && typeof summary.nbHits === "number")
    )
  )
}

export function isBlueskySummaryMap(value: unknown): value is BlueskySummaries {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (summary) =>
        summary === BLUESKY_SUMMARY_UNAVAILABLE ||
        (isRecord(summary) &&
          Number.isInteger(summary.hitsTotal) &&
          (summary.hitsTotal as number) >= 0)
    )
  )
}

export function isBlueskyResponseData(value: unknown): value is BlueskyResponseData {
  return (
    isRecord(value) &&
    isBlueskySummaryMap(value.summaries) &&
    (value.retryAfterMs === undefined ||
      (typeof value.retryAfterMs === "number" &&
        Number.isFinite(value.retryAfterMs) &&
        value.retryAfterMs >= 0))
  )
}

export function isExtensionResponse<T>(
  value: unknown,
  isData: (data: unknown) => data is T
): value is ExtensionResponse<T> {
  if (!isRecord(value)) {
    return false
  }
  if (value.ok === true) {
    return isData(value.data)
  }
  return value.ok === false && typeof value.error === "string"
}
