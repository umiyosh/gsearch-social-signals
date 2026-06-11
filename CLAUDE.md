# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome extension (Manifest V3, TypeScript) that overlays Hatena Bookmark counts and Hacker News post counts on Google search results. No runtime dependencies — devDependencies only.

## Commands

```bash
npm run build       # clean → tsup bundle → copy public/ into dist/
npm run dev         # tsup watch + public/ copy watch (load dist/ unpacked in Chrome)
npm run lint        # ESLint on src/ and tests/
npm run fmt-check   # Prettier check (fmt = --write)
npm run test        # Vitest (jsdom), run once
npm run test:coverage   # Vitest + v8 coverage with per-file thresholds
npx vitest run tests/shared/url.test.ts   # run a single test file
npm run typecheck   # tsc --noEmit
npm run quality:check   # eslint warnings + knip vs quality-baseline.json (ratchet)
npm run quality:test    # node --test for scripts/*.test.mjs
```

Quality gate before a PR: `make check` (= lint / fmt-check / typecheck / quality-test / lint-quality / test-coverage). Manual smoke test: rebuild, reload the extension at `chrome://extensions/`, open a Google SERP and confirm badges render.

Make targets are thin wrappers around the npm scripts.

### Quality baseline (ratchet)

`quality-baseline.json` records every currently-known ESLint warning (complexity / max-lines etc.) and knip finding as repayment targets. `npm run quality:check` fails on any **new or worsened** entry; after intentionally reducing debt, refresh with `npm run quality:update-baseline` (it refuses to ratchet upward). The gate logic lives in `scripts/quality-gate*.mjs`, tested via `npm run quality:test` (node:test, not Vitest).

### Coverage gate

`vitest.config.ts` enforces per-file thresholds (lines/statements/functions 80%, branches 70%) on the logic layer. `src/background/index.ts` and `src/content/index.ts` are excluded as chrome-runtime/DOM entrypoint glue — keep logic out of them and in `src/shared/` or `src/content/searchResults.ts`, which are gated.

## Architecture

tsup builds exactly two bundles from `tsup.config.ts`: `dist/background.js` (service worker) and `dist/content.js` (content script). `public/` (including `manifest.json`) is copied into `dist/` as-is.

The code is split by Chrome extension runtime boundary:

- **`src/content/`** — runs on Google SERPs. Discovers result links, renders badges/overlay into the DOM. Never fetches external APIs directly.
- **`src/background/`** — service worker. The only place that performs network requests (Hatena and HN Algolia APIs, allowed via `host_permissions` in the manifest).
- **`src/shared/`** — message contracts, URL normalization, and API clients used by both sides.

### Message flow

Content and background communicate exclusively through typed message envelopes defined in `src/shared/messages.ts` (`MESSAGE_TYPES` constants + `is...Request/Response` type guards — every handler validates with the guard, never casts). The flow:

1. Content script scans the SERP (`discoverSearchResults`), extracts external URLs, and batches `COUNT_REQUEST` / `HN_REQUEST` messages.
2. Background fetches counts (`src/shared/hatena.ts`, `src/shared/hackerNews.ts`) and responds.
3. Content renders inline badges; results with 0 counts get no badge. Hovering the Hatena badge sends `ENTRY_REQUEST` to fetch bookmark comments for the overlay popup.

Async `sendResponse` handlers in `src/background/index.ts` must `return true` to keep the message channel open.

### Caching layers

Content script keeps per-page caches (`cachedCounts`, `cachedHnSummaries`, inflight sets) so re-scans from the MutationObserver don't re-request. Background keeps an in-memory HN cache across pages. There is no persistent storage.

### URL normalization (`src/shared/url.ts`) — the critical piece

Google hrefs may be redirects (`/url?q=...`) and Hatena API response keys don't always match the requested URL exactly. `url.ts` handles: redirect unwrapping, Google-property filtering, hash/tracking-param stripping (`utm_*`, `gclid`, etc.). `fetchHatenaCounts` then matches responses against candidate variants (http↔https flip, query-string stripped). Most count-mismatch bugs live here.

### Google SERP layout assumptions

All DOM selectors for result containers are concentrated in `src/content/searchResults.ts` (`RESULT_CONTAINER_SELECTOR`). When Google changes its SERP layout, fix it there. Containers are marked with `data-gsplus-hatebu` to prevent double-processing; a MutationObserver in `src/content/index.ts` re-scans dynamically added nodes.

### Adding a new data source

Follow the Hacker News example: API client in `src/shared/`, request/response types + type guards in `src/shared/messages.ts`, handler in `src/background/index.ts`, badge rendering in `src/content/index.ts`, and the API host added to `host_permissions` in `public/manifest.json`.

### Manifest

`public/manifest.json`: supporting another Google TLD means adding a pattern to `content_scripts[0].matches`; calling a new API host requires a `host_permissions` entry.

## Conventions

- Prettier: no semicolons, double quotes, 100 char width (`.prettierrc`), enforced by `fmt-check`. TypeScript strict mode.
- Tests live in `tests/` mirroring the source tree (`tests/shared/`, `tests/content/`), named `*.test.ts`, Vitest + jsdom with globals enabled. Pure helpers (`url.ts`, `hatena.ts`, `searchResults.ts`) are the tested surface — keep new logic in pure functions so it stays testable.
- Conventional Commits (`feat(content): ...`).
- `docs/spec.md` is the architectural source of truth; feature specs (`docs/spec_hn.md`, `docs/spec_hn_overlay.md`) document the HN integration. Reflect major changes there. See also `AGENTS.md` for PR/commit guidelines.
