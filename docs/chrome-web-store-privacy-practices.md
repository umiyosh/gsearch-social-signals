# Chrome Web Store Privacy Practices Draft

Public URL for now: https://github.com/umiyosh/GSPlusHatebu

Privacy policy URL after merge: https://github.com/umiyosh/GSPlusHatebu/blob/master/PRIVACY.md

Official references:

- Privacy fields: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- Limited Use: https://developer.chrome.com/docs/webstore/program-policies/limited-use
- User Data FAQ: https://developer.chrome.com/docs/webstore/program-policies/user-data-faq

## Single Purpose

Use this in the Chrome Web Store Privacy practices "Single purpose" field:

> Google検索結果に表示されるリンクURLについて、公開されている Hatena Bookmark 件数と Hacker News score を検索結果上にバッジ表示すること。

English fallback:

> Display public Hatena Bookmark counts and Hacker News scores next to links on supported Google Search result pages.

This is intentionally narrow. The extension does not provide analytics, advertising, tracking, ranking changes, account sync, or general browsing history features.

## Permission Justification

Use these explanations for the permissions shown in the Chrome Web Store Developer Dashboard.

### `https://bookmark.hatenaapis.com/*`

Required to send Google Search result URLs to the Hatena Bookmark count API and display the public bookmark count as a `123 users` badge.

### `https://b.hatena.ne.jp/*`

Required to fetch public Hatena Bookmark entry/comment information for the URL whose Hatena badge the user hovers or focuses. It is also used as the destination when the user opens the Hatena entry page from a badge.

### `https://hn.algolia.com/*`

Required to send Google Search result URLs to the Hacker News Search / Algolia API and display the highest matching public Hacker News story score as an `HN 456 pts` badge.

### No extension API permissions

`permissions` is intentionally empty. The extension does not request `tabs`, `activeTab`, `scripting`, `storage`, or other Chrome extension API permissions.

### Supported Google Search pages

The content script is limited to supported Google Search result pages:

- `https://www.google.com/search*`
- `https://www.google.co.jp/search*`
- `https://www.google.co.uk/search*`
- `https://www.google.co.in/search*`
- `https://www.google.ca/search*`
- `https://www.google.com.au/search*`
- `https://www.google.com.hk/search*`
- `https://www.google.com.sg/search*`
- `https://www.google.com.tw/search*`

Do not use broad patterns such as `<all_urls>` or `https://www.google.*`.

## Remote Code

Select:

> No, I am not using remote code.

Explanation:

> The extension does not load or execute JavaScript, WebAssembly, or other executable code from remote URLs. It only sends HTTPS requests to public APIs to retrieve data displayed in the extension UI.

## Data Collection Disclosure

Disclose that the extension handles user data. Do not select "This item does not collect user data".

The extension handles the following data only for its single purpose:

- Google Search result link URLs.
- The Google Search result page DOM structure needed to identify organic result links and place badges.
- The URL associated with a Hatena badge when the user hovers or focuses that badge.

The set of search result URLs can reveal or suggest the user's search intent, so it should be disclosed honestly as privacy-sensitive browsing activity / website content data.

Recommended data type selections:

- Web browsing activity: yes, because the extension reads and sends the URLs of search results shown on supported Google Search pages.
- Website content: yes, because the extension reads the search result page DOM enough to identify result links and place badges.

Do not select these categories:

- Personally identifiable information.
- Health information.
- Financial and payment information.
- Authentication information.
- Personal communications.
- Location.
- User-generated content.

The extension does not intentionally collect Google account information, cookies, form inputs, full page contents outside the result-link data needed for the feature, or the raw Google search query string.

## Data Use

Use the data only for app functionality:

- Send search result URLs to Hatena Bookmark APIs to retrieve bookmark counts and public comment previews.
- Send search result URLs to Hacker News Search / Algolia to retrieve matching public story scores.
- Cache responses in memory during the browser session or service worker lifetime to avoid repeated requests.

Do not disclose analytics, advertising, personalization, profiling, credit-worthiness, resale, or unrelated research uses because the extension does not perform those activities.

## Data Sharing

Disclose third-party sharing because search result URLs are sent to external APIs to provide the feature.

Share data only with:

- Hatena Bookmark API: `https://bookmark.hatenaapis.com/*`
- Hatena Bookmark entry API: `https://b.hatena.ne.jp/*`
- Hacker News Search / Algolia: `https://hn.algolia.com/*`

Do not disclose sharing with developer servers, analytics providers, advertising providers, error tracking providers, data brokers, or information resellers because the extension does not use them.

Use this explanation:

> Search result URLs are sent to Hatena Bookmark APIs and Hacker News Search / Algolia only to retrieve the public social signals displayed by the extension. This transfer is necessary to provide the extension's single purpose. The developer does not operate a server for this extension and does not store the transmitted URLs.

## Developer Data Retention

Use this statement where the dashboard asks how data is handled:

> The developer does not store user data. The extension does not send data to a developer-operated server. In-memory caches may exist in the browser tab or extension service worker only to avoid repeated API requests and are not persisted with `chrome.storage`.

## Advertising, Sale, and Profiling

Use this statement in the data use certification:

> User data is not sold, transferred to advertising providers or data brokers, used for personalized advertising, used for profiling, or used to determine credit-worthiness. The data is used only to provide the user-facing badge display feature.

## Limited Use Statement

Use this statement in the Privacy practices certification and keep it consistent with `PRIVACY.md`:

> The extension's use of browsing activity and website content data complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. Data is used only to provide or improve the single purpose of showing public Hatena Bookmark and Hacker News signals on supported Google Search result pages. Data is transferred to third parties only when necessary to provide that feature. Data is not sold and is not used for advertising, profiling, or unrelated purposes.

## Consistency Checklist

- Privacy practices and `PRIVACY.md` both explain that search result URLs can suggest search intent.
- Privacy practices and `PRIVACY.md` both list Hatena Bookmark API, Hatena Bookmark entry API, and Hacker News Search / Algolia.
- Privacy practices and `PRIVACY.md` both state that third-party transfer is necessary to provide the user-facing feature.
- Privacy practices and `PRIVACY.md` both state that the developer does not operate a server or retain user data.
- Privacy practices and `PRIVACY.md` both state that browser caches are in-memory only and not persisted with `chrome.storage`.
- Privacy practices, README, and Store listing copy all describe the same single purpose: displaying public social signals on Google Search results.
