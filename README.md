# Google検索 with ソーシャルシグナル

Google検索結果に、各リンクのはてなブックマーク件数（`X users`）とHacker News最大スコア（`HN X pts`）を表示するChrome拡張です。公開ソーシャル情報を検索結果に重ね、リンク先の信任性・注目度を判断するための補助シグナルを追加します。

この拡張は検索結果の順位や内容を変更しません。Manifest V3 + TypeScriptで構築し、Hatena Bookmark APIとHacker News Search API（Algolia）から公開情報を取得してDOMへ控えめに描画します。

## スクリーンショット

![Google検索結果にHatena Bookmark件数とHacker Newsスコアを表示している画面](docs/assets/google-search-social-signals-serp.png)

## 機能

- Google検索結果の各URL付近にHatena Bookmark件数を表示します。
- Hacker Newsで言及されているURLには、そのURLに対応するstory群の最大スコアを`HN X pts`として表示します。
- Hatenaバッジにマウスオーバーまたはフォーカスすると、コメント付きブックマークのプレビューを表示します。
- 件数やスコアが0件の結果にはバッジを表示しません。
- Google redirect URLを正規化し、同じURLへの重複リクエストを抑制します。

## 公開名

- 日本語名: `Google検索 with ソーシャルシグナル`
- English name: `Google Search with social signal`

## 商標・非公式性

This extension is not affiliated with Google, Hatena, Hacker News, or Y Combinator.

- Google公式拡張ではありません。名称中のGoogleは、この拡張がGoogle検索結果ページ上で動作することを説明するために使っています。
- Hatena公式拡張ではありません。Hatena Bookmarkの公開APIから取得した件数とコメント情報を表示します。
- Hacker NewsまたはY Combinatorの公式拡張ではありません。Hacker News Search API（Algolia）から取得した公開story情報の最大スコアを補助シグナルとして表示します。
- この拡張は検索結果の順位や内容を変更せず、各検索結果の横に公開ソーシャル情報を小さなバッジとして追加します。

## プロジェクト構成

- `src/background/`: サービスワーカー。content scriptからのURLリストを受け取り、Hatena API / Hacker News APIをコールしてレスポンスを返します。
- `src/content/`: Google検索DOMを解析し、URL抽出・キャッシュ管理・Hatena/HNバッジ挿入を担うコンテンツスクリプト。
- `src/shared/`: メッセージ型・URL正規化・Hatena/Hacker Newsクライアントなど共通ユーティリティ。
- `public/manifest.json`: Manifest V3定義（権限、content scriptのマッチ条件など）。
- `tests/`: Vitest + jsdomでのユニットテスト。

## 必要要件

- Node.js 20.x 以上
- npm 10.x 以上
- Google Chrome (Manifest V3 対応版)

## セットアップ

```bash
npm install          # 依存解決
# または
make install
```

## 開発フロー

- `npm run dev` / `make dev` : tsupウォッチ＋publicコピーで `dist/` を更新。Chromeに読み込んだままホットリロード互換の開発が可能。
- `npm run lint` / `make lint` : ESLint（複雑度・サイズ系の品質ルール込み）で静的解析。
- `npm run fmt-check` / `make fmt-check` : Prettierフォーマットチェック（`fmt` で自動修正）。
- `npm run test` / `make test` : Vitestによる単体テストを実行。
- `npm run test:coverage` / `make test-coverage` : per-file カバレッジ閾値つきでテスト実行。
- `npm run typecheck` / `make typecheck` : TypeScriptのstrictチェック。
- `npm run quality:check` / `make lint-quality` : ESLint warning と knip の検出を `quality-baseline.json` と比較し、増加をブロック。

## ビルド手順

```bash
npm run build   # もしくは make build
```

`dist/` に `background.js` と `content.js` が生成され、public配下の資産もコピーされます。配布用 zip は `npm run package:store` または `make package` で作成します。

## 配布zip作成

```bash
npm run package:store   # もしくは make package
```

`npm run package:store` は `npm run build:store` を実行したうえで、`store-package/gsplus-hatebu-<version>.zip` を作成します。zip は `dist/` の中身だけをルートに配置するため、Chrome Web Store にアップロードする zip のルートには `manifest.json` が存在します。

配布 zip には `.git`、`.env`、`node_modules`、`src`、`tests`、`coverage`、`.DS_Store`、`__MACOSX`、`.map` を含めません。`tsup.config.ts` は `sourcemap: false` のため公開 zip に source map は入りません。minify は審査時の確認しやすさを優先して現時点では無効のままにしています。

## リリース作成

`v*` タグを push すると GitHub Actions の Release workflow が動き、`npm run package:store` で配布 zip を作成して GitHub Release に添付します。

```bash
make release-check VERSION=0.1.0
make release-tag VERSION=0.1.0
```

`release-check` / `release-tag` は、指定した tag version と `package.json`、`package-lock.json`、`public/manifest.json` の version が一致していることを検証します。

バージョニング方針、rollback、Chrome Web Store rollout、問い合わせ導線は [Release Management](docs/release-management.md) にまとめています。変更内容は [CHANGELOG](CHANGELOG.md) に記録します。

### 対応ドメイン

デフォルトでは以下のGoogleドメインで検索ページが対象になります: `google.com`, `google.co.jp`, `google.co.uk`, `google.co.in`, `google.ca`, `google.com.au`, `google.com.hk`, `google.com.sg`, `google.com.tw`。他地域に対応したい場合は `public/manifest.json` の `content_scripts[0].matches` に該当する `https://www.google.<tld>/search*` パターンを追加してください。

Chrome拡張のmatch patternはTLDワイルドカードをサポートしていないため、`https://www.google.*` のような指定は使いません。`https://*/*` など広い `matches` と `include_globs` の組み合わせでも近い絞り込みはできますが、content scriptの権限警告と審査説明が広くなるため、この拡張では対応するGoogleドメインを明示列挙します。

## Chrome Web Store からのインストール

Chrome Web Store 公開後は、ストアページからインストールできます。現在の `0.1.0` は Unlisted beta として提出する想定です。公開URLはリリース後にこの README と Store Listing に反映します。

## 手動インストール手順

1. 上記ビルドを完了させ、`dist/` ディレクトリがあることを確認します。
2. Chromeで `chrome://extensions/` を開き、右上の「デベロッパーモード」を有効化。
3. 「パッケージ化されていない拡張機能を読み込む」をクリックし、プロジェクトの `dist/` を選択。
4. Googleで検索結果を開くと、各結果のリンク付近に `123 users` や `HN 456 pts` のようなバッジが表示されます（0件の結果は非表示）。

Store 提出用 zip を確認する場合は、`make package` で作成される `store-package/gsplus-hatebu-<version>.zip` を使います。zip は Chrome Web Store アップロード用で、通常のローカル開発では展開済みの `dist/` を読み込んでください。

## プライバシー概要

この拡張は、Google検索結果ページ上のリンクURLを読み取り、公開ソーシャルシグナルを取得するために外部APIへ送信します。

- Hatena Bookmark件数取得のため、検索結果URLをHatena Bookmark APIへ送信します。
- Hatenaコメントプレビュー取得のため、ユーザーがHatenaバッジをhoverまたはfocusしたURLをHatena entry APIへ送信します。
- Hacker News最大スコア取得のため、検索結果URLをHacker News Search API（Algolia）へ送信します。

開発者サーバーにはデータを送信しません。検索クエリ文字列、ページ本文、Googleアカウント情報、Cookie、入力フォーム内容を意図的に収集しません。キャッシュはブラウザ実行中のメモリ上で扱い、永続保存には`chrome.storage`を使用していません。

検索結果URLの集合からユーザーの検索意図が推測される可能性があるため、詳しい扱いは [Privacy Policy](PRIVACY.md) に記載しています。Chrome Web Store の Privacy practices へ入力する内容は [docs/chrome-web-store-privacy-practices.md](docs/chrome-web-store-privacy-practices.md) にまとめています。

## 問い合わせ

公開後の質問、不具合報告、権限やプライバシーに関する問い合わせは GitHub Issues で受け付けます。

- Repository: <https://github.com/umiyosh/GSPlusHatebu>
- Issues: <https://github.com/umiyosh/GSPlusHatebu/issues>

Chrome Web Store の Support tab には GitHub Issues URL を設定します。

## Chrome Web Store掲載文ドラフト

### 短い説明文

Show Hatena Bookmark counts and Hacker News points directly on Google Search results.

### 詳細説明文

Google検索 with ソーシャルシグナル is an unofficial extension that adds public social signals to Google Search results.

It shows Hatena Bookmark counts and Hacker News points next to supported Google Search result links, helping you judge how much attention a page has received in Japanese and international tech communities without changing the ranking or content of the search results.

Features:

- Hatena Bookmark count badges on Google Search results.
- Hacker News points badges based on the highest matching story score.
- Hatena comment preview on badge hover/focus.
- Google redirect URL normalization.
- Zero-count results are hidden to keep the search page quiet.

Data usage:

- Search result URLs are sent to Hatena Bookmark APIs to retrieve bookmark counts and comment previews.
- Search result URLs are sent to Hacker News Search API (Algolia) to retrieve matching story scores.
- The developer does not operate a server for this extension and does not store browsing history, search queries, page contents, account information, cookies, or form inputs.

Host permissions:

- `https://bookmark.hatenaapis.com/*`: used to retrieve Hatena Bookmark counts for URLs shown in Google Search results.
- `https://b.hatena.ne.jp/*`: used to retrieve public Hatena Bookmark entry comments when the user hovers or focuses a Hatena badge, and to open Hatena entry pages from the badge.
- `https://hn.algolia.com/*`: used to search the Hacker News Search API for matching stories and retrieve public points/comment counts.
- `news.ycombinator.com` is not requested as a host permission. Hacker News story pages are only opened when the user clicks a badge; the extension does not fetch data from `news.ycombinator.com`.

Non-affiliation:

This extension is not affiliated with Google, Hatena, Hacker News, or Y Combinator.

Google, Hatena, Hacker News, and Y Combinator names are used only to describe where the extension works and which public services provide the displayed signals.

## テストと品質ゲート

```bash
make check   # lint / fmt-check / typecheck / quality-test / lint-quality / test-coverage
```

Pull Request前に上記を必ず通し、可能ならChrome上で `chrome://extensions/` から再読み込み→Google検索ページでの手動確認を行ってください。

既知の品質債務（複雑度・ファイルサイズ警告や knip の未使用検出）は `quality-baseline.json` に記録され、増加すると `quality:check` が失敗します。債務を返済したら `npm run quality:update-baseline` で baseline を更新してください（悪化方向への更新は拒否されます）。
