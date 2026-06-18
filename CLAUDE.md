# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome extension (Manifest V3, TypeScript) that overlays Hatena Bookmark counts and Hacker News maximum story points on Google search results. No runtime dependencies — devDependencies only.

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

Before Chrome Web Store submission, also run `make package` and check the package rules in `docs/release-management.md`, `docs/remote-hosted-code-audit.md`, and `docs/chrome-web-store-privacy-practices.md`. Public-facing copy must stay aligned across `README.md`, `PRIVACY.md`, `public/manifest.json`, and the Chrome Web Store listing.

Live E2E sweep (real Chrome + chrome-devtools MCP, badge counts vs Hatena API): use the `gsplus-hatebu-e2e` user skill only when the user explicitly asks for it. Never wire it into CI; Google bot detection makes it inherently flaky there.

### User-triggered live verification

Do not run `gsplus-hatebu-e2e` just because a branch was pushed or a PR was created. The live sweep is user-triggered, not a post-push gate.

When the user asks for the live sweep:

1. Confirm that the target `dist/` has been built and the extension has been reloaded at `chrome://extensions/` (⟳). Never skip the reload — the installed extension keeps running the old build, so a sweep without it validates stale code and produces false confidence.
2. Ask or infer the intended scope from the user's request. Use a reduced smoke sweep unless the user asks for a full sweep or the change touches URL normalization, count matching, or SERP selectors.
3. Report the branch / commit under test, the requested scope, the result, and any CAPTCHA, popup, Chrome, or reload constraints.

Make targets are thin wrappers around the npm scripts.

### Quality baseline (ratchet)

`quality-baseline.json` records every currently-known ESLint warning (complexity / max-lines etc.) and knip finding as repayment targets. `npm run quality:check` fails on any **new or worsened** entry; after intentionally reducing debt, refresh with `npm run quality:update-baseline` (it refuses to ratchet upward). The gate logic lives in `scripts/quality-gate*.mjs`, tested via `npm run quality:test` (node:test, not Vitest).

### Coverage gate

`vitest.config.ts` enforces per-file thresholds (lines/statements/functions 80%, branches 70%) on the logic layer. Only the two entrypoints (`src/background/index.ts`, `src/content/index.ts`) are excluded as wiring glue — every other module (shared, handlers, content modules, infra adapters) is gated, so keep the entrypoints free of logic.

## Architecture

tsup builds exactly two bundles from `tsup.config.ts`: `dist/background.js` (service worker) and `dist/content.js` (content script). `public/` (including `manifest.json`) is copied into `dist/` as-is.

The code is split by Chrome extension runtime boundary:

- **`src/content/`** — runs on Google SERPs. `index.ts` is thin boot glue (styles + MutationObserver); the work happens in `searchResults.ts` (DOM discovery), `signals.ts` (per-URL caching/orchestration), `badges.ts` / `overlay.ts` / `styles.ts` (rendering), and `messaging.ts` (the only content-side file that touches `chrome.runtime`). Never fetches external APIs directly.
- **`src/background/`** — service worker. `index.ts` only wires real fetchers into `handlers.ts` (`createMessageHandler(deps)` — dependency-injected, exhaustively switched, unit-testable). The only place that performs network requests (Hatena and HN Algolia APIs, allowed via `host_permissions` in the manifest). HN requests are capped separately from Hatena requests because they fan out one fetch per URL.
- **`src/shared/`** — message contracts, URL normalization, and API clients used by both sides.
- **`src/infra/chrome/`** — `messageRouter.ts` wraps `chrome.runtime.onMessage` and owns the MV3 "return `true` to keep the channel open for async `sendResponse`" protocol, so handlers just return a `Promise` (or `null` for foreign messages).

### Message flow

Content and background communicate exclusively through typed messages defined in `src/shared/messages.ts`: requests are a discriminated union (`MESSAGE_TYPES` + `is...Request` guards that validate payload element types), responses are `{ ok: true, data } | { ok: false, error }` envelopes validated with `isExtensionResponse(value, isData)`. Never cast a message — always narrow through the guards. The flow:

1. Content script scans the SERP (`discoverSearchResults`), extracts external URLs, and batches `COUNT_REQUEST` / `HN_REQUEST` messages.
2. Background validates the payload (http/https allowlist, size cap — content-script input is treated as untrusted), fetches counts (`src/shared/hatena.ts`, `src/shared/hackerNews.ts`), and responds with an envelope.
3. Content renders inline badges; results with 0 counts get no badge. Hovering the Hatena badge sends `ENTRY_REQUEST` to fetch bookmark comments for the overlay popup. Error envelopes map to the same UI states as the legacy behavior (counts → no badge, entry → empty-comments wording).

### Caching layers

Content script keeps per-page caches (`cachedCounts`, `cachedHnSummaries`, inflight sets) so re-scans from the MutationObserver don't re-request. Background keeps an in-memory HN cache across pages. There is no persistent storage.

### URL normalization (`src/shared/url.ts`) — the critical piece

Google hrefs may be redirects (`/url?q=...`) and Hatena API response keys don't always match the requested URL exactly. `url.ts` handles: redirect unwrapping, Google-property filtering, hash/tracking-param stripping (`utm_*`, `gclid`, etc.). `fetchHatenaCounts` then matches responses against candidate variants (http↔https flip, query-string stripped). Most count-mismatch bugs live here.

### Google SERP layout assumptions

All DOM selectors for result containers are concentrated in `src/content/searchResults.ts` (`RESULT_CONTAINER_SELECTOR`). When Google changes its SERP layout, fix it there. Containers are marked with `data-gsplus-hatebu` to prevent double-processing; a MutationObserver in `src/content/index.ts` re-scans dynamically added nodes.

### Adding a new data source

Follow the Hacker News example: API client in `src/shared/`, request/response types + type guards in `src/shared/messages.ts`, a case in `src/background/handlers.ts`, send/validate plumbing in `src/content/messaging.ts`, badge rendering in `src/content/badges.ts` + orchestration in `src/content/signals.ts`, and the API host added to `host_permissions` in `public/manifest.json`.

### Manifest

`public/manifest.json`: supporting another Google TLD means adding a pattern to `content_scripts[0].matches`; calling a new API host requires a `host_permissions` entry.

## Conventions

- Prettier: no semicolons, double quotes, 100 char width (`.prettierrc`), enforced by `fmt-check`. TypeScript strict mode.
- Tests live in `tests/` mirroring the source tree (`tests/shared/`, `tests/content/`), named `*.test.ts`, Vitest + jsdom with globals enabled. Pure helpers (`url.ts`, `hatena.ts`, `searchResults.ts`) are the tested surface — keep new logic in pure functions so it stays testable.
- Conventional Commits (`feat(content): ...`).
- `docs/spec.md` is the architectural source of truth; feature specs (`docs/spec_hn.md`, `docs/spec_hn_overlay.md`) document the HN integration. Reflect major changes there. See also `AGENTS.md` for PR/commit guidelines.
