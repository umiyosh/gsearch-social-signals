# Hacker News Signal Spec

## Status

Hacker News support is implemented in the main GSearch With Social Signals extension. This document describes the current behavior and constraints.

## User-Facing Behavior

- Each supported Google Search result URL can show an HN badge in the form `HN <maxPoints> pts`.
- `maxPoints` is the maximum positive `points` value among Hacker News stories whose `url` matches the normalized search result URL.
- `nbHits` is kept as response metadata but is not the visible count.
- `maxComments` and `topStoryId` are kept as summary metadata.
- The badge is hidden when `maxPoints` is missing, zero, or negative.
- HN badges are rendered next to Hatena Bookmark badges in the shared social signal container.
- HN story links open only when the user clicks a badge; the extension does not request `news.ycombinator.com` as a host permission.

## API

- Endpoint: `https://hn.algolia.com/api/v1/search`
- Query parameters:
  - `query=<normalized_url>`
  - `tags=story`
  - `hitsPerPage=50`
- The implementation does not send `numericFilters=points>0`.
- URL matching and positive-points filtering are performed locally after receiving `hits`.

Server-side attribute narrowing and numeric filters are intentionally avoided because they produced 400 responses during implementation and regression testing.

## Matching Rules

For each requested URL, the client builds comparison keys from:

- the normalized request URL;
- the same URL with `http` and `https` flipped;
- the normalized URL without query string;
- the flipped-protocol URL without query string.

A hit is eligible only when:

- `hit.url` is a string;
- `normalizeForComparison(hit.url)` is in the candidate key set;
- `hit.points` is a positive number.

The summary uses:

- `nbHits`: the number of locally matching positive-point hits;
- `maxPoints`: the highest matching `points`;
- `maxComments`: the highest matching `num_comments`;
- `topStoryId` / `topStoryUrl`: the object ID and HN item URL for the highest-point hit.

## Performance And Limits

- HN uses one Algolia fetch per unique URL.
- `src/shared/hackerNews.ts` limits concurrent HN fetches to 4.
- Each HN fetch has a 5 second timeout.
- `src/background/handlers.ts` caps HN requests at 40 URLs per message.
- The background HN cache is capped at 200 entries.
- The content script also keeps page-local caches and inflight sets so MutationObserver re-scans do not repeatedly fetch the same URL.

## Message Flow

- Content sends `MESSAGE_TYPES.HN_REQUEST` with `{ urls: string[] }`.
- Background validates the envelope with `isExtensionRequest`.
- Background filters payload values to `http:` / `https:` URLs.
- Background fetches only uncached summaries and responds with `{ ok: true, data: Record<string, HackerNewsSummary | null> }`.
- Content validates the response envelope and renders only positive `maxPoints`.

## Error Handling

- HTTP 400 from HN Algolia is treated as a missing summary for that URL.
- Invalid JSON shape, empty hits, missing points, URL mismatch, timeout, and fetch failure result in no HN badge.
- Failures are aggregated where possible so the extension does not flood the console with one error per URL.

## Security And Privacy

- HN API calls are made only from the background service worker.
- The content script never fetches HN directly.
- The only HN host permission is `https://hn.algolia.com/*`.
- Search result URLs are sent to HN Algolia to provide the displayed points. This is described in `PRIVACY.md` and the Chrome Web Store Privacy practices draft.

## Tests

- `tests/shared/hackerNews.test.ts`
- `tests/background/handlers.test.ts`
- `tests/content/badges.test.ts`
- `tests/content/signals.test.ts`
- `tests/shared/messages.test.ts`
