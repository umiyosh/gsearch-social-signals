# Remote Hosted Code Audit

Date: 2026-06-18

## Policy Basis

Chrome Web Store treats remotely hosted code as code executed by the browser that is loaded from outside the extension package, such as JavaScript or WASM. Data such as JSON or CSS is not RHC. Reviewers evaluate compiled output, so the built `dist/` directory must be searched.

Manifest V3 also requires extension logic to be bundled in the extension package and disallows executing arbitrary strings with `eval()` or `new Function()`.

## Result

No remotely hosted executable code is used.

- No external JavaScript is loaded.
- No external WASM is loaded.
- No CDN script is used.
- `eval()` is not used.
- `new Function()` is not used.
- No dynamic `<script src>` insertion is used.
- Production build output does not include source maps, reducing Chrome Web Store review noise from non-executable source strings.

## `https://` Classification

The built extension still contains `https://` strings for non-executable purposes:

- API endpoints:
  - `https://bookmark.hatenaapis.com/count/entries`
  - `https://b.hatena.ne.jp/entry/jsonlite/`
  - `https://hn.algolia.com/api/v1/search`
- User navigation destinations:
  - `https://b.hatena.ne.jp/entry/...`
  - `https://hn.algolia.com/?query=...`
  - `https://news.ycombinator.com/item?id=...`
- Manifest metadata and match patterns:
  - `homepage_url`
  - `host_permissions`
  - `content_scripts.matches`
  - `web_accessible_resources.matches`

These are not executable code.

## Build Output Search

Commands run against `dist/` after `npm run build`:

- `grep -R "eval(" dist`: no matches.
- `grep -R "new Function" dist`: no matches.
- `grep -R "<script" dist`: no matches.
- `grep -R "https://" dist`: matches only API endpoints, user navigation destinations, manifest metadata, host permissions, content script match patterns, and web-accessible-resource match patterns.

Additional checks:

- `rg -n "WebAssembly|\\.wasm|wasm" dist src public package.json package-lock.json`: no `dist/` matches. Matches in `package-lock.json` are dev toolchain optional dependencies and are not packaged in `dist/`.
- `rg -n "createElement\\([\\\"']script|script\\.src|appendChild\\(script|import\\(|https://.*cdn|cdn\\.jsdelivr|unpkg|cdnjs|esm\\.sh|skypack" dist src public package.json package-lock.json`: no matches.

## Favicon Decision

Previously the content script loaded Hatena and Hacker News favicons from external URLs. Images are not RHC, but they add external requests and make `dist/` `https://` auditing noisier.

Decision: bundle local SVG icon assets and load them with `chrome.runtime.getURL()`. The assets are exposed only to the supported Google Search origins through `web_accessible_resources`.
