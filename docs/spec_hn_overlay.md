# Design Doc: Hacker News バッジ拡張（非侵襲オーバーレイ版）

## 1. 目的

- 既存の「GSPlus Hatebu」（はてなブックマーク件数バッジ）を **一切壊さず**、ユーザーが任意で読み込む追加プラグインとして Hacker News 情報を重ねる。
- 元拡張が描画する DOM・CSS を変更せず、その真上に HN 情報層を合成することで、利用者は「はてな＋Hacker News」を同時観測できる。

## 2. スコープと前提

- 配布形態は「既存拡張の上から読み込む野良プラグイン」。そのため **オリジナル DOM を直接改変（削除／書き換え）してはならない**。
- Google 検索結果ページ内に、はてなバッジ群と独立した HN 表示領域を動的に挿入し、DOM を分離する。
- 既存拡張と競合しないよう、`data-gsplus-*` 属性・クラス名を再利用せず、`gsplus-hn-*` 接頭辞を付与した独自ラッパーを使用する。
- HN データ取得には Algolia Hacker News Search API を利用し、`maxPoints` を主指標としてバッジに表示。API 詳細は `docs/spec_hn.md` に準拠。

## 3. 非侵襲 DOM 合成戦略

1. **アンカー追跡**: `discoverSearchResults()` を共用し、検索結果リンクとレイアウトメタを取得。ただしオリジナル拡張が追加した `span.gsplus-signal-container` を変更しない。
2. **透過レイヤー方式**:
   - 各検索結果のアンカー直後に、HN 用の `span.gsplus-hn-container` を `insertAdjacentElement("afterend", …)` で追加。
   - 既存バッジの兄弟要素として並列化するため、`position: relative` を付与せず、CSS フレックスを用いた行追加に留める。
3. **CSS 分離**: HN 用スタイルシートは別 `<style id="gsplus-hn-style">` とし、既存 `gsplus-hatebu-style` と衝突しないようにする。
4. **デタッチ可能**: プラグイン停止時には自レイヤー要素を全てクリーンアップできるよう、コンテナに `data-gsplus-hn-bound="true"` を付けて管理。

## 4. メッセージング & API 呼び出し

- Background worker へ新規 `HN_REQUEST` メッセージを送信。payload は URL 配列と `source: "hn-addon"`。
- Background では既存 `fetchHackerNewsSummaries()` を利用しつつ、**独立キャッシュ `hnAddonCache`** を持つ。オリジナルと共有するとキャッシュ汚染の可能性があるため必ず名前空間を分ける。
- Rate limit 対策として 1 リクエストあたり最大 20 URL。Google SERP では通常 10 件/ページなので十分。

## 5. UI 仕様

- バッジテキスト: `HN <maxPoints> pts`。`maxPoints <= 0` または未定義の場合はコンテナを追加しない。
- クリック先: `topStoryUrl` があれば `https://news.ycombinator.com/item?id=<objectID>`、なければ Algolia HN Search。
- ツールチップ: 既存オーバーレイに干渉しないよう、title 属性で投稿数、top story の points、最大コメント数を補助表示するのみ。
- レイアウト: 12px favicon + テキスト。左右余白は `.35rem`。`display: inline-flex`。

## 6. 実装ステップ

1. **shared**: `fetchHackerNewsSummary/Summaries` を `src/shared/hackerNews.ts` から再利用し、必要なら export 形状を調整。
2. **background**: `chrome.runtime.onMessage` に `isHackerNewsAddonRequest` を追加。キャッシュと API 呼び出しを実行後、`HN_ADDON_RESPONSE` を返却。
3. **content**: `ensureHnStyles()` でスタイル注入 → `bindHnBadges()` で URL ごとのバッジを生成。元 DOM にクラスを付けない。
4. **クリーンアップ**: MutationObserver で SERP が更新された際も、はてな拡張の処理を待たずに HN コンテナの再構築を行う。

## 7. テスト計画

- `tests/content/hnAddon.spec.ts`: フェイク SERP HTML を用意し、既存 `gsplus-hatebu` クラスに一切触れないこと、HN コンテナが兄弟要素として生成されることを検証。
- `tests/background/hnAddon.spec.ts`: fetch モックで API エラー時に null 返却・キャッシュ再利用を確認。

## 8. リスクと緩和

- **DOM 競合**: オリジナル拡張が構造変更した場合でも、兄弟要素として後付けするため壊れにくい。万一 DOM シグネチャが変わった場合は `discoverSearchResults()` 更新で吸収。
- **API クォータ**: Algolia HN API は公開されているが過負荷に注意。必要なら `setTimeout` で 2req/sec を上限とする。
- **スタイル衝突**: CSS ID を変えており、`all: initial` でリセットする fallback を検討（Phase2）。

---

この設計により、オリジナル GSPlus Hatebu の DOM に手を触れず、Hacker News シグナルを追加層として重ね合わせることが可能になる。
