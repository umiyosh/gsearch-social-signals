import { afterEach, describe, expect, it, vi } from "vitest"
import { MESSAGE_TYPES, ok } from "../../src/shared/messages"

type ChromeStub = {
  runtime: {
    id: string
    lastError?: { message: string } | undefined
    getURL: (path: string) => string
    sendMessage: (message: unknown, callback: (response: unknown) => void) => void
  }
}

function stubChrome(messages: unknown[]): void {
  const stub: ChromeStub = {
    runtime: {
      id: "ext",
      getURL: (path) => `chrome-extension://test-extension/${path}`,
      sendMessage: (message, callback) => {
        messages.push(message)
        if (
          typeof message === "object" &&
          message !== null &&
          "type" in message &&
          message.type === MESSAGE_TYPES.COUNT_REQUEST &&
          "urls" in message &&
          Array.isArray(message.urls)
        ) {
          callback(ok(Object.fromEntries(message.urls.map((url) => [url, 3]))))
          return
        }
        if (
          typeof message === "object" &&
          message !== null &&
          "type" in message &&
          message.type === MESSAGE_TYPES.HN_REQUEST
        ) {
          callback(ok({}))
          return
        }
        callback(ok([]))
      }
    }
  }
  vi.stubGlobal("chrome", stub)
}

afterEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
})

describe("content script boot", () => {
  it("processes search results added by MutationObserver", async () => {
    document.head.innerHTML = ""
    document.body.innerHTML = ""
    const messages: unknown[] = []
    stubChrome(messages)
    const NativeMutationObserver = globalThis.MutationObserver
    const observers: MutationObserver[] = []
    vi.stubGlobal(
      "MutationObserver",
      class extends NativeMutationObserver {
        constructor(callback: MutationCallback) {
          super(callback)
          observers.push(this)
        }
      }
    )

    await import("../../src/content/index")
    const result = document.createElement("div")
    result.className = "g"
    result.innerHTML = `
      <div class="yuRUbf">
        <a href="https://dynamic.example/article">
          <h3>Dynamic result</h3>
        </a>
      </div>
    `

    document.body.appendChild(result)

    await vi.waitFor(() => {
      expect(messages).toContainEqual({
        type: MESSAGE_TYPES.COUNT_REQUEST,
        urls: ["https://dynamic.example/article"]
      })
    })
    expect(messages).toContainEqual({
      type: MESSAGE_TYPES.HN_REQUEST,
      urls: ["https://dynamic.example/article"]
    })
    expect(result.querySelector(".gsplus-hatebu-count__text")?.textContent).toBe("3 users")

    observers.forEach((observer) => observer.disconnect())
  })
})
