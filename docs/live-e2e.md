# Live E2E verification

GSearch With Social Signals depends on the live Google Search result page DOM. Google changes SERP markup through product updates, A/B tests, and regional variations, so DOM change detection is an important part of release and support work.

This repository includes a repository-local Codex agent skill for live E2E verification:

- Skill: `gsearch-social-signals-live-e2e`
- Location: `.codex/skills/gsearch-social-signals-live-e2e/SKILL.md`

The workflow opens real Google SERPs in the user's local Chrome profile and checks that Hatena Bookmark and Hacker News badges render next to eligible search results. It also compares rendered values with the external APIs used by the extension.

## What It Checks

- Hatena Bookmark count badges are rendered when the Hatena count API reports a positive count.
- Hacker News badges are rendered when the current HN Algolia Search based implementation finds a positive max score.
- HN-positive probe keywords, such as `antirez from where left`, can render at least one `HN <points> pts` badge.
- Negative controls detect intentionally changed badge values instead of passing trivially.
- Search result URLs are compared after the same style of URL normalization used by the extension.

## Why It Is Not CI

This workflow is intentionally not part of GitHub Actions or any other CI pipeline.

Google Search frequently applies bot detection, CAPTCHA, consent screens, and layout variations to clean automated environments. Those conditions make live Google SERP E2E unreliable in CI and can produce failures that do not reflect extension behavior.

Instead, the skill uses the user's existing Chrome profile through chrome-devtools. That profile already has the unpacked or store-installed extension and is less likely to hit bot detection than a fresh CI browser.

## Requirements

- The extension is installed and enabled in local Chrome.
- chrome-devtools MCP can control the user's Chrome session.
- The target build has been loaded or reloaded in `chrome://extensions/` before verification.
- If Google returns `/sorry`, CAPTCHA, or popup-blocking interruptions, the workflow stops and reports partial results.

## Limits

- Google A/B tests, language settings, region, and account state can still affect SERP markup.
- The workflow cannot fully guarantee every Google domain or SERP module variant.
- Hatena Bookmark may register the same content under a different URL representation than the URL shown in Google results.
- Hacker News verification follows the extension's current Algolia Search API based behavior and checks `maxPoints`; it does not verify against the Firebase item API's latest story values.

## Running It

Invoke the repository-local Codex skill when live browser verification is needed:

```text
$gsearch-social-signals-live-e2e
```

Use it after release packaging, after changes that may affect badge rendering, or when investigating reports about missing Hatena counts, missing HN points, or Google SERP layout changes.
