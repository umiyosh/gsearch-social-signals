import type { HatenaBookmarkSummary, HatenaCountMap } from "./hatena"
import type { HackerNewsSummary } from "./hackerNews"

export const MESSAGE_TYPES = {
  COUNT_REQUEST: "GSPLUS_HATEBU_REQUEST_COUNTS",
  ENTRY_REQUEST: "GSPLUS_HATEBU_REQUEST_ENTRY",
  HN_REQUEST: "GSPLUS_HATEBU_REQUEST_HN"
} as const

export type HatenaCountsRequest = {
  type: typeof MESSAGE_TYPES.COUNT_REQUEST
  urls: string[]
}

export type HatenaEntryRequest = {
  type: typeof MESSAGE_TYPES.ENTRY_REQUEST
  url: string
}

export type HackerNewsRequest = {
  type: typeof MESSAGE_TYPES.HN_REQUEST
  urls: string[]
}

export type ExtensionRequest = HatenaCountsRequest | HatenaEntryRequest | HackerNewsRequest

export type Ok<T> = { ok: true; data: T }
export type Err = { ok: false; error: string }
export type ExtensionResponse<T> = Ok<T> | Err

export type HnSummaryMap = Record<string, HackerNewsSummary | null>

export type HatenaCountsResponse = ExtensionResponse<HatenaCountMap>
export type HatenaEntryResponse = ExtensionResponse<HatenaBookmarkSummary[]>
export type HackerNewsResponse = ExtensionResponse<HnSummaryMap>

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
    isRecord(value) && value.type === MESSAGE_TYPES.ENTRY_REQUEST && typeof value.url === "string"
  )
}

export function isHackerNewsRequest(value: unknown): value is HackerNewsRequest {
  return isRecord(value) && value.type === MESSAGE_TYPES.HN_REQUEST && isStringArray(value.urls)
}

export function isExtensionRequest(value: unknown): value is ExtensionRequest {
  return isHatenaCountsRequest(value) || isHatenaEntryRequest(value) || isHackerNewsRequest(value)
}

export function isCountMap(value: unknown): value is HatenaCountMap {
  return (
    isRecord(value) &&
    Object.values(value).every((count) => count === null || typeof count === "number")
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
      (summary) => summary === null || (isRecord(summary) && typeof summary.nbHits === "number")
    )
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
