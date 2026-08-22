# Implementation Plan: 招待制ギャラリーのセキュリティ修正と配信品質改善

## 1. Overview

photo_gallery_app（撮影データ納品用の招待リンク型フォトギャラリー）に対して、次の4系統の修正を行う。

1. **アクセス制御の是正**（最優先）。現在の Firestore ルールは「Firebase 認証済みなら誰でも読める」設計で、web ギャラリーが匿名認証を使うため実質的に無制限公開になっている。招待リンクを本当のアクセス境界にする。
2. **選定結果（いいね）の業務接続**。クライアントが選んだ写真を管理画面から確認できるようにし、いいねを匿名UIDではなく招待単位に紐づけて端末をまたいで保持する。
3. **配信コストと表示速度の改善**。画像最適化APIのCDNキャッシュ、フォント読み込み、並び順の不整合を直す。
4. **保守性の回復**。壊れている admin の lint/test スクリプト、ドキュメントのドリフトを直す。

Phase 1〜3 を必須スコープ、Phase 4 を任意スコープとする。

## 2. Goal

**ユーザー（撮影クライアント）のゴール**: 受け取ったリンクから自分の納品写真だけを見て、気に入った写真を選び、端末を変えてもその選択が残っている状態で、原本をまとめてダウンロードできる。

**ビジネス（撮影者 / NonTurn LLC）のゴール**:

- 他クライアントの写真・氏名・メールアドレスが第三者から読めない状態にする（現状は読める）。
- クライアントが選んだ写真を管理画面で確認し、レタッチ・納品工程に渡せるようにする（現状はいいねデータが管理側からまったく見えない）。
- Vercel の関数実行と帯域を削減し、閲覧枚数が増えてもコストが線形に膨らまないようにする。

## 3. Current State

本セッションで実際に読んだコードとルールに基づく現状。

### 3.1 アクセス制御

- `firestore.rules:69` — `invitations` の read が `isAuthenticated()` のみ。
- `web/src/services/invitationService.ts` の `getInvitationByToken` は `where('token','==',token)` の**コレクションクエリ**でトークンを引いており、collection の list 権限に依存している。
- `web/src/services/authService.ts` は `signInAnonymously()` を使う。公開 API キー（デプロイ済みバンドルから取得可能）で匿名サインインできるため、**第三者が全招待ドキュメントを列挙し、token / clientName / clientEmail を取得できる**。招待リンクがアクセス境界として機能していない。
- `firestore.rules:49` — `images` の read も `isAuthenticated()` のみ。全プロジェクトの画像メタデータ（`url` を含む）が読める。`storage.rules` は `allow read: if true` なので URL が分かれば原本が取得できる。
- 期限判定は `web/src/services/invitationService.ts` の `validateInvitation` によるクライアント側のみ。ルール側に期限チェックが無いため、Firestore を直接叩けば期限切れリンクの画像も読める。
- `firestore.rules:24` に `hasValidSession()` が定義されているが、**どのルールからも参照されていない**。`sessions/{uid}` は web が書いているのに権限判定に使われていない。
- `firestore.rules:55` — `(onlyLikeCountChanged() && isAuthenticated())` により、任意の認証ユーザーが任意の画像の `likeCount` を任意の値に書き換えられる。
- `firestore.rules:61` — `likes` の read が `isAuthenticated()` のみで、他人の like を列挙できる。
- `web/src/app/layout.tsx` の metadata に robots 指定が無く、`/gallery/{token}` が検索インデックス対象になり得る。

### 3.2 選定結果

- admin 側のソースを全文検索した結果、いいねを表示する画面は存在しない（`likeCount` は型定義・テストフィクスチャ・削除処理にのみ登場）。
- `web/src/services/likeService.ts` の like ドキュメント ID は `${userId}_${imageId}`（`userId` は匿名 UID）。匿名 UID は端末・ブラウザごとに別なので、**スマホで選んだお気に入りが PC では見えず、ストレージ削除で消える**。
- `web/src/hooks/useInvitation.ts` は既存セッションがあれば `lastAccessedAt` の更新のみ行うため、同一端末で2つ目のギャラリーを開いても `sessions/{uid}.invitationId` は1つ目のまま残り、`accessCount` も増えない。

### 3.3 配信・表示

- `web/src/app/api/image/route.ts` の `Cache-Control` は `public, max-age=2592000` のみ。`s-maxage` が無く CDN 層でのキャッシュが効かないため、訪問者ごとに sharp のリサイズが走る。ホスト許可リスト・HTTPS 限定・`redirect: 'error'`・20MB 上限は既に実装済みで妥当。
- `web/src/app/layout.tsx` が Google Fonts を外部 `<link>` から読み込んでおり、レンダリングを1往復ブロックする（web lint の `@next/next/no-page-custom-font` 警告に対応）。
- `web/src/services/imageService.ts` の `getImagesByIds` が `createdAt` 降順に並べた直後、`web/src/hooks/useInvitation.ts` がファイル名で並べ直している（二重ソート）。しかも比較が `localeCompare(nameB, 'ja')` で `numeric: true` が無いため `IMG_10 < IMG_2` となり、admin 側の `naturalSortFiles`（アップロード順）と**閲覧順が一致しない**。
- `web/src/services/downloadService.ts` の `downloadImagesAsZip` は全画像 Blob をメモリ上の JSZip に保持し、既定の DEFLATE で JPEG を再圧縮したうえで `generateAsync({ type: 'blob' })` する。枚数が増えるとモバイルでメモリ不足になり、ZIP 生成中は進捗が止まって見える。
- `web/src/contexts/GalleryContext.tsx` は全画像を取得後に20件ずつ描画する方式（`PAGE_SIZE = 20`）。
- `web/src/services/imageService.ts` は画像1枚につき `getDoc` を1回呼ぶ。

### 3.4 保守性

- `admin/package.json` の `lint` が `next lint` のままで、Next.js 16 でこのコマンドが削除されたため実行不能（`Invalid project directory provided, no such directory: admin/lint`）。`test` スクリプトが存在せず、`npx vitest run` で直接起動する必要がある。
- web の lint は現時点で 16 errors / 7 warnings（うち7件は未追跡のデバッグスクリプト由来）。これがベースライン。
- `admin/src/services/imageService.ts:92-137` に `syncInvitationsOnImageDelete` / `syncInvitationsOnImageUpload` があり、`arrayRemove` / `arrayUnion` で招待の `imageIds` を同期している。
- `CLAUDE.md` に `/web` の記載が無く、Firestore スキーマ節に `projectId` / `invitations` / `sessions` が反映されていない。
- `back/`（NestJS）は初回コミット（2025-05-12, `4d6b2a0`）以降更新されていない。`front/`（Expo）は 2026-02-14 以降停止。
- Firebase エミュレータの設定は `firebase.json` に無い（`emulators` キーなし）。したがってルール変更の自動検証手段が現状は存在しない。

## 4. Scope

**Phase 1: アクセス制御の是正（必須）**

- `images` / `likes` のルールを `get` と `list` に分離し、匿名ユーザーからコレクション列挙を封じる。
- `likeCount` 更新を有効セッション保持者に限定し、変化量を ±1 に制約する。
- 招待をトークン自体をドキュメント ID とする構造に変更し、`invitations` の `list` を管理者のみにする。
- 招待の有効性（`isActive` / `expiresAt`）を Firestore ルールで強制する。
- 既存招待ドキュメントの移行スクリプトを追加する。
- `/gallery/{token}` に `noindex` を設定する。

**Phase 2: 選定結果の業務接続（必須）**

- like ドキュメントを招待単位（`${invitationId}_${imageId}`）に変更し、`invitationId` フィールドを保存する。
- 同一端末で別の招待を開いた際に `sessions/{uid}.invitationId` を更新する。
- admin の招待詳細画面に選定結果（枚数・サムネイル一覧・ファイル名リストのコピー）を追加する。

**Phase 3: 配信・表示・保守性（必須）**

- web の並び順を admin の自然順（数値対応）に揃え、二重ソートを解消する。
- `/api/image` に `s-maxage` / `immutable` / `stale-while-revalidate` を追加する。
- Google Fonts を `next/font` に移行する。
- ZIP を `compression: 'STORE'` にし、生成フェーズの進捗表示を追加する。
- `admin/package.json` の `lint` を `eslint` 直呼びに直し、`test` スクリプトを追加する。
- `CLAUDE.md` を実装に合わせて更新する。

## 5. Non-Scope

- ZIP のストリーミング生成（`client-zip` / StreamSaver / サーバー側 ZIP 生成）。Phase 3 ではメモリ問題の緩和までとし、根本対処は別計画とする。
- 画像メタデータ取得の一括化。`allow list` を開けない方針と衝突するため、計測を伴う任意タスク（task_017）に切り出す。
- `back/` の削除、`front/`（Expo）の継続判断。破壊的かつ事業判断を含むため任意タスクとし、実行前にユーザー確認を必須とする。
- Cloud Functions の導入（`likeCount` のサーバー集計など）。
- 認証方式の変更（匿名認証の廃止、パスコード追加など）。
- 既存 like データの移行は任意タスク（task_015）。実データがほぼ無い前提で、破棄も選択肢とする。
- web lint の既存16エラーの解消。ベースラインとして記録し、本計画では新規エラーを増やさないことのみを条件とする。
- UI のビジュアルデザイン変更、favicon / OG 画像の追加。

## 6. Assumptions

- Firebase Authentication の匿名認証は有効になっている（`signInAnonymously` を使う実装が本番稼働しているため）。
- 本番の web は Vercel プロジェクト `prj_iNPCBkmphuIEJAgcR1GOAFg9aBbK`（`https://web-kappa-neon-94.vercel.app`）、admin は `prj_xxy5XuVwHn5rw0wXK6mIb3rXN2kx`。admin の公開URLは未確認。
- 現在稼働中の招待リンクは少数で、移行スクリプトの実行中に短時間の不整合が生じても業務影響は許容できる。**この前提が誤っている場合、task_002 は無停止移行（新旧ID併存期間を設ける）に設計変更が必要。**
- Firestore セキュリティルールが `increment()` 変換後の値を `request.resource.data` で参照できるかは未検証。task_001 の `likeCount` 変化量制約はこの挙動に依存するため、実装時にエミュレータまたは本番検証で確認する。挙動が異なる場合は「セッション保持者のみ」に限定する形へ縮退させる。
- `nanoid(21)` の既定アルファベット（`A-Za-z0-9_-`）は Firestore のドキュメント ID 制約（`/` 不可、`.`/`..` 不可、`__.*__` 不可）に抵触しない。ただし理論上 `__…__` 形式が生成され得るため、task_002 では `customAlphabet` で `_` を除外する。
- 移行スクリプトは既存の `scripts/migrate-thumbnails.mjs` と同じ方式（web/node_modules の Firebase クライアント SDK + 管理者アカウントでのメール/パスワード認証）で動かす。サービスアカウント鍵は使わない。
- ルール変更の検証は当面手動（本番または Firebase コンソールのルールプレイグラウンド）で行う。自動化は task_016（任意）で導入する。
- 期限切れリンクを開いたクライアントに対しては、「無効化」と「期限切れ」を区別しない汎用メッセージで足りる（ルールで read を拒否するため理由を判別できなくなる）。

## 7. Architecture Impact

**Frontend (web)**: 招待の取得がクエリからドキュメント ID 直接取得に変わる（`getInvitationByToken` → `getInvitationByTokenId`）。権限拒否を「見つからない/無効」に正規化するエラーハンドリングが必要。like の識別子が招待単位になるため `LikeButton` / `GalleryContext` / `useInvitation` が受け渡す ID が変わる。フォント読み込みが `next/font` 経由に変わり `layout.tsx` の `<head>` が縮む。

**Frontend (admin)**: 招待作成が `addDoc` から `setDoc`（ID 指定）に変わる。招待詳細に選定結果セクションが増え、`likes` を `invitationId` で引く新規サービス関数が必要。`getInvitation(id)` は引数の意味が「ドキュメントID = トークン」になる（呼び出し側の変更は不要）。

**Backend**: なし（`back/` は本計画では触らない）。サーバー側処理は Next.js Route Handler `/api/image` のヘッダ変更のみ。

**Database (Firestore)**: `invitations` のドキュメント ID がトークンになる（データ移行あり）。`likes` のドキュメント ID 体系が変わり `invitationId` フィールドが追加される（インデックス追加あり）。`images` / `sessions` のスキーマ変更なし。

**Auth**: 認証方式は変更しない。ただし `sessions/{uid}` が権限判定に実際に使われるようになるため、セッション作成の失敗が閲覧不能に直結する。`useInvitation` のセッション作成は現在 try/catch の外にあるため、失敗時の扱いを明示する。

**Storage**: ルール変更なし。

**Infrastructure**: `firebase deploy --only firestore:rules` と `firestore.indexes.json` のデプロイが必要。Vercel 側の環境変数追加は不要。

## 8. UI Plan

**web / `/gallery/[token]`**

- 権限拒否時の表示を1系統に統合する。`ExpiredLink` コンポーネントを「このリンクは無効か、有効期限が切れています」の汎用文言で再利用する。現行の「無効化されています」「期限が切れています」の出し分けはルール側で理由が取れなくなるため廃止する。
- `noindex` はページ metadata で付与し、UI 上の変化はない。
- 並び順の変更により表示順が変わる（アップロード順＝ファイル名の自然順に一致する）。レイアウト自体は変更しない。
- ZIP 生成フェーズの進捗を `DownloadProgressModal` に追加する。既存の「取得済み枚数 / 総数」に加えて、全取得完了後は「ZIPを作成中…」の不定進捗表示に切り替える。レスポンシブ挙動は既存モーダルのまま。

**admin / `/admin/projects/[projectId]/invitations/[id]`**

- 既存の `Descriptions`（クライアント名・メール・画像数・アクセス数・有効期限・作成日）の下に「選定結果」カードを追加する。
- 表示要素: 選定枚数（`Statistic`）、選定画像のサムネイルグリッド、ファイル名一覧のクリップボードコピーボタン。
- 状態: 読み込み中（`Spin`）、0件（`Empty` で「まだ選定されていません」）、取得失敗（`message.error` + 再試行ボタン）。
- ブレークポイント: サムネイルグリッドは Ant Design の `Row`/`Col` で xs=12 / sm=8 / md=6 とする。

## 9. API Plan

新規エンドポイントは作らない。既存の1本のみ変更する。

**`GET /api/image`（`web/src/app/api/image/route.ts`）**

- リクエスト・レスポンスの形は変更しない（クエリ `url` / `w` / `q`、レスポンスは画像バイナリ）。
- 変更点はレスポンスヘッダのみ。`Cache-Control: public, max-age=<CACHE_MAX_AGE>, s-maxage=31536000, stale-while-revalidate=86400, immutable` とする。`Vary: Accept` は維持する。
- 認証は現状どおり無し。許可ホストリスト・HTTPS 限定・`redirect: 'error'`・Content-Type 検証・20MB 上限は変更しない。
- エラーハンドリングは既存のまま（400 / 403 / 413 / 500 / upstream ステータス透過）。

## 10. Database Plan

**`invitations`**

- ドキュメント ID: 自動生成 ID → `token` の値。`token` フィールドは互換のため残す（値はドキュメント ID と同一）。
- 移行: `scripts/migrate-invitation-ids.mjs` が全招待を読み、`token` を ID とする新ドキュメントを `setDoc` で作成する。旧ドキュメントの削除は `--delete-old` フラグを明示した場合のみ行う（既定はコピーのみ）。
- インデックス: 変更不要。`projectId` / `isActive` / `createdAt` の既存複合インデックスはそのまま使う。`token` に対する単一フィールドインデックスは不要になるが、`firestore.indexes.json` に定義は無いため削除作業もない。

**`likes`**

- ドキュメント ID: `${userId}_${imageId}` → `${invitationId}_${imageId}`。
- フィールド追加: `invitationId: string`。`userId` は最後に操作した匿名 UID の記録として残す。
- インデックス追加: `likes` に `invitationId` ASC + `createdAt` DESC の複合インデックスを `firestore.indexes.json` へ追加する（admin の選定結果取得で使用）。
- 制約: 同一招待・同一画像で1ドキュメント。既存の `runTransaction` による存在チェックを維持する。

**`images`**

- スキーマ変更なし。`likeCount` は「全招待を通じた合計」という既存の意味を維持する（招待別の件数は `likes` の件数で数える）。

**`sessions`**

- スキーマ変更なし。`invitationId` を再訪問時に更新する挙動変更のみ。

## 11. File-by-File Plan

| ファイル | 区分 | 目的 | 変更内容 | リスク |
|---|---|---|---|---|
| `firestore.rules` | modify | アクセス制御の是正 | `images` を `get`（認証済み）/ `list`（管理者のみ）に分離。`likes` を自分の like のみ read 可（+ 管理者）に。`likeCount` 更新を `hasValidSession()` かつ変化量 ±1 に制約。`invitations` を `get`（認証済みかつ `isActive` かつ未期限）/ `list`（管理者のみ）に分離。 | high |
| `firestore.indexes.json` | modify | 選定結果クエリ用 | `likes` に `invitationId` ASC + `createdAt` DESC の複合インデックスを追加 | low |
| `scripts/migrate-invitation-ids.mjs` | create | 招待IDのトークン化移行 | 全招待を読み `token` を ID とする新ドキュメントを作成。既定はコピーのみ、`--delete-old` で旧削除。件数と結果を標準出力に報告 | high |
| `web/src/services/invitationService.ts` | modify | トークン直接取得 | `getInvitationByToken` をコレクションクエリから `getDoc(doc(db,'invitations',token))` に変更。権限拒否（`permission-denied`）を `null` に正規化 | medium |
| `web/src/hooks/useInvitation.ts` | modify | エラー正規化・セッション更新・ソート統一 | 招待が取れない場合の文言を1系統に統合。既存セッションの `invitationId` が異なる場合は更新し `accessCount` も増やす。ファイル名ソートを自然順ユーティリティ呼び出しに置換 | medium |
| `web/src/utils/naturalSort.ts` | create | 並び順の共通化 | ファイル名の自然順比較関数（`localeCompare` に `numeric: true` を指定）。admin の `naturalSortFiles` と同じ規則 | low |
| `web/src/services/imageService.ts` | modify | 二重ソート解消 | `getImagesByIds` 内の `createdAt` ソートを削除し、並び順の責務を呼び出し側に一本化 | low |
| `web/src/services/likeService.ts` | modify | like を招待単位に | like ID を `${invitationId}_${imageId}` に変更。`invitationId` を保存。`getLikedImageIds` を `invitationId` 引数に変更 | medium |
| `web/src/components/LikeButton.tsx` | modify | 招待IDの受け渡し | `toggleLike` に `invitationId` を渡す（`useGallery()` の `invitation` から取得） | low |
| `web/src/app/(gallery)/gallery/[token]/page.tsx` | modify | noindex | ページ metadata に `robots: { index: false, follow: false }` を追加 | low |
| `web/src/app/(gallery)/liked/page.tsx` | modify | noindex | 同上 | low |
| `web/src/app/layout.tsx` | modify | フォント読み込み | Google Fonts の `<link>` を削除し `next/font/google` で `Instrument_Serif` / `Outfit` / `Noto_Sans_JP` を読み込む。Storage への `preconnect` は維持 | medium |
| `web/src/app/api/image/route.ts` | modify | CDNキャッシュ | `Cache-Control` に `s-maxage` / `stale-while-revalidate` / `immutable` を追加 | low |
| `web/src/services/downloadService.ts` | modify | ZIPのメモリ・CPU削減 | `generateAsync` に `compression: 'STORE'` を指定。取得完了後に生成フェーズを通知するコールバック引数を追加 | medium |
| `web/src/components/DownloadProgressModal.tsx` | modify | 生成フェーズ表示 | 生成中の不定進捗表示を追加 | low |
| `web/src/hooks/useBulkDownload.ts` | modify | 生成フェーズ状態 | `downloadImagesAsZip` の新コールバックを受けて状態を保持 | low |
| `admin/src/services/invitationService.ts` | modify | ID指定作成 | `createInvitation` を `addDoc` から `setDoc(doc(db,'invitations',token))` に変更。トークン生成を `customAlphabet`（`_` 除外）に変更 | medium |
| `admin/src/services/likeService.ts` | create | 選定結果取得 | `getLikesByInvitation(invitationId)` を追加し、`invitationId` で `likes` を取得して `imageId` 配列を返す | low |
| `admin/src/services/index.ts` | modify | エクスポート追加 | 新サービスを再エクスポート | low |
| `admin/src/app/admin/projects/[projectId]/invitations/[id]/page.tsx` | modify | 選定結果UI | 選定枚数・サムネイルグリッド・ファイル名コピーを追加 | medium |
| `admin/package.json` | modify | スクリプト修復 | `lint` を `eslint` 直呼びに変更、`test`（`vitest run`）と `test:watch` を追加 | low |
| `CLAUDE.md` | modify | ドキュメント整合 | `/web` の節を追加。Firestore スキーマに `projectId` / `invitations` / `sessions` を反映。admin のルートを実際のパスに修正。ルール方針の記述を新ルールに合わせる | low |
| `admin/src/services/__tests__/invitationService.test.ts` | modify | 既存テスト追随 | `addDoc` → `setDoc` のモック期待値を更新 | medium |
| `web/src/services/likeService.test.ts` | create | 新規テスト | 招待単位の like ID 生成と `getLikedImageIds` の引数変更を検証 | low |
| `web/src/utils/naturalSort.test.ts` | create | 新規テスト | `IMG_2 < IMG_10` を含む自然順の検証 | low |
| `web/src/services/downloadService.test.ts` | modify | 既存テスト追随 | `STORE` 指定と生成フェーズ通知の検証を追加 | medium |

## 12. Implementation Order

Phase 1（アクセス制御）

1. `task_001` Firestore ルールの分離とハードニング（`images` / `likes` / `likeCount`）
2. `task_002` 招待トークンのドキュメントID化（ルール・web・admin・移行スクリプト）
3. `task_003` ギャラリーページの `noindex`

Phase 2（選定結果）

4. `task_004` like を招待単位に変更（web・ルール・インデックス）
5. `task_005` セッションの招待ID更新とアクセスカウント修正
6. `task_006` admin 招待詳細に選定結果を表示

Phase 3（配信・表示・保守性）

7. `task_007` 並び順を自然順に統一
8. `task_008` `/api/image` の CDN キャッシュヘッダ
9. `task_009` `next/font` への移行
10. `task_010` ZIP の `STORE` 化と生成フェーズ進捗
11. `task_011` admin の lint / test スクリプト修復
12. `task_012` `CLAUDE.md` の更新

Phase 4（任意・実行前に個別確認）

13. `task_013` サーバー側ギャラリー取得API（Admin SDK）への移行
14. `task_014` 既存 like データの移行
15. `task_015` `back/` の削除と `front/` の継続判断
16. `task_016` ルールのユニットテスト（エミュレータ導入）
17. `task_017` 画像メタデータ取得の一括化（計測が前提）

## 13. Verification Commands

リポジトリに実在するコマンドのみを記載する。

```bash
# web（web/package.json に定義あり）
cd web && npm run build
cd web && npm test
cd web && npm run lint

# admin（build のみ定義あり。test スクリプトは task_011 で追加するまで npx 起動）
cd admin && npm run build
cd admin && npx vitest run

# ルール・インデックスのデプロイ（firebase.json / .firebaserc あり）
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

存在しないため使えないもの:

- `npm run typecheck`（両プロジェクトに未定義。型検査は `npm run build` が実行する）
- `cd admin && npm run lint`（`next lint` が Next.js 16 で廃止され実行不能。task_011 完了後に使用可能になる）
- `cd admin && npm test`（未定義。task_011 完了後に使用可能になる）
- Firebase エミュレータ関連コマンド（`firebase.json` に `emulators` 設定が無い。task_016 で導入する場合のみ）

ベースライン（変更前に確認済みの値）:

- `cd web && npm test` → 5 files / 22 tests passed
- `cd admin && npx vitest run` → 10 files / 103 tests passed
- `cd web && npm run lint` → 16 errors / 7 warnings（うち7 errors は未追跡のデバッグスクリプト由来）
- `cd web && npm run build` / `cd admin && npm run build` → いずれも成功

## 14. Acceptance Criteria

**アクセス制御**

- 匿名認証のみのクライアントから `invitations` コレクションへのクエリ（list）が `permission-denied` で失敗する。
- 匿名認証のみのクライアントから `images` コレクションへのクエリ（list）が `permission-denied` で失敗する。
- 有効な token を持つクライアントは `invitations/{token}` の単一ドキュメント取得に成功する。
- `isActive: false` または `expiresAt` が過去の招待は、単一ドキュメント取得も `permission-denied` で失敗する。
- 上記の失敗時、web は例外を表示せず「リンクが無効か期限切れ」の画面に遷移する。
- 匿名クライアントが他人の like を列挙できない。
- 匿名クライアントが `likeCount` を ±1 以外の値に更新できない（この判定が rules で不可能と判明した場合は、有効セッション必須までを達成条件とし、計画を更新する）。
- `/gallery/{token}` と `/liked` のレスポンスに `noindex` が含まれる。

**選定結果**

- web で写真をお気に入りにすると `likes/{invitationId}_{imageId}` が作られ、`invitationId` フィールドを持つ。
- 同じ招待リンクを別のブラウザ（別の匿名UID）で開くと、先に付けたお気に入りが反映されている。
- admin の招待詳細に選定枚数と選定画像のサムネイルが表示される。0件時は空状態が表示される。
- 選定画像のファイル名一覧をクリップボードにコピーできる。

**表示・配信**

- ギャラリーの表示順が admin のアップロード順（ファイル名の自然順）と一致し、`IMG_2` が `IMG_10` より前に表示される。
- `/api/image` のレスポンスヘッダに `s-maxage` が含まれる。
- ギャラリーページの HTML に `fonts.googleapis.com` への `<link rel="stylesheet">` が含まれない。
- ZIP ダウンロードで全取得後に「ZIP作成中」の状態が表示され、生成された ZIP 内の画像が無圧縮格納（STORE）である。

**リグレッションと検証**

- `cd web && npm test` が全パス（新規テストを含む）。
- `cd admin && npx vitest run` が全パス。
- `cd web && npm run build` と `cd admin && npm run build` が成功。
- `cd web && npm run lint` のエラー数がベースライン（16）を超えない。
- 既存の稼働中招待リンクが移行後もそのまま開ける。
- モバイル（iOS Safari / Android Chrome）でギャラリー表示・お気に入り・単体ダウンロードが従来どおり動作する。

## 15. Repair Loop

1. 該当フェーズの検証コマンドを実行する（`cd web && npm test` → `cd web && npm run build` → `cd admin && npx vitest run` → `cd admin && npm run build`）。
2. 失敗した出力をそのまま記録する。要約や推測に置き換えない。
3. エラーを task_id に対応づける。対応先が判別できない場合は、直前に変更したファイルを含む task を起点にする。
4. 当該 task の `files_to_modify` に列挙されたファイルのみを修正する。他タスクのファイルには触らない。
5. 検証コマンドを再実行する。ベースラインを下回っていないことも確認する。
6. 実装が計画と乖離した場合（例: rules が `increment` 後の値を参照できず `likeCount` 制約が実装不能だった場合）、`docs/implementation-plan.md` の該当節と `docs/task-list.json` の該当 task、`docs/acceptance-checks.json` の該当 check を更新してから次へ進む。乖離を黙って残さない。
7. Firestore ルール・インデックスに関わる変更は、デプロイ（`firebase deploy --only firestore:rules,firestore:indexes`）後に本番の web で1本の招待リンクを実際に開いて確認する。自動テストが存在しないため、この手動確認を省略しない。
