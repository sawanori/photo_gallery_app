# Implementation Plan: App Store 提出（審査通過のための実装）

作成日: 2026-08-21
改訂日: 2026-08-21（Fable 5 / Codex / Gemini の敵対的レビュー3件の指摘を反映した全面改訂。version 2）

**配置場所について**: このリポジトリは案件ごとに `docs/<案件名>/` を作る慣習になっている
（`docs/native-app/`、`docs/admin-upload/`、`docs/app-signin/`）。ルート直下の
`docs/implementation-plan.md` は別件（Firestore ルールのセキュリティ修正）で使用中のため、
本計画は `docs/app-store/` に置く。

**前提となる調査**: `docs/native-app/app-store-submission.md`（審査要件と現状の突き合わせ）。

## 初版からの主な変更（レビューで判明した欠陥）

| # | 欠陥 | 対応 |
|---|---|---|
| 1 | **無効なトークンが保存され、回復不能な行き止まりになる**（初版が見落としていた最重要欠陥） | `task_003` を新設 |
| 2 | **iOS 実機での保存が未検証なのに「回帰」として扱っていた** | `task_005` を新設。check の表記も訂正 |
| 3 | デモトークンが手打ち不能（21文字・大小混在・記号入り） | `task_009` で人間が打てる ID にする |
| 4 | 貼り付け画面の文言が日本語のみ | `task_004` で日英併記にする |
| 5 | `task_006`（旧）の依存が誤り。web 本番デプロイの依存が抜けていた | 依存を修正し `task_008` を新設 |
| 6 | デモトークンをリポジトリにコミットする計画になっていた | `task_013` でプレースホルダのみにする |
| 7 | **`viewingDays` を閲覧の強制境界であるかのように書いていた** | §7 / §10 に非強制であることを明記 |
| 8 | デモ招待を 3650 日有効にする設計 | `task_009` で 180 日に短縮し、審査後に無効化する |
| 9 | **`cd admin && npm run lint` は何も検査していない（終了コード 0 の空検証）** | §13 で `npx eslint src` に置換 |
| 10 | 4.2 の緩和が審査メモの文章のみ | `task_015`（任意・高優先）に保存 UI のネイティブ化を追加 |
| 11 | お気に入り・`/liked` の受け入れ基準がゼロ | check を追加 |
| 12 | `app-signin` のタスク数の記載誤り（14 → 実際は 15） | 訂正 |

---

## 1. Overview

iOS アプリ（`com.nonturn.photogallery`）を App Store に提出し、審査を通すために必要な
コード変更・成果物・手順を定義する。

中心は次の4点である。

1. **レビュアーがアプリの中身に到達できる入口を作る**（Guideline 2.1 対策）
2. **その入口が一度の入力ミスで壊れないようにする**（無効トークンからの回復）
3. **デモ用の招待が審査期間中に失効しないようにする**
4. **審査面を狭め、提出に必須の成果物を揃える**

## 2. Goal

**事業上の目的**: 撮影した写真を、クライアントが自分の iPhone の写真アプリへ確実に保存できる
状態で納品する。ブラウザでは iOS のフォトライブラリへ直接保存できないため、
アプリを App Store 経由で配布できることが納品品質に直結する。

**この計画の目的**: 審査で却下される既知の要因を、提出前にすべて潰すこと。
「確実に通す」ことは保証できない（審査は人間の裁量を含む）が、
**却下されるとしたら Guideline 4.2 の判断のみ**という状態まで持っていく。

## 3. Current State

### アプリの起動経路（2026-08-21 時点）

- `photogallery://gallery/<token>` — 動作する（実機確認済み）
- `https://gallery.non-turn.com/gallery/<token>` — ユニバーサルリンクが動作する
  （実機確認済み。`docs/native-app/device-test-log.md` 第5章）。
  **ただし初回インストール直後は Safari で開き続け、アプリを入れ直して解消した**という
  実績がある。レビュアーの端末で同じことが起きうる
- 過去に開いた招待は `expo-secure-store` に保存され、次回のアイコン起動で再表示される
- **上記のいずれも無い状態でアイコンから起動すると `NoInvitationScreen` で行き止まりになる**

### 無効な招待に到達したときの挙動（**初版が見落としていた欠陥。実測で確認**）

| 事実 | 確認方法 |
|---|---|
| `applyLink` は `resolveDeepLink` が**形式として**解決できた時点でトークンを保存する。招待の有効性は確認しない | `mobile/App.tsx` を読んだ |
| 無効な招待でも web は **HTTP 200** を返し、`ExpiredLink` ページを描画する | 本番の存在しないトークンで `curl` した |
| `ExpiredLink` にはリンクもボタンも**1つも無い** | 該当ファイルを `grep` した（0件） |
| `GalleryWebView` が `hasError` を立てるのは `onError` と `onHttpError >= 500` のときだけ | 該当ファイルを読んだ |

**帰結**: トークンを1文字打ち間違えても、文字種が合っていれば「解決成功」として**保存される**。
以後アイコン起動のたびに脱出手段の無いエラーページへ直行し、貼り付け画面には二度と戻れない。
**潰したはずの行き止まりが、より悪い形（回復不能）で復活する。**

これはレビュアーだけの問題ではない。**閲覧期限が切れたクライアントも同じ状態に陥る。**

### 閲覧期限の実装（**3か所に重複している**）

招待は `expiresAt` とは別に「作成から7日」の閲覧期限を持つ。7 日が3か所に別々に書かれている。

| 場所 | 用途 |
|---|---|
| `web/src/components/Header.tsx:19` | 画面に表示する期限 |
| `web/src/services/invitationService.ts:72` | `validateInvitation` の判定 |
| `web/src/services/manifestService.ts:29,107` | `isUsable` の判定（ネイティブ保存の認可） |

### 閲覧期限は「強制境界」ではない（**実測で確認。初版の記述は誤解を招くものだった**）

匿名クライアントとして本番に対して確認した結果である。

| 試したこと | 結果 |
|---|---|
| 招待の `viewingDays` / `expiresAt` / `createdAt` を書き換えて期限を延ばす | **すべて拒否**（`permission-denied`） |
| 招待を経由せず `imageId` だけで `images` を単体取得する | **通る**（`allow get: if isAuthenticated()`） |
| 取得した Storage の URL に**認証なしで**アクセスする | **HTTP 200。誰でも取得できる**（`storage.rules` が `allow read: if true`） |

**したがって閲覧期限（7日 / `viewingDays`）は表示と便宜のための制御であって、
写真そのものへのアクセスを止める技術的な担保ではない。** 実効的な境界は
`expiresAt` と `isActive`（Firestore ルールの `get` 条件）、および
`/api/native/manifest` の認可だけである。これは以前からの設計で `viewingDays` の追加が
悪化させるものではないが、初版はこれを明記していなかった。

### iOS 実機での検証状況（**初版が「回帰」と誤記していた箇所**）

`docs/native-app/device-test-log.md` 第4章の結論は「**表示まで合格。保存は検証中**」である。

| 項目 | 状態 |
|---|---|
| ギャラリー表示・ネイティブ検出・第三者 iframe 遮断 | 合格（第4章） |
| ユニバーサルリンク | 合格（第5章） |
| **一括保存（46枚）** | ユーザーの報告により**動作を確認**（2026-08-16「全部保存で保存できました」）。ただし device-test-log の未検証表は更新されていない |
| **権限ダイアログの文言** | **未確認** |
| **保存されたファイル名** | **未確認**（LINE 経由の確認は LINE が名前を付け替えるため判定材料にならなかった） |
| **一括保存のキャンセル** | **未実施**（Android を含む全プラットフォームで） |
| **バックグラウンド移行時の中断** | **未実施** |

**審査メモで「キャンセル」を宣伝する計画になっていたが、その機能は一度も検証されていない。**
レビュアーが押して誤動作すれば 2.1 で却下される。

### `mobile/eas.json`

- `preview` プロファイルは `EXPO_PUBLIC_WEB_ORIGIN` を明示している
- **`production` プロファイルには `env` が無い**。`mobile/src/config.ts` の既定値に暗黙で依存している
- `submit.production` が空

### 提出物

プライバシーポリシー、スクリーンショット、説明文、審査メモは**いずれも存在しない**。

### すでに満たしているもの（確認済みの事実）

- `PrivacyInfo.xcprivacy` はビルド済み IPA に含まれている（2026-08-16 に IPA を展開して確認）
- アプリアイコンは 1024×1024・透過なしの PNG（`mobile/assets/icon.png`。2026-08-16 に差し替え済み）
- 解析・広告・トラッキング SDK を使用していない
- アプリ内でのアカウント作成が無いため、Guideline 5.1.1(v)（アカウント削除の義務）は非該当
- サードパーティ / SNS ログインが無いため、Guideline 4.8（Sign in with Apple の義務）は非該当
- `NSPhotoLibraryAddUsageDescription` のみで、読み取り権限を持たない

## 4. Scope

- 閲覧期限を招待ごとに設定できるようにする（`viewingDays`）。3か所の重複を1か所へ集約する
- 管理画面の招待作成に閲覧日数を追加する
- **無効な招待に当たったときに、保存済みトークンを破棄して入口へ戻れるようにする**
- **アプリに「招待リンク／招待コードを貼り付けて開く」入口を追加する**（日英併記）
- **iOS 実機で保存機能をひととおり検証する**
- iOS の提出設定（`supportsTablet: false`、`ITSAppUsesNonExemptEncryption`、表示名、`eas.json`）
- プライバシーポリシーのページ
- web の本番デプロイ
- デモ用プロジェクト／招待の作成（**人間が打てる招待コード**、180日、審査後に無効化）
- 提出前の実地検証スクリプト
- スクリーンショットと審査メモ用の記録動画
- App Store Connect のレコード作成とメタデータ登録

## 5. Non-Scope

- **ID＋合言葉サインインの実装**（`docs/app-signin/`、**15タスク**）。§6 の Assumption 1 で理由を述べる。
  任意タスク `task_016` として残す
- **Android / Google Play への提出**
- `firestore.rules` の変更。**ただし `task_015` の検討対象には含める**（下記 Assumption 8）
- 既存の匿名 UID 単位のお気に入りデータの移行
- アプリ内課金・アカウント作成・トラッキングの追加（**追加すると審査要件が増える**）
- iPad 対応

## 6. Assumptions

1. **レビュアーの入口は「貼り付け」で実装する。ただしレビュー3件の指摘を受けて条件を付ける。**

   3件のレビューはいずれも「貼り付けのみでは 2.1 に対して弱い」と指摘した。
   Gemini は App Store Connect の「サインイン情報」欄をレビュアーが期待することを、
   Codex はアイコンから起動された場合やユニバーサルリンクが Safari で開く場合を、
   Fable は21文字の手打ちが現実的でないことを挙げた。**いずれも妥当である。**

   そのうえで貼り付けを維持するのは、指摘された失敗経路が**個別に潰せる**からである。

   | 指摘された失敗経路 | 対応 |
   |---|---|
   | 21文字のトークンを手で打てない | `task_009` でデモだけ `REVIEW-DEMO-2026` のような**人間が打てる ID** にする |
   | 打ち間違いで行き止まりになる | `task_003` で回復できるようにする |
   | 英語話者が画面を読めない | `task_004` で日英併記にする |
   | リンクをタップすると Safari が開く | 貼り付けという第2の経路がある。加えて `task_011` で操作の記録動画を添付する |
   | 手順が非標準でレビュアーに伝わらない | `task_013` の審査メモを英語で書き、動画を添付する |

   **それでも 2.1 で却下された場合は `task_016`（ID＋合言葉）へ escalate する。**
   その場合は審査が1周分（数日）遅れる。**この判断はユーザーが変更してよい。**
   最初から `task_016` を実装する選択も合理的である。

2. **`viewingDays` は表示と便宜のための制御であり、写真へのアクセスを止める技術的担保ではない。**
   §3 の実測のとおり、Storage の写真は認証なしで誰でも取得できる。
   契約上の閲覧期限を厳密に切りたい場合は `expiresAt`（Firestore ルールが評価する）を使う。

3. **デモ用の写真は NonTurn 自身のサンプル撮影を使う。**

4. **デモ招待の有効期間は 180 日とし、審査完了後に `isActive: false` にする。**
   初版の 3650 日は、失効しない bearer credential を長期間放置することになり、
   コスト攻撃と `likeCount` の改ざんの標的になる（レビュー3件が一致して指摘）。
   再審査時に再有効化する。

5. **スクリーンショットは実機（iPhone 16 Pro Max / 1320×2868）で撮影する。**

6. **アプリの表示名は `app.config.ts` の `name` を `NonTurn`、App Store 上を「NonTurn Gallery」とする。**
   空きの確認は App Store Connect でしかできない。使用済みだった場合の代替は `task_012` で決める。

7. **プライバシーポリシーは web に `/privacy` として置く。**

8. **`firestore.rules` の既知の弱点は本計画では直さない。** レビューで2件指摘された。
   (a) `invitations` の update は「変更キーが `accessCount` と `lastAccessedAt` だけ」であれば
   **任意の認証済みユーザーが任意の招待に対して**実行できる（トークン＝ドキュメント ID を
   知る必要はあるが、増分の検証をしていないため任意の値に書き換えられる）。
   (b) `likeCountDeltaValid()` は ±1 の変化量しか見ておらず、like ドキュメントとの整合を
   要求しないため、`+1` を繰り返せば `likeCount` を任意に膨らませられる。
   **どちらも審査には影響しないが、デモトークンを外部に出す前に (b) は塞ぐ価値がある。**
   別計画の課題として `docs/task-list.json` に追記する。

9. **`viewingDays` を持たない既存の招待は、これまでどおり7日で扱う。**

## 7. Architecture Impact

**フロントエンド（web）**: 閲覧期限の判定・表示を共有モジュールに集約する。
**無効な招待に当たったことをネイティブへ通知する**（既存のブリッジに1種類追加）。
プライバシーポリシーのページが1枚増える。

**フロントエンド（admin）**: 招待作成フォームに入力が1つ増える。詳細に閲覧期限を表示する。

**フロントエンド（mobile）**: 起動時の分岐に貼り付け画面を追加する。
**web から「この招待は無効」という通知を受けたら、保存済みトークンを破棄して入口に戻す。**

**バックエンド**: 変更なし。新しい API は追加しない。

**データベース**: `invitations` に任意フィールド `viewingDays` が増える。
インデックスの追加は不要。**Firestore ルールの変更は不要**（ルールは `viewingDays` を評価しない。
これは「クライアントが自分で延長できない」ことと同時に「期限が強制されない」ことも意味する。
Assumption 2 を参照）。

**ブリッジ**: `web → native` に `invitationInvalid` を1種類追加する。
既存の `saveImage` / `saveImages` / `cancelSave` / `openSettings` と同じ形式に揃える。
**web は即時デプロイされ、アプリの更新は遅れる**ため、古いアプリがこのメッセージを
受け取っても無視するだけで壊れないこと（`handleMessage` の既存の未知メッセージ処理）を確認する。

## 8. UI Plan

### アプリ: 招待を開く画面（新規 `mobile/src/screens/OpenByLinkScreen.tsx`）

`NoInvitationScreen` を置き換える。**日英併記**にする（レビュアーが日本語話者とは限らない）。

- 見出し「ギャラリーを開く / Open your gallery」
- 説明「撮影担当者からお送りしたリンクまたは招待コードを入力してください。/
  Paste the link or enter the invitation code you received.」
- 複数行の入力欄（`autoCapitalize="none"`、`autoCorrect={false}`、`keyboardType="url"`）
- 「開く / Open」ボタン。入力が空のときは無効
- `KeyboardAvoidingView` で入力欄がキーボードに隠れないようにする
- エラー（状態別・日英併記）
  - 空 → 「リンクまたはコードを入力してください / Enter a link or code」
  - 解決できない → 「このリンクは開けません / This link cannot be opened」
- 画面下部に小さく「リンクをタップしても開けます / Tapping the link also works」

**受け付ける入力**（`normalizeInvitationInput` で正規化してから `resolveDeepLink` に渡す）

1. `https://gallery.non-turn.com/gallery/<token>`
2. `photogallery://gallery/<token>`
3. `https://gallery.non-turn.com/liked?token=<token>`
4. **トークン／招待コードのみ** → `<WEB_ORIGIN>/gallery/<token>` に組み立てる
5. 前後の空白・改行を除去する

**トークンとみなす条件を明確に定める**（初版の「21文字前後」は仕様として未定義だった）。
`^[A-Za-z0-9_-]{8,40}$` とする。下限 8 はデモ用の短い招待コード（`REVIEW-DEMO-2026` は16文字）を
通すため、上限 40 は既存の nanoid 21 文字に余裕を持たせるため。境界値をテストする。

**旧ドメインのリンクは受け付けない。** `resolveDeepLink` が `WEB_ORIGIN` 以外のオリジンを拒否する。

### アプリ: 無効な招待からの回復

web から `invitationInvalid` を受け取ったら、

- `SecureStore` の保存済みトークンを削除する
- 貼り付け画面へ戻す
- 画面上部に「このリンクは無効か、有効期限が切れています /
  This link is invalid or has expired」を表示する

### web: プライバシーポリシー（新規 `web/src/app/privacy/page.tsx`）

静的な1枚。記載する内容は**事実に基づくもののみ**。

- 収集する情報: 匿名認証の識別子、招待へのアクセス回数と日時、選んだ写真（お気に入り）
- 収集しない情報: 利用者に氏名・メールアドレス等の入力を求めていないこと
- **端末の写真の読み取りを行わないこと**
- **写真の URL を知っている者は閲覧期限後もアクセスできること**（§3 の実測に基づく正直な記載）
- 写真の保存先（Firebase / Google Cloud）
- 解析・広告・トラッキングを行わないこと
- 問い合わせ先（NonTurn 合同会社）

## 9. API Plan

**新しいエンドポイントは追加しない。**

`POST /api/native/manifest` の挙動が `viewingDays` の導入で変わる。`isUsable` が
招待の `viewingDays`（未設定なら 7）を見るようになり、長い閲覧期間を持つ招待では
これまで 403 だったものが 200 を返す。その他の応答（400 / 403 / 404 / 429 / 500 と
`Cache-Control: no-store`）は変更しない。

## 10. Database Plan

### `invitations` に任意フィールドを追加

| フィールド | 型 | 既定 | 説明 |
|---|---|---|---|
| `viewingDays` | number（任意） | 未設定＝7 | 招待の作成日からの閲覧可能日数 |

- 既存ドキュメントの一括更新は行わない
- **Firestore ルールの変更は不要**。ただしこれは `viewingDays` が
  **サーバー側で強制されない**ことを意味する（Assumption 2）
- インデックスの追加は不要
- 値の扱い: 1 以上の整数のみ有効。それ以外（0・負数・非数値）は未設定と同じ 7 日として扱う。
  **不正な値で閲覧期限が消える（無期限になる）ことを避けるため、緩く受けずに既定へ倒す**

### デモ招待のドキュメント ID

`createInvitation` は `nanoid` でトークンを生成するため、管理画面からは人間が打てる ID を
作れない。**デモ招待だけ Firebase コンソールから手動でドキュメントを作る**（ID＝`REVIEW-DEMO-2026`）。
必要なフィールドは `task_009` に列挙する。

## 11. File-by-File Plan

| ファイル | 区分 | 目的 | リスク |
|---|---|---|---|
| `web/src/utils/viewingWindow.ts` | 新規 | 閲覧期限の算出を1か所に集約 | 中 |
| `web/src/utils/viewingWindow.test.ts` | 新規 | 既定値・任意値・不正値・境界の検証 | 低 |
| `web/src/services/invitationService.ts` | 変更 | `validateInvitation` が共有モジュールを使う | 中 |
| `web/src/services/manifestService.ts` | 変更 | `isUsable` が共有モジュールを使う | **中〜高**（保存の認可経路） |
| `web/src/services/manifestService.test.ts` | 変更 | `viewingDays` を持つ招待の検証を追加 | 低 |
| `web/src/components/Header.tsx` | 変更 | 表示する期限が共有モジュール由来になる | 低 |
| `web/src/types/index.ts` | 変更 | `Invitation` に `viewingDays?: number` | 低 |
| `web/src/lib/nativeBridge.ts` | 変更 | `notifyInvitationInvalid()` を追加 | 中 |
| `web/src/lib/nativeBridge.test.ts` | 変更 | 通知のテスト | 低 |
| `web/src/components/ExpiredLink.tsx` | 変更 | 表示時にネイティブへ通知する | 中 |
| `web/src/app/privacy/page.tsx` | 新規 | プライバシーポリシー | 低 |
| `admin/src/services/invitationService.ts` | 変更 | `createInvitation` が `viewingDays` を受け取る | 低 |
| `admin/src/services/__tests__/invitationService.test.ts` | 変更 | `viewingDays` の保存を検証 | 低 |
| `admin/src/app/admin/projects/[projectId]/invitations/create/page.tsx` | 変更 | 閲覧日数の入力欄（30日超は確認文言） | 低 |
| `admin/src/app/admin/projects/[projectId]/invitations/[id]/page.tsx` | 変更 | 詳細に閲覧期限を表示 | 低 |
| `mobile/src/bridge/protocol.ts` | 変更 | `invitationInvalid` を追加 | 中 |
| `mobile/src/bridge/handleMessage.ts` | 変更 | 受信時のコールバック | 中 |
| `mobile/src/navigation/resolveInitialUrl.ts` | 変更 | `normalizeInvitationInput()` を追加 | 中 |
| `mobile/src/navigation/resolveInitialUrl.test.ts` | 変更 | 正規化と境界値のテスト | 低 |
| `mobile/src/screens/OpenByLinkScreen.tsx` | 新規 | 貼り付け入口（日英併記） | 中 |
| `mobile/src/screens/NoInvitationScreen.tsx` | 削除 | 役割終了 | 低 |
| `mobile/src/screens/GalleryWebView.tsx` | 変更 | `invitationInvalid` を上位へ伝える | 中 |
| `mobile/App.tsx` | 変更 | 起動分岐、トークン破棄、貼り付け成功時の処理 | **中〜高** |
| `mobile/app.config.ts` | 変更 | `name`、`supportsTablet: false`、`ITSAppUsesNonExemptEncryption` | 低 |
| `mobile/eas.json` | 変更 | `production` の `env`、`submit.production` | 低 |
| `scripts/verify-demo-invitation.mjs` | 新規 | 提出前の実地検証 | 低 |
| `docs/app-store/review-notes.md` | 新規 | 審査メモ（**実トークンは書かない**） | 低 |
| `docs/app-store/screenshots.md` | 新規 | 撮影カットと手順 | 低 |
| `docs/app-store/store-listing.md` | 新規 | 説明文・キーワード等の原稿 | 低 |
| `docs/native-app/device-test-log.md` | 変更 | iOS 保存の検証結果を追記 | 低 |
| `docs/task-list.json` | 変更 | Firestore ルールの既知の弱点2件を課題として追記 | 低 |

## 12. Implementation Order

| # | タスク | 種別 |
|---|---|---|
| 1 | `task_001` 閲覧期限を `viewingDays` で制御（web） | コード |
| 2 | `task_002` 管理画面の閲覧日数（admin） | コード |
| 3 | `task_003` **無効な招待からの回復** | コード |
| 4 | `task_004` **貼り付け入口**（日英併記） | コード |
| 5 | `task_005` **iOS 実機での保存フル検証** | 検証 |
| 6 | `task_006` iOS 提出設定 | 設定 |
| 7 | `task_007` プライバシーポリシー | コード |
| 8 | `task_008` web の本番デプロイ | 運用 |
| 9 | `task_009` デモ用プロジェクトと招待 | 人間 |
| 10 | `task_010` 提出前の実地検証スクリプト | コード |
| 11 | `task_011` スクリーンショットと記録動画 | 人間 |
| 12 | `task_012` App Store Connect の登録 | 人間 |
| 13 | `task_013` 審査メモ | 文書 |
| 14 | `task_014` production ビルドと提出 | 提出 |
| 15 | `task_015` [任意・高優先] 保存 UI のネイティブ化（4.2 緩和） | コード |
| 16 | `task_016` [任意] ID＋合言葉サインイン | コード |
| 17 | `task_017` [任意] 却下時のフォールバック | 判断 |

## 13. Verification Commands

リポジトリに実在し、**実際に検査が動くもの**だけを挙げる。

**web**
```
cd web && npm run lint
cd web && npm test
cd web && npm run build
```

**admin**
```
cd admin && npx eslint src
cd admin && npx vitest run
cd admin && npm run build
```

**`cd admin && npm run lint` は使わない。** `package.json` の lint は `next lint` だが、
新しい Next.js では `next lint` が廃止されており、`lint` がディレクトリ名として解釈される。
エラーメッセージを出しながら**終了コード 0 を返す**ため、通っても何も保証しない。

```
> next lint
Invalid project directory provided, no such directory: .../admin/lint
exit=0
```

初版はこれを検証コマンドとして挙げていた。リポジトリの既知の課題でもある
（`docs/task-list.json` の task_011「admin の lint / test スクリプトを修復する」が未着手）。

**mobile**
```
cd mobile && npm run typecheck
cd mobile && npm test
cd mobile && npx expo config --type public
```

**ビルドと提出**
```
cd mobile && npx eas-cli build --platform ios --profile production
cd mobile && npx eas-cli submit --platform ios
```
`eas-cli` はローカルに導入していないため `npx` が毎回取得する（実行時に
「Proceeding with outdated version」と出るのはこのため）。

**注意**: web の lint はベースラインで 7 errors / 5 warnings が出る（本計画と無関係の既存指摘）。
admin の `npx eslint src` は 0 errors / 1 warning。いずれも件数を増やさないことを基準とする。

## 14. Acceptance Criteria

1. アイコンから起動し、リンクも保存済みトークンも無い状態で貼り付け画面が出る
2. デモ用の招待コード／リンクを入力するとギャラリーが開く
3. **無効なトークンを入力した後にアプリを再起動しても、貼り付け画面に戻れる**
4. 前後に空白や改行があっても、トークンのみでも開く
5. 別オリジンの URL では開かず、エラー文言が出る
6. 招待リンクをタップして開く経路（ユニバーサルリンク）が従来どおり動作する
7. **iOS 実機で単体保存・一括保存・キャンセルが動作し、権限ダイアログが「写真の追加のみ」を求める**
8. `viewingDays` が長い招待が、作成から7日を過ぎても閲覧でき、写真を保存できる
9. `viewingDays` を持たない既存の招待が、これまでどおり7日で閲覧できなくなる
10. 管理画面で閲覧日数を指定して招待を作成でき、詳細画面で確認できる
11. `https://gallery.non-turn.com/privacy` が 200 で表示される
12. `/liked?token=` の経路が従来どおり動作し、お気に入りが機能する
13. ビルドした IPA が iPad 対応を宣言していない
14. **提出前の検証スクリプトがデモ招待の到達性を確認して合格する**
15. すべての検証コマンドが通る（既存のベースラインを超えない）

## 15. Repair Loop

1. 検証コマンドを実行する
2. エラー出力をそのまま記録する
3. エラーを task_id に対応付ける
4. 関係するファイルだけを修正する
5. 検証コマンドを再実行する
6. 実装が計画と食い違ったら、この計画書を更新してから進める

**テストを通すためにテストを緩めない。**

**実機でしか出ない差に注意する。** 2026-08-16 の iOS 検証で、Jest（Node 上）を通るのに
実機で失敗する不具合が3件出ている（`device-test-log.md` 第4章）。原因は React Native の
`URL` が正規表現による簡易実装であること、および `react-native-webview` の内部挙動だった。
`task_004` は `resolveDeepLink` を触るため、**`URL` の挙動に依存する変更を入れないこと**。
文字列処理で完結させる。

**「動くはず」で済ませない。** `task_005` を独立タスクにしたのは、
初版が iOS の保存を検証済みであるかのように扱っていたためである。
審査メモで宣伝する機能は、宣伝する前に実機で動かすこと。

**却下された場合は `app-store-submission.md` §5 に戻る。**
2.1 系なら本計画の実装漏れなので修正して再提出する。
その理由が「デモに到達できない」であれば `task_016`（ID＋合言葉）へ escalate する。
4.2 系なら実装では解決しないため、配布形態の判断に移る。
**Unlisted App Distribution も審査基準は通常審査と同一であり、4.2 の免除ではない**
（初版はこれを楽観的に書いていた）。
