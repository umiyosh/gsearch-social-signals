# Bluesky URL Mention Signal Spec

## Signal Semantics

- The extension calls the unauthenticated public AppView endpoint `app.bsky.feed.searchPosts` once per unique normalized URL.
- The visible value is the optional `hitsTotal` returned by the API and is rendered as the generic Unicode butterfly emoji followed by `<hitsTotal>` only when it is positive (for example, `🦋 12`). The accessible name and tooltip retain the full `Bluesky` service name.
- The badge does not bundle or reproduce Bluesky's official butterfly logo artwork.
- `hitsTotal` is a URL mention count that the API may round or truncate. It is not a sum of likes, reposts, or replies.
- Missing or invalid `hitsTotal` is unavailable, not zero. `posts.length` is never used as the total.
- The badge opens `https://bsky.app/search?q=<normalized URL>` in a new tab with `noopener noreferrer`.

## API Request

- Endpoint: `https://api.bsky.app/xrpc/app.bsky.feed.searchPosts`
- Parameters: `q=<normalized URL>`, `url=<normalized URL>`, `limit=1`, `sort=top`
- Authentication: none
- Background service worker only; the content script does not fetch AppView directly.
- Host permission: `https://api.bsky.app/*` only. No fallback host is requested because this is the AppView endpoint used by the extension.

Bluesky does not publish a numeric request limit for the public AppView. The documented PDS read limit of 3,000 requests per five minutes per IP is not the limit for `api.bsky.app`, so this implementation does not present it as an AppView allowance.

## Request Control

- Existing `normalizeRequestUrl` behavior removes fragments and tracking parameters while retaining meaningful query parameters.
- Equivalent normalized URLs are deduplicated before fetch. A normal successful batch performs at most one AppView request per unique normalized URL.
- Maximum concurrency: 3.
- Maximum URLs per extension message: 40.
- Per-attempt timeout: 5 seconds.
- Stable zero and positive summaries are cached in background memory, capped at 200 entries. Unavailable results are not cached or persisted.
- The content script maintains page-local cache and inflight state to avoid repeated requests during MutationObserver rescans.

## Failure Handling

- HTTP 400 and 403 are unavailable and are not retried.
- HTTP 429 is not retried. `Retry-After`, `RateLimit-Reset`, or `X-RateLimit-Reset` opens a circuit until the indicated time. With no usable header, the circuit opens for 60 seconds.
- HTTP 5xx, timeout, and transient fetch errors use the shared bounded retry helper for at most three attempts.
- Invalid JSON, invalid response shape, and missing `hitsTotal` are unavailable and are not retried at the message layer.
- Unavailable Bluesky data does not block Hatena or HN rendering. While the result filter is enabled, a settled unavailable result counts as no known positive signal and is retried automatically with bounded backoff.
- Automatic retries also apply to results added by pagination or infinite scroll. Pending results remain visible; a later positive response restores a previously filtered result.

## Filter Behavior

- A positive signal from Hatena, Hacker News, or Bluesky keeps the result visible.
- The filter hides a result only after all three providers have completed successfully with no positive signal.
- Pending data from any provider keeps the result visible. Settled unavailable data does not count as a positive signal and remains eligible for automatic retry.
- Turning the filter off restores results hidden by the extension.

## Diagnostics And Privacy

- Search result URLs are sent directly from the background service worker to the public Bluesky AppView. No developer-operated server, Bluesky login, account information, or API token is involved.
- URLs and API responses are not written to persistent extension storage. The only persistent setting remains the boolean filter preference.
- Diagnostic builds log aggregate counts for positive, zero, and unavailable results. They do not log raw URLs or query strings.
- The integration is unofficial and is not provided, approved, or endorsed by Bluesky.

## Tests

- `tests/shared/bluesky.test.ts`
- `tests/shared/messages.test.ts`
- `tests/background/handlers.test.ts`
- `tests/content/messaging.test.ts`
- `tests/content/signals.test.ts`
- `tests/content/badges.test.ts`
- `tests/content/styles.test.ts`
- `tests/manifest.test.ts`
