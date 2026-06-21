# Privacy Policy

Effective date: 2026-06-18

This privacy policy applies to the Chrome extension "GSearch With Social Signals".

Public project URL: https://github.com/umiyosh/GSPlusHatebu

## Purpose

The extension adds public social signals to supported Google Search result pages. It shows Hatena Bookmark counts and Hacker News points next to search result links so that users can judge how much public attention a page has received.

The extension does not change Google Search ranking or replace search results.

## Data Processed

The extension processes the following data on supported Google Search result pages:

- Link URLs shown in Google Search results.
- The Google Search result page DOM structure needed to find result links and place badges.
- The URL associated with a Hatena badge when the user hovers or focuses that badge to open the comment preview.

The set of search result URLs can reveal or suggest the user's search intent. For that reason, this policy treats those URLs as privacy-sensitive browsing activity data even though the extension does not directly send the Google search query string.

## Data Sent to External Services

The extension sends search result URLs to the following third-party services only to provide its user-facing features:

- Hatena Bookmark API (`https://bookmark.hatenaapis.com/*`): retrieves Hatena Bookmark counts for search result URLs.
- Hatena Bookmark entry API (`https://b.hatena.ne.jp/*`): retrieves public bookmarked comments for the URL whose Hatena badge the user hovers or focuses.
- Hacker News Search / Algolia (`https://hn.algolia.com/*`): retrieves public Hacker News story matches, points, and comment counts for search result URLs.

The extension opens Hatena Bookmark entry pages and Hacker News story/search pages only when the user clicks the corresponding badge.

## Data Not Stored by the Developer

The developer does not operate a server for this extension and does not store extension data on a developer-controlled server.

The extension does not intentionally collect or store:

- Google search query strings.
- Page body text outside the link URLs needed for the feature.
- Google account information.
- Cookies.
- Form input contents.
- Authentication information.
- Payment or financial information.
- Location data.

The extension does not use analytics, advertising tracking, profiling, credit-worthiness evaluation, or error tracking services.

## Data Retention

The developer does not retain user data on a developer-controlled server.

The extension uses in-memory caches in the browser to avoid repeated API requests for the same URLs during the current browser session or extension service worker lifetime. These caches are not written to `chrome.storage` or other persistent extension storage by this extension.

Third-party services listed above may process requests according to their own policies.

## Chrome Web Store Limited Use

The extension uses browsing activity and website content data only to provide or improve its single purpose: showing public Hatena Bookmark and Hacker News signals on supported Google Search result pages.

The extension transfers data to third parties only as necessary to provide that single purpose. The extension does not sell user data and does not use user data for advertising, profiling, credit-worthiness evaluation, or unrelated purposes.

## User Controls

Users can:

- Disable the extension from Chrome's extension management page.
- Remove the extension from Chrome.
- Review the extension permissions from Chrome's extension management page.

## Contact

For questions or requests, use the GitHub repository:

https://github.com/umiyosh/GSPlusHatebu

## Changes

This policy may be updated when the extension's behavior or Chrome Web Store requirements change. Updates will be published in the GitHub repository.
