import { describe, expect, it, vi } from "vitest"
import { HttpResponseError, retryTransientRequest } from "../../src/shared/request-queue"

describe("retryTransientRequest", () => {
  it("does not retry a rate-limit response immediately", async () => {
    const task = vi.fn().mockRejectedValue(new HttpResponseError("provider", 429))

    await expect(retryTransientRequest(task)).rejects.toMatchObject({ status: 429 })
    expect(task).toHaveBeenCalledTimes(1)
  })
})
