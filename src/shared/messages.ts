import type { HatenaBookmarkSummary } from "./hatena"

export const MESSAGE_TYPES = {
  COUNT_REQUEST: "GSPLUS_HATEBU_REQUEST_COUNTS",
  COUNT_RESPONSE: "GSPLUS_HATEBU_COUNTS_RESPONSE",
  ENTRY_REQUEST: "GSPLUS_HATEBU_REQUEST_ENTRY",
  ENTRY_RESPONSE: "GSPLUS_HATEBU_ENTRY_RESPONSE"
} as const

export type HatenaCountsRequest = {
  type: typeof MESSAGE_TYPES.COUNT_REQUEST
  urls: string[]
}

export type HatenaCountsResponse = {
  type: typeof MESSAGE_TYPES.COUNT_RESPONSE
  counts: Record<string, number | null>
}

export type HatenaEntryRequest = {
  type: typeof MESSAGE_TYPES.ENTRY_REQUEST
  url: string
}

export type HatenaEntryResponse = {
  type: typeof MESSAGE_TYPES.ENTRY_RESPONSE
  url: string
  bookmarks: HatenaBookmarkSummary[]
}

export type RuntimeMessage =
  | HatenaCountsRequest
  | HatenaCountsResponse
  | HatenaEntryRequest
  | HatenaEntryResponse

export function isHatenaCountsRequest(value: unknown): value is HatenaCountsRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: string }).type === MESSAGE_TYPES.COUNT_REQUEST &&
    Array.isArray((value as { urls?: unknown }).urls)
  )
}

export function isHatenaCountsResponse(value: unknown): value is HatenaCountsResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: string }).type === MESSAGE_TYPES.COUNT_RESPONSE &&
    typeof (value as { counts?: unknown }).counts === "object" &&
    (value as { counts?: unknown }).counts !== null
  )
}

export function isHatenaEntryRequest(value: unknown): value is HatenaEntryRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: string }).type === MESSAGE_TYPES.ENTRY_REQUEST &&
    typeof (value as { url?: unknown }).url === "string"
  )
}

export function isHatenaEntryResponse(value: unknown): value is HatenaEntryResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: string }).type === MESSAGE_TYPES.ENTRY_RESPONSE &&
    typeof (value as { url?: unknown }).url === "string" &&
    Array.isArray((value as { bookmarks?: unknown }).bookmarks)
  )
}
