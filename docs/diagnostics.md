# 診断ビルド

Hatena Bookmark コメントプレビューの間欠的な遅延を、Store 版と同じ処理経路で計測する開発者向けビルドです。通常ユーザーへの配布は想定していません。

## ビルド

```bash
npm install
npm run build:diagnostics
```

成果物は `dist-diagnostics/` に生成されます。manifest の名前は `GSearch With Social Signals Diagnostics` となり、`version_name` に元の version と commit SHA が入ります。未commitの変更を含む場合は SHA に `-dirty` が付きます。権限、host permissions、外部 API、コメントの取得・filter・表示処理は通常版と共通です。

## Chrome への読み込み

Store 版と診断版を同時に有効にすると、バッジ注入と API 通信が二重に発生します。

1. `chrome://extensions/` で Store 版を一時的に無効にする。
2. デベロッパーモードを有効にする。
3. 「パッケージ化されていない拡張機能を読み込む」から `dist-diagnostics/` を選ぶ。
4. Google 検索結果を開き直す。

## ログの確認

Google 検索結果の DevTools Console で `[GSPLUS_DIAGNOSTICS]` をfilterし、Hatena Bookmarkバッジをhoverします。成功したコメント取得ごとに1行の構造化ログが出ます。

主な項目:

- `roundTripMs`: content scriptからbackgroundへrequestし、response callbackが戻るまで。
- `backgroundReceivedDelayMs`: content送信からbackground handler開始までの概算。
- `backgroundTotalMs`: background handler内の合計。
- `fetch.fetchHeadersMs`: Hatena APIのresponse header受信まで。
- `fetch.bodyParseMs`: JSON bodyの解析。
- `fetch.filterMs`: コメントありブックマークの抽出。
- `fetch.responseHeaders.xCache`: CloudFrontのcache hit/miss情報。
- `fetch.responseHeaders.age`: cache生成後の経過秒数。
- `fetch.responseHeaders.xAmzCfPop`: 応答したCloudFront edge location。
- `runtimeDeliveryMs`: background処理以外にかかったruntime message配送・response cloneの概算。

response headerは上記3項目だけを許可リストで取得します。`target`はoriginとpathnameだけです。Google検索語、URL query/hash、コメント本文、Hatenaユーザー名は出力しません。

## 終了

測定後は診断版をChromeから削除し、Store版を再度有効にします。診断版の成果物はcommitせず、調査対象のcommitから毎回生成してください。
