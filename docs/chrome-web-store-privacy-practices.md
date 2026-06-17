# Chrome Web Store Privacy Practices Draft

Public URL for now: https://github.com/umiyosh/GSPlusHatebu

Privacy policy URL after merge: https://github.com/umiyosh/GSPlusHatebu/blob/master/PRIVACY.md

## Single Purpose

Show public Hatena Bookmark counts and Hacker News points next to supported Google Search result links.

## Data Disclosure

Disclose that the extension handles browsing activity / website content data, limited to:

- Link URLs shown in supported Google Search result pages.
- Search result page DOM structure needed to identify result links and place badges.
- The URL associated with a Hatena badge when the user hovers or focuses that badge.

Reason: the set of search result URLs can reveal or suggest the user's search intent.

## Data Use

Use the data only for app functionality:

- Send search result URLs to Hatena Bookmark APIs to retrieve bookmark counts and public comment previews.
- Send search result URLs to Hacker News Search / Algolia to retrieve matching public story scores.
- Cache responses in memory during the browser session or service worker lifetime to avoid repeated requests.

## Data Sharing

Share data only with:

- Hatena Bookmark API: `https://bookmark.hatenaapis.com/*`
- Hatena Bookmark entry API: `https://b.hatena.ne.jp/*`
- Hacker News Search / Algolia: `https://hn.algolia.com/*`

Do not disclose sharing with developer servers, analytics providers, advertising providers, or error tracking providers because the extension does not use them.

## Data Not Collected

The extension does not intentionally collect:

- Personal identification information.
- Health information.
- Financial or payment information.
- Authentication information.
- Personal communications.
- Location.
- Cookies.
- Form inputs.
- Full page contents outside the link URLs required for the feature.

## Limited Use Statement

The extension's use of browsing activity and website content data complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. The data is used only to provide or improve the extension's single purpose, is not sold, and is not used for advertising.

## Consistency Checklist

- Privacy practices and `PRIVACY.md` both explain that search result URLs can suggest search intent.
- Privacy practices and `PRIVACY.md` both list Hatena Bookmark API, Hatena Bookmark entry API, and Hacker News Search / Algolia.
- Privacy practices and `PRIVACY.md` both state that the developer does not operate a server or retain user data.
- Privacy practices and `PRIVACY.md` both state that browser caches are in-memory only and not persisted with `chrome.storage`.
