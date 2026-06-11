# GSPlus Hatebu Extension

Google検索結果に各リンクのはてなブックマーク件数（`X users`）を表示するChrome拡張です。Manifest V3 + TypeScriptで構築し、Hatena公開APIからカウントをバッチ取得してDOMへ柔らかく描画します。

## プロジェクト構成

- `src/background/`: サービスワーカー。content scriptからのURLリストを受け取り、Hatena APIをコールしてレスポンスを返します。
- `src/content/`: Google検索DOMを解析し、URL抽出・キャッシュ管理・UI挿入を担うコンテンツスクリプト。
- `src/shared/`: メッセージ型・URL正規化・Hatenaクライアントなど共通ユーティリティ。
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

`dist/` に `background.js` と `content.js` が生成され、public配下の資産もコピーされます。配布用の内容確認には `make package` を実行すると簡易メッセージが表示されます。

### 対応ドメイン

デフォルトでは以下のGoogleドメインで検索ページが対象になります: `google.com`, `google.co.jp`, `google.co.uk`, `google.co.in`, `google.ca`, `google.com.au`, `google.com.hk`, `google.com.sg`, `google.com.tw`。他地域に対応したい場合は `public/manifest.json` の `content_scripts[0].matches` に該当する `https://www.google.<tld>/search*` パターンを追加してください。

## Chromeへのインストール手順

1. 上記ビルドを完了させ、`dist/` ディレクトリがあることを確認します。
2. Chromeで `chrome://extensions/` を開き、右上の「デベロッパーモード」を有効化。
3. 「パッケージ化されていない拡張機能を読み込む」をクリックし、プロジェクトの `dist/` を選択。
4. Googleで検索結果を開くと、各結果のリンク横に `★ 123 users` のようなバッジが表示されます（0件の結果は非表示）。

## テストと品質ゲート

```bash
make check   # lint / fmt-check / typecheck / quality-test / lint-quality / test-coverage
```

Pull Request前に上記を必ず通し、可能ならChrome上で `chrome://extensions/` から再読み込み→Google検索ページでの手動確認を行ってください。

既知の品質債務（複雑度・ファイルサイズ警告や knip の未使用検出）は `quality-baseline.json` に記録され、増加すると `quality:check` が失敗します。債務を返済したら `npm run quality:update-baseline` で baseline を更新してください（悪化方向への更新は拒否されます）。
