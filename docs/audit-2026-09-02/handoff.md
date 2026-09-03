# 引き継ぎ書（監査 2026-09-02 → 修正作業）

所見の根拠は同ディレクトリの `findings.md`。ID（S1, F1, H1 …）はそこに対応する。

## 共通の制約（全ワークパッケージ）

1. **デプロイしない**。`firebase deploy`、`vercel`、`eas build` を実行しない。ルール・インデックスの変更はファイル編集とエミュレータテストまで。
2. **commit / push しない**。作業ツリーに変更を残す。
3. 自分のワークパッケージのファイル範囲だけを触る。範囲外の不具合を見つけたら報告に書く。
4. `eslint-disable` や `@ts-ignore` で警告を消さない。テストを通すための特殊分岐・ハードコードをしない。
5. ライブラリの API を確認するときは context7 MCP（`resolve-library-id` → `query-docs`）を使う。
6. 変更した振る舞いには単体テストを付ける。既存テストは壊さない。
7. 報告は結論先行。各主張をツール実行結果と突き合わせ、未検証は未検証と書く。
8. 修正しないと決めた項目は理由を添えて報告する。黙って落とさない。

## WP-A: web（`web/` 配下のみ）

対象 ID: S5, S6, S7, F1, F3（web 側）, F4, F5, F6（web 側）, F13, H1（web の未使用依存）, H2, F2（manifest に bytes）

| # | 作業 | 受け入れ条件 |
|---|---|---|
| A1 | `web/e2e/` の 4 ファイルから招待トークンと本番 URL の直書きを除去し、`process.env.E2E_GALLERY_URL` から読む。未設定なら `test.skip` | `grep -E "gallery/[A-Za-z0-9_-]{16,}" web/e2e` がヒット 0 |
| A2 | `/api/image`: URL の `pathname` を自バケット `photo-gallery-app-20251204.firebasestorage.app` の `images/` または `thumbnails/` 配下（URL エンコード済み `images%2F` 形式）に限定。`mobile/src/config.ts` の `STORAGE_PATH_PATTERNS` と同じ基準。`w` / `q` は `Number.isFinite` で正規化し不正値は既定値。fetch に `AbortSignal.timeout(15000)`。Content-Length 欠落時は本文を読み進めながら 20MB で打ち切る | Route Handler の vitest（許可 URL、他バケット URL → 400、`q=abc` → 既定値、タイムアウト） |
| A3 | `/api/native/manifest`: レート制限キーを `x-forwarded-for` の先頭 IP（無ければ `unknown`）にし、上限を 120 回/分に。`token` は長さ 64 超で 400。挿入時に期限切れバケットを掃除する | vitest（IP 単位の 429、token 長、掃除） |
| A4 | manifest の `ManifestItem` に任意項目 `bytes`（画像ドキュメントの `size` があれば載せる）を追加。型 `Image` に `size?: number` を追加 | 既存 `manifestService.test.ts` が通り、`bytes` の有無両方のテストがある |
| A5 | `manifestService.ts` の `where('token','==')` フォールバックとそのテストを削除 | 削除後にテストが通る |
| A6 | 一括 ZIP: `downloadService.ts` で `response.ok` を検査し、失敗は `Promise.allSettled` で集計。戻り値に `failedCount` を含める。`useBulkDownload` の呼び出し側（`BulkDownloadButton.tsx`, `liked/page.tsx`）で catch し、失敗枚数をユーザーに見える形で表示する（既存の `NativeSaveNotice` の見た目に合わせた簡素な通知でよい） | vitest（非 ok 応答が ZIP に混入しない、1 枚失敗でも残りは保存され失敗数が返る） |
| A7 | `nativeBridge.ts`: `capabilities.nonce` が null のとき `postToNative` は送らず `false` を返す（呼び出し側は既存のフォールバックに落ちる）。`useNativeSave.ts`: 進捗も結果も 60 秒来なければ `save_failed` にして `isSaving` を解除する watchdog | vitest（nonce null → false、watchdog） |
| A8 | `ImageCard.tsx`: オーバーレイを `pointer-events-none group-hover:pointer-events-auto` にし、`@media (hover: none)` では常時表示（Tailwind の `pointer-coarse:` 変種や `[@media(hover:none)]:` を使う）。`role="button"` の div 内に `<button>` を入れ子にしている構造を直す | 目視ではなく DOM テスト（タッチ環境相当でボタンが `pointer-events: none` を持たない／持つ） |
| A9 | `useInvitation.ts`: `updateInvitationAccess` をセッション確保（create または update）の **後に毎回** 呼ぶ。失敗は warn のまま | vitest で `useInvitation` を新規にテスト（初回・再訪・invitationId 貼り替え・denied・unavailable） |
| A10 | `web/src/utils/viewingWindow.ts` に admin と同じ `effectiveDeadline`（閲覧期限と `expiresAt` の小さい方）を追加し、`Header.tsx` の表示と `isExpiringSoon` に使う | `viewingWindow.test.ts` に `effectiveDeadline` のテスト |
| A11 | `MasonryGrid.tsx` の observer 依存に `images.length` を追加。`liked/page.tsx` の token 無しは `denied` 扱い。`WelcomeGuide.tsx` のスワイプ案内を実装に合わせて修正（スワイプ実装は今回はしない） | 既存テストが通る |
| A12 | `ImageLightbox.tsx`: 開いたときにフォーカスを閉じるボタンへ移し、Tab をダイアログ内にトラップし、閉じたら元の要素に戻す（`NativeSaveNotice.tsx:99-114` と同じ方式） | DOM テスト |
| A13 | lint エラー 7 件と警告 5 件を `eslint-disable` 無しで解消。`set-state-in-effect` は `useState` の遅延初期化（`localStorage` 読みは SSR 安全にするため `typeof window` ガード）か `useSyncExternalStore`、`purity` は `useState(() => Date.now())` 等 | `npm run lint` が 0 エラー 0 警告 |
| A14 | `dayjs`・`nanoid` が `web/src` で本当に未使用なら `npm uninstall` で除去 | `grep -r "from 'dayjs'\|from 'nanoid'" web/src` がヒット 0 |

完了条件: `cd web && npm run lint && npx vitest run && npm run build` がすべて成功。

## WP-B: admin（`admin/` 配下のみ）

対象 ID: S2（admin 側）, F6（admin 側）, F7, F8, F9, F14, H1（admin）, F2（size の保存）

| # | 作業 | 受け入れ条件 |
|---|---|---|
| B1 | `package.json` の `lint` を `eslint .` に。`eslint-config-next` を Next 16.1 系に合わせて更新。`nanoid` を dependencies に明記。`axios`・`jwt-decode` が未使用なら除去 | `npm run lint` が動き 0 エラー |
| B2 | `deleteImageFiles` の結果を `deleteImagesForProject` / 単体削除で使い、Storage 削除に失敗した画像は Firestore ドキュメントを **削除しない**。失敗件数と対象パスを戻り値に含め、プロジェクト削除・画像削除の UI で「Storage の削除に失敗した画像が N 件あります。再実行してください」と表示する | vitest（Storage 失敗時にドキュメントが残る、成功時は消える） |
| B3 | `uploadImageFile`: 原本アップロード後の工程（サムネイル、`getDownloadURL`、`setDoc`）が失敗したら、上げ済みの Storage パスを `deleteObject` して元の例外を再送出する。画像ドキュメントに `size`（原本の bytes）を保存する | vitest（サムネイル失敗で原本が削除される、`setDoc` 失敗で原本＋サムネイルが削除される、`size` が書かれる） |
| B4 | プロジェクト詳細の招待一覧（`[projectId]/page.tsx` の `getInvitationStatus` と期限表示）を `effectiveDeadline` に統一。admin 側 `viewingWindow.ts` にテストを追加 | 既存ページテストに閲覧期限切れの招待が「期限切れ」と出るケースを追加 |
| B5 | 3 画面のグリッド `<Image src>` を `img.thumbnails?.small ?? img.url` に | ページテストで `thumbnails.small` が使われることを確認 |
| B6 | `getGalleryUrl`: `NEXT_PUBLIC_WEB_URL` 未設定かつ `window.location.hostname` が `localhost` / `127.0.0.1` でなければ例外を投げ、招待作成画面でエラーメッセージとして表示する | vitest |
| B7 | `admin/src/app/admin/layout.tsx` の `router.replace` を `useEffect` へ。`invitations/[id]/page.tsx` の clipboard を await + catch | 既存テスト通過 |
| B8 | `deleteProject`: 各招待について `sessions` を `where('invitationId','==', id)` で取得して同じバッチで削除 | vitest（sessions が削除される） |
| B9 | `dashboard`, `[projectId]`, `invitations/[id]` の読み込み失敗を空状態と区別し、Ant Design の `Alert`（再試行ボタン付き）で表示 | ページテスト |
| B10 | `userService.getUsers` の `orderBy('createdAt')` を外し、クライアント側で `createdAt` 降順（無いものは末尾）に並べる | vitest |
| B11 | `utils/imageCompression.ts`、`utils/thumbnailGenerator.ts`、`types/index.ts` のレガシー型が本当に未使用なら削除（型だけ使われている場合はその型を利用側に移す） | `npm run build` 成功 |
| B12 | HEIC / `type` 空ファイル: 受け入れる MIME を `image/jpeg`, `image/png`, `image/webp` の許可リストにし、外れたファイルはファイル名付きでメッセージを出して弾く（変換は今回はしない） | ページテスト |

完了条件: `cd admin && npm run lint && npx vitest run && npm run build` がすべて成功。

## WP-C: Firebase ルール・ルート設定・ドキュメント（`firestore.rules`, `storage.rules`, `firebase.json`, `firestore.indexes.json`, `CLAUDE.md`, `scripts/`, 新規 `rules-tests/`）

対象 ID: S1, S2（ルール側）, S3, S4, H3, H4, H5, H6, H7, H8, I1

| # | 作業 | 受け入れ条件 |
|---|---|---|
| C1 | `firestore.rules` に以下を適用（`findings.md` S3, S4）。<br>・`users`: `create: false`、`update`/`delete`: `isAdmin()` のみ、`get`/`list` は現状維持。`isRegisteredUser()` を削除。<br>・`images`: `create` と `delete` を `isAdmin()`（`projectId` の検査は残す）。`update` は `isAdmin()` または「有効セッション かつ セッションの招待が有効 かつ `imageId in invitation.imageIds` かつ likeCount のみ ±1」。`resource.data.userId == request.auth.uid` 条項は削除。<br>・`likes`: `list`/`create`/`delete` に「セッションの招待が有効」を追加し、`create` に `imageId in invitation.imageIds` を追加。<br>・`sessions`: `create` は `invitationId is string` かつその招待が有効。`update` は `invitationId` を変える場合のみ新しい招待が有効であることを要求。<br>・`invitations`: 非管理者の `update` は「有効セッション かつ `invitationId == sessionInvitationId()` かつ 招待が有効 かつ affectedKeys が accessCount/lastAccessedAt のみ かつ `accessCount == resource + 1` かつ `lastAccessedAt == request.time`」。<br>ヘルパー `invitationData(id)` / `invitationUsable(id)` / `sessionInvitationUsable()` / `imageInSessionInvitation(imageId)` を追加。 | C4 のテストが全件通る |
| C2 | `storage.rules`: `isAdmin()` を `firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.role == 'admin'` で定義（context7 で Cloud Storage ルールのクロスサービス構文を確認してから書く）。`images` / `thumbnails` の `read` は `request.auth != null`、`create` は `isAdmin() && request.auth.uid == userId && isImageType() && isValidSize()`、`delete` は `isAdmin()`。`/profiles` ブロックを削除 | C4 のテストが通る。クロスサービス参照がエミュレータで動かない場合は理由を報告し、`create` を `request.auth.token.firebase.sign_in_provider != 'anonymous'` にする代替案で進める |
| C3 | `firebase.json`: hosting ブロックを削除し、`emulators`（auth, firestore, storage, ui 無効）を追加。`firestore.indexes.json` から未使用 5 本（`findings.md` H4）を削除 | `firebase emulators:exec` が設定を読める |
| C4 | ルート直下に `rules-tests/`（独立した `package.json`、`@firebase/rules-unit-testing` + vitest）を作り、`findings.md` の「クライアント操作」を許可／拒否の両面で固定する。最低限: 匿名の Storage アップロード拒否・管理者は許可、管理者の他人パス削除許可、匿名の users 自己作成拒否、匿名の images 作成拒否、有効な招待でのセッション作成→like→likeCount+1 が通る、失効した招待ではセッション作成と like が拒否される、招待外の imageId の like 拒否、accessCount の +1 以外拒否、invitations の list 拒否、users の list 拒否、likes の list が自分の招待に限定される。実行は `firebase emulators:exec --only auth,firestore,storage --project demo-photo-gallery "npm test"` を `rules-tests/package.json` の `test:emu` にする | `cd rules-tests && npm run test:emu` が全件成功（初回はエミュレータ JAR のダウンロードが走る） |
| C5 | `CLAUDE.md` の陳腐化（`findings.md` H6）を全項目直す。admin は Vercel、Firebase CLI は rules / indexes のみ、Anonymous プロバイダ必須、`rules-tests` の実行方法、admin の `npm run lint` は `eslint .`、管理者作成は Console で `users/{uid}` に `role: 'admin'`・`email`・`createdAt` を作る手順、`cors.json` の適用コマンド（`gsutil cors set cors.json gs://photo-gallery-app-20251204.firebasestorage.app`）を追記 | 記載と実コードの不一致が無い |
| C6 | `scripts/create-admin.mjs` / `.ts`: 先頭コメントで「現行ルールではクライアント SDK からの users 作成は拒否される。Console で作成すること」と明記し、`.ts` の重複は削除 | — |

完了条件: `cd rules-tests && npm run test:emu` 成功。`firestore.rules` / `storage.rules` の変更点と、それぞれがどのクライアント操作に対して検証済みかを報告に列挙する。**デプロイはしない**。

## WP-D: mobile（`mobile/` 配下と `docs/native-app/decisions.md`）

対象 ID: F2（mobile 側）, F10, F11, F15, H1（`expo-network`）

| # | 作業 | 受け入れ条件 |
|---|---|---|
| D1 | `manifest.ts` / `handleMessage.ts`: `imageIds` が 500 を超える場合は 500 件ずつ manifest を取得して結合する。サーバーの 400 を `manifest_failed` にせず、件数超過は `too_many_items` を返す。`bytes` が manifest に無い項目は推定を使うが、**推定合計で `too_many_items` にしない**（件数上限 `MAX_BATCH_ITEMS` だけを拘束にし、空き容量チェックは `insufficient_storage` として別に判定する） | jest（501 件で 2 回取得、409 件が通る、実 bytes があれば合計で判定） |
| D2 | `saveToLibrary.ts` / `saveBatch.ts`: expo-file-system 57 の `DownloadTask`（context7 で API を確認）を使い、項目ごとに 60 秒のタイムアウト、キャンセル時は進行中のダウンロードも abort。一時ファイルを掃除 | jest（タイムアウトで該当項目が failed になり残りは続く、キャンセルで進行中が止まる） |
| D3 | `GalleryWebView.tsx`: Android の `BackHandler` で `canGoBack` なら `goBack()`、無ければ既定動作 | typecheck 通過。手動確認は未検証と報告 |
| D4 | `isAllowedNavigation.ts`: `mailto:` と `tel:` を外部で開けるようにする。`javascript:` / `data:` / `intent:` / `file:` は引き続き拒否 | 既存テストに追加 |
| D5 | `inject.ts` の nonce を `expo-crypto` の `getRandomBytes(16)` の hex にする（`npx expo install expo-crypto`） | typecheck 通過。ネイティブビルドが必要になる旨を報告 |
| D6 | 未使用の `MeteredConfirmMessage` 型、`BatchResult.interrupted`、`expo-network` 依存を削除し、`docs/native-app/decisions.md` に「従量課金警告は見送り」を 1 項目追記。`escape-string-regexp` を devDependencies に追加 | typecheck / jest 通過 |
| D7 | `validate.ts` の `sanitizeBaseName` の切り詰めをコードポイント単位に | jest |
| D8 | `handleMessage.ts`・`saveBatch.ts`・`manifest.ts` に単体テストを追加（分岐: 重複 requestId、キャンセル、部分失敗、403/404/429/500 の対応） | `npx jest` 全件成功 |

完了条件: `cd mobile && npm run typecheck && npx jest` 成功。

## 引き継ぎ後の全体検証（オーケストレータが実行）

```bash
cd web && npm run lint && npx vitest run && npm run build
cd admin && npm run lint && npx vitest run && npm run build
cd mobile && npm run typecheck && npx jest
cd rules-tests && npm run test:emu
git status --short
```

## ユーザーの判断が必要な事項（作業者は実行しない）

1. **ルールのデプロイ**: `firebase deploy --only firestore:rules,storage:rules,firestore:indexes`。Storage の `create` が管理者限定になるため、デプロイ後に管理画面から 1 枚アップロードして確認する。
2. **失効済みトークンの履歴からの除去**: リポジトリは公開。トークンは失効済みなので必須ではないが、履歴を書き換えるなら `git filter-repo` を別途。
3. **Vercel の環境変数**: admin プロジェクトに `NEXT_PUBLIC_WEB_URL=https://gallery.non-turn.com` が設定されているか確認（F8）。
4. **`cors.json` の適用状況**と、デプロイ済みルール・インデックスがリポジトリと一致しているかの確認（`firebase firestore:indexes` / Console）。
5. **mobile の再ビルド**: WP-D は `expo-crypto` 追加と保存ロジック変更を含むため EAS ビルドと実機確認が必要。
6. 設計変更を伴う推奨事項（`findings.md` §4 の I2, I3, I4, I13, I14）を次のスプリントに入れるか。

---

## 実施結果（2026-09-02, Opus 4 エージェントで並列実施・Fable が検証）

すべての WP が完了し、オーケストレータが再実行した検証は以下のとおり全件成功。**commit・deploy は未実施**（作業ツリーに変更が残っている）。

| 対象 | コマンド | 結果 |
|---|---|---|
| web | `npm run lint` / `npx vitest run` / `npm run build` | 0 エラー 0 警告 / 20 ファイル 197 テスト成功（監査前 118） / 成功 |
| admin | `npm run lint` / `npx vitest run` / `npm run build` | 0 エラー 1 警告（`<img>`、既存） / 16 ファイル 232 テスト成功（監査前 173） / 成功 |
| mobile | `npm run typecheck` / `npx jest` | 成功 / 10 スイート 150 テスト成功（監査前 76） |
| rules-tests | `npm run test:emu` | Firestore 49 + Storage 9 = 58 テスト成功。Storage ルールの `firestore.get()` はエミュレータで動作 |

### 計画からの逸脱（作業者の判断。妥当と確認済み）

- **WP-C**: グローバルの firebase-tools 15.6 は JDK 21 を要求し、環境は JDK 17 のため `rules-tests/` に firebase-tools 14.x を devDependency として pin した。JDK 21 を入れれば pin は外せる。
- **WP-B**: `eslint-config-next` を 16 に上げたことで `react-hooks` の新ルールが有効になり、既存の 7 エラーを `eslint-disable` 無しで修正した。`deleteProject` は Storage 削除に失敗した画像があるときプロジェクト文書も残す（「再実行してください」を成立させるため）。`src/test/setup.ts` に `@ant-design/v5-patch-for-react-19` を追加。
- **WP-D**: D2 は `DownloadTask` ではなく `File.downloadFileAsync` + `AbortSignal` を採用（`DownloadTask` には `idempotent` が無く既知の `DestinationAlreadyExists` 問題が再発するため）。`BatchResult.interrupted` と `AppState` 監視を削除。`handleMessage.ts` で manifest 取得前に件数超過を判定する事前チェックを追加（オーケストレータの追加依頼）。
- **WP-A**: `/api/image` は `firebasestorage.googleapis.com` の `images%2F` / `thumbnails%2F` 以外を 400 にする。既存の画像文書の `url` がすべてこの形式であることは本番データ未確認。`next/font` への切り替えで Noto Sans JP のフォントファイルがビルドに同梱される（ブラウザでの表示は未確認）。

### 残った既知事項（今回のバッチでは扱わない）

- `MAX_BATCH_ITEMS = 500` のため 500 枚超のギャラリーは一括保存できず `too_many_items` になる（上限の引き上げは設計判断）。
- `web` と `admin` の `viewingWindow.ts` は依然として手コピーの重複（I10）。
- `admin/package.json` の `@eslint/eslintrc` は `FlatCompat` を使わなくなったので未使用。`imageService.deleteImages`（一括）は呼び出し元が無い。
- `web/e2e/appstore-screenshots.spec.ts` と `review-demo.spec.ts` は `https://gallery.non-turn.com` を直書き（トークンは含まない）。
- `scripts/migrate-thumbnails.mjs` は元アップロード者の uid 配下に書くため、別の管理者で実行すると Storage の `create` が拒否される（コメントで注記済み）。
- 旧ドキュメントに `accessCount` / `likeCount` が無い場合、±1 のルールで拒否される。本番データは未確認。
- `findings.md` §4 の機能向上（I2 ストリーミング ZIP、I3 スワイプ、I4 高さ考慮 masonry、I13 セッション ID、I14 署名 URL など）は未着手。

### 適用状況（2026-09-03 更新）

**完了済み**

1. **commit と master への取り込み**: ブランチ `audit-2026-09-02-fixes` に 5 コミット、`--no-ff` で master へマージし push 済み（`19e3a5e..4d7c600`）。
2. **ルールのデプロイ**: `firebase deploy --only firestore:rules,storage:rules` を実行。公開リポジトリへ push する**前**に実行し、穴を塞いでから所見を公開した。
   デプロイ後、匿名認証で以下 7 つを本番に対して実際に試し、すべて拒否されることを確認した（Firestore・Storage には何も書かれていない）。
   Storage への匿名アップロード / `users` の自己作成 / `users` を `role: 'admin'` で自己作成 / `invitations` の列挙 / `users` の列挙 / `images` の列挙 / 存在しない招待でのセッション作成。
3. **インデックスのデプロイ**: `firebase deploy --only firestore:indexes --force` で未使用 5 本を削除し、本番は 4 本になった。
   静的解析だけに頼らず、管理者としてログインしてコード上の全 13 クエリを**削除前と削除後の両方**で本番に実行し、どちらも全件成功することを確認した
   （`images` の projectId+orderBy は 143 件、`invitations` の projectId+isActive+orderBy は 1 件など、実データが返る条件で確認）。
   削除した 5 本が未使用である根拠: `likes` と `sessions` のクエリはいずれも `orderBy` を持たない単一項目の等値条件で自動インデックスに収まり、
   `invitations` の `isActive` 単独クエリも同様。`likes.userId` は書き込むだけでクエリに使われていない。

**残り**

4. **管理画面からのアップロード 1 枚確認**。Storage の `create` が管理者限定になったため。管理者の資格情報が要るので未実施。
5. **Vercel の再デプロイ**（web と admin）。コード修正は再デプロイまで本番に反映されない。
6. **Vercel admin プロジェクトの `NEXT_PUBLIC_WEB_URL` 設定確認**。ローカルの `admin/.env.local` には設定されているが、Vercel 側は未確認。
7. **mobile の EAS 再ビルド**（`expo-crypto` 追加）と実機確認（Android 戻るキー、保存中キャンセル、`mailto:`）。
8. **`cors.json` の適用状況確認**。
9. **JDK 21 の導入**（firebase-tools 15 でエミュレータを回す場合。現状は `rules-tests` が 14 系を pin）。
