export type RequestTaskQueue = <T>(task: () => Promise<T>) => Promise<T>

export const PROVIDER_REQUEST_MAX_ATTEMPTS = 3
const PROVIDER_RETRY_BASE_DELAY_MS = 250

export class HttpResponseError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number
  ) {
    super(`${provider} API responded with ${status}`)
    this.name = "HttpResponseError"
  }
}

export function createRequestQueue(maxConcurrent: number): RequestTaskQueue {
  if (!Number.isInteger(maxConcurrent) || maxConcurrent <= 0) {
    throw new Error("maxConcurrent must be a positive integer")
  }

  const pending: Array<() => Promise<void>> = []
  let active = 0

  const drain = (): void => {
    while (active < maxConcurrent) {
      const next = pending.shift()
      if (!next) {
        return
      }

      active += 1
      void next().finally(() => {
        active -= 1
        drain()
      })
    }
  }

  return <T>(task: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      pending.push(async () => {
        try {
          resolve(await task())
        } catch (error) {
          reject(error)
        }
      })
      drain()
    })
}

function isTransientRequestError(error: unknown): boolean {
  if (error instanceof HttpResponseError) {
    return error.status === 429 || error.status >= 500
  }
  if (error instanceof TypeError) {
    return true
  }
  return (
    typeof error === "object" && error !== null && "name" in error && error.name === "AbortError"
  )
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}

export async function retryTransientRequest<T>(task: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= PROVIDER_REQUEST_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await task()
    } catch (error) {
      if (attempt >= PROVIDER_REQUEST_MAX_ATTEMPTS || !isTransientRequestError(error)) {
        throw error
      }

      await wait(PROVIDER_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1))
    }
  }

  throw new Error("provider request retry loop exhausted")
}
