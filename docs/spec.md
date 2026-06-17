# Design Doc: Google検索結果にはてなブックマーク件数を表示するChrome拡張

## 1. 概要

本ドキュメントは、「Google検索結果ページに、各結果URLのはてなブックマーク件数（`X users`）を表示する」Chrome拡張の設計書である。
この設計書は **Coding Agent に対する実装指示書** を目的としており、技術スタック・アーキテクチャ・責務分割・注意点を中心に記述する。擬似コードや詳細実装（具体的なコード）は扱わない。

---

## 2. ゴールと非ゴール

### 2.1 ゴール

- GoogleのWeb検索結果ページ上で、各検索結果に対応するURLの「はてなブックマーク件数」を表示する。
- 件数は「`X users`」形式のテキスト（必要ならリンク）として表示する。
- 0件のURLについては、UI上に何も追加しない（＝0は非表示）。
- Hatena Bookmarkの**公開APIのみ**を使用し、認証（OAuth等）は不要とする。
- Manifest V3 + TypeScript + Node.js + npm を前提とした、再利用性の高い構成とする。

### 2.2 非ゴール

- Google以外の検索エンジン（Bing, DuckDuckGo など）への対応。
- はてなブックマークのホットエントリ情報、コメント数、コメント本文等の表示。
- はてなブックマークへの新規投稿や編集など、ユーザーアクション機能。
- 派手なカスタムUI（ポップアップ、詳細オーバーレイ、グラフ表示など）。
- Manifest V2 対応。

---

## 3. ユースケース

- ユーザーが Chrome で Google 検索を行う。
- 検索結果一覧が表示されると同時に、各結果のタイトル付近に「`123 users`」のようにブックマーク件数が表示される。
- ユーザーは、この件数をもとに SEO スパムっぽい結果をフィルタし、ブックマークされている（≒ある程度信頼できる）ページを優先的に閲覧する。

---

## 4. 要求仕様

### 4.1 機能要件

1. **対象ページ**
   - URL が `https://www.google.*/*`（`.co.jp`など含む）で、検索クエリを含む検索結果ページに対して拡張機能を有効化する。

2. **検索結果の検出**
   - 検索結果ページ内から「外部サイトへの結果リンク」を列挙する。
   - 内部リンク（Google自身のURL、広告枠など）は極力除外する。

3. **ブックマーク件数の取得**
   - 列挙したURLに対して、はてなブックマークの件数を一括で取得する。
   - Hatena Bookmarkの公開API（`bookmark.hatenaapis.com`）のカウントAPIを使用する。

4. **UI表示**
   - 各検索結果のタイトル等の近くに `X users` というテキストを表示する。
   - 件数が0の場合は、UI表示を行わない。
   - UIは最小限の装飾（小さめの灰色テキスト、適度なマージン）に留める。

5. **動的変化への追従（オプション）**
   - Googleの「もっと見る」「継続スクロール」による追加結果表示にも対応できるよう、MutationObserver による監視を設計上考慮する（必須ではないが、拡張性として設計に入れておく）。

### 4.2 非機能要件

- **パフォーマンス**
  - 検索結果1ページあたりのAPI呼び出しは最小限にする（複数URL用APIを活用）。
  - ページ描画の体感速度に大きな影響を与えないこと。

- **安定性**
  - Hatena APIエラー時は静かに失敗し、検索結果表示自体に影響を与えないこと。

- **可読性・保守性**
  - TypeScript で型安全に実装する。
  - Google側DOM構造に依存する処理は、変更に対応しやすいよう一箇所に集約する。

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
   - 役割: Hatena APIへの通信と、Content Script とのメッセージ仲介。

3. **Content Script (Google Search 用)**
   - 役割: Google検索結果ページのDOMからURLを抽出し、Backgroundに問い合わせ、結果をUIとして描画する。

4. **共通モジュール（任意）**
   - メッセージ型定義、URL正規化、Hatena APIクエリの構築ロジック等を共通化。

### 6.2 データフロー (概要)

1. Content Script がページロード後に起動。
2. Content Script が検索結果DOMを解析し、URLリストを作成。
3. Content Script が Background に「URLリスト → カウント取得」のメッセージを送信。
4. Background が Hatena API に対してバッチリクエストを送信。
5. Background がレスポンス（URL→件数マップ）を受け取り、Content Script に返信。
6. Content Script が各検索結果要素に対して `X users` の表示を挿入する。

---

## 7. Manifest 設計（抽象）

Coding Agent は以下のようなポイントを満たすように `manifest.json` を設計・定義すること。

- `manifest_version: 3`
- 必須フィールド: `name`, `version`, `description`
- **背景スクリプト**
  - `"background": { "service_worker": "<ビルド済みbackgroundスクリプト>", "type": "module" }`

- **コンテンツスクリプト**
  - 検索結果ページにマッチする `matches` 配列（例: `https://www.google.*/*`）
  - 検索クエリを含むURLに限定するための `include_globs` or `exclude_matches` 等。
  - `run_at` は `document_end` または `document_idle`

- **権限**
  - `"host_permissions"` は外部API fetch に必要なホストだけを宣言する。
    - `https://bookmark.hatenaapis.com/*`: Hatena Bookmark件数取得。
    - `https://b.hatena.ne.jp/*`: Hatena entry / コメント情報取得とエントリーページリンク。
    - `https://hn.algolia.com/*`: Hacker News Search API によるURL言及・score取得。
  - `https://news.ycombinator.com/*` は fetch しないため宣言しない。HN story はユーザークリック時の通常遷移先として扱う。
  - `"permissions"` は空配列を維持し、不要な `tabs` / `activeTab` / `scripting` / `storage` を追加しない。

- **アイコン、options_page 等**
  - 必須ではないが、必要に応じて設計。

---

## 8. Background Service Worker 設計

### 8.1 責務

- Content Script からの「件数取得リクエスト」を受け付ける。
- Hatena API のカウントエンドポイントを呼び出し、結果をマージする。
- 結果を Content Script に返信する。
- クロスオリジン通信を一元管理する。

### 8.2 メッセージインタフェース

Coding Agent は、Background と Content Script 間でやり取りするメッセージ型を定義すること。
最低限必要な構造:

- リクエストメッセージ例:
  - `type`（文字列。例えば `"GET_HATENA_COUNTS"`）
  - `urls`: string[] （コンテンツスクリプトで抽出したURLリスト）

- レスポンスメッセージ例:
  - `type`（例: `"GET_HATENA_COUNTS_RESULT"`)
  - `counts`: `{ [url: string]: number | null }`（null はエラー時・取得不可時）

### 8.3 Hatena API呼び出し方針

#### エンドポイント

- 単一URL版: `GET https://bookmark.hatenaapis.com/count/entry?url=<encodedURL>`
- 複数URL版: `GET https://bookmark.hatenaapis.com/count/entries?url=<url1>&url=<url2>&...`

#### 呼び出し戦略

- 原則として **複数URL版** を利用し、API呼び出し回数を削減する。
- URL数が多すぎる場合は、一定件数（例: 50件）ごとに分割して複数回呼び出す戦略をとる。
- APIが返すレスポンス形式を確認した上で、`url → count` のマップを生成する。
- `fetch` を用いてリクエストを送信し、`res.ok` を確認後にレスポンスをパースする。

#### エラーハンドリング

- ネットワークエラー、ステータスコード異常、パースエラー等の場合:
  - 対象URLの count を `null` として扱う。
  - コンテンツスクリプトにエラー情報を返すかどうかは任意だが、少なくともUI表示を控える設計とする。

- Background 内ではエラー内容を console にログ出力しておく（開発時デバッグ用途）。

### 8.4 非同期メッセージ処理の注意点

- `chrome.runtime.onMessage.addListener` 内で非同期処理 (`fetch` 等) を行うため、リスナー関数は `true` を返し、`sendResponse` を非同期に呼び出すパターンにすること。
- Service Worker のライフサイクルに注意し、メッセージ応答完了前にWorkerが終了しないようにする（`sendResponse`まで確実に実行）。

---

## 9. Content Script 設計

### 9.1 責務

- Google検索結果ページ上のDOMから、各検索結果の**外部リンクURL**と**対応するDOM要素**を抽出する。
- 抽出したURL一覧をBackgroundに送信し、結果を受け取る。
- 受け取った件数を元に、適切な位置に `X users` のUIを挿入する。
- 動的に追加された検索結果（可能であれば）にも対応する。

### 9.2 DOM抽出戦略

GoogleのDOM構造は変わりやすいため、以下の点に注意して実装する:

- 検索結果のコンテナは概ね `div#search` 配下に存在する。
- 一般的なオーガニック検索結果は:
  - タイトル部分に `h3` があり、その内側または近傍に `<a href="...">` のリンクがある。

- セレクタの設計方針:
  - コンテナ (`#search`) を起点に `a[href]` をパターンマッチする。
  - `href` が `http://` または `https://` で始まり、Google 自身のドメイン以外のものだけを対象とする。
  - 広告枠やその他UI要素と混ざらないよう、クラス名や属性（例: `data-ved`）を利用してより絞り込む戦略も検討する。

- 抽出結果:
  - URL文字列
  - URLを表示している`<a>`要素（または、その親の結果ブロック要素）への参照

Coding Agent は、DOM抽出ロジックを **一つの関数／モジュールに隔離** し、Google側の構造変更時にその部分だけ差し替えれば済むような設計にすること。

### 9.3 UI挿入戦略

- 各結果ごとに、既存DOMに `X users` を追加する。
- 挿入位置の候補:
  - タイトルリンク (`<a>`) の直後
  - タイトルを囲むコンテナの末尾
  - スニペット（説明文）やURL表示の近く

- UI要素:
  - HTMLタグ: `<span>` もしくは `<a>`（クリックでHatenaエントリページに飛ばす場合）
  - クラス名: 例として `hatebu-count` 等の固有クラス名を付与する。

- スタイル:
  - フォントサイズは周辺文字よりやや小さめ（例: 90%）
  - マージン左側に少し余白を入れる（例: 4〜8px）
  - 色は薄めのグレー（例: `#777`）

- 0件の扱い:
  - Countが `0` または `null` の場合、UI挿入は行わない。

- 既に挿入済みかどうかの判定:
  - 同じ結果に二重挿入しないため、結果要素に `data-hatebu-count-injected="true"` のような属性を付けてフラグ管理する。

### 9.4 メッセージ送受信

- DOM抽出後、URL一覧をBackgroundに送信する。
- Backgroundから戻った `url → count` マップを利用して、対応するDOM要素へUI挿入する。
- URL文字列の扱いに注意:
  - Googleが結果リンクにリダイレクトURL（問合せパラメータ付きのGoogle内部URL）を使っている場合、実際のターゲットURLを抽出・正規化することが望ましい。
  - 可能なら `href` をそのまま使うのではなく、`a.href`が返す絶対URLを使い、余計なトラッキングパラメータは除去する設計も検討する（必須ではないが、ハッシュキーの安定性向上に寄与）。

### 9.5 動的な結果追加（オプション）

- Infinite Scroll やページ内再検索への対応として、MutationObserver を `#search` もしくはその親要素に設定する。
- ノード追加イベントで、新規に現れた結果要素に対してのみ抽出・問い合わせ・UI挿入を行う。
- 既に処理した要素に対しては、`data-hatebu-count-injected` 等でスキップする。

---

## 10. Hatena API との連携仕様

Coding Agent は、実際のAPI仕様を最新ドキュメントで確認したうえで、以下の方針に従って連携を実装すること。

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

- 必要最低限の `host_permissions` のみを宣言する（`bookmark.hatenaapis.com`, `b.hatena.ne.jp`, `hn.algolia.com`）。
- `news.ycombinator.com` はユーザークリック時の遷移先またはfavicon画像参照だけに使い、host permission は要求しない。
- 外部favicon取得をやめる場合は、公式faviconの同梱可否を確認したうえで拡張内アセット化し、`chrome.runtime.getURL()` と必要最小限の `web_accessible_resources` で参照する。
- コンテンツスクリプトからは外部ドメインへ直接通信せず、必ず Background を通す。
- ユーザーの個人情報や機密情報を収集しない。
- ログ出力は開発時のみ詳細設定し、本番ビルドでは必要最低限に抑える。

---

## 12. i18n とアクセシビリティ

- 表示テキストは `X users` の形で英語固定でもよいが、必要に応じてロケールごとに変更しやすい構造にしておく（i18n対応は必須ではない）。
- スクリーンリーダー対応として、`aria-label` を付与することも検討可（例: 「Hatena Bookmark: X users」）。
- UI要素は検索結果本文と視認性のバランスを保つよう、過度に目立たせない。

---

## 13. テスト戦略

Coding Agent は以下の観点で動作確認を行うこと。

1. **基本シナリオ**
   - 通常のGoogle検索（PC版）でページを開き、各検索結果に `X users` が表示されること。
   - ブックマーク数が多いURLで、実際のHatenaページと件数が整合していること。

2. **0件のシナリオ**
   - ブックマーク数0のURLがUI表示されないことを確認。

3. **エラーシナリオ**
   - ネットワークを切る、API URLをわざと間違えるなどして、UIが壊れずに検索結果だけは正常に見えること。

4. **DOM変更耐性**
   - 異なるGoogleレイアウト（日本語・英語、ライトテーマ／ダークテーマ）で動作確認し、セレクタが安定しているか検証する。

5. **パフォーマンス**
   - 大量の検索結果（継続スクロールで増やした場合）でもブラウザが重くならないこと。

---

## 14. 将来拡張・オプション

- **オプションページの追加**
  - 「表示をON/OFFする」「0件も表示する」「クリックでHatenaエントリページに飛ぶかどうか」などの設定を持たせる拡張。

- **UIの高度化**
  - 件数に応じた色分け（ある閾値以上は強調する等）。

- **他サイト対応**
  - 同じ仕組みで、はてなブックマーク件数をGitHub等他サイトにも表示する。

---

以上がCoding Agent向けのDesign Docである。
実装フェーズでは、本ドキュメントに基づき以下を行うこと:

- Manifest V3の定義
- Background Service Workerの実装（Hatena API クライアント + メッセージハンドラ）
- Content Scriptの実装（DOM抽出 + UI挿入 + メッセージ送受信）
- TypeScript/ビルド環境の構築
- 上記テスト戦略に沿った動作確認・調整

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
