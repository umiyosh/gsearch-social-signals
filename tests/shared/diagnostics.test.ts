import { describe, expect, it } from "vitest"
import { isEntryDiagnosticsRequest, sanitizeDiagnosticTarget } from "../../src/shared/diagnostics"

describe("isEntryDiagnosticsRequest", () => {
  it("accepts finite timestamps and non-empty request IDs", () => {
    expect(isEntryDiagnosticsRequest({ requestId: "entry-1", sentAtEpochMs: 1 })).toBe(true)
  })

  it("rejects malformed diagnostics metadata", () => {
    expect(isEntryDiagnosticsRequest(null)).toBe(false)
    expect(isEntryDiagnosticsRequest([])).toBe(false)
    expect(isEntryDiagnosticsRequest({ requestId: "", sentAtEpochMs: 1 })).toBe(false)
    expect(isEntryDiagnosticsRequest({ requestId: "entry-1", sentAtEpochMs: Infinity })).toBe(false)
  })
})

describe("sanitizeDiagnosticTarget", () => {
  it("removes query parameters and fragments", () => {
    expect(sanitizeDiagnosticTarget("https://example.com/article?secret=1#section")).toBe(
      "https://example.com/article"
    )
  })

  it("does not echo invalid input", () => {
    expect(sanitizeDiagnosticTarget("not a url?secret=1")).toBe("invalid-url")
  })
})
