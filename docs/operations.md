# Operations

このドキュメントは、GSearch With Social Signals 公開後の保守運用手順です。

## Issue トリアージ

GitHub Issue templates は以下の用途で使います。

- Google SERP layout broken: `src/content/searchResults.ts` またはバッジ配置 CSS の問題を疑う。
- Hatena count mismatch: URL 正規化または `src/shared/hatena.ts` の問題を疑う。
- HN score mismatch: URL matching または `src/shared/hackerNews.ts` の問題を疑う。
- Badge not displayed: 対応 Google ドメイン、URL 抽出、message handling、API 結果を確認する。
- Privacy question: `PRIVACY.md`、`docs/support.md`、`docs/chrome-web-store-privacy-practices.md` に沿って回答する。

ユーザーに、非公開の検索語やログイン状態のスクリーンショットを求めない。多くの場合、公開 URL と個人情報を消したスクリーンショットで十分。

## Google SERP DOM 変更時の対応手順

1. 報告された Google ドメインと検索語が公開して問題ない場合、同じ条件で再現する。
2. 対象の検索結果コンテナを確認し、どの Google layout が使われているかを見る。
3. 描画自体が壊れていない限り、まず `src/content/searchResults.ts` の selector / discovery logic だけを修正する。
4. `tests/fixtures/` に SERP fixture を追加または更新する。
5. 新しい layout、Google 内部リンク除外、redirect URL 正規化、二重挿入防止の回帰テストを追加する。
6. 次を実行する。

```bash
make check
```

7. Store package を作り、実Chromeで smoke test してから新バージョンをアップロードする。

手動 smoke checklist:

- `chrome://extensions/` で `dist/` を読み込む。
- 対応している Google 検索結果ページを開く。
- Hatena の正の件数がある結果にバッジが出ることを確認する。
- HN の正の points がある結果にバッジが出ることを確認する。
- 0件または正の score がない結果ではバッジが出ないことを確認する。
- Hatena の hover / focus preview が壊れていないことを確認する。
- Google が後から追加した検索結果に、バッジが二重挿入されないことを確認する。

## 外部API仕様変更時の対応手順

Hatena API:

1. `src/shared/hatena.ts` と失敗している endpoint を確認する。
2. count API、entry API、response shape、rate behavior のどれが変わったかを確認する。
3. API 失敗時も Google 検索結果の表示自体を壊さない。
4. API 400 / 500、invalid JSON、missing keys、multi-batch behavior の回帰テストを追加する。

Hacker News Search / Algolia:

1. `src/shared/hackerNews.ts` を確認する。
2. matching、points、URL fields、empty hits のどれが変わったかを確認する。
3. URLごとの timeout と concurrency limit は維持する。
4. empty hits、missing points、URL mismatch、timeout、API error の回帰テストを追加する。

送信データや第三者送信先が変わる場合だけ、`PRIVACY.md` と Chrome Web Store Privacy practices 文面を更新する。

## Chrome Web Store 審査差し戻し時の対応手順

1. 差し戻し理由の原文を作業ノートに控える。
2. 理由を分類する。
   - policy / privacy practices
   - permissions
   - remote hosted code
   - listing text or screenshots
   - package contents
   - functionality review
3. Dashboard、manifest、`dist/`、docs を source of truth として確認する。
4. code または package 変更が必要な場合、再アップロード前に必ず version を上げる。
5. 次を実行する。

```bash
make check
make package
```

6. 新しい zip をアップロードし、再度審査に送信する。
7. release / rollback 方針が変わる場合は `docs/release-management.md` を更新する。

Chrome Web Store に一度アップロードした version number は再利用しない。

## 定期確認

Unlisted 期間中は、週1回を目安に以下を確認する。

- Chrome Web Store dashboard の審査・公開状態、レビュー、サポート質問、GitHub Issues。
- 更新版を送信する前の `make check`、`make package`、実Chrome smoke test。
- Google 検索結果の見た目が大きく変わったと気づいたときの SERP smoke checklist。

## Chrome Web Store レビュー・問い合わせ確認

1. Chrome Web Store Developer Dashboard の item page を確認する。
2. GitHub Issues の新規報告を確認する。
3. ユーザー報告に個人情報が含まれる場合、公開 issue に引用しない。
4. 対応可能な報告は、近い template で GitHub Issue を作成または更新する。
5. 公開挙動の説明が変わる場合は、`README.md`、`docs/support.md`、Store Listing を同時に更新する。
