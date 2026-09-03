# 全体監査 所見（2026-09-02, Fable 5.1）

対象: リポジトリ HEAD `19e3a5e`（master, 作業ツリーはクリーン）。web / admin / mobile / Firebase ルール・デプロイ設定・リポジトリ衛生の 4 領域を、コードの通読と lint / test / build の実走で確認した。`front/`・`back/` は CLAUDE.md の方針どおり対象外。

行番号は監査時点のもの。修正後はずれる。

## 1. 実走した検証

| 対象 | コマンド | 結果 |
|---|---|---|
| web | `npm run lint` | **失敗**。7 エラー / 5 警告（`react-hooks/set-state-in-effect` ×4、`react-hooks/purity` ×1、`react/no-unescaped-entities` ×2） |
| web | `npx vitest run` | 12 ファイル / 118 テスト 成功 |
| web | `npm run build` | 成功 |
| admin | `npm run lint` | **コマンド自体が壊れている**。`next lint` は Next 16 に存在せず `Invalid project directory provided, no such directory: .../admin/lint` で終了 |
| admin | `npx eslint src`（直接実行） | 0 エラー / 1 警告（`<img>` 使用） |
| admin | `npx vitest run` | 13 ファイル / 173 テスト 成功 |
| admin | `npm run build` | 成功。`[projectId]` 系は動的ルート（静的エクスポートではない） |
| mobile | `npm run typecheck` | 成功 |
| mobile | `npx jest` | 5 スイート / 76 テスト 成功 |

バージョン: web/admin とも Next 16.1.6、React 19.2.3 / 19.1.0、admin の `eslint-config-next` は 15.3.2（Next 16 と不整合）。mobile は Expo 57.0.13 / RN 0.86.2。

## 2. 前提として確認した事実

- GitHub リポジトリ `sawanori/photo_gallery_app` は **公開（PUBLIC）**。
- `web/e2e/` の 4 ファイル（`debug_gallery`, `production-gallery`, `verify-deploy`, `verify-loading`）に本番ギャラリーの招待トークンが 2 種類、平文で commit されている。本番の `/api/native/manifest?token=` は両方とも 404 を返すため **現時点で失効済み**。実害は無いが慣行として直す。
- 秘密情報（サービスアカウント鍵、`.env.local`、keystore 等）の commit は無い。`mobile/.env` は未追跡で中身は `EXPO_PUBLIC_WEB_ORIGIN` のみ。
- admin は Vercel にデプロイされている（`admin/.vercel/project.json`）。`firebase.json` の hosting ブロック（`admin/out`）は静的エクスポート設定が無いため **動作しない**。
- Storage の画像 URL はすべて `getDownloadURL` のトークン付き URL を Firestore に保存して使っている。web / mobile / LINE 共有 / `/api/image` のいずれも `allow read: if true` に依存していない。
- 招待トークンは `nanoid customAlphabet(63 文字, 21 桁)` ≒ 125 bit。推測は不可能。
- Storage のファイル名は `Date.now()-<乱数 5 文字>` で元ファイル名は使っていない。

## 3. 所見（優先度順）

### P0: セキュリティ・データ整合性（確認済み）

**S1. [High] 匿名ユーザーが Storage に公開ファイルを無制限にアップロードできる**
`storage.rules:21-27, 32-38` の `create` 条件は「認証済み かつ `uid == パスの userId` かつ image/* かつ 50MB 未満」だけ。web は匿名認証を有効にしており（`web/src/services/authService.ts:4-7`）Firebase 設定は公開情報なので、誰でも `signInAnonymously()` → `uploadBytes(ref('images/<自分のuid>/x'))` で世界公開ファイルを置ける。アップロードするのは管理者だけ（`admin/src/services/imageService.ts:301,307`）。
修正: create を管理者限定にする（Storage ルールから `firestore.get()` で `users/{uid}.role == 'admin'` を参照）。

**S2. [High] アップロード者以外の管理者が削除すると Storage ファイルが孤児化し、失敗が握り潰される**
`storage.rules:25-26, 36-37` の delete は `uid == userId` のみで管理者条項が無い。`admin/src/services/imageService.ts:403-420`（`deleteImageFiles`）は `deleteObject` の失敗を `console.warn` するだけで、`deleteImagesForProject`（`:518-555`）はその結果を捨てて Firestore ドキュメントをバッチ削除する。`storagePath` / `thumbnailPaths` が消えるので二度と回収できない。docstring の「先に消しておけば再実行で回収できる」は成り立っていない。`scripts/migrate-thumbnails.mjs:97-99` も同じ不整合（元アップロード者の uid 配下に書くため他の管理者では create が拒否される）。
修正: Storage delete に管理者条項を追加し、Storage 削除に失敗した画像は Firestore ドキュメントを消さずに失敗件数を UI に出す。

**S3. [Medium] 匿名ユーザーが `users/{uid}` を自己作成して「登録ユーザー」になり、images を書ける**
`firestore.rules:66-67` は認証済み（匿名含む）なら `role:'user'` で自分の users ドキュメントを作れる。すると `isRegisteredUser()` が真になり `images.create`（`:87-89`）で任意の `projectId` / `url` のドキュメントを作れ、自分の作った images の update / delete もできる（`:95, :97`）。管理画面の Users 一覧（`userService.ts:48-58`）を任意の `email` で汚染できる。クライアントに users を作る経路は無い。副作用として `scripts/create-admin.{mjs,ts}` は `role:'admin'` で自己作成するため **既にこのルールで拒否される（壊れている）**。
修正: `users.create` を `false`、`users.update/delete` を管理者限定、`images.create/delete` を `isAdmin()` にする。`isRegisteredUser()` は不要になる。

**S4. [Medium] セッションの信頼が無制限（B1〜B5）**
- B1: `firestore.rules:94-96` により、セッション保持者は imageId を知っている **任意の画像** の likeCount を ±1 でき、likes ドキュメント無しで何度でも繰り返せる。
- B2: `hasValidSession()`（`:24-27`）はセッション文書の存在しか見ない。セッションは削除されないので、招待の `isActive=false`・`expiresAt` 超過・招待削除後も likes の create/list/delete と likeCount 更新が動き続ける。
- B3: `sessions.create`（`:157`）は任意の `invitationId` を受け付ける。トークンを知っている限り（転送されたリンク、失効した招待）その招待の選定が読める。
- B4: `invitations.update`（`:148-150`）は認証済みなら誰でも、失効した招待を含む任意の招待の `accessCount` / `lastAccessedAt` を **任意の値** に書ける。web は `increment(1)` + `serverTimestamp()` を使うがルールは強制していない。
- B5: `likes.create`（`:112-115`）は `imageId` がその招待の `imageIds` に含まれるか確認しない。トークン保持者が「選定済み」を捏造でき、管理者の `getLikedImageIdsByInvitation` に返る。
修正: sessions の create / invitationId 更新時に招待が有効（`isActive && expiresAt > request.time`）であることを要求し、likes / images.likeCount / invitations.update をすべて「セッションの招待が有効」かつ「imageId ∈ invitation.imageIds」かつ「accessCount は +1、lastAccessedAt は request.time」に絞る。ルール案は `handoff.md` WP-C に記載。

**S5. [Medium] `/api/image` が全 Firebase プロジェクト共通ホストを許可した開放リサイズプロキシ**
`web/src/app/api/image/route.ts:5-8, 28-30` は `firebasestorage.googleapis.com`（全プロジェクト共有ホスト）をホスト名だけで許可し、バケット・パスを検査しない。誰でも任意の公開画像を投げて sharp の CPU と Vercel 帯域を消費でき、`s-maxage=31536000` の CDN キャッシュも汚せる。`:16,39` は `q=abc` で `quality: NaN` を sharp に渡して 500 になる。fetch にタイムアウトが無い。Content-Length 欠落時は本文全体を読んでから 20MB 判定する（`:57-65`）。
修正: `pathname` を自バケット（`photo-gallery-app-20251204.firebasestorage.app`）の `images/` `thumbnails/` 接頭辞に限定（`mobile/src/config.ts:32-35` の `STORAGE_PATH_PATTERNS` と同じ基準）、`Number.isFinite` で正規化、`AbortSignal.timeout` を付ける。

**S6. [Medium] manifest のレート制限が総当たりに効かず、Map が無限に育つ**
`web/src/app/api/native/manifest/route.ts:74` はキーが `token` なので、トークンを変えて総当たりする側は 1 度も制限されない。掃除（`:33-38`）は既存バケットに当たった分岐でしか走らず、未知トークンごとの新規エントリ（`:26-29`）は残り続ける。`token` に長さ上限が無い（`:70`）。逆に正規利用では 30 回/分がトークン単位で全端末共有なので、単発保存を 31 回押すと 429 → mobile は「通信状況を確認」を出す。
修正: `x-forwarded-for` ベースのキー（token と組み合わせてもよい）、token 長を 64 で拒否、挿入時に期限切れを掃除、上限を実利用に合わせて引き上げ。

**S7. [High→現時点は Low] 本番の招待トークンが公開リポジトリに commit されている**
`web/e2e/debug_gallery.spec.ts:17`, `production-gallery.spec.ts:3`, `verify-deploy.spec.ts:5`, `verify-loading.spec.ts:4`。両トークンとも失効済みであることを本番 API で確認した。
修正: `process.env.E2E_GALLERY_URL` から読み、未設定ならスキップ。以後トークンをコードに書かない。

### P1: 機能不具合（確認済み）

**F1. [High] 一括 ZIP ダウンロードの失敗が黙って消える**
`web/src/hooks/useBulkDownload.ts:22-26` は AbortError 以外を再送出するが、呼び出し側 `BulkDownloadButton.tsx:31` と `liked/page.tsx:50` は await も catch もしていない（unhandled rejection）。`downloadService.ts:66-67` は `response.ok` を見ずに `blob()` するため 403/404 の XML 本文が `.jpg` として ZIP に混入する。1 枚失敗すると `Promise.all` 全体が拒否され、モーダルが消えるだけで文言は出ない。
修正: `response.ok` 検査、`Promise.allSettled` で失敗枚数を集計して通知、呼び出し側で catch。

**F2. [High] mobile: 410 枚以上のギャラリーで一括保存ができず、誤ったエラーが出る**
manifest の `ManifestItem`（`web/src/services/manifestService.ts:31-35`）に `bytes` が無く、mobile は 1 枚 5MB と推定（`mobile/src/config.ts:63`）。`saveBatch.ts:81-90` は推定合計が 2GB（`config.ts:51`）を超えると `too_many_items` を返すので 410 枚で拒否される（`MAX_BATCH_ITEMS` は 500 なのに）。500 超は `manifest.ts:23-25` が `manifest_failed` を返し、web は「通信状況を確認して」（`NativeSaveNotice.tsx:66-70`）と誤表示。空き容量判定も `n×5MB+200MB` を要求する。
修正: admin がアップロード時に画像サイズ（bytes）を保存し manifest に載せる。mobile は manifest 取得を 500 件ずつに分割し、件数超過は `too_many_items` にする。bytes 不明時は件数上限を拘束条件にする。

**F3. [High] Android でネイティブ保存が永遠に終わらないケース**
`web/src/lib/nativeBridge.ts:132-141` は UA マーカーだけ検出できたとき `nonce: null` の能力オブジェクトを作り、`postToNative`（`:162-183`）はそれでも送って `true` を返す。mobile の `protocol.ts:170` は nonce が文字列でないメッセージを黙って捨てる。`useNativeSave.ts:76-106` は既に `isSaving=true` にしておりタイムアウトが無いので、ボタンは disabled、モーダルは 0/N のまま。`cancel` も届かない。`notifyInvitationInvalid`（`:221-238`）は `native-gallery-ready` を待つ実装があるのに保存側は待たない。
修正: nonce が null なら `postToNative` は `false` を返して ZIP にフォールバック。進捗が 60 秒来なければ `save_failed` にする watchdog を追加。

**F4. [Medium] タッチ端末でグリッドの ♡ / DL ボタンが「見えないのに押せる」**
`web/src/components/ImageCard.tsx:64` のオーバーレイは `opacity-0 group-hover:opacity-100`。Tailwind 4.1 の `hover:` は `@media (hover: hover)` に閉じるためスマホでは表示されない一方、`:83-91` のボタンは `stopPropagation` 付きで生きている。サムネ右上をタップすると無言でお気に入りが反転／新規タブが開く。
修正: オーバーレイに `pointer-events-none group-hover:pointer-events-auto`、または `@media (hover: none)` で常時表示。

**F5. [Medium] accessCount が実態より大幅に少ない**
`web/src/hooks/useInvitation.ts:104-110` はセッションが無いときだけ `updateInvitationAccess` を呼ぶ。再訪や同一匿名 UID で開いた 2 つ目の招待は加算されない。管理画面のアクセス回数は「端末あたり最大 1」になる。
修正: 開くたびに加算（S4 のルール修正とセットで。セッション確保後に呼ぶ）。

**F6. [Medium] 有効期限表示が web と admin で食い違う**
- admin プロジェクト一覧 `admin/src/app/admin/projects/[projectId]/page.tsx:125-129, 280` は `expiresAt` だけで判定し `viewingDays` を無視。招待詳細（`invitations/[id]/page.tsx:179-193`）は `effectiveDeadline` を正しく使っている。閲覧期限切れの招待が一覧では「有効」と出る。
- web の `viewingWindow.ts` には `effectiveDeadline`（閲覧期限と `expiresAt` の小さい方）が無く、`Header.tsx:21-23` は閲覧期限だけを出す。`expiresAt` が先に来る場合、ヘッダーは実際より遅い日付を表示する。
修正: 両方 `effectiveDeadline` に統一。

**F7. [Medium] admin: アップロード途中失敗で Storage に孤児が残り、再試行も無い**
`imageService.ts:301` で原本を上げた後、`:304-315` のサムネイル 2 枚・`getDownloadURL`、`:347` の Firestore 書き込みのどこかで失敗すると、原本（とサムネイル）が参照されないまま残る。`upload/page.tsx:185-187` は `failCount` を増やすだけ。キャンセルも無く、画面遷移で中断もしない。
修正: 原本アップロード後の工程を try/catch で包み、失敗時に上げ済みのパスを `deleteObject`。失敗分の再試行ボタン。

**F8. [Medium] admin: 招待リンクの origin が本番で管理画面ドメインに黙って落ちる**
`admin/src/services/invitationService.ts:190-195` は `NEXT_PUBLIC_WEB_URL` 未設定時に `window.location.origin.replace(':3001', ':3002')` するが、Vercel では no-op なので `https://<admin-host>/gallery/<token>`（404）を生成する。Vercel 側の設定値はリポジトリからは検証できない。
修正: localhost 以外で未設定なら例外にし、画面に見える形で警告。

**F9. [Medium] admin: グリッドが原本を読み込む**
`[projectId]/page.tsx:190-197`、`invitations/create/page.tsx:346-355`、`invitations/[id]/page.tsx:406-411` が `img.url`（原本）を使う。`thumbnails.small`（384px WebP）があるのに使っていない。`getImagesByProject` はページングも無いので 700 枚のプロジェクトは訪問ごとに 700 枚の原本を引く。
修正: `img.thumbnails?.small ?? img.url`。

**F10. [Medium] mobile: キャンセルがダウンロード中の項目を止められず、タイムアウトも無い**
`saveBatch.ts:160-178` は項目間でしか `isCancelled` を見ない。`saveToLibrary.ts:65-67` の `File.downloadFileAsync` はオプションが `headers` / `idempotent` のみ。接続が止まると worker が永久に塞がる。expo-file-system 57 には `DownloadTask.cancel()` と `AbortSignal` オプションがある（`node_modules/expo-file-system/src/NetworkTasks.ts:220, :20`）。
修正: `DownloadTask` + 項目ごとのタイムアウト + キャンセル時 abort。

**F11. [Medium] mobile: Android の戻るキーでアプリが終了する**
`mobile/` に `BackHandler` が無く、`app.config.ts:75` は `predictiveBackGestureEnabled: false`、`GalleryWebView.tsx` に `goBack` が無い。ライトボックスや `/liked` で戻るを押すとアプリごと落ちる。
修正: `BackHandler` で `canGoBack ? goBack() : false`。

**F12. [Medium] 同一ブラウザで 2 つの招待を開くと、先に開いたタブのお気に入りが黙って失敗する**
`useInvitation.ts:97-103` が `sessions/{uid}.invitationId` を最新の招待に貼り替えるため、前のタブでは likes の create/delete がルールと不一致で permission-denied になり、`LikeButton.tsx:36-40` は見た目を戻すだけ。
修正（設計変更を伴う）: セッション ID を `${uid}_${invitationId}` にする。今回のバッチでは扱わず、推奨事項として残す。少なくとも permission-denied 時に再読み込みを促す文言を出す。

**F13. [Low] web: 細かい不具合**
- `MasonryGrid.tsx:50-65` の observer 依存が `[hasMore, loadMore]` で `images.length` を含まず、縦長画面で sentinel が交差したままだと次ページが来ない。
- `liked/page.tsx:31` は token 無しのとき `''` を `doc(db,'invitations','')` に渡して例外 → 「読み込みに失敗しました」。`denied` として扱うべき。
- `WelcomeGuide.tsx:30` は「左右スワイプで切り替え」と案内するが `ImageLightbox.tsx` にタッチ処理は無い。
- `ImageLightbox.tsx:124` は `role="dialog" aria-modal` だがフォーカス移動・トラップが無い（`NativeSaveNotice.tsx:99-114` に正しい実装がある）。`ImageCard.tsx:30-43` は `role="button"` の div の中に `<button>` を入れ子にしている。
- `manifestService.ts:75-88` の `where('token','==')` フォールバックは `invitations.list` が管理者限定なので必ず permission-denied。無駄な往復とテスト（`manifestService.test.ts:151`）を削除する。
- 単体 DL の失敗も `DownloadButton.tsx:32-33` は console のみ。

**F14. [Low] admin: 細かい不具合**
- `admin/src/app/admin/layout.tsx:60-63` がレンダー中に `router.replace('/')` を呼ぶ（Strict Mode で二重実行）。
- `invitations/[id]/page.tsx:153-158` の `navigator.clipboard.writeText` が await / catch 無しで常に成功表示。
- `dashboard/page.tsx:35-37`、`[projectId]/page.tsx:68-70`、`invitations/[id]/page.tsx:84-86` は読み込み失敗を「プロジェクトがありません／見つかりません」として表示する。
- `LoginForm.tsx:18-20` は Firebase の生メッセージを表示、`authService.ts:27` は英語メッセージを投げる。
- `userService.ts:48-58` の `orderBy('createdAt')` は `createdAt` の無いドキュメント（Console で手作りした管理者）を一覧から落とす。
- `deleteProject`（`projectService.ts:168-188`）は sessions を消さない。`deleteInvitation`（`invitationService.ts:186-188`）は UI に繋がっておらず、繋いだ場合 likes / sessions が残る。
- `finalizeUploadBatch`（`imageService.ts:254-270`）は `imageCount` 更新失敗を握り潰し、削除ダイアログの件数がずれる。
- HEIC / `type` 空のファイル: `upload/page.tsx:36-38` は `image/*` を通すが Chrome/Windows/Android では `createImageBitmap` が HEIC を復号できず、4MB 超は失敗、4MB 以下はサムネイル無しで原本のまま上がる（web が Chrome/Android で描画できない）。`type` 空はメッセージ無しで落ちる。

**F15. [Low] mobile: 細かい不具合**
- `isAllowedNavigation.ts:62-68` は外部に http/https しか許さず、`privacy/page.tsx:161,217` の `mailto:` が無反応（審査官が押す可能性）。
- `inject.ts:10-16` の nonce が `Math.random`。Android では `addJavascriptInterface` が全フレームに露出するため、nonce が唯一の防壁。`expo-crypto` の `getRandomBytes` にする。
- `protocol.ts:141-147` の `MeteredConfirmMessage`、`BatchResult.interrupted`、`expo-network` 依存は未使用（計画では従量課金警告の予定だった: `docs/native-app/task-list.json:350-395`）。
- `originWhitelist.test.ts:1` が未宣言の `escape-string-regexp` を import。
- `sanitizeBaseName`（`validate.ts:49`）が UTF-16 単位で切るためサロゲートペアを分断しうる。

### P2: 衛生・設定・ドキュメント

**H1. `admin/package.json` の `lint` が壊れている**（上記実走結果）。`"lint": "eslint ."` にし、`eslint-config-next` を 16 系に上げる。`nanoid` は `admin/src/services/invitationService.ts:18` で使っているのに `package.json` に無く、hoist で偶然解決している。`axios`・`jwt-decode`・`utils/imageCompression.ts`・`utils/thumbnailGenerator.ts`・`types/index.ts` のレガシー型は未使用。web も `dayjs`・`nanoid` が `web/src` で未使用。mobile も `expo-network` 未使用。

**H2. web の lint エラー 7 件**（`AndroidSaveGuide.tsx:17`, `IosSaveGuide.tsx:17,42`, `WelcomeGuide.tsx:15`, `ImageLightbox.tsx:29`, `Header.tsx:26`）。`eslint-disable` ではなく、遅延初期化 state や `useSyncExternalStore` で直す。

**H3. `firebase.json` の hosting ブロックは動作しない**。削除し、admin の Vercel デプロイと `firebase deploy --only firestore:rules,storage:rules,firestore:indexes` を正とする。

**H4. `firestore.indexes.json` の 9 本中 5 本が未使用**: `likes(userId,createdAt)`, `likes(imageId,createdAt)`, `likes(invitationId,createdAt)`, `invitations(isActive,createdAt)`, `sessions(invitationId,createdAt)`。不足している index は無い。`collectionGroup` クエリも無い。

**H5. `storage.rules` の `/profiles` ブロックは参照されていない**。

**H6. `CLAUDE.md` の陳腐化（検証済み）**: 「Hosting: Admin panel hosting」と `firebase deploy --only hosting`、`/front` を現行として記述、存在しない `/admin/images` ルート、Firestore Schema に `projects` / `invitations` / `sessions` が無い（likes のキーは `{invitationId}_{imageId}`）、Storage Structure に `/thumbnails` が無く未使用の `/profiles` がある、Quick Start の `cd front`、Security Rules 要約（「Users can read all users」「10MB/5MB」等は実態と不一致）、「Mobile: Firebase Auth with AsyncStorage」（mobile は WebView シェルで Firebase 認証を持たない）、Anonymous プロバイダの記載漏れ。

**H7. `scripts/create-admin.{mjs,ts}`** は重複していて、S3 のとおり現行ルールでも既に拒否される。Console での作成を正として明記する。

**H8. `cors.json`（`origin: ["*"], GET`）** は JSZip / 共有の `fetch` に必要で妥当だが、適用手順（`gsutil cors set`）がどこにも書かれていない。適用されているかは未検証。

## 4. 機能向上の余地（推奨順）

| # | 内容 | 根拠 | 工数 |
|---|---|---|---|
| I1 | ルールのエミュレータ単体テスト（`@firebase/rules-unit-testing`） | 列挙対策を 3 回にわたり手で塞いだ経緯がルール内コメントに残っている。S1〜S4 の修正を固定し、クライアント操作一覧が壊れないことを機械的に保証する価値が最も高い | M |
| I2 | ストリーミング ZIP（`client-zip` 等）または 500MB 程度での分割 | `downloadService.ts:55-105` は全 Blob を保持したうえで `generateAsync` でもう 1 本作るため、ピークメモリが総容量の約 2 倍。300 枚 × 8MB で約 5GB、モバイルのタブが落ちる | M |
| I3 | ライトボックスのスワイプ／ピンチズーム | 写真納品の主要導線がモバイルなのにタッチ操作が無い（F13） | M |
| I4 | 高さを考慮した masonry 配置 | `MasonryGrid.tsx:72-74` は `index % colCount` で縦横比を無視し列が偏る。画像ドキュメントに width/height を持たせる（F2 の bytes と同時に保存できる） | M |
| I5 | OpenGraph メタデータ | `app/layout.tsx:4-6` は title/description のみ。LINE 共有のプレビューが汎用表示になる | S |
| I6 | 失敗時のトースト（単体 DL、お気に入り、ZIP） | 現状はすべて console のみ | S |
| I7 | admin: 失敗分の再試行・キャンセル・`getImagesByProject` のページング | F7, F9 | M |
| I8 | admin: 読み込み失敗を空状態と区別して表示 | F14 | S |
| I9 | admin: 認証の永続化を `browserSessionPersistence` に | 共有 PC での放置リスク | S |
| I10 | `viewingWindow.ts` を workspace パッケージで共有 | 手コピーの重複が F6 を生んだ | M |
| I11 | mobile: 初期表示の `startInLoadingState` / `renderLoading`、`SCHEME` 定数の一元化 | 起動直後の白画面、`App.tsx:16` と `app.config.ts:45` の重複 | S |
| I12 | 招待の削除 UI（likes / sessions の同時削除付き） | `deleteInvitation` が UI に無い | M |
| I13 | セッション ID を `${uid}_${invitationId}` に | F12 の根治 | M |
| I14 | 有効期限付き Storage URL（署名 URL） | 閲覧期限は表示上の制御に過ぎず、LINE 共有は恒久 URL を配る（`viewingWindow.ts:8-17` 自認）。Cloud Functions か Admin SDK を持つ API が必要 | L |
| I15 | HEIC の扱いを明示（許可リスト＋メッセージ、または変換） | F14 | S〜M |

## 5. テストの空白

- **Firestore / Storage ルールのテストが無い**（I1）。
- web: `useInvitation`（セッション作成・貼り替え・accessCount・denied/unavailable 分岐）、`LikeButton` の楽観更新とロールバック、`/api/image` と `/api/native/manifest` の Route Handler 自体、`downloadImagesAsZip` の失敗系、`useBulkDownload` / `useNativeSave`、`MasonryGrid` の無限スクロール。
- admin: 認証ゲート一式（`AuthContext`, `authService`, `LoginForm`, `AdminLayout`）、`userService` と users ページ、`likeService`、admin 側 `viewingWindow.ts`、`getGalleryUrl` の env フォールバック、Storage permission-denied 経路。admin の e2e は本番に対して `E2Eテスト_<timestamp>` プロジェクトを作りっぱなしにする。
- mobile: `handleMessage.ts`、`saveBatch.ts`（並行・部分失敗・キャンセル・409 枚の崖）、`manifest.ts`（403/404/429/500 の対応）、`storage.ts`、`GalleryWebView` のエラー処理。
- web の `e2e/` は本番に対する場当たりスクリプトで CI に組み込める形ではない。

## 6. 未検証事項

- Storage ルールの `list` 判定（単一セグメントのワイルドカード一致で `/images/{uid}/` の列挙が拒否される、という結論はパス一致からの推論）。
- Storage ルールからの `firestore.get()`（クロスサービス参照）がこのバケットで使えるか。使えない場合の代替は `request.auth.token.firebase.sign_in_provider != 'anonymous'`。
- `cors.json` が適用済みか、デプロイ済みのルール・インデックスがリポジトリと一致しているか（firebase MCP が接続できず CLI も叩いていない）。
- `likeCount` / `accessCount` フィールドの無い旧ドキュメントが存在するか（存在すれば ±1 演算のルールで拒否される）。
- admin ログイン直後の競合（`LoginForm` の遷移と `AuthContext` の `getUserProfile` の順序）。再現はしていない。
- iOS Safari での大容量 Blob の `file-saver` 挙動。
- Android WebView が `shouldOverrideUrlLoading` の 250ms 以内に応答しないと許可に倒れる挙動（`RNCWebViewClient.java:42,113`）による nonce 露出。再現はしていない。
