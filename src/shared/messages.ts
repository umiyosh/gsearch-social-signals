export const MESSAGE_TYPES = {
  REQUEST: "GSPLUS_HATEBU_REQUEST_COUNTS",
  RESPONSE: "GSPLUS_HATEBU_COUNTS_RESPONSE"
} as const

export type HatenaCountsRequest = {
  type: typeof MESSAGE_TYPES.REQUEST
  urls: string[]
}

export type HatenaCountsResponse = {
  type: typeof MESSAGE_TYPES.RESPONSE
  counts: Record<string, number | null>
}

export type RuntimeMessage = HatenaCountsRequest | HatenaCountsResponse

export function isHatenaCountsRequest(value: unknown): value is HatenaCountsRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: string }).type === MESSAGE_TYPES.REQUEST &&
    Array.isArray((value as { urls?: unknown }).urls)
  )
}

export function isHatenaCountsResponse(value: unknown): value is HatenaCountsResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: string }).type === MESSAGE_TYPES.RESPONSE &&
    typeof (value as { counts?: unknown }).counts === "object" &&
    (value as { counts?: unknown }).counts !== null
  )
}
