# Support and FAQ

このページでは、GSearch With Social Signals のよくある質問と、不具合報告の方法を説明します。

## よくある質問

### なぜ0件は表示されないのですか？

この拡張は、検索結果に正の公開シグナルがある場合だけバッジを表示します。

- Hatena Bookmark は `0 users` の場合は表示しません。
- Hacker News は、正の points を持つ一致 story が見つからない場合は表示しません。

すべての検索結果にバッジを追加すると Google 検索結果が読みづらくなるため、意味のあるシグナルがある場合だけ表示します。

### なぜ HN 投稿数ではなく points を表示するのですか？

Hacker News では、同じ URL が複数の story やコメントで言及されることがあります。

この拡張では、Hacker News Search / Algolia で見つかった一致 story のうち、最も高い正の score を表示します。これは、その URL が Hacker News 上でどれくらい注目されたかを簡潔に示すためです。

すべての言及数、コメント数、重複投稿数を数えるものではありません。

### 検索クエリは外部APIへ送信されますか？

検索クエリ文字列を Hatena Bookmark や Hacker News Search / Algolia に送ることは意図していません。

バッジ表示のために、拡張は対応している Google 検索結果ページに表示された検索結果 URL を読み取り、その URL を以下へ送信します。

- Hatena Bookmark API
- Hacker News Search / Algolia

ただし、検索結果 URL の集合から検索意図が推測される可能性はあります。この点は [Privacy Policy](../PRIVACY.md) にも記載しています。

### 開発者は閲覧履歴を保存しますか？

保存しません。

開発者はこの拡張用のサーバーを運用しておらず、検索結果 URL、検索クエリ、閲覧履歴、Google アカウント情報を保存しません。

拡張はブラウザ内のメモリキャッシュを使いますが、これは開発者のサーバーへ送信されません。

### 対応している Google ドメインはどれですか？

現在は以下の Google 検索結果ページに対応しています。

- `google.com`
- `google.co.jp`
- `google.co.uk`
- `google.co.in`
- `google.ca`
- `google.com.au`
- `google.com.hk`
- `google.com.sg`
- `google.com.tw`

関係のないウェブサイト、Google アカウント画面、設定画面、その他の Google サービス画面では動作しません。

## 不具合や質問を報告する

GitHub Issues から報告してください。

https://github.com/umiyosh/gsearch-social-signals/issues

報告内容に近いテンプレートを選んでください。

- Google SERP layout broken
- Hatena count mismatch
- HN score mismatch
- Badge not displayed
- Privacy question

表示崩れや件数違いを報告するときは、可能な範囲で以下を含めてください。

- Google ドメイン
- 検索語。ただし公開して問題ない場合だけ
- 対象の検索結果 URL
- Chrome バージョン
- 拡張バージョン
- 個人情報を消したスクリーンショット

プライベートな検索、アカウント情報、社内情報、ログイン状態が映ったスクリーンショットは添付しないでください。
