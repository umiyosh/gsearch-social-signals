# Hacker News Overlay Spec

## Status

This document records the current Hacker News badge behavior after the HN feature was integrated into the main GSearch With Social Signals extension.

The old separate add-on approach is no longer used. HN badges are rendered by the same content script, style sheet, message contract, and background service worker as the Hatena Bookmark badges.

## Current Behavior

- HN badges are inserted into the shared social signal container for each discovered Google Search result.
- Hatena and HN badges can appear together. If Hatena has no count but HN has positive points, the HN badge can appear by itself.
- HN badges use the bundled `icons/hacker-news.svg` asset through `chrome.runtime.getURL()`.
- HN badges are links with `target="_blank"` and `rel="noopener noreferrer"`.
- `topStoryUrl` links to `https://news.ycombinator.com/item?id=<objectID>` when a matching top story exists.
- Without `topStoryUrl`, the badge links to `https://hn.algolia.com/?query=<encoded_url>&type=story`.
- The title tooltip is intentionally minimal: `Hacker News: X points`.
- The badge has `aria-label="Hacker News: X points"`.

## Rendering Constraints

- `maxPoints <= 0`, missing points, no matching hits, invalid JSON, HTTP 400, and fetch failures produce no HN badge.
- HN is visually distinct from Hatena by icon, text prefix, and orange styling; it does not rely on color alone.
- HN badges may appear after Hatena badges because HN requires one request per URL and is fetched asynchronously.
- Re-scans from `MutationObserver` must not duplicate badges for the same result.

## Implementation References

- DOM discovery: `src/content/searchResults.ts`
- Badge rendering: `src/content/badges.ts`
- Orchestration and content-side caches: `src/content/signals.ts`
- Message contract: `src/shared/messages.ts`
- Background handler and HN cache cap: `src/background/handlers.ts`
- HN API client: `src/shared/hackerNews.ts`

## Test Coverage

- `tests/content/badges.test.ts`
- `tests/content/signals.test.ts`
- `tests/content/searchResults.test.ts`
- `tests/background/handlers.test.ts`
- `tests/shared/hackerNews.test.ts`
- `tests/shared/messages.test.ts`
