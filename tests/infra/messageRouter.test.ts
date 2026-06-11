import { afterEach, describe, expect, it, vi } from "vitest"
import { registerMessageHandler } from "../../src/infra/chrome/messageRouter"

type Listener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void
) => boolean

function stubChromeOnMessage(): { getListener: () => Listener } {
  let listener: Listener | undefined
  vi.stubGlobal("chrome", {
    runtime: {
      onMessage: {
        addListener: (registered: Listener) => {
          listener = registered
        }
      }
    }
  })
  return {
    getListener: () => {
      if (!listener) {
        throw new Error("listener was not registered")
      }
      return listener
    }
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("registerMessageHandler", () => {
  it("returns false and sends nothing for unhandled messages", () => {
    const { getListener } = stubChromeOnMessage()
    registerMessageHandler(() => null)
    const sendResponse = vi.fn()

    const keepChannelOpen = getListener()({ type: "unknown" }, {}, sendResponse)

    expect(keepChannelOpen).toBe(false)
    expect(sendResponse).not.toHaveBeenCalled()
  })

  it("keeps the channel open and forwards resolved responses", async () => {
    const { getListener } = stubChromeOnMessage()
    registerMessageHandler(() => Promise.resolve({ ok: true, data: 1 }))
    const sendResponse = vi.fn()

    const keepChannelOpen = getListener()({}, {}, sendResponse)
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled())

    expect(keepChannelOpen).toBe(true)
    expect(sendResponse).toHaveBeenCalledWith({ ok: true, data: 1 })
  })

  it("converts rejected handlers into error envelopes", async () => {
    const { getListener } = stubChromeOnMessage()
    registerMessageHandler(() => Promise.reject(new Error("boom")))
    const sendResponse = vi.fn()

    getListener()({}, {}, sendResponse)
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled())

    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: "boom" })
  })
})
