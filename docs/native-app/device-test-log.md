# 実機検証ログ

実施日: 2026-08-16

## 検証した端末

| 種別 | 端末 | 結果 |
|---|---|---|
| エミュレータ | `Medium_Phone_API_36.0`（API 36 / Android 16） | 合格 |
| **実機** | **Samsung Galaxy SCG21（Android 16 / API 36）** | **合格** |
| **実機** | **iPhone 16 Pro Max（iOS 26.6）** | **表示まで合格。保存は検証中**（第4章） |

以下、まずエミュレータでの検証、続いて実機での検証を記す。

---

# 1. Android エミュレータ

端末: `Medium_Phone_API_36.0`（API 36 / Android 16、`emulator-5554`）
アプリ: `com.nonturn.photogallery` debug ビルド（Expo SDK 57、`assembleDebug`）
web: ローカル開発サーバー `http://10.0.2.2:3002`（エミュレータからホストへの経路）
招待: `7AA53aP_hAqR-x3qXEqY7`（46枚、有効期限 2026-09-15）

判定は目視だけでなく、`adb shell content query --uri content://media/external/images/media` で
MediaStore を直接照会して行った。各試行の前に MediaStore を空にしている。

---

## 合格した項目

| 対応する check | 内容 | 結果 |
|---|---|---|
| check_002 | Android 実機で単体保存が MediaStore に登録される | **合格**（0件 → 1件） |
| check_004 | 生成アプリが `READ_MEDIA_*` / `READ_EXTERNAL_STORAGE` を要求しない | **合格**（`dumpsys package` の requested permissions に1つも無い） |
| check_007 | 一括保存で全件が保存される | **合格**（46枚、約60秒） |
| check_015 | 認可 API が招待に属する画像だけを返す | **合格**（`POST /api/native/manifest 200`、46枚を1リクエストで解決） |
| check_016 | ネイティブが web から URL を受け取らない | **合格**（マニフェスト呼び出しは単体1回・一括1回のみ） |
| check_021 | ディープリンクでアプリが起動する | **合格**（`photogallery://gallery/{token}`。https の App Links は未検証） |
| — | ネイティブ検出（UI 分岐） | **合格**（説明文が「保存ボタンで端末の写真アプリに直接保存」に、ヘッダーが「すべて保存」に、共有ボタンが非表示に） |
| — | 権限なしでの MediaStore 書き込み | **合格**（Android 10 以降のスコープドストレージ。権限ダイアログは出ない） |
| check_016(UI) | 進捗表示 | **合格**（「8 / 46」「17%」と進捗バー、警告文、キャンセルボタン） |

## この検証で見つけて直した不具合

### 1. 保存されるファイル名が Firestore のドキュメントID

写真アプリに `bgIVseNkms1ol613Qwy0.jpg` のような名前で並んでいた。
原因は `storagePath`（`images/{uid}/1786861045375-0ubf6g`）にも URL にも拡張子が無く、
`manifestService.filenameFor` が `imageId` にフォールバックしていたこと。

`title`（アップロード時の元ファイル名）を優先するよう変更。
`DSC05695.jpg` のように元の撮影ファイル名で保存されることを実機で確認した。
native 側の `validate.ts` はパス区切りを含む名前を拒否するため、サーバー側で無害化している。

### 2. 進捗モーダルの上部が画面外に切れる

タイトルと「8 / 46」の件数が見えなかった。

**原因は本計画の変更ではなく、既存の構造にあった。**
`Header` が `backdrop-blur-md`（= `backdrop-filter`）を持っており、
`backdrop-filter` が付いた要素はその子孫の `position: fixed` に対する**包含ブロックになる**。
進捗モーダルは `BulkDownloadButton` 経由で Header の中に描画されるため、
画面全体ではなくヘッダーの高さ（64px）を基準に配置されていた。
ブラウザでも同じ条件で起きる（ZIP ダウンロードの進捗モーダルも同様）。

`ModalPortal`（`createPortal` で `document.body` 直下に描画）を追加して解消。
`DownloadProgressModal` と `NativeSaveNotice` の両方に適用した。

### 3. 単体保存に完了・失敗のフィードバックが無い

`NativeSaveNotice` を `BulkDownloadButton` とお気に入りページからしか描画しておらず、
ライトボックスの保存ボタンは結果を受け取っても何も表示していなかった。
**保存が失敗しても利用者に何も伝わらない状態**だった。

`DownloadButton` からも通知を描画するよう変更。「写真に保存しました」のトーストが出ることを実機で確認した。

---

## 未検証の項目

| check | 内容 | 理由 |
|---|---|---|
| check_001 / 003 / 005 | iOS 実機での保存と権限ダイアログ | Xcode 26.2 に対応する iOS プラットフォームコンポーネントが未インストール |
| check_008 | 空き容量不足時の挙動 | エミュレータで容量を枯渇させる手順を用意していない |
| check_009 | セルラー通信時の警告 | エミュレータでの再現手順が未整備 |
| check_010 | 一括保存のキャンセル | 未実施 |
| check_011 | バックグラウンド移行時の中断 | 未実施 |
| check_020 | WebView プロセスのクラッシュ復帰 | 未実施 |
| check_022 | `/liked?token=` のディープリンク | 未実施 |
| check_023 | アプリ未インストール時のフォールバック | https の App Links 未設定のため未実施 |
| check_031 / 032 | アクセシビリティ（TalkBack） | 未実施 |
| check_027 | hydration 警告 | **既存の警告が1件残っている**。`gallery/[token]/page.tsx:46` の読み込み中スケルトンが `Math.random()` を `style` に使っているため。本計画の変更とは無関係 |

## 補足

- 実機（物理端末）ではなくエミュレータでの検証である。カメラロールへの実際の見え方や
  機種固有の挙動は確認できていない。
- https のユニバーサルリンク / App Links は、Team ID と署名鍵の SHA-256 が未取得のため設定していない。
  詳細は `deeplink-setup.md`。

---

# 2. Android 実機（Samsung Galaxy SCG21）

端末: Samsung SCG21 / Android 16 / API 36（`R5CW50HPH3Y`）
接続: USB。`adb reverse` で端末の `localhost:3002` を Mac の web 開発サーバーへ転送
`mobile/.env`: `EXPO_PUBLIC_WEB_ORIGIN=http://localhost:3002`

## 結果

| 項目 | 結果 |
|---|---|
| ネイティブ検出 | 合格（ヘッダーが「すべて保存」、共有ボタン非表示） |
| ディープリンク（カスタムスキーム） | 合格 |
| 単体保存 | 合格 |
| 一括保存46枚 | 合格。**8秒で30枚、全体で約20秒**（エミュレータは60秒。実機のほうが約3倍速い） |
| **保存先** | **`DCIM/`** — Android 標準のカメラロール。Galaxy の「ギャラリー」と Google フォトに表示される |
| ファイル名 | `DSC05695.jpg` `DSC07636.jpg` など元の撮影ファイル名 |
| ファイルサイズ | 2MB前後。原本のまま |
| 要求権限 | 合格。`READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` / `READ_EXTERNAL_STORAGE` を1つも要求しない（`dumpsys package` で確認） |
| 権限ダイアログ | **出ない**（Android 10 以降のスコープドストレージで MediaStore に書けるため） |

判定は `adb shell content query --uri content://media/external/images/media` で MediaStore を直接照会。
`date_added` で今回保存した分だけを抽出して数えた。

## 実機で新たに分かったこと

**保存先が `DCIM/` 直下である。** エミュレータでは MediaStore への登録しか見ていなかった。
`DCIM/` はカメラで撮った写真と同じ場所なので、クライアントの写真一覧に自然に混ざる。
納品分だけをアルバムに分けたい場合はフォトライブラリのフル権限が必要になり、
現在の「追加のみ」の方針を崩すことになる（任意タスク task_019）。

## 補足

検証の過程で同じ写真を複数回保存したため、端末には重複が残っている（46枚 + 重複7枚 = 53枚）。
不要であれば端末側で削除する。

---

# 3. 実機検証後に直したもの

## hydration 警告（既存の不具合）

`web/src/app/(gallery)/gallery/[token]/page.tsx` の読み込み中スケルトンが
`style={{ height: `${200 + Math.random() * 200}px` }}` を使っており、
サーバーで生成した HTML とクライアントの再描画で値が食い違って必ず警告が出ていた。
本計画の変更とは無関係の既存の問題。

固定値の配列（`SKELETON_HEIGHTS`）に置き換えて解消。
見た目の目的は「高さがばらついて写真らしく見えること」だけなので固定値で足りる。
この修正で web の lint エラーは 16件から15件に減った。

---

# 4. iOS 実機（iPhone 16 Pro Max / iOS 26.6）

端末: `憲孝のiPhone` / iOS 26.6 / UDID `00008140-00111C222893C01C`
ビルド: EAS Build の `preview` プロファイル（Ad Hoc 内部配布）。詳細は `eas-build-setup.md`
web: `https://photo-gallery-native-test.vercel.app`（Vercel のプレビュー。本番には触れていない）
招待: `7AA53aP_hAqR-x3qXEqY7`（46枚、有効期限 2026-09-15）

インストールは USB 経由で行った（`xcrun devicectl device install app`）。
Expo の配布ページを Safari で開く手順より速く、プロファイルの信頼操作も不要になる。

## Android では出ず、iOS で初めて出た不具合 3件

**3件とも Jest のテストは通っていた。** テストは Node 上で走るため、実機のランタイム差と
ライブラリ内部の挙動が再現されないことが共通の原因である。3件とも、その差を再現する
テストを追加した（mobile のテストは 40件 → 55件）。

### 1. カスタムスキームのディープリンクが解決できない

`photogallery://gallery/<token>` を開いてもギャラリーが表示されない。

React Native の `URL` は正規表現による簡易実装で（`react-native/Libraries/Blob/URL.js`）、
`host` / `pathname` / `origin` のいずれも **`https?://` にしかマッチしない**。
カスタムスキームを渡すと例外を投げないまま `host=''`、`pathname='/'` になるため、
トークンを取り出せず `resolveDeepLink` が null を返していた。

`resolveInitialUrl.ts` でカスタムスキームを `URL` に解釈させるのをやめ、
文字列として `/gallery/<token>` を切り出す形に変更。Node でも React Native でも同じ結果になる。
テストでは `URL` を実機と同じ簡易実装に差し替えて検証している。

### 2. 自分のギャラリーが「外部サイト」と判定される（白画面の主因）

アプリが白いまま、同じページが Safari で開く。

`originWhitelist` に `` `${WEB_ORIGIN}/*` `` を渡していた。react-native-webview はこの値を
**オリジンだけ**（`https://host`。末尾スラッシュもパスも無い）に対して照合するため、
`^https://host/.*` という正規表現になり決して一致しない。一致しない URL はライブラリが
自分で `Linking.openURL` に渡すので、**こちらの `onShouldStartLoadWithRequest` は呼ばれない**。

Android で発症しなかったのは、Android の WebView が初回ロードで
`shouldOverrideUrlLoading` を通さず、この照合自体が起きないため。

### 3. iframe ひとつでアプリがブラウザに奪われる

ページを開くたびに Safari へ切り替わる。開いていたのは
`https://vercel.live/_next-live/feedback/feedback.html` で、**Vercel のプレビュー用
ツールバーが読み込む iframe** だった。Firebase 認証の iframe でも同じことが起きる。

アプリが背面に回ると WebView の JavaScript が止まるため、写真一覧の取得も完了しなかった
（サーバーログで `/api/image` が1件も記録されないことで確認）。

`isTopFrame` で判定し、**iframe は外部ブラウザへ回さずその場で止める**ようにした。
`navigationType` は Android で常に `other` になるため、この用途には使えない。
あわせて `originWhitelist` を `['https://*', 'http://*']` に緩め、可否の判断を
すべて自前の `decideNavigation` に集約した。ライブラリに横取りされると制御できないため。

## 合格した項目

判定は端末画面に出した計測表示と、Vercel のランタイムログで行った。

| 内容 | 結果 |
|---|---|
| ディープリンクでギャラリーが開く | 合格（`photogallery://gallery/<token>`） |
| ページの JavaScript が動作する | 合格（`boot rs=loading ua=ok`） |
| ネイティブ検出（User-Agent の印） | 合格（`ua=ok`） |
| 写真の描画 | 合格（`img=40`、`rs=complete`） |
| UI 分岐 | 合格（ヘッダーが「すべて保存」。ZIP ではない） |
| 第三者 iframe の遮断 | 合格（`vercel.live` と Firebase 認証の iframe が `block`） |

Firebase 認証の iframe を遮断してもギャラリーは表示される。この iframe は
匿名認証と Firestore の読み取りには不要である。

## 未検証（次に確認する）

| 内容 | 対応する check |
|---|---|
| 単体保存とフォトライブラリへの登録 | check_001 |
| 権限ダイアログが「追加のみ」であること | check_003 / check_005 |
| 保存されるファイル名が元の撮影ファイル名であること | — |
| 一括保存46枚と進捗表示 | check_007 |

## 検証用に入れたもの（削除が必要）

保存の確認が終わったら、次の3つを外したビルドを作る。

- `GalleryWebView.tsx` の `DEBUG_NAVIGATION` と黒い帯の表示、`onLoadStart` などの計測
- `GalleryWebView.tsx` の `webviewDebuggingEnabled`
- `bridge/inject.ts` の `DEBUG_PAGE_REPORTER` と `PAGE_REPORTER_SNIPPET`
- `web/src/app/layout.tsx` に入れた計測用の `<script>`（これは効果が無かった。
  Vercel は存在しないパスへの 404 をランタイムログに残さないため）

---

# 5. ユニバーサルリンク（2026-08-17）

配信ドメインを `gallery.non-turn.com` に確定し、招待リンクをタップするだけで
アプリが開く状態にした。iPhone 16 Pro Max（iOS 26.6）で動作を確認済み。

## 構成

| 項目 | 値 |
|---|---|
| 配信ドメイン | `gallery.non-turn.com` |
| DNS | `non-turn.com` のゾーンに CNAME を1件追加（`gallery` → `cname.vercel-dns.com`） |
| ネームサーバー | `ns-rs1.gmoserver.jp` / `ns-rs2.gmoserver.jp` |
| Apple Team ID | `2WWB6ZA7A9` |
| 対象パス | `/gallery/*` と `/liked?token=*` |

`non-turn.com` 本体（`76.76.21.21`）とメール（`mail89.onamae.ne.jp`）には触れていない。
サブドメインを1件足しただけである。

## 詰まった点

**`apple-app-site-association` が `application/octet-stream` で配信されていた。**
このファイルは拡張子を持たないため、Next.js の既定ではそうなる。Apple はこれを
受け付けないので、`web/next.config.ts` の `headers()` で `application/json` を明示した。
**対処しなければユニバーサルリンクは動かなかった。**

**アプリを入れ直すまで Safari で開いていた。** iOS はアプリのインストール時に
ドメインとの結びつきを取得する。初回インストールの時点では Apple の CDN が
まだ設定ファイルを保持していなかったため、結びつきが空のままだった。
アンインストールして入れ直すと解決した。

サーバー側が正しいかどうかは、Apple の CDN に直接問い合わせて確認できる。

```
curl https://app-site-association.cdn-apple.com/a/v1/gallery.non-turn.com
```

ここに期待した内容が返っていれば、残りの原因は端末側に絞れる。

## 切り替えた設定

- 管理画面の `NEXT_PUBLIC_WEB_URL` を `https://gallery.non-turn.com` に変更（Vercel の環境変数と `admin/.env.local` の両方）。**以後に発行する招待リンクは自社ドメインになる**
- アプリの `EXPO_PUBLIC_WEB_ORIGIN`、`app.config.ts` と `src/config.ts` の既定値、
  `eas.json` の preview プロファイルを新ドメインへ変更
- 配布済みの旧ドメインのリンクも引き続き開ける（Vercel が両方のドメインで配信するため）

## 未対応

**Android の App Links は未稼働。** `web/public/.well-known/assetlinks.json` の
`sha256_cert_fingerprints` がプレースホルダのままである。EAS の Android クレデンシャルを
作成すると署名鍵の SHA-256 が判明するので、それを入れれば有効になる。

---

# 6. 無効な招待からの回復（2026-08-22）

端末: iPhone 16 Pro Max / iOS 26.6
ビルド: EAS の preview プロファイル。USB でインストール
web: `https://gallery.non-turn.com`（本番。修正を反映済み）

## 直した欠陥

無効な招待に一度当たると**回復不能な行き止まり**になっていた。
`applyLink` は形式解決だけでトークンを保存し、無効な招待でも web は HTTP 200 と
脱出手段の無いエラーページを返すため、ネイティブ側は正常な表示と区別できなかった。

設計と経緯は `docs/app-store/invalid-link-recovery.md`。

## 実機での結果

| 手順 | 結果 |
|---|---|
| わざと壊れたトークン（末尾2文字を変更）で `photogallery://gallery/<token>` を開く | 「アクセスできません」が表示される |
| アプリを終了し、ホーム画面のアイコンから起動する | **「招待リンクから開いてください」が表示される（合格）** |

**修正前はここで必ずエラー画面へ直行し、二度と入口に戻れなかった。**

## 本番の web で確認した通知の挙動

アプリと同じ条件（ネイティブとして検出される状態）を Playwright/WebKit で再現して確認した。

| 条件 | `invitationInvalid` の送信 |
|---|---|
| 無効なトークン | **1件**（正しいトークンと nonce を伴う） |
| 有効な招待 | **0件** |

## 未実施

- **機内モードで有効な招待を開いてもトークンが破棄されないこと。**
  誤破棄しないことの確認であり、壊れていると電波の悪い場所でトークンが消える。
  自動テスト（`invitationService.test.ts`）では `unavailable` を `denied` にしないことを
  固定しているが、実機での確認は行っていない
- Android 実機での確認（注入遅延と組み合わせた経路）

## 残っていること

トークンを破棄した後に着地するのは、現在の `NoInvitationScreen`（文言のみで入力欄が無い）。
**閉じ込めは解消され、新しいリンクをタップすれば開ける**が、利用者が自力で
リンクを貼り付ける入口は `docs/app-store/` の task_004 で追加する。
