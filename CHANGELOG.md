# Changelog

All notable changes to this project are documented here.

## [0.2.0] - 2026-07-20

### Added

- DuckDuckGo web search result support with Hatena Bookmark and Hacker News signals ([#40](https://github.com/umiyosh/gsearch-social-signals/pull/40)).
- Optional filtering that keeps only results with a positive social signal and fails open when a provider is unavailable ([#38](https://github.com/umiyosh/gsearch-social-signals/pull/38)).
- A Chrome toolbar popup for toggling the social-signal filter ([#41](https://github.com/umiyosh/gsearch-social-signals/pull/41)).
- A diagnostic build for measuring production-equivalent content, background, and Hatena request timing ([#35](https://github.com/umiyosh/gsearch-social-signals/pull/35)).

### Changed

- Redesigned and localized the settings UI with accessible controls and automatic save feedback ([#41](https://github.com/umiyosh/gsearch-social-signals/pull/41)).
- Added bounded request queues and retry handling for Hatena Bookmark, Hacker News, and runtime messages ([#41](https://github.com/umiyosh/gsearch-social-signals/pull/41)).
- Reused browser caching for Hatena Bookmark comment previews to reduce repeat loading time ([#35](https://github.com/umiyosh/gsearch-social-signals/pull/35)).

### Fixed

- Prevented unfiltered results from remaining visible after loading large numbers of paginated search results ([#41](https://github.com/umiyosh/gsearch-social-signals/pull/41)).
- Allowed Hacker News lookups to recover after transient provider failures instead of caching an unavailable result ([#41](https://github.com/umiyosh/gsearch-social-signals/pull/41)).

## [0.1.3] - 2026-07-07

### Changed

- Localized the Chrome Web Store listing metadata and documented the public support and operations paths ([#30](https://github.com/umiyosh/gsearch-social-signals/pull/30)).
- Added pull request CI checks and a repository-local live E2E workflow for real Google search result verification ([#31](https://github.com/umiyosh/gsearch-social-signals/pull/31), [#32](https://github.com/umiyosh/gsearch-social-signals/pull/32)).
- Improved repository presentation and governance with status badges, the application icon, and code ownership ([#31](https://github.com/umiyosh/gsearch-social-signals/pull/31), [#33](https://github.com/umiyosh/gsearch-social-signals/pull/33), [#34](https://github.com/umiyosh/gsearch-social-signals/pull/34)).

## [0.1.2] - 2026-06-22

### Changed

- Repository URL target: `https://github.com/umiyosh/gsearch-social-signals`.
- Package name: `gsearch-social-signals`.
- Store submission package: `store-package/gsearch-social-signals-0.1.2.zip`.

## [0.1.1] - 2026-06-22

### Changed

- Public extension name: `GSearch With Social Signals`.
- Store submission package: `store-package/gsplus-hatebu-0.1.1.zip`.

## [0.1.0] - 2026-06-18

### Added

- Initial Unlisted beta release candidate for Chrome Web Store submission.
- Manifest V3 extension package with background service worker and Google Search content script.
- Hatena Bookmark count badges for supported Google Search result URLs.
- Hacker News score badges via Hacker News Search API / Algolia.
- Hatena comment preview on badge hover or keyboard focus.
- Local extension icons and badge icons for store-ready packaging.
- Store package build command that produces a zip with `manifest.json` at the archive root.
- GitHub Release workflow that attaches the Chrome Web Store zip when a `v*` release tag is pushed.

### Release Notes

- Public extension name: `Search With Social Signals`.
- Current intended channel: Unlisted beta.
- Store submission package: `store-package/gsplus-hatebu-0.1.0.zip`.
