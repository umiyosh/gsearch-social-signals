# Design Doc: Google検索結果に Hacker News 言及数を重ねて表示する拡張

このドキュメントは、既存の Chrome 拡張 **GSPlus Hatebu**（Google検索結果に はてなブックマーク数を表示）に対して、**Hacker News (HN) の URL 言及情報をバッジとして表示する機能**を追加するための要求仕様・設計指針である。
実装はコーディングエージェントが行うことを前提とし、ここでは **コードレベルには踏み込まず、「何をどう実装するか」の方式・方針・利用ライブラリ・注意点のみ**を記述する。

既存コードの全体像・各ファイルの役割は `yek.md` 内の README / manifest / src 構成を参照。

---

## 1. フェーズ定義とスコープ

### 1.1 Phase 1（今回実装する範囲）

- Google 検索結果の各リンクに対し、**URL に対応する Hacker News story 群の最大スコア（maxPoints）をバッジ表示**する。
- 既存の「はてなブックマーク件数バッジ」と同様に、**検索結果ごとに小さい数値バッジを重ねる UI** を実現する。
- HN の投稿数やコメント数 (`nbHits`, `num_comments`) は、**内部データや title 属性の補助情報**として保持する。
- 既存の設計・コード構造（background service worker / content script / shared utils）を維持し、**HN 機能を追加する形**で拡張する。

### 1.2 今後の拡張候補（Phase 2 以降）

ここで挙げるものは **「今回の実装対象外だが、将来のフェーズで実装したいアイデア」** である。
「やらなくていいこと」ではなく、「次のフェーズで取り組む候補」として位置づける。

- HN の `hits` を使った **スレッド一覧のオーバーレイ表示**（最もポイントの高いスレッドへのリンク一覧、タイトル・ポイント・コメント数など）。
- Reddit 等の他サービスについて、**URL 言及一覧やスコアを同様のオーバーレイで表示**する機能。
- バッジのクリックによる、**専用ポップアップ UI（HN/Reddit の要約）** の表示。

今回の設計では、これら将来の拡張が行いやすいよう、**URL → ソーシャルシグナル取得**の部分を抽象化しておく。

---

## 2. 既存拡張の構造把握（GSPlus Hatebu）

`yek.md` に含まれる README・manifest・src 構成から読み取れる現状構造：

- **public/manifest.json**
  - Manifest V3。
  - Google 検索結果ページへの content script の注入設定。
  - はてな API への `host_permissions` を定義。

- **src/content/**（content script）
  - Google 検索 DOM から外部リンク URL を抽出。
  - URL の正規化ロジックは `src/shared/url.ts` を利用。
  - URL の集合を background にメッセージ送信。
  - background から返ってきた「URL → ブックマーク数」をもとに、 `X users` バッジを挿入。
  - 必要に応じて hover オーバーレイ（はてブコメント）も表示。

- **src/background/**（service worker）
  - content からのメッセージ（URLリスト）を受け、Hatena API を叩く。
  - `src/shared/hatena.ts` のバッチ取得ロジックを利用し、最大50件ずつ API コール。
  - 結果（URL → count）を content script に返す。

- **src/shared/**
  - `url.ts`
    - Google 検索結果の href から実URLを抽出（redirectの除去など）。
    - URL正規化（プロトコル強制、フラグメント除去、mailto除外など）。

  - `hatena.ts`
    - Hatena の count API クライアント。
    - URL配列をチャンク分割 (`chunkArray`) し、複数URLの件数をまとめて取得。

  - `messages.ts`
    - background / content 間のメッセージ型・type enum・型ガード。

この構造を踏襲し、**Hacker News 用の shared モジュール＋メッセージ種別＋UI 表示**を追加する方針とする。

---

## 3. Hacker News 言及数表示の仕様

### 3.1 検索結果への表示仕様

- Google 検索結果の各リンクに対し、次のような UI を追加：
  - 既存：`★ 123 users`（はてな）
  - 新規：`HN 342 pts`（Hacker News）

- 表示ルール：
  - `maxPoints > 0` の場合のみ表示。
  - `maxPoints` が 0 または未定義の場合は、HN バッジを出さない（既存の「ブクマ0件は非表示」と同じ思想）。
  - はてなバッジが存在する場合は、その**直後に HN バッジを並べる**。
  - はてなが無い場合でも、HN のみ表示可能とする。
  - HNバッジはハッカーニュースのfaviconを使用すること。

- HN バッジのテキストフォーマット（Phase 1）：
  - 基本形：`HN <maxPoints> pts`
  - 投稿数 `nbHits`、最大コメント数 `maxComments`、top story URL は内部データとして保持し、title 属性や将来の詳細表示に利用する。

- バッジのクリック：
  - `topStoryUrl` がある場合は、最もスコアの高い story の HN 本家 URL (`https://news.ycombinator.com/item?id=<objectID>`) へ遷移する。
  - `topStoryUrl` がない場合は、HN 検索画面（Algolia HN Search）へ遷移する：
    - 例：`https://hn.algolia.com/?query=<encoded_url>&type=story`

### 3.2 HN 言及数の定義

- **Hacker News 上で「その URL が story として一度でもどれだけ強く評価されたか」** を主指標とみなす。
- これは Algolia HN API の `hits[].points` から計算する `maxPoints` に対応する。
  - `nbHits` は投稿件数として保持するが、主表示には使わない。
  - `totalPoints` は複数投稿 URL で膨らみやすいため、Phase 1 では採用しない。

---

## 4. Hacker News API 利用設計

### 4.1 使用する API

- サービス：**Hacker News Search (Algolia)**
  - トップページ: [https://hn.algolia.com](https://hn.algolia.com)
  - API 説明（非公式だが実質デファクト）：
    - [https://hn.algolia.com/api](https://hn.algolia.com/api)
    - Algolia の一般的な search API ドキュメント（`nbHits` など）：

- 利用するエンドポイント：
  - `GET https://hn.algolia.com/api/v1/search`

- 推奨クエリパラメータ（1 URL あたり）：
  - `query=<encoded_url>`
  - `tags=story`（story のみに限定）
  - `restrictSearchableAttributes=url`（URLフィールドに限定）
  - `numericFilters=points>0`（ノイズ除外用。0ポイント story を外す）
  - `hitsPerPage=50`（代表的な hits を十分に取得できる範囲）

例：
`https://hn.algolia.com/api/v1/search?query=<encoded_url>&tags=story&restrictSearchableAttributes=url&numericFilters=points>0&hitsPerPage=50`

### 4.2 レスポンスの利用方針

- 主要フィールド：
  - `nbHits: number`
    → 投稿件数として保持し、title 属性や将来の詳細表示に利用。
  - `hits: Array<{ points, num_comments, created_at, url, objectID, ... }>`
    → Phase 1 では `points` の最大値を主表示に利用し、コメント数や top story も集計する。

- 内部で計算しておく代表値：
  - `max_points`: `max(hits[].points)`
  - `max_comments`: `max(hits[].num_comments)`
  - `top_story_url`: `https://news.ycombinator.com/item?id=<objectID>`（points 最大のもの）

### 4.3 レート制限・パフォーマンス配慮

- 1回の検索ページ表示で、多数の URL に対して HN API を叩くことになるため、以下に注意：
  - **同一URLに対する複数リクエストを避けるためのキャッシュ**：
    - background 側で `Map<normalizedUrl, HnSummary>` を持ち、セッション中に再利用。

  - URL 数が多い場合の制御：
    - 1検索ページあたりの URL 数を制限（例えば上位 50 件の結果だけにバッジを付けるなど）。

  - 将来必要に応じて、**簡易的なレート制限制御（一定時間当たりの最大リクエスト数）** を実装。

---

## 5. 実装アーキテクチャ（Phase 1）

### 5.1 新規モジュール：`src/shared/hackerNews.ts`（想定）

目的：URL 配列から HN 情報を取得するクライアントユーティリティ。

- 役割：
  - 正規化済み URL を受け取り、HN Search API を呼び出して `HnSummary` を返す。
  - 複数 URL の場合は並列/直列の制御（Promise.all など）と、内部キャッシュを行う。

- 依存：
  - ネイティブ `fetch`（または既存コードで使用している HTTP クライアントがあればそれを利用）。

- 入出力イメージ（抽象）：
  - 入力: `string[]`（正規化 URL の配列）
  - 出力: `Record<string, HnSummary>`
    - `HnSummary` は以下のような構造を想定（型名のみ示す）：
      - `nbHits: number`
      - `maxPoints?: number`
      - `maxComments?: number`
      - `topStoryId?: string`（HN item ID）

### 5.2 URL 正規化の再利用

- 既存の `src/shared/url.ts` に含まれる以下の機能を再利用する：
  - Google 検索結果リンクから実URLを抽出 (`extractExternalUrlFromHref` 的なもの)。
  - 正規化 (`normalizeUrl`, `normalizeForComparison`)：
    - プロトコルの統一（http/https）
    - ハッシュ (#) の除去
    - mailto 等の非 http(s) URL の除外

- HN へのクエリに使用する URL は、**Hatena と同じ正規化ロジック**を通したものとすることで、キャッシュキーの一貫性を保つ。

### 5.3 メッセージ設計

既存の `src/shared/messages.ts` を拡張し、HN 用のメッセージ型を追加する。

- 追加するメッセージ種別（案）：
  - `REQUEST_HN_SUMMARY`
    - payload: `{ urls: string[] }`

  - `RESPONSE_HN_SUMMARY`
    - payload: `{ summaries: Record<string, HnSummary> }`

- content → background のフロー：
  1. content scriptが検索結果から URL 一覧を抽出し、正規化。
  2. `REQUEST_HN_SUMMARY` メッセージを background に送信。

- background → content のフロー：
  1. background は `hackerNews.ts` を使って HN API を叩き、`Record<string, HnSummary>` を生成。
  2. `RESPONSE_HN_SUMMARY` として content に返送。

### 5.4 background 側の処理

- 既存の Hatena 処理に並行して、HN 用の処理を追加する。
- 実装方針：
  - メッセージ種別ごとにハンドラを分ける（既存の Hatena 用ハンドラを参考）。
  - HN 用ハンドラは、受け取った URL 配列を `hackerNews.ts` に渡し、その結果を返す。

- 注意点：
  - HN API は CORS を許可しているが、**Manifest V3 の service worker から `fetch` する設計を守る**こと。
  - 必要に応じて `host_permissions` に `https://hn.algolia.com/*` を追加。

### 5.5 content script 側の処理

- 既存の「URL 抽出 → Hatena カウント問い合わせ → DOM 挿入」のフローに、HN 処理を追加する。

基本フロー（抽象）：

1. 検索結果 DOM を解析して、外部 URL のリストを取得。
2. URL ごとにユニークな正規化キーを作成。
3. 既存の Hatena counts 要求に加え、HN summary の要求も発行。
4. background から `RESPONSE_HN_SUMMARY` を受け取ったら、
   - 各検索結果要素に対応する URL をキーに `HnSummary` を参照。
   - `maxPoints > 0` の場合、該当要素付近に HN バッジ要素を挿入。

5. HN バッジ要素は、既存 Hatena バッジとスタイルの一貫性を保つ（色・フォント・余白は既存 CSS を参考に追加）。

---

## 6. エラーハンドリング・UX 配慮

- HN API 呼び出しが失敗した場合：
  - その検索ページでは HN バッジを表示しない（サイレントフォールバック）。
  - コンソールにのみエラーを出力（ユーザーにアラートは出さない）。

- HN summary の取得が遅延した場合：
  - Hatena バッジは先に出ることがあるが、**HN バッジは後から非同期に追加されてよい**設計とする。

- HN API レスポンスで `hits` が空、もしくはすべて `points: null` の場合：
  - `maxPoints` が 0 または未定義であればバッジ非表示。
  - `nbHits` は投稿件数として保持するが、主表示には使わない。

---

## 7. 将来の Reddit 拡張を見据えた工夫

Reddit の URL 言及数（非ブックマーク的シグナル）を将来追加しやすくするため、**「ソーシャルシグナル取得レイヤー」を抽象化**しておくことを推奨する。

### 7.1 ソーシャルシグナル抽象インターフェース（概念レベル）

- 抽象型（例）：
  - `SocialSignalProvider`（インターフェース的なもの）
    - 入力：`string[]`（正規化 URL 群）
    - 出力：`Record<string, SocialSignalSummary>`

  - `SocialSignalSummary`（HN / Reddit 共通の最小公倍数）：
    - `count: number`（「言及数」「post数」「submission数」など）
    - `source: "hatena" | "hackerNews" | "reddit" | ...`
    - 任意で `score`, `comments` などの追加フィールド。

- 現時点では、Hatena / HN についてこの抽象を意識した構造にしておくことで、将来 **Reddit 用 Provider を追加するだけ**で拡張可能になる。

### 7.2 Reddit 側の API 候補

将来の Reddit 拡張時に参照する API 情報：

- Reddit 公式 API：
  - [https://www.reddit.com/dev/api/](https://www.reddit.com/dev/api/)
  - URL でリンク投稿を検索する場合、`/api/info.json?url=<encoded_url>` 等が参考になる（実装時は最新ドキュメントを再確認すること）。

- PullPush (旧 Pushshift 代替)：
  - [https://www.pullpush.io/](https://www.pullpush.io/)
  - `/reddit/search/submission/?url=<encoded_url>` などで `metadata.total_results` により総件数が取れる構造。
  - URL ごとの submission 数を簡易に取得できるため、SERP の Reddit バッジとしては有力。

Reddit 連携時も、**HN と同じく「URL → submission総数」を第一のシグナル**とし、余力があれば `score` や `num_comments` を追加で使う設計とする。

---

## 8. 開発時に参照すべき外部ドキュメント一覧（URL集）

コーディングエージェントが実装する際に参照すべきドキュメント URL の一覧。

### 8.1 既存拡張・Hatena 関連

1. 本プロジェクト（GSPlus Hatebu）の仕様・参考リンク（`yek.md` 内）
2. はてなブックマーク API ドキュメント
   - [https://developer.hatena.ne.jp/ja/documents/bookmark/apis/rest/bookmark/](https://developer.hatena.ne.jp/ja/documents/bookmark/apis/rest/bookmark/)

### 8.2 Hacker News / Algolia 関連

3. Hacker News Search（Algolia HN 検索）
   - [https://hn.algolia.com](https://hn.algolia.com)

4. Algolia HN API（概要ページ・パラメータ確認用）
   - [https://hn.algolia.com/api](https://hn.algolia.com/api)

5. Algolia Search API（`nbHits` などレスポンス解説）
   - [https://www.algolia.com/doc/rest-api/search/search-single-index](https://www.algolia.com/doc/rest-api/search/search-single-index)
   - [https://www.algolia.com/doc/guides/building-search-ui/going-further/backend-search/in-depth/understanding-the-api-response/](https://www.algolia.com/doc/guides/building-search-ui/going-further/backend-search/in-depth/understanding-the-api-response/)

### 8.3 Reddit / PullPush 関連（将来拡張用）

6. Reddit API ドキュメント（search / info / link 関連）
   - [https://www.reddit.com/dev/api/](https://www.reddit.com/dev/api/)

7. PullPush Reddit API（`/reddit/search/submission/` 等）
   - [https://www.pullpush.io/](https://www.pullpush.io/)

### 8.4 Chrome 拡張開発関連

8. Chrome Extensions: Manifest V3 Overview
   - [https://developer.chrome.com/docs/extensions/mv3/intro/](https://developer.chrome.com/docs/extensions/mv3/intro/)

9. Chrome Extensions: Service Workers (background)
   - [https://developer.chrome.com/docs/extensions/mv3/service_workers/](https://developer.chrome.com/docs/extensions/mv3/service_workers/)

10. Chrome Extensions: Content Scripts
    - [https://developer.chrome.com/docs/extensions/mv3/content_scripts/](https://developer.chrome.com/docs/extensions/mv3/content_scripts/)

---

## 9. コーディングエージェントへの作業指示まとめ

1. `yek.md` を参照し、現行の **GSPlus Hatebu** の構造とデータフロー（content → background → Hatena API）を正確に把握すること。
2. 既存の URL 抽出・正規化ロジック (`src/shared/url.ts`) をそのまま利用し、**HN 用の URL キーも同じ正規化を使う**こと。
3. 新規モジュール `src/shared/hackerNews.ts`（名前は暫定）を追加し、**HN Search API から `nbHits` と代表 hits 情報を取得するクライアント**を実装すること。
4. `src/shared/messages.ts` に HN 用メッセージ型を追加し、background / content 間で **URL 配列 → HN summary** のやりとりを行うこと。
5. background の service worker に HN 用ハンドラを追加し、**HN API 呼び出し・キャッシュ・エラー処理**を実装すること。
6. content script にて、Hatena の処理フローを参考にしつつ、**HN バッジを DOM に追加するロジック**を実装すること。
   - `maxPoints > 0` のときだけ `HN <maxPoints> pts` を表示。
   - はてなバッジが存在する場合はその直後に配置し、見た目の一貫性を保持。

7. CSS / スタイルは既存バッジと違和感が出ない範囲で最低限の追加に留め、必要であれば `class` 名だけ付与して、詳細な見た目調整は後続フェーズでも可能なようにしておくこと。
8. 将来の Reddit 連携・HN オーバーレイ（Phase 2）を見据え、**「ソーシャルシグナル取得レイヤー」を抽象化しやすい構造**を保つこと（Provider パターンなど）。
