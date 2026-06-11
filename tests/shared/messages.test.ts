import { describe, expect, it } from "vitest"
import {
  MESSAGE_TYPES,
  isHackerNewsRequest,
  isHackerNewsResponse,
  isHatenaCountsRequest,
  isHatenaCountsResponse,
  isHatenaEntryRequest,
  isHatenaEntryResponse
} from "../../src/shared/messages"

describe("isHatenaCountsRequest", () => {
  it("accepts a well-formed counts request", () => {
    expect(
      isHatenaCountsRequest({ type: MESSAGE_TYPES.COUNT_REQUEST, urls: ["https://example.com/"] })
    ).toBe(true)
  })

  it("rejects wrong types, missing urls, and primitives", () => {
    expect(isHatenaCountsRequest({ type: MESSAGE_TYPES.COUNT_RESPONSE, urls: [] })).toBe(false)
    expect(isHatenaCountsRequest({ type: MESSAGE_TYPES.COUNT_REQUEST, urls: "not-array" })).toBe(
      false
    )
    expect(isHatenaCountsRequest(null)).toBe(false)
    expect(isHatenaCountsRequest("string")).toBe(false)
  })
})

describe("isHatenaCountsResponse", () => {
  it("accepts a well-formed counts response", () => {
    expect(
      isHatenaCountsResponse({ type: MESSAGE_TYPES.COUNT_RESPONSE, counts: { "https://a": 1 } })
    ).toBe(true)
  })

  it("rejects null counts and mismatched type", () => {
    expect(isHatenaCountsResponse({ type: MESSAGE_TYPES.COUNT_RESPONSE, counts: null })).toBe(false)
    expect(isHatenaCountsResponse({ type: MESSAGE_TYPES.COUNT_REQUEST, counts: {} })).toBe(false)
    expect(isHatenaCountsResponse(undefined)).toBe(false)
  })
})

describe("isHatenaEntryRequest", () => {
  it("accepts a well-formed entry request", () => {
    expect(
      isHatenaEntryRequest({ type: MESSAGE_TYPES.ENTRY_REQUEST, url: "https://example.com/" })
    ).toBe(true)
  })

  it("rejects missing url and wrong type", () => {
    expect(isHatenaEntryRequest({ type: MESSAGE_TYPES.ENTRY_REQUEST, url: 42 })).toBe(false)
    expect(isHatenaEntryRequest({ type: MESSAGE_TYPES.ENTRY_RESPONSE, url: "x" })).toBe(false)
    expect(isHatenaEntryRequest(null)).toBe(false)
  })
})

describe("isHatenaEntryResponse", () => {
  it("accepts a well-formed entry response", () => {
    expect(
      isHatenaEntryResponse({
        type: MESSAGE_TYPES.ENTRY_RESPONSE,
        url: "https://example.com/",
        bookmarks: []
      })
    ).toBe(true)
  })

  it("rejects non-array bookmarks and missing url", () => {
    expect(
      isHatenaEntryResponse({ type: MESSAGE_TYPES.ENTRY_RESPONSE, url: "x", bookmarks: {} })
    ).toBe(false)
    expect(
      isHatenaEntryResponse({ type: MESSAGE_TYPES.ENTRY_RESPONSE, url: 1, bookmarks: [] })
    ).toBe(false)
    expect(isHatenaEntryResponse(null)).toBe(false)
  })
})

describe("isHackerNewsRequest", () => {
  it("accepts a well-formed HN request", () => {
    expect(isHackerNewsRequest({ type: MESSAGE_TYPES.HN_REQUEST, urls: [] })).toBe(true)
  })

  it("rejects non-array urls and wrong type", () => {
    expect(isHackerNewsRequest({ type: MESSAGE_TYPES.HN_REQUEST, urls: "x" })).toBe(false)
    expect(isHackerNewsRequest({ type: MESSAGE_TYPES.HN_RESPONSE, urls: [] })).toBe(false)
    expect(isHackerNewsRequest(null)).toBe(false)
  })
})

describe("isHackerNewsResponse", () => {
  it("accepts a well-formed HN response", () => {
    expect(isHackerNewsResponse({ type: MESSAGE_TYPES.HN_RESPONSE, summaries: {} })).toBe(true)
  })

  it("rejects null summaries and wrong type", () => {
    expect(isHackerNewsResponse({ type: MESSAGE_TYPES.HN_RESPONSE, summaries: null })).toBe(false)
    expect(isHackerNewsResponse({ type: MESSAGE_TYPES.HN_REQUEST, summaries: {} })).toBe(false)
    expect(isHackerNewsResponse("nope")).toBe(false)
  })
})
