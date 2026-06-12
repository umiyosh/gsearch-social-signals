import { describe, expect, it } from "vitest"
import {
  MESSAGE_TYPES,
  err,
  isBookmarkSummaryList,
  isCountMap,
  isExtensionResponse,
  isHackerNewsRequest,
  isHatenaCountsRequest,
  isHatenaEntryRequest,
  isHnSummaryMap,
  ok
} from "../../src/shared/messages"

describe("isHatenaCountsRequest", () => {
  it("accepts a well-formed counts request", () => {
    expect(
      isHatenaCountsRequest({ type: MESSAGE_TYPES.COUNT_REQUEST, urls: ["https://example.com/"] })
    ).toBe(true)
  })

  it("rejects wrong types, non-string urls, and primitives", () => {
    expect(isHatenaCountsRequest({ type: MESSAGE_TYPES.ENTRY_REQUEST, urls: [] })).toBe(false)
    expect(isHatenaCountsRequest({ type: MESSAGE_TYPES.COUNT_REQUEST, urls: "not-array" })).toBe(
      false
    )
    expect(isHatenaCountsRequest({ type: MESSAGE_TYPES.COUNT_REQUEST, urls: ["ok", 42] })).toBe(
      false
    )
    expect(isHatenaCountsRequest(null)).toBe(false)
    expect(isHatenaCountsRequest("string")).toBe(false)
  })
})

describe("isHatenaEntryRequest", () => {
  it("accepts a well-formed entry request", () => {
    expect(
      isHatenaEntryRequest({ type: MESSAGE_TYPES.ENTRY_REQUEST, url: "https://example.com/" })
    ).toBe(true)
  })

  it("rejects non-string url and wrong type", () => {
    expect(isHatenaEntryRequest({ type: MESSAGE_TYPES.ENTRY_REQUEST, url: 42 })).toBe(false)
    expect(isHatenaEntryRequest({ type: MESSAGE_TYPES.COUNT_REQUEST, url: "x" })).toBe(false)
    expect(isHatenaEntryRequest(null)).toBe(false)
  })
})

describe("isHackerNewsRequest", () => {
  it("accepts a well-formed HN request", () => {
    expect(isHackerNewsRequest({ type: MESSAGE_TYPES.HN_REQUEST, urls: [] })).toBe(true)
  })

  it("rejects non-string-array urls and wrong type", () => {
    expect(isHackerNewsRequest({ type: MESSAGE_TYPES.HN_REQUEST, urls: [1] })).toBe(false)
    expect(isHackerNewsRequest({ type: MESSAGE_TYPES.COUNT_REQUEST, urls: [] })).toBe(false)
    expect(isHackerNewsRequest(null)).toBe(false)
  })
})

describe("payload validators", () => {
  it("isCountMap accepts numeric or null values only", () => {
    expect(isCountMap({ "https://a": 1, "https://b": null })).toBe(true)
    expect(isCountMap({ "https://a": "1" })).toBe(false)
    expect(isCountMap([1])).toBe(false)
    expect(isCountMap(null)).toBe(false)
  })

  it("isBookmarkSummaryList validates entries strictly", () => {
    expect(isBookmarkSummaryList([])).toBe(true)
    expect(
      isBookmarkSummaryList([
        { user: "alice", comment: "hi", timestamp: "2024", permalink: "https://p" }
      ])
    ).toBe(true)
    expect(isBookmarkSummaryList([{ user: "alice" }])).toBe(false)
    expect(isBookmarkSummaryList([{ user: "alice", comment: "hi", timestamp: 1 }])).toBe(false)
    expect(isBookmarkSummaryList({})).toBe(false)
  })

  it("isHnSummaryMap accepts null or nbHits-bearing summaries", () => {
    expect(isHnSummaryMap({ "https://a": null, "https://b": { nbHits: 3 } })).toBe(true)
    expect(isHnSummaryMap({ "https://a": { points: 3 } })).toBe(false)
    expect(isHnSummaryMap(null)).toBe(false)
  })
})

describe("isExtensionResponse", () => {
  it("accepts ok envelopes whose data passes the validator", () => {
    expect(isExtensionResponse(ok({ "https://a": 1 }), isCountMap)).toBe(true)
  })

  it("rejects ok envelopes whose data fails the validator", () => {
    expect(isExtensionResponse(ok({ "https://a": "1" }), isCountMap)).toBe(false)
  })

  it("accepts error envelopes with string errors", () => {
    expect(isExtensionResponse(err(new Error("boom")), isCountMap)).toBe(true)
    expect(isExtensionResponse({ ok: false, error: 42 }, isCountMap)).toBe(false)
  })

  it("rejects non-envelope values", () => {
    expect(isExtensionResponse(undefined, isCountMap)).toBe(false)
    expect(isExtensionResponse({ counts: {} }, isCountMap)).toBe(false)
  })
})

describe("envelope helpers", () => {
  it("ok wraps data and err stringifies causes", () => {
    expect(ok([1])).toEqual({ ok: true, data: [1] })
    expect(err(new Error("boom"))).toEqual({ ok: false, error: "boom" })
    expect(err("raw")).toEqual({ ok: false, error: "raw" })
  })
})
