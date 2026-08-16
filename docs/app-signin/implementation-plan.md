# Implementation Plan: アプリのID＋合言葉サインイン（全面改訂版）

作成日: 2026-08-16
改訂日: 2026-08-16（敵対的レビュー3件の指摘と、確定した設計判断A〜Hに基づく全面書き直し）

**配置場所について**: このリポジトリは `docs/native-app/`・`docs/admin-upload/` のように案件ごとに
ディレクトリを分ける慣習になっている。ルート直下の `docs/implementation-plan.md` は
別件（Firestore ルールのセキュリティ修正）で使用中のため、本計画は `docs/app-signin/` に置く。

**旧版からの主な設計変更（要約）**: Firebase Admin SDK は導入しない。合言葉のハッシュは
どこにも保存せず、ID と合言葉から計算した値そのものを Firestore のドキュメント ID として使う。
ロックアウト機構は全廃する。レート制限はインスタンス内メモリではなく Firestore 上に持つ。
再発行と無効化を区別する。詳細は各章に記す。

---

## 1. Overview

ネイティブアプリ（`/mobile`）の起動時に、招待ごとに発行した **ID と合言葉** を入力すると
ギャラリーが開くようにする。入力値はサーバーで検証し、既存の招待トークンに変換して
WebView に `/gallery/{token}` を読み込ませる。

**既存のリンク方式は残す。** ID／合言葉は「アプリを入れた人向けの、確実に開ける入口」を
追加するものであり、置き換えではない。

**検証方式の核心**: 合言葉のハッシュを Firestore に保存しない。代わりに
`credentialKey = base64url(PBKDF2-SHA256(normalize(signInId) + ':' + normalize(passphrase), 固定ソルト文字列, 210000回, 32バイト))`
を計算し、これを `invitationCredentials` コレクションの**ドキュメント ID そのもの**として使う。
ID と合言葉の両方を知らない限りこのドキュメント ID を計算できないため `get` できず、
`list` はルールで禁止するため存在確認すら不可能になる。保存されたハッシュが無いので、
Firestore のデータが将来何らかの経路で漏れても、オフラインで総当たりする対象そのものが存在しない。

## 2. Goal

**利用者の目的**: 招待リンクがメールソフトや LINE のアプリ内ブラウザに横取りされても、
アプリに2つの文字列を入力するだけで自分のギャラリーを開ける。

**事業上の目的**: 納品先の環境（メールクライアント、OS、ブラウザ）に依存せずに
写真を届けられるようにし、「リンクが開けない」という問い合わせを無くす。

**この機能の位置づけ（重要）**: 本機能は**配信互換性の改善であって、秘匿性の改善ではない**。
ID と合言葉は結局、招待リンクと同じ経路（メール・LINE）でクライアントに伝えることになる。
盗聴・誤送信のリスクは招待リンクを送るときと変わらない。本機能が解決するのは
「アプリ内ブラウザにリンクを横取りされて開けない」という一点だけであり、
「リンクより安全になる」という説明はしない。

## 未解決の前提条件（本機能をリリースする前にユーザーが判断すること）

`firestore.rules:68-77` の `invitations` コレクションは次のルールになっている。

```
match /invitations/{invitationId} {
  allow read: if isAuthenticated();
  ...
}
```

`allow read` は `get` と `list` の両方を含む。web は匿名認証（`signInAnonymously`）を使っており、
公開 API キーで誰でも匿名サインインできるため、**匿名認証さえ通れば誰でも
`getDocs(collection(db,'invitations'))` を実行して全招待ドキュメントを列挙し、
`token`（招待の実質的なアクセス鍵）・`clientName`・`clientEmail` を平文で収穫できる**。

この事実は、本セッションで `docs/implementation-plan.md`（ルート直下、別計画）と
`docs/native-app/prerequisite-status.md` を実際に読んで確認した。後者には
「task_001 `images`/`likes` の read を get/list に分離」「task_002 招待トークンをドキュメント ID にし
`invitations` の list を管理者のみに」がいずれも**未完了**と記録されている（確認日 2026-08-16）。

**この穴が塞がれない限り、本機能に秘匿性の向上は無い。** `invitationCredentials` をどれだけ
堅く守っても、そこで得られる `token` の値自体が別の経路（`invitations` の list）で
誰にでも読める状態のままだからである。ID と合言葉が「アプリ内ブラウザ対策」以上の意味を
持つと利用者に説明することはできない。

**ユーザーの判断事項（2択）**:

- **(a) 推奨。** 別計画（`docs/implementation-plan.md` の task_001 / task_002）を先に実施し、
  `invitations` の `list` を管理者のみに制限してから本機能をリリースする。
- **(b)** 本機能を「利便性の改善」とだけ位置づけて先行リリースし、秘匿性が向上したとは
  主張しない。この場合、本計画の受け入れ基準のうち `invitations` の list 禁止に関する項目
  （後述 acceptance-checks.json の check_022）は**未達のまま**であることを明示的に記録する。

決定はユーザーが行う。本計画は (a)/(b) いずれの順序でも実装できる形で書くが、
実装着手前にどちらを選ぶかを確定させること。

## 3. Current State

### 現在の入口

アプリは招待リンクの受け皿として作られており、単体の入口を意図的に持たない
（`mobile/src/screens/NoInvitationScreen.tsx` のコメントに明記されている）。

- `photogallery://gallery/<token>` — カスタムスキーム。**動作する**（2026-08-16 に修正・実機確認済み）
- `https://<domain>/gallery/<token>` — ユニバーサルリンク。**未稼働**。
  `web/public/.well-known/apple-app-site-association` の `TEAMID` がプレースホルダのまま、
  かつ配信ドメインが未確定（`docs/native-app/decisions.md` D3）
- 過去に開いた招待は `expo-secure-store` に保存され、次回のアイコン起動で再表示される
  （`mobile/App.tsx` の `TOKEN_KEY`）

### 現在の認可

招待トークン（`nanoid(21)`）が bearer credential として機能する。

- `invitations/{docId}` に `token` フィールドがあり、`web/src/services/invitationService.ts` の
  `getInvitationByToken` がコレクションクエリで引く。admin 側にも同名だが別内容の
  `admin/src/services/invitationService.ts` があり、こちらは招待の CRUD と `getGalleryUrl` を持つ
- ネイティブの保存は `POST /api/native/manifest` が認可する。トークンと imageId を受け取り、
  招待の有効性（`isActive` / `expiresAt` / 作成から7日の閲覧期限）と、
  要求された画像がその招待に属するかを検証する（`web/src/services/manifestService.ts` の
  `resolveManifest`。有効性判定は内部関数 `isUsable`（現状 export されていない））
- サーバー側の Firestore アクセスは Firebase クライアント SDK ＋ 匿名認証
  （`web/src/lib/firebaseServer.ts`）。**このファイルの冒頭コメントに「サービスアカウント鍵を
  新たに運用に持ち込まずに済む利点を採った」という既存の設計判断が明記されている。
  本計画はこの方針を維持し、Admin SDK は導入しない**（旧版の Assumption 1 を撤回）
- `web/src/app/api/native/manifest/route.ts` はインスタンス内メモリの `Map` でレート制限している
  （`rateBuckets`）。コメントには「総当たりを鈍らせる目的」とあるが、複数サーバーレスインスタンスに
  分散し、コールドスタートで破棄されるため、実効性は限定的である

### 現在の Firestore ルール（関係する箇所）

`invitationCredentials` コレクションはまだ存在しない。`invitations` のルールは前章のとおり
`allow read: if isAuthenticated();` であり、この計画の対象外（別計画の管轄）。

### テストの配置規約（ワークスペースごとに異なる。旧計画の誤りを修正）

- **web**: テスト専用ディレクトリを持たない。サービスと同じ階層に `*.test.ts` を置く
  （実例: `web/src/services/manifestService.test.ts`。`web/src/services/__tests__/` は存在しない）
- **admin**: `__tests__/` サブディレクトリを使う
  （実例: `admin/src/services/__tests__/invitationService.test.ts`、
  `admin/src/app/admin/projects/[projectId]/invitations/create/__tests__/page.test.tsx`）
- **mobile**: web と同じく同じ階層に `*.test.ts` を置く
  （実例: `mobile/src/navigation/resolveInitialUrl.test.ts`、`mobile/src/save/validate.test.ts`）

旧計画は web にも `__tests__/` を使う前提で書かれており、存在しないパスを `files_to_read` に
挙げていた。本計画のファイル一覧はすべて上記の実際の規約に合わせてある。

### Firestore ルールの記法上の注意（旧計画の誤りを修正）

`allow read: if X` は `get` と `list` の両方を許可する。`allow read: if X; allow list: if false;`
のように後から `list` だけを禁止しようとしても、ルールは OR で評価されるため `list` は
拒否されない（最初の `allow read` が既に `list` を許可している）。本計画で新設する
`invitationCredentials` では、最初から `get` だけを明示的に許可し、`list` に対応する行を
一切書かないことで、default-deny により `list` を拒否する。

## 4. Scope

- `invitationCredentials` コレクションの新設。ドキュメント ID がそのままハッシュ（`credentialKey`）
- `invitations` ドキュメントに `signInId`（平文の ID）と `credentialKey` フィールドを追加
  （管理画面が `invitationCredentials` を読まずに現行 ID を表示・削除できるようにするため）
- `signInRateLimits` コレクションの新設。Firestore 上での IP 単位レート制限（補助的防御）
- Firestore ルールの追加（`invitationCredentials` は `get` のみ許可・`list` 禁止・書き込みは管理者のみ。
  `signInRateLimits` は認証済みなら get/create/update 可、`list` 禁止）
- `web` に検証エンドポイント `POST /api/native/signin` を追加（Firebase クライアント SDK ＋
  匿名認証。既存の `firebaseServer.ts` と同じ方式で、Admin SDK は使わない）
- 合言葉の鍵導出ロジック（PBKDF2-SHA256）を web（Node `crypto`）と admin（ブラウザ `crypto.subtle`）
  の両方に実装し、**既知の入出力ペア（テストベクタ）で両実装が同じ結果になることを検証する**
- 管理画面に ID と合言葉の発行・再発行・**無効化**（新設、E参照）の UI を追加
- アプリにサインイン画面を追加し、`NoInvitationScreen` の役割を置き換える
- アプリ側で、紛らわしい文字（`0`/`1`/`i`/`l`/`o`）の入力を送信前に検出して案内する
- 保存済みトークンがある場合にサインイン画面をスキップする起動分岐に、自動テストを追加する
- 運用メモ（合言葉の伝達手段、ID紛失時の再確認手順、admin と app のギャラリーURL設定の非連動）を
  `docs/native-app/decisions.md` に記録する

## 5. Non-Scope

- **ブラウザ（`/web`）側のサインイン画面**。今回はアプリのみ。ブラウザは従来どおり
  招待リンクで開く（`task_015` として任意タスクに切り出す）
- **Firebase Authentication の Email/Password 認証**への移行。匿名認証＋招待トークン前提の
  Firestore ルールを全面的に書き直すことになるため採らない
- **Firebase Admin SDK の導入**。設計判断Aにより、ハッシュを保存しない方式で不要にした
- **ロックアウト機構**。設計判断Cにより全廃する（理由は Assumptions 章に記す）
- **クライアント自身による合言葉の変更・再設定**。再発行・無効化は管理者が行う
- **ユニバーサルリンクの有効化**。別作業（`docs/native-app/` の task_010）
- **既存の招待への一括自動発行**。発行は招待ごとに管理画面の操作で行う。ただし
  「発行操作自体は既存の（作成済みの）招待に対しても行える」ことは本計画のスコープ内である
  （後付け発行そのものは対応する。自動で全件に発行するバッチ処理は対象外）
- **別計画のセキュリティ修正**（`invitations` の get/list 分離、`likeCount` の改ざん防止など）。
  「未解決の前提条件」章で扱う判断事項であり、実施そのものは別計画の管轄
- **Firestore TTL ポリシーの設定**（`signInRateLimits` の古いドキュメントの自動削除）。
  運用上望ましいが Firebase コンソールでの設定作業であり、本計画のコード変更には含めない

## 6. Assumptions

1. **Admin SDK を導入しない。** サーバーは既存の `firebaseServer.ts`（匿名認証したクライアント SDK）
   をそのまま使う。ハッシュを保存しない設計にしたことで、「サーバーだけが読める」領域を
   作る必要が無くなったため、Admin SDK 導入という既存方針の変更は不要になった。
2. **`credentialKey` の計算式**:
   `base64url(PBKDF2-SHA256(normalize(signInId) + ':' + normalize(passphrase), FIXED_SALT, 210000, 32))`。
   `normalize(v)` は「前後の空白除去 → ハイフンと空白を除去 → 小文字化」を行う関数で、
   `signInId` と `passphrase` の両方に同じ関数を適用する。
3. **`FIXED_SALT` は秘密ではない固定文字列。** ソースコードに直接埋め込む（環境変数にしない）。
   個々の認証情報ごとの乱数ソルトにしない理由: サインイン処理は「ID を先に引いてから合言葉を照合する」
   のではなく、ID と合言葉の両方から直接ドキュメント ID を計算して1回の `get` で終える設計にした
   （ID だけで何らかの事前引き当てをすると、そこが ID の実在判定オラクルになってしまう）。
   このため、個々のレコードごとの乱数ソルトを「先に引く」経路が存在しない。
   **将来 `FIXED_SALT` を変更すると、既存の全認証情報が一斉に無効になる**（ドキュメント ID が
   変わるため）。変更する場合は全招待の再発行運用が必要になることをコード内コメントに明記する。
4. **ハッシュを保存しない設計の安全性の根拠**: `invitationCredentials` のドキュメント本体には
   `{ invitationId, createdAt, createdBy }` のみを置き、秘密情報を一切含めない。ドキュメント ID
   自体が「ID と合言葉の両方を知っている証拠」になっており、`list` を禁止することで
   ID 空間そのものへのアクセスを断つ。Firestore のデータが将来何らかの経路で漏れても、
   オフラインで総当たりできるハッシュ+ソルトの組が存在しない。
5. **文字集合とエントロピー**: ID は8文字、合言葉は12文字。いずれも紛らわしい文字
   （`0`/`1`/`i`/`l`/`o`）を除いた31文字の英数字（`23456789abcdefghjkmnpqrstuvwxyz`）から生成する。
   合言葉は `xxxx-xxxx-xxxx` の形で表示するが、保存・照合時はハイフンを除いて扱う。
   1文字あたり `log2(31) ≈ 4.954` ビットなので、合言葉12文字で約59.5ビット、ID8文字を合わせて
   約99ビットの実効エントロピーになる（本セッションで計算し確認した数値）。
6. **ロックアウトを設けない。** 理由は3つ。
   - 実在する ID だけが特別な応答（旧設計では 429 ロック）を返すと、それ自体が ID の
     実在判定器（列挙オラクル）になる。
   - 攻撃者が意図的に失敗させ続けることで、正規の利用者を永続的に締め出せる（DoS）。
   - 上記5のとおり合言葉とIDを合わせて約99ビットのエントロピーがあり、オンライン総当たりは
     現実的な時間で成功しない。ロックアウトを実装するコストと複雑さに見合わない。
   代わりに、存在しない ID と合言葉違いを常に同じ 401 で返し、応答時間の差も出さない
   （後述 API Plan のとおり、この設計は追加の分岐なしに構造的に達成される）。
7. **レート制限は Firestore 上に持つ、かつ補助的な防御と位置づける。** インスタンス内メモリ
   （`manifest/route.ts` の `rateBuckets` と同じ方式）は Vercel のサーバーレス環境では
   複数インスタンスに分散し、コールドスタートで破棄されるため機能しない。`signInRateLimits`
   コレクションに `FieldValue.increment` 相当の原子的な加算を使う。**この実装は認証済み
   （匿名可）クライアントが直接書き込める設計であるため、悪意のあるクライアントが
   カウンタを直接操作してレート制限を無力化できる、という既知の弱点がある。** 主たる防御は
   あくまで5のエントロピーであり、レート制限は補助（ネットワーク帯域とFirestore読み書きの
   浪費を抑える程度の効果）と位置づける。
8. **再発行と無効化は別の操作であり、別の漏洩シナリオに対応する。**
   - 「合言葉を再発行」: 新しい ID と合言葉を発行し、古い `invitationCredentials` ドキュメントを
     削除する。**招待トークン（`invitations.token`）自体は変更しない。** そのため、
     すでにサインインを済ませてトークンを端末に保存済みの利用者（アプリは SecureStore、
     web は localStorage）は、再発行後もそのままアクセスし続けられる。ID と合言葉が
     漏洩した疑いがあるときに使う。
   - 「アクセスを無効化」: `invitations.token` を新しい値に再生成する。**`signInId` /
     `credentialKey` は変更しない。** 招待リンク自体（カスタムスキーム・ユニバーサルリンク双方）と、
     既にトークンを保存済みの端末（アプリ・ブラウザ問わず）の両方が無効になる。
     招待リンクが漏洩した疑いがあるときに使う。
   この2つは「ID・合言葉の漏洩」と「リンク（トークン）の漏洩」という別々の秘密の漏洩に
   対応する別々の対処であり、どちらか一方で両方をカバーすることはできない。管理画面の
   ボタンにはこの違いが伝わる文言を付ける（UI Plan 参照）。
9. **`invitations` に `signInId`（平文）と `credentialKey` を追加する。** 旧計画は
   「`invitations` は変更しない」としていたが、これは撤回する。管理画面が現行 ID を
   表示し、再発行時に古い認証情報ドキュメントを削除できるようにするには、
   `invitationCredentials`（read が `get` のみで `list` 不可）を読まずに済む経路が要る。
   `signInId` と `credentialKey` はどちらも単独では秘密ではない（合言葉が無ければ
   サインインできない）ため、`invitations` の既存の読み取りルール（`allow read: if isAuthenticated();`。
   前章「未解決の前提条件」の対象そのもの）の下に置いても、新たに増える機密性のリスクは無い。
10. **アプリの言語は日本語のみ。**
11. **運用メモ（コードでは強制できない、記録のみ）**:
    - 合言葉は ID と同じ経路（同じメール・同じ LINE メッセージ）で送らず、可能であれば
      別チャネル（例: ID をメール、合言葉を SMS）で伝えることを推奨する。ただし本機能自体は
      これを強制する仕組みを持たない（Goal 章のとおり秘匿性の主張はしていない）。
    - 管理画面が表示するギャラリー URL（`admin/src/services/invitationService.ts` の
      `getGalleryUrl`、`NEXT_PUBLIC_WEB_URL` に依存）と、アプリが実際に開くオリジン
      （`mobile/src/config.ts` の `WEB_ORIGIN`、`EXPO_PUBLIC_WEB_ORIGIN` に依存）は
      **別々の環境変数で管理されている**。どちらか一方だけを変更するとリンクとアプリの
      挙動が食い違う。デプロイ時にこの2つを揃えて更新することを運用手順に残す。

## 7. Architecture Impact

**フロントエンド（mobile）**: 起動時の分岐に「サインイン画面」を追加する。
`App.tsx` は現在 `sourceUrl` の有無で `GalleryWebView` と `NoInvitationScreen` を出し分けている。
判定ロジックを `mobile/src/navigation/launchDecision.ts` の純関数に切り出し、
「リンクも保存済みトークンも無い場合にサインイン画面を出す」分岐をテスト可能にする。

**フロントエンド（admin）**: 招待の作成完了時と詳細画面に、ID と合言葉の表示・再発行・
無効化を追加する。招待の CRUD を持つ `admin/src/services/invitationService.ts` を拡張する。

**バックエンド（web の Route Handler）**: `POST /api/native/signin` を追加。
既存の `/api/native/manifest` と同じ場所・同じ応答方針（`Cache-Control: no-store`、
状態を漏らさないエラーコード）に揃える。Admin SDK は使わず、`firebaseServer.ts` と同じ
匿名認証済みクライアント SDK を使う。

**データベース**: `invitationCredentials`・`signInRateLimits` を新設。`invitations` に
`signInId`・`credentialKey` の2フィールドを追加する（ルール変更は不要。既存の
`allow create/update: if isAdmin() || ...` が新フィールドの書き込みもそのままカバーする）。

**認証**: 招待トークンの立場は変わらない。ID／合言葉はトークンを取り出すための
入口が1つ増えるだけで、トークンより強い権限は持たない。

**インフラ**: **Vercel の環境変数変更は不要。** Admin SDK を導入しないため、サービスアカウント鍵を
新たに登録する必要が無い。`FIXED_SALT` はソースコードの定数であり、環境変数ではない。

## 8. UI Plan

### アプリ: サインイン画面（新規 `mobile/src/screens/SignInScreen.tsx`）

- 見出し「ギャラリーを開く」
- 説明文「撮影担当者からお伝えした ID と合言葉を入力してください。」
- 入力欄2つ。ID は `autoCapitalize="none"`・`autoCorrect={false}`、
  合言葉も同様。どちらも `keyboardType="ascii-capable"`
- 合言葉はハイフン区切りで入力しても通るよう、送信前にハイフンと空白を除去する
- **送信前に、許可文字集合（`23456789abcdefghjkmnpqrstuvwxyz`）に含まれない文字
  （`0`/`1`/`i`/`l`/`o`・大文字・記号など）が入っていないかを検査する。含まれていれば
  ネットワーク送信前に「入力できない文字が含まれています」と表示し、送信しない。**
- 「開く」ボタン。送信中は無効化し `ActivityIndicator` を出す
- エラー表示（状態別。**ロック中の文言は廃止**）:
  - 入力が空 → 「ID と合言葉を入力してください」
  - 許可されない文字を含む → 「入力できない文字が含まれています」（送信前チェック。上記）
  - 認証失敗（401） → 「ID または合言葉が違います」（どちらが違うかは示さない）
  - レート制限（429） → 「アクセスが集中しています。しばらく待ってからお試しください」
  - 招待が無効・期限切れ（403） → 「この招待は現在ご利用いただけません。撮影担当者にお問い合わせください」
  - 通信失敗・タイムアウト → 「通信に失敗しました。電波状況をご確認ください」
- 画面下部に小さく「招待リンクをお持ちの場合は、リンクをタップしても開けます」

`NoInvitationScreen` はサインイン画面に置き換えるため削除する。

### 管理画面: 発行 UI

- 招待作成完了時（`invitations/create/page.tsx`）: 作成後のモーダルに
  **ID・合言葉・ギャラリーURL** の3つを並べ、それぞれコピーボタンを付ける。
  合言葉には「この画面を閉じると再表示できません」の注意書きを添える
- 招待詳細（`invitations/[id]/page.tsx`）:
  - 認証情報が未発行の招待には「ID と合言葉を発行する」ボタンを出す
  - 発行済みの招待には現行 `signInId` を表示する（`invitation.signInId` を直接表示するだけで、
    `invitationCredentials` は読まない。合言葉は表示しない）
  - 「合言葉を再発行」ボタン。確認ダイアログの文言:
    「新しいIDと合言葉を発行します。すでにサインイン済みの端末は影響を受けず、引き続き開けます。
    古いIDと合言葉は今後使えなくなります。よろしいですか？」
  - 「アクセスを無効化」ボタン（新設）。確認ダイアログの文言:
    「招待リンクとこの招待へのアクセスをすべて無効化します。この操作を行うと、この招待を
    開いていたすべての端末（アプリ・ブラウザ問わず）で今後アクセスできなくなります。
    リンクや合言葉が流出した場合に使用してください。よろしいですか？」

### レスポンシブ

アプリのサインイン画面は縦向き固定（`app.config.ts` の `orientation: 'portrait'`）。
入力欄は `KeyboardAvoidingView` で覆い、キーボードで隠れないようにする。

## 9. API Plan

### `POST /api/native/signin`

配置: `web/src/app/api/native/signin/route.ts`
方針は `web/src/app/api/native/manifest/route.ts` に揃える（`runtime = 'nodejs'`、
`dynamic = 'force-dynamic'`、全応答に `Cache-Control: no-store`）。

**リクエスト**

```json
{ "signInId": "a3k9mq2p", "passphrase": "7fk2-p9wm-3xqa" }
```

**成功応答（200）**

```json
{ "token": "7AA53aP_hAqR-x3qXEqY7", "clientName": "sawada" }
```

**失敗応答（ロック関連の状態は存在しない）**

| 状況 | status | body |
|---|---|---|
| 形式不正・欠落・許可文字以外を含む | 400 | `{"error":"bad_request"}` |
| ID が存在しない／合言葉が違う | 401 | `{"error":"unauthorized"}` |
| レート制限 | 429 | `{"error":"rate_limited"}` |
| 招待が無効・期限切れ | 403 | `{"error":"forbidden"}` |
| サーバー内部エラー | 500 | `{"error":"internal_error"}` |

**存在しない ID と合言葉違いを区別しない。** どちらも 401 を返す。この性質は追加の
分岐ロジックで実現するのではなく、設計そのものから構造的に導かれる。
`credentialKey` は ID と合言葉の両方から計算するまで分からないため、「ID が存在するかどうか」を
先に判定する経路が存在しない。つまり、形式が正しいリクエストは常に
「`credentialKey` を計算する → その ID で `get` する」という同じ1本の経路を通り、
`get` が見つかるか見つからないかで初めて分岐する。存在しない ID に対しても
（ID として妥当な文字列である限り）同じ PBKDF2 計算が必ず実行されるため、
「存在しないID」と「合言葉違い」の間に処理時間の差は生じない。

**検証手順**

1. 入力の型と文字種・長さを確認する。`signInId` は許可文字集合
   （`23456789abcdefghjkmnpqrstuvwxyz`）のみ・8文字。`passphrase` はハイフンと空白を除去した後、
   同じ許可文字集合のみ・12文字。どちらか一方でも満たさなければ 400 bad_request（この時点では
   まだ PBKDF2 を実行しない。形式不正は「存在しないIDかどうか」の情報を漏らさないため）
2. IP 単位のレート制限チェック（`signInRateLimits` コレクション、後述 Database Plan）。
   超過していれば 429 rate_limited
3. `credentialKey = derivePassphraseKey(signInId, passphrase)` を計算する（Node `crypto.pbkdf2Sync`、
   210000回、SHA-256、32バイト、`base64url` エンコード）
4. `invitationCredentials/{credentialKey}` を `getDoc` で取得。存在しなければ 401 unauthorized
5. 取得できたら `invitationId` を読み、`invitations/{invitationId}` を取得し、
   `manifestService.ts` からexportした `isUsable` で有効性を判定
   （`isActive` / `expiresAt` / 作成から7日）。無効なら 403 forbidden
6. `token` と `clientName` を返す（200）

**有効性判定の共通化**: 現在 `manifestService.ts` に `isUsable` があるが未 export。
同じ判定を二重に書くと片方だけ直したときに食い違うため、export して共有する。

## 10. Database Plan

### 新規コレクション `invitationCredentials/{credentialKey}`

ドキュメント ID を `credentialKey`（PBKDF2 の出力そのもの）にする。クエリ不要で単一取得だけで済み、
`list` を禁止すれば ID と合言葉の両方を知らない者は存在確認もできない。

| フィールド | 型 | 説明 |
|---|---|---|
| `invitationId` | string | `invitations` のドキュメント ID |
| `createdAt` | timestamp | |
| `createdBy` | string | 発行した管理者の uid |

**秘密情報（ハッシュ・ソルト・反復回数）は一切保存しない。** ドキュメント ID 自体が
「ID と合言葉の両方を知っている証拠」であり、本体には invitationId しか要らない。

### 新規コレクション `signInRateLimits/{bucketId}`

`bucketId = ${sha256(クライアントIP)}_${時間窓インデックス}`（例: 60秒窓なら
`Math.floor(Date.now() / 60000)`）。IP は `x-forwarded-for` ヘッダー（Vercel が付与する）の
先頭要素から取得する。取得できない場合はレート制限を掛けずに続行する
（レート制限は補助であり、取得失敗を理由に本来の認証処理まで止めない）。

| フィールド | 型 | 説明 |
|---|---|---|
| `count` | number | 当該窓内のリクエスト数 |
| `windowStart` | timestamp | 参考情報。TTL ポリシーを将来設定する場合に使う |

読み取り→加算→判定を `runTransaction` で行い、同一窓内での競合を避ける
（`runTransaction` はクライアント SDK でも使え、Admin SDK を必要としない。既存コードでの
実例: `web/src/services/likeService.ts`、`admin/src/services/imageService.ts`）。
閾値は `manifest/route.ts` と同じ「1分30回」に揃える。

### `invitations` への追加フィールド

| フィールド | 型 | 説明 |
|---|---|---|
| `signInId` | string（省略可） | 現行の平文 ID。未発行の招待には存在しない |
| `credentialKey` | string（省略可） | 現行の `invitationCredentials` ドキュメント ID。再発行時に旧ドキュメントを削除するために使う |

### Firestore ルール（`firestore.rules` に追加）

```
match /invitationCredentials/{credentialKey} {
  // get のみ許可。list に対応する行を書かないことで default-deny になる。
  // ID と合言葉の両方から credentialKey を計算できた者だけが get できる。
  allow get: if isAuthenticated();
  allow create, delete: if isAdmin();
}

match /signInRateLimits/{bucketId} {
  // カウンタの読み書きのみ。list は書かず default-deny にする。
  // 認証済み（匿名可）クライアントが直接書けるため、悪意ある者がカウンタを操作できる
  // 既知の弱点がある。主たる防御はエントロピーであり、これは補助に過ぎない（Assumptions 7）。
  allow get, create, update: if isAuthenticated();
}
```

`invitations` のルールは変更しない。新フィールド（`signInId`・`credentialKey`）の書き込みは
既存の `allow create: if isAdmin() && ...` / `allow update: if isAdmin() || ...` がそのままカバーする。

### インデックス

いずれも単一ドキュメント取得（またはドキュメント ID による直接アクセス）のみのため
**追加不要**。`firestore.indexes.json` は変更しない。

### 既存データへの影響

認証情報を発行していない既存の招待は `signInId` / `credentialKey` フィールドを持たず、
リンク方式のみで従来どおり動作する。

## 11. File-by-File Plan

| ファイル | 区分 | 目的 | 変更内容 | リスク |
|---|---|---|---|---|
| `firestore.rules` | 変更 | 認証情報とレート制限の保護 | `invitationCredentials`・`signInRateLimits` の match を追加 | 中 |
| `web/src/services/passphrase.ts` | 新規 | 鍵導出 | `normalize`・`derivePassphraseKey`（Node `crypto.pbkdf2Sync`）・許可文字集合・`FIXED_SALT` 定数（変更時の全件無効化リスクをコメントに明記） | 中 |
| `web/src/services/passphrase.test.ts` | 新規 | 検証 | 正規化・同一入力の再現性・クロス実装テストベクタの読み込み | 低 |
| `docs/app-signin/credential-test-vectors.json` | 新規（実装時に生成） | クロス実装検証 | `{signInId, passphrase, expectedCredentialKey}` を3〜5件。web 実装で一度計算して確定させ、admin 側のテストがこれを読んで一致を検証する | 低 |
| `web/src/services/manifestService.ts` | 変更 | 判定の共通化 | `isUsable` を export する（挙動変更なし） | 低 |
| `web/src/services/signinService.ts` | 新規 | 検証ロジック | `resolveSignIn(db, signInId, passphrase, now)`。Firestore ハンドルを引数で受ける | 中 |
| `web/src/services/signinService.test.ts` | 新規 | 検証 | 成功・合言葉違い・存在しないID・期限切れ招待・不正な文字・レスポンスの同一性 | 低 |
| `web/src/services/signInRateLimiter.ts` | 新規 | レート制限 | IP ハッシュ化、`runTransaction` による原子的な加算と閾値判定 | 中 |
| `web/src/services/signInRateLimiter.test.ts` | 新規 | 検証 | 閾値内は許可、超過で拒否、窓が変われば解除 | 低 |
| `web/src/app/api/native/signin/route.ts` | 新規 | エンドポイント | 入力検証・レート制限・応答組み立て。既存に `route.test.ts` の類が無いため自動テストは対象外（`curl` での手動確認） | 中 |
| `admin/src/services/credentialService.ts` | 新規 | 発行・再発行・無効化 | ID・合言葉の生成、`crypto.subtle.deriveBits` によるハッシュ化、`issueCredential`・`reissueCredential`・`getCredentialSummary` | 中 |
| `admin/src/services/__tests__/credentialService.test.ts` | 新規 | 検証 | 生成文字種、長さ、`credential-test-vectors.json` とのクロス実装一致、再発行で旧ドキュメントが削除される | 低 |
| `admin/src/services/invitationService.ts` | 変更 | 型拡張・無効化 | `Invitation` 型に `signInId?`・`credentialKey?` を追加し `docToInvitation` に反映。`regenerateInvitationToken(id)`（「アクセスを無効化」用、`token` を新しい `nanoid(21)` に差し替え）を追加 | 中 |
| `admin/src/services/__tests__/invitationService.test.ts` | 変更 | 検証 | 新フィールドのマッピング、`regenerateInvitationToken` が新トークンで `updateDoc` を呼ぶこと | 低 |
| `admin/src/app/admin/projects/[projectId]/invitations/create/page.tsx` | 変更 | 発行 UI | 作成後モーダルに ID・合言葉を追加表示 | 低 |
| `admin/src/app/admin/projects/[projectId]/invitations/create/__tests__/page.test.tsx` | 変更 | 検証 | 既存テストの期待値を更新 | 低 |
| `admin/src/app/admin/projects/[projectId]/invitations/[id]/page.tsx` | 変更 | 再発行・無効化 UI | `signInId` 表示、発行・再発行・無効化の3ボタンと確認ダイアログ | 低 |
| `admin/src/app/admin/projects/[projectId]/invitations/[id]/__tests__/page.test.tsx` | 変更 | 検証 | 3ボタンの動作、確認ダイアログの文言 | 低 |
| `mobile/src/auth/signIn.ts` | 新規 | 通信 | 正規化、許可文字チェック、`/api/native/signin` 呼び出し、判別可能な結果型 | 中 |
| `mobile/src/auth/signIn.test.ts` | 新規 | 検証 | 各エラーコードの対応付け、不正文字の検出、ネットワーク失敗時の扱い | 低 |
| `mobile/src/navigation/launchDecision.ts` | 新規 | 起動分岐の純関数化 | `decideLaunchScreen({ hasDeepLink, hasSavedToken })` を `'gallery' \| 'signin'` で返す | 低 |
| `mobile/src/navigation/launchDecision.test.ts` | 新規 | 検証 | 保存済みトークンがありリンクが無い場合に `'gallery'` を返すことを含む全分岐 | 低 |
| `mobile/src/screens/SignInScreen.tsx` | 新規 | 入力画面 | UI Plan のとおり | 低 |
| `mobile/App.tsx` | 変更 | 起動分岐 | `launchDecision` を使い `NoInvitationScreen` を `SignInScreen` に差し替え、成功時にトークンを保存 | 中 |
| `mobile/src/screens/NoInvitationScreen.tsx` | 削除 | 役割終了 | `SignInScreen` が置き換える | 低 |
| `mobile/src/config.ts` | 変更 | 定数 | `SIGNIN_ENDPOINT` を追加 | 低 |
| `docs/native-app/decisions.md` | 変更 | 記録 | 入口を2系統にした判断、運用メモ（伝達手段・URL設定の非連動）を追記 | 低 |

## 12. Implementation Order

1. `task_001` Firestore ルール（`invitationCredentials`・`signInRateLimits`）
2. `task_002` web: 鍵導出モジュール（`passphrase.ts`）＋クロス実装テストベクタの生成
3. `task_003` web: `manifestService.ts` の `isUsable` を export
4. `task_004` web: サインイン検証ロジック（`signinService.ts`）
5. `task_005` web: Firestore ベースのレート制限（`signInRateLimiter.ts`）
6. `task_006` web: エンドポイント `POST /api/native/signin`
7. `task_007` admin: 発行・再発行ロジック（`credentialService.ts`）
8. `task_008` admin: `invitationService.ts` の拡張（型・`regenerateInvitationToken`）
9. `task_009` admin: 招待作成時の発行 UI
10. `task_010` admin: 招待詳細の再発行・無効化 UI
11. `task_011` mobile: 通信層（`signIn.ts`）
12. `task_012` mobile: 起動分岐の純関数化（`launchDecision.ts`）
13. `task_013` mobile: サインイン画面と `App.tsx` 統合
14. `task_014` 実機確認と記録
15. `task_015`（任意）ブラウザ側のサインイン画面

## 13. Verification Commands

リポジトリに実在するものだけを挙げる。

**web**

```
cd web && npm run lint
cd web && npm test          # vitest run
cd web && npm run build     # 型チェックを兼ねる
```

**admin**

```
cd admin && npm run lint
cd admin && npm run build
cd admin && npx vitest run  # vitest は devDependency にあるが npm script は未定義
```

**mobile**

```
cd mobile && npm run typecheck
cd mobile && npm test
```

**Firestore ルール**

```
firebase deploy --only firestore:rules
```

## 14. Acceptance Criteria

1. 正しい ID と合言葉でアプリからギャラリーが開く
2. 合言葉が違うと 401 が返り、画面に「ID または合言葉が違います」が出る
3. 存在しない ID でも、合言葉違いと**同じ 401** が返る（`signinService.test.ts` で両者の
   応答内容が同一であることを検証する）
4. ロックアウトは存在しない。何度失敗しても正しい ID と合言葉なら次の試行で成功する
   （レート制限にのみ引っかかり得る）
5. 無効化された招待・期限切れの招待では 403 が返る
6. `invitationCredentials` への `list` がクライアント SDK から `permission-denied` になる
7. 管理画面で発行した ID と合言葉で、実際にアプリからサインインできる
8. 「合言葉を再発行」を行うと、古い ID・合言葉ではサインインできなくなるが、
   再発行前に既にトークンを保存済みだった端末はサインイン画面を経ずに引き続き開ける
9. 「アクセスを無効化」を行うと、招待リンク（旧トークン）と、保存済みトークンを持つ端末の
   両方がアクセスできなくなる
10. 紛らわしい文字（`0`/`1`/`i`/`l`/`o`）を入力すると、送信前に
    「入力できない文字が含まれています」と表示され、通信が発生しない
11. 保存済みトークンがあり起動リンクが無い場合、サインイン画面を経ずにギャラリーが開く
    （`launchDecision.test.ts` で自動検証）
12. web（Node `crypto`）と admin（`crypto.subtle`）が同じ入力から同じ `credentialKey` を
    計算する（`credential-test-vectors.json` を両実装のテストが読み込んで検証する）
13. 招待リンク（カスタムスキーム）からの起動が従来どおり動作する
14. 認証情報を発行していない既存の招待が、リンク方式で従来どおり開く
15. すべての検証コマンドが通る
16. 「未解決の前提条件」で (a) を選んだ場合、`invitations` への `list` が
    `permission-denied` になる。(b) を選んだ場合はこの項目を未達として明示的に記録する

## 15. Repair Loop

1. 検証コマンドを実行する
2. エラー出力をそのまま記録する
3. エラーを task_id に対応付ける
4. 関係するファイルだけを修正する
5. 検証コマンドを再実行する
6. 実装が計画と食い違ったら、この計画書を更新してから進める

**テストが落ちたときにテストを緩めない。** 実装かテストのどちらが誤っているかを
判断し、テストが正しければ実装を直す。テストが誤っていれば、その根拠を書いてから直す。

**実機でしか出ない差に注意する。** 2026-08-16 の iOS 検証で、Jest（Node 上）を通るのに
実機で失敗する不具合が3件出ている（`docs/native-app/device-test-log.md` 第4章）。
うち1件は明確に特定APIが原因だった。

- **`URL`**: React Native の `URL` は正規表現による簡易実装で、`host`/`pathname`/`origin`
  のいずれも `https?://` にしかマッチしない（`react-native/Libraries/Blob/URL.js`）。
  カスタムスキーム文字列を `new URL()` に渡すと例外を投げないまま空の値になり、
  Jest（Node の標準 `URL`）では再現しない。`mobile/src/navigation/resolveInitialUrl.ts` は
  この問題を踏まえてカスタムスキームを文字列処理で扱っている。本計画の新規コード
  （`signIn.ts`・`launchDecision.ts`・`SignInScreen.tsx`）は URL の生成・解析を必要としない設計に
  しており、`URL` に依存しない。もし今後 URL 操作が必要になった場合は同じ回避策を踏襲すること。
- **`TextEncoder`**: 本セッションで読んだ `device-test-log.md` 第4章には登場せず、
  実際に問題になった記録は確認できていない（ユーザー指示に基づき禁止候補として記載するが、
  この一件は本ファイルからの確認事実ではないことを明記する）。念のため、モバイル側の
  コードでは文字列のバイト変換（`TextEncoder`/`TextDecoder`）を必要とする実装にしない
  （鍵導出は web と admin だけが行い、mobile は文字列の `fetch` 送信のみを行う設計のため、
  そもそも該当APIを必要としない）。
