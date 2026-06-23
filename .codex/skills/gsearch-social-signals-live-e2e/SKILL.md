---
name: gsearch-social-signals-live-e2e
description: Live E2E verification for the GSearch With Social Signals Chrome extension against real Google SERPs. Use when checking badge rendering after release or code changes, investigating Hatena Bookmark count mismatches, verifying Google SERP layout changes, or validating Hacker News score badges. This workflow intentionally uses the user's existing Chrome profile through chrome-devtools and must not be added to CI because Google bot detection makes it flaky.
---

# GSearch With Social Signals Live E2E Verification

Verify the GSearch With Social Signals extension installed in the user's real Chrome profile against real Google search results. Using the logged-in user profile is part of the test: a clean browser profile often triggers Google bot detection and invalidates the run.

## Codex Setup

1. Load chrome-devtools tools with `tool_search` if they are not already available. Search for `chrome-devtools`.
2. Use chrome-devtools MCP tools for the browser workflow, especially `new_page`, `evaluate_script`, `navigate_page`, `list_pages`, and `close_page`.
3. Do not use the Browser plugin or generic web browsing for this skill. This workflow must run in the user's existing Chrome profile so the installed extension is present.
4. If local AGENTS.md requires confirmation before external requests, get confirmation before starting the live Google/Hatena verification. The user's explicit request to run this skill may satisfy intent, but still follow the active repository rule if it asks for a separate confirmation.

## Default Scope

- Use 15 keywords by default.
- Include at least one HN-positive probe keyword, currently `antirez from where left`, so the run proves Hacker News score badges can render when `maxPoints > 0`.
- Visit page 2 (`&start=10`) for 5 starred keywords.
- This produces 20 SERP pages total, or roughly 200 URL checks when Google returns about 10 organic results per page.
- Keep one third of the default keywords alphabet-only so Hacker News score badges have realistic opportunities to appear.
- If the user specifies a smaller or larger scope, follow that scope.

Default keywords:

Alphabet-only keywords (5/15): `antirez from where left`, `react hooks`, `typescript generics`, `postgresql indexing`, `github actions`

Japanese or mixed keywords (10/15): `Kubernetes 入門`, `ドメイン駆動設計`, `確定申告 やり方`, `機械学習 入門`, `Docker compose 入門`, `Rust 所有権`, `マイクロサービス 設計`, `Terraform ベストプラクティス`, `住宅ローン 金利`, `はてなブックマーク 使い方`

Visit page 2 for the first five keywords unless the user says otherwise. To keep the live test realistic, replace a few unstarred keywords with current topical keywords when useful.

## Preconditions

1. The Chrome extension is installed and enabled in `chrome://extensions/` as `GSearch With Social Signals`.
2. chrome-devtools MCP is connected to the user's Chrome.
3. If code changed immediately before the run, build the extension with the repository's normal build command, then ask the user to reload the extension in `chrome://extensions/` before starting.

## Hard Rules

- Do not touch the user's existing tabs. Operate only on pages opened by this workflow: the test page and the probe popup.
- Stop immediately if Google returns `/sorry` or CAPTCHA. Report partial results instead of trying to bypass it.
- Keep each `evaluate_script` batch to 6 SERP pages or fewer to avoid timeouts.
- If CAPTCHA, popup blocking, tool errors, or other interruptions occur, still run best-effort cleanup for pages and storage created by this workflow before reporting.
- At the end, remove `gsplusE2E`, `gsplusE2EDataset`, `gsplusFn`, and `gsplusDrv` from google.com `localStorage`, clear `window.name`, and close only pages opened by the workflow.

## Architecture Notes

- Use a popup driver so one `evaluate_script` call can navigate multiple SERPs and extract badge data. This reduces tool calls and context use.
- Store raw extraction results in google.com `localStorage("gsplusE2E")` and the finalized dataset in `localStorage("gsplusE2EDataset")`; return only compact summaries from each batch.
- Use `window.name` only to transfer the collected dataset to the Hatena API origin. Browser-page CORS blocks direct fetches to `bookmark.hatenaapis.com` from Google, so navigate to the Hatena API origin and fetch from same origin.
- Run Hacker News comparison from a google.com page using `localStorage("gsplusE2EDataset")`. `hn.algolia.com` currently allows browser fetches from Google, and this avoids losing the dataset on cross-origin navigation.
- Hatena comparison uses the Hatena count API. Hacker News comparison uses Algolia HN Search and must calculate `maxPoints` using the same URL matching rules as `src/shared/hackerNews.ts`.
- Match the extension's URL normalization behavior. If `src/shared/url.ts`, `src/shared/hatena.ts`, or `src/shared/hackerNews.ts` changed, update the comparison logic below to match.

## Workflow

### 1. Open a Test Page and Install the Driver

Open `https://www.google.com/search?q=<first keyword>` with chrome-devtools `new_page`. Run this with `evaluate_script`:

```js
;async () => {
  const drv = `(async (batch) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const extract = async (doc, k, p) => {
      for (let i = 0; i < 14; i++) {
        if (!doc.querySelectorAll('[data-gsplus-hatebu="pending"]').length) break;
        await wait(500);
      }
      let stableHnIntervals = 0;
      let lastHnCount = doc.querySelectorAll(".gsplus-hn-count__text").length;
      for (let i = 0; i < 16; i++) {
        await wait(500);
        if (doc.querySelectorAll('[data-gsplus-hatebu="pending"]').length) {
          stableHnIntervals = 0;
          lastHnCount = doc.querySelectorAll(".gsplus-hn-count__text").length;
          continue;
        }
        const hnCount = doc.querySelectorAll(".gsplus-hn-count__text").length;
        if (hnCount === lastHnCount) stableHnIntervals += 1;
        else stableHnIntervals = 0;
        lastHnCount = hnCount;
        if (stableHnIntervals >= 3) break;
      }
      const resolve = (href) => {
        let u;
        try { u = new URL(href); } catch { return null; }
        const host = u.hostname.toLowerCase();
        if (host.startsWith("www.google.") && u.pathname === "/url") {
          const a = u.searchParams.get("q") ?? u.searchParams.get("url");
          if (!a) return null;
          try { u = new URL(a); } catch { return null; }
        } else if (host.startsWith("www.google.")) { return null; }
        if (!["http:", "https:"].includes(u.protocol)) return null;
        u.hash = "";
        return u.toString();
      };
      const byUrl = new Map();
      doc.querySelectorAll("[data-gsplus-hatebu]").forEach((c) => {
        const state = c.getAttribute("data-gsplus-hatebu");
        let url = null;
        for (const a of c.querySelectorAll("a[href]")) {
          if (a.closest(".gsplus-signal-container")) continue;
          url = resolve(a.href);
          if (url) break;
        }
        if (!url) return;
        const t = c.querySelector(".gsplus-hatebu-count__text");
        const m = t ? t.textContent.match(/^(\\d+) users$/) : null;
        const d = m ? Number(m[1]) : 0;
        const hnBadge = c.querySelector(".gsplus-hn-count");
        const hnText = c.querySelector(".gsplus-hn-count__text");
        const hm = hnText ? hnText.textContent.match(/^HN\\s+(\\d+)\\s+pts$/i) : null;
        const h = hm ? Number(hm[1]) : 0;
        const hh = hnBadge && typeof hnBadge.href === "string" ? hnBadge.href : null;
        const ht = hnBadge && typeof hnBadge.title === "string" ? hnBadge.title : null;
        const prev = byUrl.get(url);
        if (!prev || d > prev.d || h > prev.h) byUrl.set(url, { u: url, d, h, hh, ht, s: state, k, p });
      });
      const store = JSON.parse(localStorage.getItem("gsplusE2E") || "[]");
      const added = [...byUrl.values()];
      store.push(...added);
      localStorage.setItem("gsplusE2E", JSON.stringify(store));
      return { k, p, n: added.length, b: added.filter((e) => e.d > 0).length, hn: added.filter((e) => e.h > 0).length };
    };
    const w = window.open("about:blank", "gsplusProbe");
    if (!w) return { blocked: true };
    const out = [];
    for (const [k, p, url] of batch) {
      try {
        w.location.href = url;
        await wait(1000);
        for (let i = 0; i < 25; i++) {
          let ready = false;
          try { ready = w.document.readyState === "complete" && w.location.href.includes("google"); } catch (e) {}
          if (ready) break;
          await wait(400);
        }
        if (w.location.pathname.startsWith("/sorry")) { out.push({ k, captcha: true }); break; }
        out.push(await extract(w.document, k, p));
      } catch (e) {
        out.push({ k, err: String(e).slice(0, 100) });
      }
    }
    return out;
  })`
  localStorage.setItem("gsplusDrv", drv)
  localStorage.setItem("gsplusE2E", "[]")
  return "driver installed"
}
```

### 2. Run Keyword Batches

Run at most 6 pages per `evaluate_script` call:

```js
;async () => {
  const enc = (kw) => "https://www.google.com/search?q=" + encodeURIComponent(kw)
  return await eval(localStorage.getItem("gsplusDrv"))([
    ["<keyword>", 1, enc("<keyword>")],
    ["<keyword>", 2, enc("<keyword>") + "&start=10"]
  ])
}
```

If any result contains `captcha: true`, stop the crawl, run best-effort cleanup, and report partial results. If the result contains `blocked: true`, run best-effort cleanup, ask the user to allow popups for google.com, and rerun only after permission is granted.

### 3. Finalize Data and Put It in `window.name`

```js
;() => {
  const store = JSON.parse(localStorage.getItem("gsplusE2E") || "[]")
  const byUrl = new Map()
  store.forEach((e) => {
    const g = byUrl.get(e.u) ?? { u: e.u, ds: [], hs: [], hhs: [], hts: [], refs: [], pages: 0 }
    if (!g.ds.includes(e.d)) g.ds.push(e.d)
    if (typeof e.h === "number" && !g.hs.includes(e.h)) g.hs.push(e.h)
    if (e.hh && !g.hhs.includes(e.hh)) g.hhs.push(e.hh)
    if (e.ht && !g.hts.includes(e.ht)) g.hts.push(e.ht)
    if (!g.refs.some((ref) => ref.k === e.k && ref.p === e.p)) g.refs.push({ k: e.k, p: e.p })
    g.pages += 1
    byUrl.set(e.u, g)
  })
  const dataset = [...byUrl.values()]
  localStorage.setItem("gsplusE2EDataset", JSON.stringify(dataset))
  window.name = "GSPLUS_E2E:" + JSON.stringify(dataset)
  return {
    rawEntries: store.length,
    uniqueUrls: dataset.length,
    withBadge: dataset.filter((g) => g.ds.some((d) => d > 0)).length,
    withHnBadge: dataset.filter((g) => g.hs.some((h) => h > 0)).length,
    inconsistentAcrossPages: dataset.filter((g) => g.ds.length > 1).length
  }
}
```

If `inconsistentAcrossPages` is not 0, include it in the report as a possible cache consistency issue.

### 4. Navigate to Hatena API Origin and Compare All URLs

Use `navigate_page` on the same tab:

`https://bookmark.hatenaapis.com/count/entries?url=https%3A%2F%2Fexample.com%2F`

Then run:

```js
;async () => {
  if (!window.name.startsWith("GSPLUS_E2E:")) return { err: "window.name lost" }
  const dataset = JSON.parse(window.name.slice("GSPLUS_E2E:".length))
  const TRACK = new Set([
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "igshid",
    "gclid",
    "ref",
    "fbclid"
  ])
  const normalizeUrl = (raw) => {
    try {
      const u = new URL(raw)
      if (!["http:", "https:"].includes(u.protocol)) return null
      u.hash = ""
      return u.toString()
    } catch {
      return null
    }
  }
  const normalizeForComparison = (url) => {
    const n = normalizeUrl(url)
    if (!n) return url
    const p = new URL(n)
    const scheme = p.protocol === "https:" ? "https://" : "http://"
    return `${scheme}${p.hostname.toLowerCase()}${p.pathname || "/"}${p.search ?? ""}`
  }
  const stripQ = (u) => {
    const i = u.indexOf("?")
    return i === -1 ? u : u.slice(0, i)
  }
  const normalizeRequestUrl = (url) => {
    const n = normalizeForComparison(url)
    const i = n.indexOf("?")
    if (i === -1) return n
    const base = n.slice(0, i)
    const params = new URLSearchParams(n.slice(i + 1))
    const f = new URLSearchParams()
    params.forEach((v, k) => {
      if (!TRACK.has(k.toLowerCase())) f.append(k, v)
    })
    const qs = f.toString()
    return qs ? `${base}?${qs}` : base
  }
  const reqUrls = [...new Set(dataset.map((g) => normalizeRequestUrl(g.u)))]
  const apiMap = new Map()
  let apiErrors = 0
  for (let i = 0; i < reqUrls.length; i += 50) {
    const batch = reqUrls.slice(i, i + 50)
    const ep = new URL("https://bookmark.hatenaapis.com/count/entries")
    batch.forEach((u) => ep.searchParams.append("url", u))
    try {
      const r = await fetch(ep.toString())
      if (!r.ok) {
        apiErrors++
        continue
      }
      const json = await r.json()
      Object.entries(json).forEach(([k, v]) => {
        apiMap.set(normalizeForComparison(k), typeof v === "number" ? v : Number(v) || 0)
      })
    } catch {
      apiErrors++
    }
  }
  const results = { checked: 0, ok: 0, mismatches: [], unmatchedWithBadge: [] }
  dataset.forEach((g) => {
    const nr = normalizeForComparison(normalizeRequestUrl(g.u))
    const flip = nr.startsWith("https://")
      ? nr.replace("https://", "http://")
      : nr.replace("http://", "https://")
    const cands = [nr, flip, stripQ(nr), stripQ(flip)]
    const hit = cands.find((c) => apiMap.has(c))
    const api = hit !== undefined ? apiMap.get(hit) : null
    const displayed = g.ds.length === 1 ? g.ds[0] : g.ds
    results.checked++
    const expectBadge = typeof api === "number" && api > 0
    const pass = expectBadge ? g.ds.every((d) => d === api) : g.ds.every((d) => d === 0)
    if (pass) results.ok++
    else if (hit === undefined) results.unmatchedWithBadge.push({ u: g.u, displayed })
    else results.mismatches.push({ u: g.u, displayed, api })
  })
  results.apiErrors = apiErrors
  results.mismatches = results.mismatches.slice(0, 40)
  return results
}
```

### 5. Return to Google and Compare HN Score Badges

Use `navigate_page` on the same tab to return to a Google SERP, for example:

`https://www.google.com/search?q=antirez%20from%20where%20left`

Then run the HN comparison from Google origin. Do not navigate to `hn.algolia.com` for this step; the finalized dataset is stored in Google `localStorage`, and cross-origin navigation can lose `window.name` in some Chrome profiles.

Then run:

```js
;async () => {
  const buildDataset = () => {
    const store = JSON.parse(localStorage.getItem("gsplusE2E") || "[]")
    const byUrl = new Map()
    store.forEach((e) => {
      const g = byUrl.get(e.u) ?? { u: e.u, ds: [], hs: [], hhs: [], hts: [], refs: [], pages: 0 }
      if (!g.ds.includes(e.d)) g.ds.push(e.d)
      if (typeof e.h === "number" && !g.hs.includes(e.h)) g.hs.push(e.h)
      if (e.hh && !g.hhs.includes(e.hh)) g.hhs.push(e.hh)
      if (e.ht && !g.hts.includes(e.ht)) g.hts.push(e.ht)
      if (!g.refs.some((ref) => ref.k === e.k && ref.p === e.p)) g.refs.push({ k: e.k, p: e.p })
      g.pages += 1
      byUrl.set(e.u, g)
    })
    const dataset = [...byUrl.values()]
    localStorage.setItem("gsplusE2EDataset", JSON.stringify(dataset))
    return dataset
  }
  const TRACK = new Set([
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "igshid",
    "gclid",
    "ref",
    "fbclid"
  ])
  const normalizeUrl = (raw) => {
    try {
      const u = new URL(raw)
      if (!["http:", "https:"].includes(u.protocol)) return null
      u.hash = ""
      return u.toString()
    } catch {
      return null
    }
  }
  const normalizeForComparison = (url) => {
    const n = normalizeUrl(url)
    if (!n) return url
    const p = new URL(n)
    const scheme = p.protocol === "https:" ? "https://" : "http://"
    return `${scheme}${p.hostname.toLowerCase()}${p.pathname || "/"}${p.search ?? ""}`
  }
  const stripQ = (u) => {
    const i = u.indexOf("?")
    return i === -1 ? u : u.slice(0, i)
  }
  const normalizeRequestUrl = (url) => {
    const n = normalizeForComparison(url)
    const i = n.indexOf("?")
    if (i === -1) return n
    const base = n.slice(0, i)
    const params = new URLSearchParams(n.slice(i + 1))
    const f = new URLSearchParams()
    params.forEach((v, k) => {
      if (!TRACK.has(k.toLowerCase())) f.append(k, v)
    })
    const qs = f.toString()
    return qs ? `${base}?${qs}` : base
  }
  const flipProtocol = (u) =>
    u.startsWith("https://") ? u.replace("https://", "http://") : u.replace("http://", "https://")
  const buildCandidateKeys = (normalizedRequest) => {
    const flipped = flipProtocol(normalizedRequest)
    return new Set([normalizedRequest, flipped, stripQ(normalizedRequest), stripQ(flipped)])
  }
  const hitMatchesRequest = (hit, normalizedRequest) => {
    if (typeof hit.url !== "string") return false
    return buildCandidateKeys(normalizedRequest).has(normalizeForComparison(hit.url))
  }
  const fetchSummaries = async (dataset) => {
    const summaries = new Map()
    let apiErrors = 0
    for (const u of [...new Set(dataset.map((g) => g.u))]) {
      const normalizedRequest = normalizeRequestUrl(u)
      const ep = new URL("https://hn.algolia.com/api/v1/search")
      ep.searchParams.set("query", normalizedRequest)
      ep.searchParams.set("tags", "story")
      ep.searchParams.set("numericFilters", "points>0")
      ep.searchParams.set("hitsPerPage", "50")
      try {
        const r = await fetch(ep.toString(), { cache: "no-cache" })
        if (!r.ok) {
          apiErrors++
          summaries.set(u, null)
          continue
        }
        const payload = await r.json()
        const hits = Array.isArray(payload.hits)
          ? payload.hits.filter((hit) => hitMatchesRequest(hit, normalizedRequest))
          : []
        let maxPoints = 0
        let maxComments = 0
        let topStoryId = null
        hits.forEach((hit) => {
          const points = typeof hit.points === "number" ? hit.points : 0
          const comments = typeof hit.num_comments === "number" ? hit.num_comments : 0
          if (points >= maxPoints) {
            maxPoints = points
            topStoryId = hit.objectID ?? null
          }
          if (comments > maxComments) maxComments = comments
        })
        summaries.set(u, {
          nbHits: hits.length,
          maxPoints,
          maxComments,
          topStoryUrl: topStoryId ? `https://news.ycombinator.com/item?id=${topStoryId}` : null
        })
      } catch {
        apiErrors++
        summaries.set(u, null)
      }
    }
    return { summaries, apiErrors }
  }
  const compare = async (dataset) => {
    const { summaries, apiErrors } = await fetchSummaries(dataset)
    const results = {
      checked: 0,
      ok: 0,
      expectedHnBadges: 0,
      renderedHnBadges: 0,
      pointMismatches: [],
      missingHnBadges: [],
      excessHnBadges: [],
      hrefMismatches: [],
      titleMismatches: [],
      apiErrors,
      observedHn: []
    }
    dataset.forEach((g) => {
      const summary = summaries.get(g.u)
      const displayed = Array.isArray(g.hs) ? g.hs.filter((h) => h > 0) : []
      const expected = summary && summary.maxPoints > 0 ? summary.maxPoints : 0
      const expectedHref = summary?.topStoryUrl ?? null
      const expectedTitle = summary
        ? `${summary.nbHits} posts / top ${summary.maxPoints ?? 0} pts / ${summary.maxComments ?? 0} comments`
        : null
      results.checked++
      if (expected > 0) results.expectedHnBadges++
      if (displayed.length) {
        results.renderedHnBadges++
        results.observedHn.push({
          u: g.u,
          displayed,
          hrefs: g.hhs,
          titles: g.hts,
          expected,
          expectedHref,
          expectedTitle
        })
      }
      if (expected > 0 && !displayed.length) {
        results.missingHnBadges.push({ u: g.u, expected })
        return
      }
      if (expected === 0 && displayed.length) {
        results.excessHnBadges.push({ u: g.u, displayed })
        return
      }
      if (expected > 0 && !displayed.every((h) => h === expected)) {
        results.pointMismatches.push({ u: g.u, displayed, expected })
        return
      }
      if (
        expectedHref &&
        Array.isArray(g.hhs) &&
        g.hhs.length &&
        !g.hhs.every((href) => href === expectedHref)
      ) {
        results.hrefMismatches.push({ u: g.u, hrefs: g.hhs, expectedHref })
        return
      }
      if (
        expectedTitle &&
        Array.isArray(g.hts) &&
        g.hts.length &&
        !g.hts.every((title) => title === expectedTitle)
      ) {
        results.titleMismatches.push({ u: g.u, titles: g.hts, expectedTitle })
        return
      }
      results.ok++
    })
    results.pointMismatches = results.pointMismatches.slice(0, 40)
    results.missingHnBadges = results.missingHnBadges.slice(0, 40)
    results.excessHnBadges = results.excessHnBadges.slice(0, 40)
    results.hrefMismatches = results.hrefMismatches.slice(0, 40)
    results.titleMismatches = results.titleMismatches.slice(0, 40)
    results.observedHn = results.observedHn.slice(0, 10)
    return results
  }
  const enc = (kw) => "https://www.google.com/search?q=" + encodeURIComponent(kw)
  const pageUrl = (ref) => enc(ref.k) + (ref.p > 1 ? `&start=${(ref.p - 1) * 10}` : "")
  let dataset = buildDataset()
  const initial = await compare(dataset)
  if (initial.missingHnBadges.length) {
    const driver = localStorage.getItem("gsplusDrv")
    if (!driver) return { ...initial, recheckSkipped: "missing gsplusDrv" }
    const byUrl = new Map(dataset.map((g) => [g.u, g]))
    const pageKeys = new Set()
    initial.missingHnBadges.forEach((m) => {
      const refs = byUrl.get(m.u)?.refs ?? []
      refs.forEach((ref) => pageKeys.add(JSON.stringify([ref.k, ref.p, pageUrl(ref)])))
    })
    const pages = [...pageKeys].map((key) => JSON.parse(key))
    const recheckPages = []
    for (let i = 0; i < pages.length; i += 6) {
      recheckPages.push(...(await eval(driver)(pages.slice(i, i + 6))))
    }
    dataset = buildDataset()
    const after = await compare(dataset)
    return {
      ...after,
      rechecked: true,
      initialMissingHnBadges: initial.missingHnBadges,
      recheckPages
    }
  }
  return { ...initial, rechecked: false }
}
```

If `renderedHnBadges` is 0 for the whole run, the run is not sufficient for HN verification unless the explicit HN-positive probe keyword was blocked or absent. Add a targeted SERP such as `antirez from where left` and rerun the HN extraction before reporting success.

### 6. Run a Negative Control

Even if all URLs pass, prove the comparators are not trivially passing. Pick 3 URLs with displayed Hatena badges and 1-3 URLs with displayed HN badges when available, modify the displayed value by `+1`, and confirm the corresponding Hatena or HN comparison reports mismatches using the same comparison page.

### 7. Clean Up

Run this step at the normal end of the workflow and also on a best-effort basis after CAPTCHA, popup blocking, tool errors, or other interruptions.

1. Navigate back to google.com.
2. Run cleanup:

```js
;() => {
  localStorage.removeItem("gsplusE2E")
  localStorage.removeItem("gsplusE2EDataset")
  localStorage.removeItem("gsplusFn")
  localStorage.removeItem("gsplusDrv")
  window.name = ""
  return "cleaned"
}
```

3. Use `list_pages` to identify only pages opened by this workflow.
4. Use `close_page` to close the probe popup and test tab.

## Report Format

Report in Japanese unless the user asked otherwise:

- Scope: keyword count, SERP page count, unique URL count, badge count.
- Hatena result summary: matched, numeric mismatches, missing badges where Hatena API is positive, excess badges.
- HN result summary: expected HN badges, rendered HN badges, point mismatches, missing HN badges where Algolia `maxPoints > 0`, excess HN badges where `maxPoints <= 0`, top story href/title mismatches.
- HN recheck result: if the first HN comparison found missing badges, report the rerun pages and only treat badges still missing after re-extraction as failures.
- HN-positive probe result: include at least one observed `HN <points> pts` badge or explicitly report why the probe could not be observed.
- Negative control result for both Hatena and HN when HN badges are present.
- CAPTCHA or popup-blocker interruptions, if any.
- Limitation: this compares URLs as they appear in SERPs. It does not detect cases where the same content is registered in Hatena under a different URL representation, such as YouTube `/channel/UC...` vs `/@handle`; that is expected behavior.
- HN limitation: this verifies the extension's current Algolia-based `maxPoints` behavior. It does not query the official Firebase item API for fresher story scores.

## Known Pitfalls

- Exclude anchors inside `.gsplus-signal-container`; otherwise the extension's own Hatena badge link (`b.hatena.ne.jp`) is extracted as the result URL.
- `evaluate_script` file paths may be restricted to the workspace. Prefer inline scripts unless a loaded chrome-devtools tool explicitly supports external script files in the current environment.
- Fetching `bookmark.hatenaapis.com` directly from a Google page fails due to CORS. The same-origin Hatena API navigation in step 4 is required.
- Do not use Hatena `data-gsplus-hatebu="pending"` alone as proof that HN rendering has settled. HN requests are independent and can finish after Hatena, so the driver waits for HN badge count stability and Step 5 rechecks HN-missing SERPs.
- Do not rely on `window.name` for HN comparison. Some Chrome profiles lose it across the HN Algolia navigation; use Google `localStorage("gsplusE2EDataset")` and browser fetches to Algolia instead.
- HN API comparison intentionally fetches from `hn.algolia.com/api/v1/search` and calculates `maxPoints` from filtered `hits[].points`; do not compare against Algolia `nbHits` for the HN badge.
- A SERP can legitimately have zero HN badges even when `apiNbHits` is large, if none of the returned hits have `hit.url` matching the exact SERP URL under the extension's URL matching rules. Report this as expected behavior, not a failure.
- Google mixes `/url?q=...` redirect links and direct links. The `resolve` function handles both.
