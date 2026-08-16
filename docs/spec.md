# Design Doc: 検索結果に公開ソーシャルシグナルを表示するChrome拡張

## 1. 概要

本ドキュメントは、「Google と DuckDuckGo のWeb検索結果ページに、各結果URLの Hatena Bookmark 件数（`X users`）、Hacker News 最大スコア（`HN X pts`）、Bluesky URL mention count（`🦋 X`）を表示する」Chrome拡張の現行仕様である。
公開前の source of truth として、技術スタック、アーキテクチャ、権限、データフロー、公開時の注意点を記録する。

---

## 2. ゴールと非ゴール

### 2.1 ゴール

- Google と DuckDuckGo のWeb検索結果ページ上で、各検索結果に対応するURLの Hatena Bookmark 件数を表示する。
- Hacker News Search API / Algolia から、各検索結果URLに対応するstory群の最大 positive points を表示する。
- Bluesky public AppView API から、各検索結果URLを含む投稿の `hitsTotal` を表示する。
- Hatena 件数は `X users`、HN は `HN X pts`、Bluesky は一般的なUnicode蝶絵文字と件数を `🦋 X` として表示する。
- 0件または positive score がないURLについては、UI上に何も追加しない（＝0は非表示）。
- Hatena Bookmarkの**公開APIのみ**を使用し、認証（OAuth等）は不要とする。
- Hacker News は公開 Search API のみを使用し、認証は不要とする。
- Bluesky は公開 AppView API のみを使用し、認証、アカウント、API tokenは不要とする。
- Manifest V3 + TypeScript + Node.js + npm を前提とした、再利用性の高い構成とする。

### 2.2 非ゴール

- Bing など、Google / DuckDuckGo 以外の検索エンジンへの対応。
- DuckDuckGo の画像・動画・ニュースなどWeb以外の検索タブへの対応。
- bot detection、CAPTCHA、rate limit を回避する仕組み。
- はてなブックマークへの新規投稿、編集、ホットエントリ閲覧などのユーザーアクション機能。
- 派手なカスタムUI（ポップアップ、詳細オーバーレイ、グラフ表示など）。
- Hacker News のスレッド一覧オーバーレイや要約ポップアップ。
- Reddit など追加サービスへの対応。
- Manifest V2 対応。

---

## 3. ユースケース

- ユーザーが Chrome で Google または DuckDuckGo のWeb検索を行う。
- 検索結果一覧が表示されると、各結果のタイトル付近に `123 users`、`HN 456 pts`、`🦋 12` のようなバッジが表示される。
- ユーザーは、Hatena Bookmark 件数、HN score、BlueskyでのURL mention countを補助シグナルとして参照できる。

---

## 4. 要求仕様

### 4.1 機能要件

1. **対象ページ**
   - URL が明示列挙した Google 検索ドメイン（例: `https://www.google.com/search*`, `https://www.google.co.jp/search*`）または `https://duckduckgo.com/*` に一致する場合だけ、拡張機能を有効化する。
   - DuckDuckGo では通常Web検索結果のDOMだけを処理し、Web以外の検索タブは処理しない。
   - Chrome 拡張の match pattern は TLD ワイルドカードをサポートしないため、`https://www.google.*` のような指定は使わない。

2. **検索結果の検出**
   - 検索結果ページ内から「外部サイトへの結果リンク」を列挙する。
   - 検索サービスの内部導線、広告枠、関連検索などは除外する。

3. **Hatena Bookmark 件数の取得**
   - 列挙したURLに対して、はてなブックマークの件数を一括で取得する。
   - Hatena Bookmarkの公開API（`bookmark.hatenaapis.com`）のカウントAPIを使用する。

4. **Hacker News score の取得**
   - 列挙したURLに対して、Hacker News Search API（Algolia）を URL ごとに検索する。
   - `hits[].points` の最大 positive value を `maxPoints` として扱う。
   - Algolia 側の検索属性制限や points filter には依存せず、URL一致と positive points 判定はローカルで行う。

5. **Bluesky URL mention count の取得**
   - 列挙したURLに対して、Bluesky public AppViewの `app.bsky.feed.searchPosts` を URL ごとに検索する。
   - optionalな `hitsTotal` が整数として得られた場合だけ正式な件数として扱い、`posts.length` は総数に使わない。
   - `hitsTotal` はlikes、reposts、repliesの合計ではなく、丸め・切り捨てられる可能性のあるURL mention countとする。

6. **UI表示**
   - 各検索結果のタイトル等の近くに `X users`、`HN X pts`、`🦋 X` を表示する。
   - 件数またはscoreが0の場合は、UI表示を行わない。
   - UIは最小限の装飾（小さめの灰色テキスト、適度なマージン）に留める。

7. **動的変化への追従**
   - Google / DuckDuckGo の継続スクロールによる追加結果表示にも、MutationObserver による再スキャンで対応する。

### 4.2 非機能要件

- **パフォーマンス**
  - 検索結果1ページあたりのAPI呼び出しは最小限にする（複数URL用APIを活用）。
  - ページ描画の体感速度に大きな影響を与えないこと。

- **安定性**
  - いずれかの外部APIがエラーや取得不能になっても、他のバッジと検索結果表示自体に影響を与えないこと。

- **可読性・保守性**
  - TypeScript で型安全に実装する。
  - 検索サービス側DOM構造に依存する処理は、変更に対応しやすいよう一箇所に集約する。

- **セキュリティ**
  - Manifest V3 のポリシーに従い、最小限の権限のみ要求する。
  - コンテンツスクリプトからのクロスオリジン通信は行わず、バックグラウンドサービスワーカー側で行う。

---

## 5. 技術スタック・前提

- **ブラウザ**: Google Chrome (Manifest V3 対応バージョン)
- **拡張仕様**: Manifest V3
- **言語**: TypeScript
- **ビルド環境**: Node.js + npm + bundler（webpack / Vite / Rollup等。どれを選ぶかは実装フェーズで決定可）
- **型定義**: Chrome拡張API用型（`@types/chrome` など）

---

## 6. 高レベルアーキテクチャ

### 6.1 コンポーネント構成

1. **Manifest**
   - 権限・コンテンツスクリプト・バックグラウンドサービスワーカーを定義。

2. **Background Service Worker**
   - 役割: Hatena API / Hacker News Search API / Bluesky public AppView API への通信、入力再検証、Content Script とのメッセージ仲介。

3. **Content Script (対応検索サービス用)**
   - 役割: Google / DuckDuckGo 検索結果ページのDOMからURLを抽出し、Backgroundに問い合わせ、結果をUIとして描画する。外部APIは直接 fetch しない。

4. **共通モジュール（任意）**
   - メッセージ型定義、URL正規化、各外部APIクライアント等を共通化。

### 6.2 データフロー (概要)

1. Content Script がページロード後に起動。
2. Content Script が検索結果DOMを解析し、URLリストを作成。
3. Content Script が Background に `COUNT_REQUEST`、`HN_REQUEST`、`BLUESKY_REQUEST` を送信。
4. Background が Hatena API に対してバッチリクエストを送信する。
5. Content Script は HN 対象を40 URLごとに分割し、Background が HN Algolia API に対して URL ごとの検索リクエストを送信する。HN は最大4並列、1メッセージ40 URLまで。
6. Content Script は Bluesky 対象を40 URLごとに分割し、Background が AppView API に対して正規化・重複排除した URL ごとの検索リクエストを送信する。Bluesky は最大3並列、1メッセージ40 URLまで。
7. Background が response envelope を Content Script に返信する。
8. Content Script が各検索結果要素に各サービスのpositiveなバッジを挿入する。

---

## 7. Manifest 設計（抽象）

`public/manifest.json` は以下を満たす。

- `manifest_version: 3`
- 必須フィールド: `name`, `version`, `description`
- `default_locale: en`
- `name`, `description`, `action.default_title` は `_locales/en` / `_locales/ja` の `messages.json` でローカライズする。
- **背景スクリプト**
  - `"background": { "service_worker": "<ビルド済みbackgroundスクリプト>", "type": "module" }`

- **コンテンツスクリプト**
  - 検索結果ページにマッチする `matches` 配列（例: `https://www.google.com/search*`, `https://www.google.co.jp/search*`）を、対応する Google ドメインごとに明示列挙する。
  - DuckDuckGo は検索クエリをルートパスのquery parameterで受け取るため、`https://duckduckgo.com/*` を明示する。DOM解析では通常Web検索のオーガニック結果だけを対象にする。
  - `https://www.google.*` は Chrome の match pattern として無効なため使わない。
  - `https://*/*` など広い `matches` と `include_globs` で疑似的に絞る案は、content script の権限警告と審査説明が広くなるため採用しない。
  - `matches` の path を `/search*` にして、検索結果ページへ限定する。
  - `run_at` は `document_idle`

- **権限**
  - `"host_permissions"` は外部API fetch に必要なホストだけを宣言する。
    - `https://bookmark.hatenaapis.com/*`: Hatena Bookmark件数取得。
    - `https://b.hatena.ne.jp/*`: Hatena entry / コメント情報取得とエントリーページリンク。
    - `https://hn.algolia.com/*`: Hacker News Search API によるURL言及・score取得。
    - `https://api.bsky.app/*`: Bluesky public AppView API によるURL mention count取得。
  - `https://news.ycombinator.com/*` は fetch しないため宣言しない。HN story はユーザークリック時の通常遷移先として扱う。
  - `"permissions"` はフィルター設定の永続化に必要な `storage` のみを宣言し、不要な `tabs` / `activeTab` / `scripting` は追加しない。
  - `"action.default_popup"` で同梱の `popup.html` を指定し、ツールバーアイコンからフィルター設定を切り替えられるようにする。
  - `"options_ui"` で同梱の `options.html` を指定し、設定画面をタブで開く。

- **アイコン**
  - extension icon と action icon は 16 / 32 / 48 / 128px を指定する。
  - Hatena / HN badge icon は拡張パッケージに同梱し、`chrome.runtime.getURL()` で参照する。
  - Bluesky badge はプラットフォームのUnicode `🦋` を使い、Bluesky公式ロゴ画像は同梱しない。

---

## 8. Background Service Worker 設計

### 8.1 責務

- Content Script からの「件数取得リクエスト」「Hatena entry リクエスト」「HN summary リクエスト」「Bluesky summary リクエスト」を受け付ける。
- Content Script 由来の入力を再検証し、http(s) URL のみに絞る。
- Hatena API のカウントエンドポイント、Hatena entry API、Hacker News Search API、Bluesky public AppView API を呼び出す。
- 結果を Content Script に返信する。
- クロスオリジン通信を一元管理する。

### 8.2 メッセージインタフェース

Background と Content Script 間のメッセージ型は `src/shared/messages.ts` に集約する。

- `MESSAGE_TYPES.COUNT_REQUEST`: `{ type, urls: string[] }`
- `MESSAGE_TYPES.ENTRY_REQUEST`: `{ type, url: string }`
- `MESSAGE_TYPES.HN_REQUEST`: `{ type, urls: string[] }`
- `MESSAGE_TYPES.BLUESKY_REQUEST`: `{ type, urls: string[] }`
- Response envelope: `{ ok: true, data } | { ok: false, error }`

Background は `isExtensionRequest` を通過しないメッセージを無視する。Content は `isExtensionResponse` と data guard で response envelope を検証する。

### 8.3 API呼び出し方針

#### エンドポイント

- 単一URL版: `GET https://bookmark.hatenaapis.com/count/entry?url=<encodedURL>`
- 複数URL版: `GET https://bookmark.hatenaapis.com/count/entries?url=<url1>&url=<url2>&...`

#### 呼び出し戦略

- 原則として **複数URL版** を利用し、API呼び出し回数を削減する。
- URL数が多すぎる場合は、一定件数（例: 50件）ごとに分割して複数回呼び出す戦略をとる。
- APIが返すレスポンス形式を確認した上で、`url → count` のマップを生成する。
- `fetch` を用いてリクエストを送信し、`res.ok` を確認後にレスポンスをパースする。
- Hacker News Search API は URL ごとに検索するため、同時実行数を最大4本に制限する。
- 1回のSERPスキャンで処理する検索結果は上位40件までとし、過剰な外部API呼び出しを避ける。
- HN request は1メッセージ40 URLまで、background cache は200件までとする。
- HN fetch は5秒で timeout する。
- Bluesky request は1メッセージ40 URLまで、最大3並列、background cacheは200件、fetch timeoutは5秒とする。
- Bluesky 429ではreset headerに従ってcircuit breakerを開き、header不在時は60秒停止する。backgroundは残りcooldownをcontentへ返し、contentが解除後に対象URLをまとめて再取得する。400/403/429は即時再試行せず、5xx・timeout・一時的fetch errorだけ最大3回とする。
- Hatena count request は最大500 URLまで受け付けるが、API呼び出し時は50件ごとに分割する。

#### エラーハンドリング

- ネットワークエラー、ステータスコード異常、パースエラー等の場合:
  - 対象URLの count / summary を `null` として扱う。
  - UI表示を控え、検索結果そのものを壊さない。

- Background 内ではエラー内容を console にログ出力しておく（開発時デバッグ用途）。
- URLごとの失敗を逐一 `console.error` に出さず、バッチ単位で必要最低限の件数情報に集約する。

### 8.4 非同期メッセージ処理の注意点

- `chrome.runtime.onMessage.addListener` 内で非同期処理 (`fetch` 等) を行うため、リスナー関数は `true` を返し、`sendResponse` を非同期に呼び出すパターンにすること。
- Service Worker のライフサイクルに注意し、メッセージ応答完了前にWorkerが終了しないようにする（`sendResponse`まで確実に実行）。

---

## 9. Content Script 設計

### 9.1 責務

- Google / DuckDuckGo 検索結果ページ上のDOMから、各検索結果の**外部リンクURL**と**対応するDOM要素**を抽出する。
- 抽出したURL一覧をBackgroundに送信し、結果を受け取る。
- 受け取った件数を元に、適切な位置に `X users` のUIを挿入する。
- 動的に追加された検索結果（可能であれば）にも対応する。

### 9.2 DOM抽出戦略

検索サービスのDOM構造は変わりやすいため、以下の点に注意して実装する:

- 検索結果のコンテナは概ね `div#search` 配下に存在する。
- 一般的なオーガニック検索結果は:
  - タイトル部分に `h3` があり、その内側または近傍に `<a href="...">` のリンクがある。

- DuckDuckGo の通常Web検索結果は:
  - 結果全体が `li[data-layout="organic"]` であり、その直下に `article[data-testid="result"][data-nrn="result"]` がある。
  - 主リンクは `a[data-testid="result-title-a"]` である。
  - `li[data-layout="ad"]` / `article[data-testid="ad"]` は広告として除外する。

- セレクタの設計方針:
  - コンテナ (`#search`) を起点に `a[href]` をパターンマッチする。
  - `href` が `http://` または `https://` で始まり、Google 自身のドメイン以外のものだけを対象とする。
  - 広告枠やその他UI要素と混ざらないよう、クラス名や属性（例: `data-ved`）を利用してより絞り込む戦略も検討する。

- 抽出結果:
  - URL文字列
  - URLを表示している`<a>`要素（または、その親の結果ブロック要素）への参照

DOM抽出ロジックは `src/content/searchResults.ts` に集約し、検索サービス側の構造変更時にその部分だけ差し替えれば済む構造にする。

### 9.3 UI挿入戦略

- 各結果ごとに、既存DOMに social signal container を追加し、positiveな `X users`、`HN X pts`、`🦋 X` を入れる。
- 挿入位置の候補:
  - タイトルリンク (`<a>`) の直後
  - タイトルを囲むコンテナの末尾
  - スニペット（説明文）やURL表示の近く

- UI要素:
  - HTMLタグ: `<a>`。クリックで Hatena entry page、HN item/search、または Bluesky search に遷移する。
  - クラス名: `gsplus-hatebu-count` / `gsplus-hn-count` / `gsplus-bluesky-count` など `gsplus-` prefix の固有クラス名を付与する。
  - Hatena / HN のアイコンは同梱アセットを `chrome.runtime.getURL()` で参照し、Bluesky はUnicode `🦋` をテキストとして表示する。

- スタイル:
  - フォントサイズは周辺文字よりやや小さめ（例: 90%）
  - マージン左側に少し余白を入れる（例: 4〜8px）
  - 色は薄めのグレー（例: `#777`）

- 0件の扱い:
  - Countが `0` または `null` の場合、UI挿入は行わない。

- 既に挿入済みかどうかの判定:
  - 同じ結果に二重挿入しないため、結果要素に `data-gsplus-hatebu` を付けてフラグ管理する。

### 9.4 メッセージ送受信

- DOM抽出後、URL一覧をBackgroundに送信する。
- Backgroundから戻った `url → count` / `url → HnSummary` / `url → BlueskySummary` マップを利用して、対応するDOM要素へUI挿入する。
- URL文字列の扱いに注意:
  - Googleが結果リンクにリダイレクトURL（問合せパラメータ付きのGoogle内部URL）を使っている場合、実際のターゲットURLを抽出・正規化することが望ましい。
  - 可能なら `href` をそのまま使うのではなく、`a.href`が返す絶対URLを使い、余計なトラッキングパラメータは除去する設計も検討する（必須ではないが、ハッシュキーの安定性向上に寄与）。

### 9.5 動的な結果追加（オプション）

- Infinite Scroll やページ内再検索への対応として、MutationObserver を document body に設定する。
- ノード追加イベントで、新規に現れた結果要素に対してのみ抽出・問い合わせ・UI挿入を行う。
- 既に処理した要素に対しては、`data-gsplus-hatebu` 等でスキップする。

### 9.6 ソーシャルシグナルフィルター

- Toolbar popup または Options page の `Show only results with social signals` で ON / OFF を切り替える。初期値は OFF とする。
- 設定は `chrome.storage.sync` に boolean として保存し、content script は `chrome.storage.onChanged` で変更を反映する。
- ON の場合、Hatena count、HN summary、Bluesky summaryの3つがsettledとなり、すべてに正のシグナルがない検索結果だけに拡張固有の非表示 class を付ける。
- いずれかがpositive、または初回取得中（pending）の場合は表示を維持する。unknownで非表示になった結果は自動再取得中も非表示を維持し、positiveに回復した時点で再表示する。
- API エラー・runtime error・不正 response により判定不能（unknown）となり、他providerにもpositiveがなければ非表示にする。filterがONの間はURL・provider単位のbounded backoffで自動再取得する。pagination / infinite scrollで新しいURLが追加されても、過去URLの再試行上限はリセットしない。Bluesky 429はbackgroundが返すcooldownの解除後に再取得する。
- OFF に戻した場合は拡張固有の非表示 class を外し、検索サービス側の表示状態は変更しない。
- URL ごとの取得結果を page-local cache へ保持し、MutationObserver で追加された同一 URL の結果にも同じ判定を適用する。

---

## 10. Hatena API との連携仕様

Hatena API 連携は以下の方針に従う。

- **エンドポイント**
  - 単一: `/count/entry?url=...`
  - 複数: `/count/entries?url=...&url=...`

- **HTTPメソッド**
  - GET

- **プロトコル**
  - HTTPS を使用

- **パラメータ**
  - URLは必ず `encodeURIComponent` 相当でエンコードする。

- **レスポンス**
  - 形式は公式ドキュメントに従う。
  - 受け取ったデータを `url → count` 形式のマップに変換すること。

- **制限事項**
  - 一度に送信できるURL件数やURL長に上限がある場合を想定し、大きい場合は複数回に分割する。
  - APIの利用規約・レート制限を尊重する。

---

## 11. セキュリティ・権限

- 必要最低限の `host_permissions` のみを宣言する（`bookmark.hatenaapis.com`, `b.hatena.ne.jp`, `hn.algolia.com`, `api.bsky.app`）。
- `news.ycombinator.com` はユーザークリック時の遷移先だけに使い、host permission は要求しない。
- 外部favicon取得をやめる場合は、公式faviconの同梱可否を確認したうえで拡張内アセット化し、`chrome.runtime.getURL()` と必要最小限の `web_accessible_resources` で参照する。
- コンテンツスクリプトからは外部ドメインへ直接通信せず、必ず Background を通す。
- ユーザーの個人情報や機密情報を収集しない。
- 永続化する拡張設定はソーシャルシグナルフィルターの boolean のみに限定する。
- ログ出力は開発時のみ詳細設定し、本番ビルドでは必要最低限に抑える。

---

## 12. i18n とアクセシビリティ

- 表示テキストは `X users` の形で英語固定でもよいが、必要に応じてロケールごとに変更しやすい構造にしておく（i18n対応は必須ではない）。
- スクリーンリーダー対応として、`aria-label` を付与することも検討可（例: 「Hatena Bookmark: X users」）。
- Hatena badge は `Hatena Bookmark: X users`、HN badge は `Hacker News: X points`、Bluesky badge は `Bluesky: X posts mentioning this URL` の `aria-label` を付与する。
- UI要素は検索結果本文と視認性のバランスを保つよう、過度に目立たせない。
- hover overlay はライトモードとダークモードの両方で本文とコメントが読める配色にする。
- `title` tooltip は詳細なAPIレスポンスを並べず、リンク先の意味が分かる最小限の内容にする。

---

## 13. テスト戦略

以下の観点で動作確認を行う。

1. **基本シナリオ**
   - 通常の Google / DuckDuckGo Web検索（PC版）でページを開き、正のシグナルがある各検索結果に対応する3サービスのバッジが表示されること。
   - ブックマーク数が多いURLで、実際のHatenaページと件数が整合していること。

2. **0件のシナリオ**
   - ブックマーク数0のURLがUI表示されないことを確認。

3. **エラーシナリオ**
   - ネットワークを切る、API URLをわざと間違えるなどして、UIが壊れずに検索結果だけは正常に見えること。

4. **DOM変更耐性**
   - Google の異なるレイアウトと DuckDuckGo の通常Web検索で動作確認し、広告・内部導線を処理せずセレクタが安定しているか検証する。

5. **パフォーマンス**
   - 大量の検索結果（継続スクロールで増やした場合）でもブラウザが重くならないこと。

6. **フィルター**
   - 初期値 OFF、各サービスのみpositive、3サービスすべてnone、各サービスの取得失敗を検証する。
   - ON / OFF の即時反映、保存後の再読み込み、MutationObserver で追加された結果への適用を検証する。

---

## 14. Public Release Notes

- Chrome Web Store 公開名: `GSearch With Social Signals`
- Public project URL: `https://github.com/umiyosh/gsearch-social-signals`
- Privacy policy: `PRIVACY.md`
- Store Listing draft: `README.md`
- Privacy practices draft: `docs/chrome-web-store-privacy-practices.md`
- Store asset checklist: `docs/chrome-web-store-assets.md`
- Release and rollback policy: `docs/release-management.md`
- Remote hosted code audit: `docs/remote-hosted-code-audit.md`
- Store package command: `make package`

## 15. 将来拡張・オプション

- **フィルター条件の高度化**
  - Hatena / HN ごとの最小値や対象シグナルを選べる詳細設定。

- **UIの高度化**
  - 件数に応じた色分け（ある閾値以上は強調する等）。

- **他サイト対応**
  - 同じ仕組みで、はてなブックマーク件数をGitHub等他サイトにも表示する。

---

以上が公開前時点の現行仕様である。公開向けの挙動、権限、外部API、プライバシー説明を変更した場合は、本ドキュメント、README、PRIVACY、Store Listing draft を同時に更新する。

# 参考文章

※このリストは「今回のDesign Docと実装で実際に参照する可能性が高いもの」に絞っています。

---

## Chrome拡張（Manifest V3 / ネットワーク / メッセージング）

1. **Extensions / Manifest V3 - Chrome for Developers**
   [https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)

2. **Migrate to Manifest V3 - Chrome for Developers**
   [https://developer.chrome.com/docs/extensions/develop/migrate](https://developer.chrome.com/docs/extensions/develop/migrate)

3. **Cross-origin network requests - Chrome for Developers**
   [https://developer.chrome.com/docs/extensions/develop/concepts/network-requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)

4. **Changes to Cross-Origin Requests in Chrome Extension Content Scripts**
   [https://www.chromium.org/Home/chromium-security/extension-content-script-fetches/](https://www.chromium.org/Home/chromium-security/extension-content-script-fetches/)

5. **Chrome Extensions For Beginners（Manifest V3 / Service workers / Content scripts / Message passing 概要）**
   [https://jl978.medium.com/chrome-extensions-for-beginners-46019a826cd6](https://jl978.medium.com/chrome-extensions-for-beginners-46019a826cd6)

6. **Chrome拡張機能 manifest.json Ver.3の書き方（Qiita）**
   [https://qiita.com/shiro1212/items/12f0a767494a7b2ab0b3](https://qiita.com/shiro1212/items/12f0a767494a7b2ab0b3)

7. **自分の作ったChrome拡張をManifest Version 3に対応させる（Zenn）**
   [https://zenn.dev/satoshie/articles/aa62f01faddd84](https://zenn.dev/satoshie/articles/aa62f01faddd84)

8. **大遅刻 Manifest V3 移行メモ（Manifest V3移行チェックリスト紹介付き）**
   [https://takusan.negitoro.dev/posts/chrome_extension_migrate_manifest_v3/](https://takusan.negitoro.dev/posts/chrome_extension_migrate_manifest_v3/)

9. **Chrome 拡張機能の content_scripts で CORS を回避する方法（Zenn）**
   [https://zenn.dev/noraworld/articles/chrome-extensions-cors](https://zenn.dev/noraworld/articles/chrome-extensions-cors)

10. **Stack Overflow: How to make a cross-origin request in a content script (currently blocked by CORS)**
    [https://stackoverflow.com/questions/55214828/how-to-make-a-cross-origin-request-in-a-content-script-currently-blocked-by-cor](https://stackoverflow.com/questions/55214828/how-to-make-a-cross-origin-request-in-a-content-script-currently-blocked-by-cor)

---

## はてなブックマーク API 関連

11. **はてなブックマーク件数取得API - Hatena Developer Center**
    [https://developer.hatena.ne.jp/ja/documents/bookmark/apis/getcount/](https://developer.hatena.ne.jp/ja/documents/bookmark/apis/getcount/)

12. **ブックマーク API | Hatena Developer Center（REST API 全般・旧エンドポイント廃止案内）**
    [https://developer.hatena.ne.jp/ja/documents/bookmark/apis/rest/bookmark/](https://developer.hatena.ne.jp/ja/documents/bookmark/apis/rest/bookmark/)

13. **特定のサイトに対する合計ブックマーク数を取得する API を実験的に公開します（はてなブックマーク開発ブログ）**
    [https://bookmark.hatenastaff.com/entry/2018/06/14/181615](https://bookmark.hatenastaff.com/entry/2018/06/14/181615)

14. **ページ毎のはてなブックマーク数を週次で取得する（Google Apps Scriptから件数取得APIを叩く例）**
    [https://www.meganii.com/blog/2020/07/20/getting-the-number-of-hatena-bookmarks-per-page-with-google-apps-script-weekly/](https://www.meganii.com/blog/2020/07/20/getting-the-number-of-hatena-bookmarks-per-page-with-google-apps-script-weekly/)

15. **【はてなブックマーク】特定ページの登録数を取得する API の使い方（Techblog Tips）**
    [https://www.folklore.place/tips/hatena-bookmark/api/count](https://www.folklore.place/tips/hatena-bookmark/api/count)

16. **Hugoで作成したブログの各記事内にブクマ件数を表示する（Lamnda + S3 で件数取得）**
    [https://michimani.net/post/development-show-hatebu-count-in-hugo-posts/](https://michimani.net/post/development-show-hatebu-count-in-hugo-posts/)

---

## 旧はてなブックマークChrome拡張・関連OSS

17. **はてなブックマーク Google Chrome 拡張（公式GitHubリポジトリ）**
    [https://github.com/hatena/hatena-bookmark-googlechrome-extension](https://github.com/hatena/hatena-bookmark-googlechrome-extension)

18. **Hatena Co., Ltd. GitHub（hatena-bookmark-googlechrome-extension含む）**
    [https://github.com/hatena](https://github.com/hatena)

19. **hatebu-mydata-parser（旧はてブ拡張 search.data のパーサライブラリ）**
    [https://github.com/azu/hatebu-mydata-parser](https://github.com/azu/hatebu-mydata-parser)

20. **はてなブックマーク Google Chrome 拡張のベータテストを開始します（はてなブックマーク開発ブログ）**
    [https://bookmark.hatenastaff.com/entry/2009/12/09/000000](https://bookmark.hatenastaff.com/entry/2009/12/09/000000)

21. **はてな、はてなブックマークGoogle Chrome拡張を正式リリース（プレスリリース）**
    [https://hatena.co.jp/press/release/entry/2010/01/26/093821](https://hatena.co.jp/press/release/entry/2010/01/26/093821)

22. **はてなブックマークChrome拡張の表示を修正するGreasemonkey（Google検索結果レイアウト調整例）**
    [https://gist.github.com/yonchu/2688337](https://gist.github.com/yonchu/2688337)

---
