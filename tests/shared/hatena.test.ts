import { describe, expect, it } from "vitest"
import { chunkArray } from "../../src/shared/hatena"

describe("chunkArray", () => {
  it("splits arrays into even chunks", () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it("throws on invalid size", () => {
    expect(() => chunkArray([1], 0)).toThrowError()
  })
})
