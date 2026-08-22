# Implementation Plan: 写真閲覧画面のネイティブ化（WebView シェル + フォトライブラリ直接保存）

**版**: v2（Gemini `gemini-3.5-flash` と Codex による敵対的レビューを反映）
**レビュー記録**: `docs/native-app/adversarial-review.md`（採用・部分採用・却下の全件と、公式ドキュメントによる裁定）

> **出力先について**: `docs/` 直下には別機能の計画（`docs/implementation-plan.md` = 招待制ギャラリーのセキュリティ修正と配信品質改善、未コミット）が既に存在する。上書きすると Git 履歴のない作業成果が失われるため、本計画は `docs/native-app/` 配下に分離して作成する。両計画の依存関係は「6. Assumptions」に明記する。

## 1. Overview

撮影データ納品用の招待制フォトギャラリー（`web`）を、iOS / Android のネイティブアプリから利用できるようにする。目的はただ一つ、**クライアントが写真を端末のフォトライブラリ（iPhone の「写真」/ Android のギャラリー）へ直接保存できるようにすること**である。現状 iOS Safari では画像を長押しして「"写真"に追加」を選ぶ手動操作しか手段がなく（`web/src/components/IosSaveGuide.tsx` がその案内を出している）、複数枚の一括保存は不可能である。

UI は既存の web UI をそのまま使う（ユーザー指示）。したがって React Native での画面再実装は行わず、**Expo による薄いネイティブシェルが `react-native-webview` で本番の web ギャラリーを表示し、保存操作だけをブリッジ経由でネイティブ側の `expo-media-library` に委譲する**構成とする。

配布形態は「web が主、アプリは保存機能を追加する任意のクライアント」である。招待リンク（`https://<domain>/gallery/{token}`）はアプリ未インストールでも従来どおりブラウザで開き、インストール済みならユニバーサルリンク / App Links でアプリが開く。

**v2 での最大の変更**: 敵対的レビューで「ネイティブ側の URL 許可リストは認可ではない」という指摘を受けた。web から渡された画像 URL をホスト名だけ検証して保存する初版の設計では、同じ Firebase Storage ホスト上にある**他クライアントの写真を保存させられる**。ストア公開前にサーバー側の認可済みマニフェスト API を必須とし、Phase 1 でもブリッジの検証を厳格化する（「9. API Plan」参照）。

## 2. Goal

**ユーザー（撮影クライアント）のゴール**: 受け取った招待リンクをスマートフォンで開き、気に入った写真を選び、**選んだ写真をタップ数回で自分の端末のカメラロールに保存できる**。1枚ずつでも、お気に入り全件まとめてでも保存できる。

**ビジネス（撮影者 / NonTurn LLC）のゴール**:

- 「写真が保存できない / 保存方法が分からない」という納品後の問い合わせをなくす。現状 iOS・Android それぞれに保存手順の案内 UI を出しており、これは体験の失敗を UI で補填している状態である。
- ZIP ダウンロード（`web/src/services/downloadService.ts`）はデスクトップ前提の導線であり、モバイルでは実質使えない。モバイルの一括受け取り手段を初めて成立させる。
- UI を web に一本化したまま実現し、画面の二重メンテナンスを発生させない。
- **他クライアントの写真が第三者の端末に保存され得る状態を作らない。** これは新規のゴールではなく、既存の情報管理責任をネイティブ化で悪化させないという制約である。

## 3. Current State

本セッションで実際に読んだコードに基づく現状。

### 3.1 閲覧画面（`web`、Next.js 16 / React 19 / Tailwind 4、ポート 3002）

- ルート: `web/src/app/(gallery)/gallery/[token]/page.tsx`（一覧）、`web/src/app/(gallery)/liked/page.tsx`（お気に入り、`?token=` クエリ）。どちらも `'use client'` で、データ取得は全てクライアント側の Firebase SDK。ただし **`'use client'` でも Next.js は初期 HTML をサーバーで生成する**ため、レンダリング結果がサーバーとクライアントで食い違うと hydration エラーになる（「8. UI Plan」の分岐方針の根拠）。
- 認証: `web/src/services/authService.ts` の `signInAnonymously()`。招待の取得は `web/src/services/invitationService.ts` の `getInvitationByToken`（`where('token','==',token)` のコレクションクエリ）。
- 画像取得: `web/src/services/imageService.ts` が `imageIds` を `getDoc` で1件ずつ引く。並びは `web/src/hooks/useInvitation.ts` が `storagePath` のファイル名で再ソート。
- 表示: `MasonryGrid`（CSS グリッドを列分割）→ `ImageCard` → `ImageLightbox`。ページングは `web/src/contexts/GalleryContext.tsx` の 20 件ずつレンダリング。
- 画像配信: サムネイルは Firestore の `thumbnails.small` / `thumbnails.medium`、なければ自前の最適化 API `web/src/app/api/image/route.ts`（sharp、許可ホスト限定、20MB 上限）。原本は Firebase Storage の `image.url`。

### 3.2 保存まわりの現状（＝本計画が解決する対象）

- `web/src/services/downloadService.ts` の `downloadSingleImage` は、iOS / Android を検出すると **`window.open(image.url, '_blank')` で新規タブに開くだけ**で、保存はユーザーの手作業に委ねている。
- `web/src/components/IosSaveGuide.tsx`: 「写真を長押しして『"写真"に追加』を選択してください」。
- `web/src/components/AndroidSaveGuide.tsx`: 「画像が新しいタブで開きます。画像を長押しして『画像をダウンロード』を選択してください」。
- `web/src/components/WelcomeGuide.tsx`: 「※ スマートフォンは機種・ブラウザにより保存方法が異なります。**PC からのダウンロードを推奨します**」と明記されている。モバイルでの保存が成立していないことを製品側が自認している。
- `web/src/components/ShareButton.tsx`: `navigator.share({ files:[...] })` による単体共有。Android では非表示。複数枚同時共有は未実装。
- 一括は ZIP のみ（`downloadImagesAsZip` → `file-saver`）。iOS Safari で ZIP を受け取っても写真アプリには入らない。

### 3.3 既存の `front/`（Expo アプリ）は流用できない

- `front/package.json` の依存に **`firebase` も `@react-native-async-storage/async-storage` も入っていない**。にもかかわらず `front/src/config/firebase.ts` はその両方を import しており、`front/src/services/*` も Firebase 依存である。`front/node_modules` は空（0 エントリ）。現状のままでは起動しない。
- 実際に画面が使っている経路は Firebase ではなく `BACKEND_URL`（NestJS の `back/`）への axios 呼び出しであり（`front/src/screens/ImagesScreen.tsx`）、`web` の招待制ギャラリーとはデータモデルもアクセス制御も別物である。
- 一方で `expo-media-library` / `expo-file-system` を使った保存処理の前例は存在する（`front/src/screens/ImagesScreen.tsx:283-291`、`front/src/screens/LikedImagesScreen.tsx:36-46`）。**API の使い方の参考にはするが、コードベースとしては流用せず新規に `mobile/` を作る**。
- `front/` の存廃は既存計画 `docs/task-list.json` の task_015（任意）で扱われている。本計画では `front/` を一切変更しない。

### 3.4 アクセス制御の現状（v2 で重要度を引き上げ）

- `firestore.rules`: `images`（49行）/ `likes`（61行）/ `invitations`（69行）の read がいずれも `isAuthenticated()` のみ。匿名認証で誰でも通る。
- `storage.rules`（20行）: `images/{userId}/{imageId}` は `allow read: if true`（完全公開）。
- 別計画 `docs/implementation-plan.md` はこの状態を「実質的に無制限公開」と記載しており、その是正が task_001 / task_002 / task_004 である。
- **ネイティブ化はこの穴を塞がないどころか、「任意の公開 Storage 画像を第三者の端末の写真アプリに書き込める道具」を新たに作り出す。** したがって別計画の是正はストア公開の前提条件であり、加えて本計画側でも認可を持つ必要がある（「9. API Plan」）。

### 3.5 ビルド・テストのベースライン（本セッションで実測）

- `cd web && npm test` → 5 files / 22 tests passed
- `cd web && npm run lint` → 23 problems（**16 errors / 7 warnings**）。うち 7 errors は未追跡のデバッグスクリプト（`web/*.js`）由来。
- `mobile/` は未作成のため検証コマンドは存在しない。

## 4. Scope

**ゲート 0: Web Share API による代替の可否 — 判断済み（却下）**

- 決定の詳細は `docs/native-app/decisions.md` の D1 を参照。
- ユーザーが事前に複数の手段を試した結果、Web Share API 経由の保存は**技術的に不可能なのではなく、求めるユーザビリティを満たさない**（共有シートを経由する手順が煩雑で、納品先のクライアントに提示できる UX にならない）と判断された。
- **したがってネイティブアプリを実装する。** ゲート 0 のタスク（`task_000`）は却下として完了扱いとする。

**ゲート 1: 配布形態と配信ドメイン — 一部判断済み**

- **配布形態（D2）**: 公開ストア（App Store / Google Play）を第一候補とし、App Store 4.2 で却下された場合に TestFlight 外部配布へ切り替える。
  - 「クライアント限定だから内部配布で足りる」という当初の想定は成立しない。TestFlight の内部テスターは App Store Connect のチームメンバー（最大100名）に限られ、クライアントは招待できない。クライアントに配る場合は外部テスター扱いとなり **Beta App Review を通る**（Apple 公式: グループに追加された時点で自動的に審査へ回る）。
  - さらに **TestFlight のビルドは 90 日で失効する**（App Store Connect ヘルプに明記）。TestFlight 運用は3か月ごとの再ビルドが恒久的に必要になり、納品期間中のクライアントが開けなくなるリスクを抱える。
  - 最終確定は `task_015`（実機ビルド後の go/no-go 判断）で行う。
- **配信ドメイン（D3）**: 独自ドメインを用意する方針で確定。**具体的なドメイン名は未確定**であり、`task_010`（ディープリンク設定）の着手前に決める必要がある。
- Apple Developer Program / Google Play Console の登録、および `eas login` / `eas init` は人間が実施する（対話が必要なためエージェントでは実行できない）。

**Phase 1: ネイティブシェルと保存（必須）**

- `mobile/` に Expo アプリを新規作成する（**SDK バージョンを明示 pin**、TypeScript、`react-native-webview`、`expo-media-library`、`expo-file-system`、`expo-linking`、`expo-secure-store`、`expo-keep-awake`）。
- WebView で本番 web の招待ギャラリー URL を表示する。ナビゲーションは `URL` パースによる**厳密な origin 一致**で自オリジンに限定し、外部リンクは OS の既定ブラウザへ逃がす。WebView プロセスのクラッシュから復帰する。
- **多重のネイティブ検出**（カスタム User-Agent 接尾辞 + `window.ReactNativeWebView` の存在 + 注入グローバル）とバージョン交渉つきのブリッジを定義する。
- ネイティブ側で「入力検証 → キャッシュへ**ファイル名を明示して**ダウンロード → `MediaLibrary.saveToLibraryAsync` → キャッシュ削除」を実行する。iOS は**書き込み専用権限**（`requestPermissionsAsync(true)` + `NSPhotoLibraryAddUsageDescription`）で完結させる。
- 一括保存は進捗通知・キャンセル・部分失敗・**総バイト上限・空き容量チェック・セルラー警告**に対応する。
- web 側にネイティブ検出を追加し、**hydration mismatch を起こさない方法で**保存ボタンの挙動をブリッジ呼び出しに差し替え、保存手順の案内 UI と ZIP 導線を非表示にする。

**Phase 2: 認可の是正（必須、ストア公開前に完了させる）**

- サーバー側の認可済みマニフェスト API を追加する。ネイティブは画像 URL ではなく `token + imageId[]` を送り、サーバーが招待の有効性と所属を検証して URL を返す。
- 別計画 `docs/implementation-plan.md` の task_001 / task_002 / task_004 の完了を確認する。

**Phase 3: 導線と配布（必須）**

- カスタムスキーム（`photogallery://`）、iOS ユニバーサルリンク、Android App Links を設定する。**パスとクエリを保持する起動 URL 解決**を実装する。
- Android の生成マニフェストを監査し、不要な `READ_MEDIA_*` 権限が入らないことを確認する。
- **web 側に「アプリで開く」導線（iOS Smart App Banner ほか）を実装する**（v1 では任意だったが、同一ドメイン内で universal link をタップしても Safari に留まる Apple の仕様のため必須）。
- EAS Build を設定し、内部配布ビルドで実機確認する。
- ストア提出物を用意する。

**Phase 4: 回帰とドキュメント（必須）**

- web 側にネイティブ分岐のユニットテストを追加する。
- アクセシビリティを確認する。
- `CLAUDE.md` に `mobile/` を追記する。

## 5. Non-Scope

- **UI の React Native 再実装**。ユーザー指示により web UI を使う。RN 版の一覧・ライトボックスは作らない。
- **web ギャラリーの置き換え**。web は引き続き主たる配信手段であり、アプリは任意の追加手段とする。
- **web UI の静的エクスポート（アプリ内同梱）**。Next.js App Router の `output: 'export'` は `web/src/app/api/image/route.ts`（`request.nextUrl.searchParams` を使う動的 Route Handler）および `/gallery/[token]` の動的ルートと両立せず、web 側の構造変更を要する。本計画ではリモート URL 読み込みとする。
- **オフライン閲覧・写真のローカルキャッシュ同期**。
- **バックグラウンド転送**（`expo-task-manager` による中断耐性のあるダウンロード）。中断時は再実行で対応する。
- **モバイルでの ZIP ダウンロード**。フォトライブラリ直接保存に置き換えるため不要。web（PC）側の ZIP は現状維持。
- **admin パネルのネイティブ化**、プッシュ通知、アプリ内課金。
- **`front/` の修復・削除**。既存計画 task_015 の管轄。
- **`firestore.rules` / `storage.rules` の変更**。別計画 `docs/implementation-plan.md` の管轄。本計画はその完了を前提とするだけで、自分では触らない。
- web lint の既存 16 errors の解消。ベースラインとして記録し、新規エラーを増やさないことのみを条件とする。

> v1 にあった「新規のサーバー API を作らない」は **Non-Scope から外した**。敵対的レビューの指摘 A1 により、認可済みマニフェスト API を Phase 2 の必須項目に格上げしたため。

## 6. Assumptions

- **Expo SDK は 57 を明示的に pin する（実装時に確定）。** v1 は SDK 55 を想定していたが、`create-expo-app` が生成したのは `expo@~57.0.13` だった。実際にインストールした版の型定義と実装を読んで確認した事実は次のとおり:
  - `expo-file-system@57.0.4`: `File.downloadFileAsync(url, destination: Directory | File, options?)` と `Paths.cache` が正規 API。**主エントリの `FileSystem.downloadAsync` は runtime throw する**（`legacyWarnings.js`）。destination には `Directory` ではなく `new File(dir, 検証済みファイル名)` を渡し、同名ファイル対策に `{ idempotent: true }` を付ける。
  - `expo-media-library@57.0.4`: **`saveToLibraryAsync` を主エントリから import すると runtime throw する。** `expo-media-library/legacy` から import すること。モダン API は `Asset` / `Album` / `Query` のクラス群。
  - 権限は主エントリの `requestPermissionsAsync(writeOnly?, granularPermissions?)` を使う。`requestPermissionsAsync(true)` で書き込み専用を要求できる。
  - **`Asset.create()` が書き込み専用権限で動作するかは未検証。** 生成した Asset を読み戻して返す API のため、iOS の追加のみ認可では成立しない見込み。本計画は書き込み専用で完結させる方針のため legacy の `saveToLibraryAsync` を採る。SDK を上げる際はこの点を再確認する。
  - **config plugin は既定で読み取り権限を注入する。** iOS は `NSPhotoLibraryUsageDescription`、Android は `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` / `READ_MEDIA_AUDIO` / `READ_MEDIA_VISUAL_USER_SELECTED` / `READ_EXTERNAL_STORAGE`。前者は `photosPermission: false`、後者は `android.blockedPermissions` に**5件すべてを列挙**して除去する（列挙漏れは素通りする）。
- **`docs/implementation-plan.md`（別計画）の task_001 / task_002 / task_004 の完了が、本計画のストア公開の前提条件である。**
  - task_004（いいねを招待単位に変更）が未完了だと、WebView は Safari とは別の匿名 UID を持つため「ブラウザで付けたお気に入りがアプリでは空になる」。
  - task_001 / task_002（`list` の制限と招待トークンの ID 化）が未完了だと、匿名認証だけで全招待・全画像が列挙でき、ネイティブの保存機能がその情報の受け皿になる。
  - task_002（招待トークンのドキュメント ID 化）は WebView が web のコードをそのまま実行するため、アプリ側の追加対応なしに反映される。これは本設計の利点である。
- 配信ドメインは独自ドメインを用意する方針で確定している（`decisions.md` の D3）。ただし**具体的なドメイン名は未確定**であり、`task_010` の着手前に決める。既存計画に記載のある `https://web-kappa-neon-94.vercel.app` は本セッションで未検証のプレビュー用ホストであり、この値のまま実装に入らない。
- Firebase Authentication の匿名認証は本番で有効（web が稼働しているため）。WKWebView / Android WebView 内でも Firebase Web SDK はブラウザ同様に動作する前提。
- **WebView のストレージはシステムブラウザと完全に隔離されている。** 同じ人でも Safari とアプリでは別の匿名 UID になる。これを URL 経由のセッション移行トークンで解決する案はレビューで出たが、招待トークン自体が bearer credential であるところにさらに credential を足すため**却下した**。task_004 が正しい解決策である。
- `MediaLibrary.createAssetAsync` / `createAlbumAsync`（およびモダン API の `Asset.create` / `Album.create`）は読み取りを含むフル権限を要求する。したがって**アルバム分けは書き込み専用権限では実現できない**。既定はアルバム分けなしとし、アルバム分けは任意タスク（task_019）に切り出す。
- iOS はアプリがバックグラウンドに入るとダウンロードが中断され得る。`expo-keep-awake` と警告表示で実用上の中断を減らすが、完全なバックグラウンド転送は Non-Scope。
- Apple Developer Program と Google Play Console の有料登録が必要。**金額は変動するため申込時点の公式価格を確認する。**
- **招待トークンは個人情報に準ずる bearer credential として扱う。** `web/src/types/index.ts:22` のとおり招待は `clientName` / `clientEmail` を持ち、トークンはそこへ到達する鍵である。「トークンだけだから個人情報ではない」という v1 の記述は誤りだった。

## 7. Architecture Impact

**Frontend (mobile — 新規)**: `mobile/` に Expo アプリを新設する。画面は実質 WebView 1枚とエラー / 未リンク起動時の案内画面のみ。ネイティブ固有のロジックは「ブリッジ受信」「入力検証」「ダウンロード」「フォトライブラリ保存」「ディープリンク解決」に限定する。Firebase SDK は入れない。

**Frontend (web — 追加のみ)**: 既存コンポーネントに「ネイティブシェル内かどうか」の分岐を足す。新しい画面は作らない。**マークアップは分岐させず、挙動の差はイベントハンドラ内で決める**（hydration mismatch を避けるため）。DOM が変わる箇所（ボタン文言など）だけ mount 後に切り替える。ネイティブ非対応環境（通常のブラウザ）では現在の挙動を変えない。

**Backend**: `back/`（NestJS）は触らない。**Phase 2 で `web` に Route Handler を1本追加する**（認可済みマニフェスト）。`web/src/app/api/image/route.ts` は変更しない。

**Database (Firestore)**: スキーマ変更なし。アプリは web のコードを通して同じコレクションを読み書きする。マニフェスト API はサーバー側で既存コレクションを読むだけ。

**Auth**: 匿名認証をそのまま使う。マニフェスト API は招待トークンで認可する（Firebase Auth のトークンではない）。

**Storage**: 変更なし。ただし `allow read: if true` に依存した設計を**そのままにしない**。マニフェスト API がアクセス可能な画像を招待単位に限定する。

**Infrastructure**: `web/public/.well-known/apple-app-site-association` と `assetlinks.json` を配信する。AASA は拡張子なし・`Content-Type: application/json` で返す必要があるため、実際に `curl` で確認する。EAS Build / EAS Submit の設定を追加する。

## 8. UI Plan

新規画面は原則作らない。既存 web 画面のネイティブ内での差分と、ネイティブ側の最小画面のみを定義する。

### 8.1 分岐の実装方針（hydration 対策）

初期 HTML はサーバーで生成されるため、`window.__NATIVE_GALLERY__` の有無でレンダリング結果を変えると hydration mismatch になる。したがって:

1. **可能な限りマークアップを変えない。** `DownloadButton` は見た目を変えず、`onClick` の中でネイティブ判定して分岐する。これなら mismatch は起きない。
2. **DOM が変わる箇所だけ mount 後に切り替える。** ZIP ボタンの文言、`WelcomeGuide` の注記など。`useState(false)` + `useEffect` で `mounted` を立てる。`IosSaveGuide` / `AndroidSaveGuide` / `WelcomeGuide` は**既に**この形（`useEffect` で `setShow(true)`）なので追加コストはない。
3. **「初回描画でちらつかない」ことを受け入れ条件にしない。** `injectedJavaScriptBeforeContentLoaded` は Android では experimental で 100% 信頼できないため、注入が間に合わない前提で設計する。
4. **検出は多重化する。** ① WebView に設定するカスタム User-Agent 接尾辞（`PhotoGalleryApp/<version>`）、② `window.ReactNativeWebView` の存在、③ 注入グローバル `window.__NATIVE_GALLERY__`。①は最も確実で、サーバー側でも読めるため将来の SSR 分岐にも使える。③が無い場合は①②でネイティブと判定し、機能バージョンは既定値 1 とする。

### 8.2 web `/gallery/[token]`（ネイティブ内での差分）

| 要素 | ブラウザ | ネイティブシェル内 |
|---|---|---|
| `ImageCard` / `ImageLightbox` の保存ボタン | 現状維持 | **マークアップ不変**。`onClick` でブリッジ保存。押下中はスピナー、完了でトースト「写真に保存しました」 |
| `IosSaveGuide` / `AndroidSaveGuide` | 現状維持 | 非表示（mount 後に判定） |
| `WelcomeGuide` の「PC 推奨」注記 | 現状維持 | ネイティブ用文面に差し替え（mount 後） |
| ヘッダーの ZIP ボタン | 現状維持 | 「すべて保存」に差し替え（mount 後）。押下で一括保存 |
| `ShareButton` | 現状維持 | 非表示（mount 後） |

### 8.3 web `/liked`（ネイティブ内での差分）

- ZIP ボタン → 「お気に入りを保存（N枚）」。
- 進捗は既存の `DownloadProgressModal` を再利用し、`mode='save'` で「保存中 (current/total)」を表示する。キャンセルは `cancelSave` を送る。
- **保存中は「アプリを閉じないでください」の警告を出す**（バックグラウンド移行で中断されるため）。

### 8.4 状態表示（web 側、ネイティブ時のみ）

- 権限拒否: 「写真への保存が許可されていません。設定アプリから許可してください」＋「設定を開く」。
- 空き容量不足: 「端末の空き容量が不足しています（必要 約X MB）」。保存を開始しない。
- セルラー通信時の一括保存: 「Wi-Fi に接続していません。約X MB をダウンロードします」＋続行/中止。
- 部分失敗: 「N枚中M枚を保存しました」＋再試行。
- **ブリッジ非対応**: インストール済みアプリが古く要求機能に対応していない場合、「アプリを更新してください」を表示し、**ブラウザと同じ従来挙動にフォールバックする**（黙って失敗させない）。
- アクセシビリティ: 保存の開始・進捗・完了・失敗を `aria-live="polite"` の領域で通知する。モーダルはフォーカストラップを持ち、閉じたら発火元へフォーカスを戻す。

### 8.5 ネイティブ側の画面（最小）

1. **WebView 画面**: 全画面、SafeArea 対応、pull-to-refresh。
2. **読み込みエラー画面**: ネットワーク不通・タイムアウト時に「接続できませんでした / 再試行」。
3. **WebView クラッシュからの復帰**: `onContentProcessDidTerminate`（iOS）/ `onRenderProcessGone`（Android）で自動リロードする。白画面のまま沈黙させない。
4. **未リンク起動画面**: 保存済みトークンがない場合「受け取った招待リンクから開いてください」。アプリ単体の入口は作らない。

**レスポンシブ**: web 側のブレークポイントをそのまま使う。ネイティブ側でのビューポート改変は行わない。

## 9. API Plan

### 9.1 ブリッジ・プロトコル（バージョン交渉つき）

**能力ハンドシェイク（native → web）**

```js
window.__NATIVE_GALLERY__ = {
  bridgeVersion: 1,
  supports: ['saveImage', 'saveImages', 'cancelSave', 'openSettings'],
  platform: 'ios' | 'android',
  appVersion: '1.0.0',
  nonce: '<起動ごとに生成されるランダム値>'
};
```

`injectedJavaScriptBeforeContentLoaded` で注入する。**Android では注入が間に合わない場合があるため**、web は User-Agent 接尾辞と `window.ReactNativeWebView` の存在でもネイティブと判定し、その場合は `bridgeVersion: 1` / `supports` を既定値として扱う。

**バージョン skew の扱い（必須）**: web は即時デプロイされるがアプリの更新は遅れる。web は使いたい機能が `supports` に含まれるかを必ず確認し、含まれなければ**ブラウザと同じ従来挙動にフォールバックする**。未対応のメッセージを送って黙って失敗させない。

**web → native**

| type | ペイロード | 意味 |
|---|---|---|
| `saveImage` | `{ v:1, nonce, requestId, url, filename }` | 1枚保存 |
| `saveImages` | `{ v:1, nonce, requestId, items:[{url, filename}] }` | 一括保存 |
| `cancelSave` | `{ v:1, nonce, requestId }` | 中断 |
| `openSettings` | `{ v:1, nonce }` | 設定アプリを開く |

**native → web**（`injectJavaScript` で `CustomEvent` を dispatch）

| type | ペイロード |
|---|---|
| `saveProgress` | `{ v:1, requestId, current, total }` |
| `saveResult` | `{ v:1, requestId, ok, savedCount, failedCount, errorCode? }` |

`errorCode` は `permission_denied` / `download_failed` / `save_failed` / `invalid_url` / `insufficient_storage` / `cancelled` / `unauthorized` の列挙のみ。ネイティブの例外メッセージを web に渡さない。

### 9.2 ネイティブ側の入力検証（Phase 1、防御の第一層）

**web から届いた値を信用しない。** 各 URL について:

1. `new URL(u)` でパースできること。`u.protocol === 'https:'` であること。
2. **`u.origin` が許可リストと完全一致**すること（`startsWith` を使わない。`https://<origin>.evil.tld/` が通ってしまうため）。許可は `https://firebasestorage.googleapis.com` と `https://photo-gallery-app-20251204.firebasestorage.app` の2件。
3. パスがこのプロジェクトのバケットと `images/` 接頭辞に一致すること（例: `/v0/b/photo-gallery-app-20251204.firebasestorage.app/o/images%2F...`）。
4. `filename` にパス区切り（`/`、`\`）、`..`、NUL を含まないこと。拡張子が `jpg` / `jpeg` / `png` / `heic` / `webp` のいずれかであること。違反時は URL のパスから再導出し、それも取れなければ `.jpg` にフォールバックする。
5. `nonce` が起動時に生成した値と一致すること（ページ内の任意スクリプトからの無差別呼び出しを抑止する）。
6. 1リクエストの件数上限（500件）、**総バイト上限（既定 2GB）**、1件のサイズ上限（50MB）。
7. リクエスト時点の WebView の現在 URL が自オリジンかつ `/gallery/` または `/liked` 配下であること。

検証に落ちた項目は `invalid_url` として失敗計上し、処理全体は止めない。

### 9.3 認可済みマニフェスト API（Phase 2、**実装済み**）

> 2026-08-16 実装完了。`web/src/app/api/native/manifest/route.ts` と `web/src/services/manifestService.ts`。
> ブリッジのペイロードは `token + imageId(s)` に変更済みで、**web から URL を渡す経路は存在しない**
> （`web/src/lib/nativeBridge.ts` の `OutgoingMessage` に url フィールドがない）。
> 認可の判定は `manifestService.test.ts` の16件で固定してある。
> サーバー側の Firestore 読み取りには Admin SDK ではなくクライアント SDK + 匿名サインインを使った
> （`web/src/lib/firebaseServer.ts`）。認可の判定は Firestore ルールではなくサーバーコードで行うため
> Admin 権限が不要であり、サービスアカウント鍵を新たに運用へ持ち込まずに済むため。
> トレードオフはコールドスタートごとに匿名ユーザーが1つ増えること。


**9.2 はあくまで入力検証であって認可ではない。** ホストとパスが正しければ「他クライアントの写真」も通る。ストア公開前に次を追加する。

**`POST /api/native/manifest`（`web/src/app/api/native/manifest/route.ts`）**

- リクエスト: `{ token: string, imageIds: string[] }`
- サーバー側処理: 招待を `token` で引き、`isActive` と `expiresAt` を検証し、`imageIds` が招待の `imageIds` に**全て含まれる**ことを確認する。含まれないものは拒否する。
- レスポンス: `{ items: [{ imageId, url, filename, bytes }] }`。招待が無効・期限切れなら `403`。
- ネイティブはこの API のレスポンスに含まれる URL しか保存しない。web から直接 URL を受け取る経路は Phase 2 完了時に**廃止する**。
- 認証: 招待トークンそのもの（bearer credential）。Firebase Auth のトークンは使わない。
- エラー: `400`（形式不正）/ `403`（招待が無効・画像が招待に含まれない）/ `404`（招待なし）/ `429`（レート制限）。

### 9.4 静的ファイル

- `GET /.well-known/apple-app-site-association` — `applinks.details[].paths` に `/gallery/*` と `/liked*`。`Content-Type: application/json`、拡張子なし。
- `GET /.well-known/assetlinks.json` — `sha256_cert_fingerprints` は EAS の署名鍵から取得した実値。

## 10. Database Plan

**スキーマ変更・マイグレーション・インデックス追加はいずれも不要。**

- `images` / `invitations` / `likes` / `sessions` の読み書きの形は変わらない。
- Phase 2 のマニフェスト API はサーバー側で `invitations` と `images` を読むだけで、書き込みは行わない。招待の取得にトークンからの単一ドキュメント取得を使うため、別計画 task_002（トークンのドキュメント ID 化）と整合する。
- ネイティブ側のローカル保存は `expo-secure-store` に直近の招待トークン1件のみ。
- **訂正（v1 の誤り）**: このトークンは「個人情報ではない」ものではない。`web/src/types/index.ts:22` のとおり招待は `clientName` / `clientEmail` を持ち、トークンは写真とそれらに到達する bearer credential である。保存期間・失効時の削除・ログへの出力禁止（マスキング）・問い合わせ時の消去手順を運用として定める（task_015）。

## 11. File-by-File Plan

| ファイル | 区分 | 目的 | 変更内容 | リスク |
|---|---|---|---|---|
| `mobile/package.json` | create | 依存とスクリプト | Expo SDK を**明示バージョンで pin**。`react-native-webview`, `expo-media-library`, `expo-file-system`, `expo-linking`, `expo-secure-store`, `expo-keep-awake`, `expo-network`。scripts に `typecheck`(`tsc --noEmit`) と `test`(`jest-expo`) | low |
| `mobile/app.config.ts` | create | ネイティブ設定 | `scheme`、`ios.bundleIdentifier`、`ios.associatedDomains`、`ios.infoPlist.NSPhotoLibraryAddUsageDescription`（日本語）、`android.package`、`android.intentFilters`、`android.blockedPermissions`（不要な `READ_MEDIA_*` の除外）、`plugins: [['expo-media-library', {...}]]` | medium |
| `mobile/tsconfig.json` | create | 型設定 | `expo/tsconfig.base` 継承、`strict: true` | low |
| `mobile/eas.json` | create | ビルド設定 | `development` / `preview`(internal) / `production` | low |
| `mobile/App.tsx` | create | シェル本体 | WebView マウント、初期 URL 解決、ディープリンク購読、`onMessage` 配線、画面の出し分け | high |
| `mobile/src/config.ts` | create | 定数 | `WEB_ORIGIN`、許可 origin、バケット・パス接頭辞、件数・総バイト・単体サイズ上限 | low |
| `mobile/src/bridge/protocol.ts` | create | 型定義 | 9.1 のメッセージ型と `supports` 一覧 | low |
| `mobile/src/bridge/inject.ts` | create | 注入スクリプト | `__NATIVE_GALLERY__`（nonce 含む）の定義 | medium |
| `mobile/src/bridge/handleMessage.ts` | create | 受信ディスパッチ | JSON パース失敗・nonce 不一致・未知の type を無視。`requestId` 単位の実行管理とキャンセル | medium |
| `mobile/src/save/validate.ts` | create | 入力検証 | 9.2 の全項目。**expo モジュールを import しない純関数**（Node のテストランナーで動かすため） | low |
| `mobile/src/save/saveToLibrary.ts` | create | 保存処理 | `requestPermissionsAsync(true)` → `new File(Paths.cache, sanitizedFilename)` を destination に `File.downloadFileAsync` → `MediaLibrary.saveToLibraryAsync(file.uri)` → キャッシュ削除 | high |
| `mobile/src/save/saveBatch.ts` | create | 一括保存 | 同時実行3でダウンロード、保存は直列。空き容量チェック、進捗、キャンセル、部分失敗集計、keep-awake | high |
| `mobile/src/save/storage.ts` | create | 空き容量 | 保存前の空き容量確認と必要容量の算出 | low |
| `mobile/src/navigation/resolveInitialUrl.ts` | create | 起動 URL 解決 | `Linking.getInitialURL()` → 保存済みトークン → なし。**パスとクエリを保持**し `/gallery/:token` と `/liked?token=` の両方に対応 | medium |
| `mobile/src/save/validate.test.ts` | create | テスト | 許可外 origin、`https://<origin>.evil.tld`、path traversal、拡張子欠落、nonce 不一致 | low |
| `web/src/lib/nativeBridge.ts` | create | 検出と送受信 | 多重検出（UA / `ReactNativeWebView` / 注入グローバル）、`supports` によるフィーチャ判定、送信、購読。全て SSR 安全 | medium |
| `web/src/hooks/useNativeSave.ts` | create | 保存状態管理 | `requestId` 発行、進捗・結果・エラー、キャンセル、未対応時のフォールバック | medium |
| `web/src/hooks/useIsNativeShell.ts` | create | mount 後の判定 | `useState(false)` + `useEffect` で mount 後に true。**レンダリング分岐はこれ経由のみ**（hydration 対策） | low |
| `web/src/components/DownloadButton.tsx` | modify | 単体保存の分岐 | **マークアップは変えず** `onClick` 内で分岐 | medium |
| `web/src/components/BulkDownloadButton.tsx` | modify | 一括の分岐 | `useIsNativeShell` で文言と挙動を切り替え | medium |
| `web/src/app/(gallery)/liked/page.tsx` | modify | 一括の分岐 | 同上 | medium |
| `web/src/components/IosSaveGuide.tsx` | modify | 非表示条件 | 既存の `useEffect` 内の条件にネイティブ判定を追加 | low |
| `web/src/components/AndroidSaveGuide.tsx` | modify | 非表示条件 | 同上 | low |
| `web/src/components/WelcomeGuide.tsx` | modify | 文言分岐 | 同上 | low |
| `web/src/components/ShareButton.tsx` | modify | 非表示条件 | `useIsNativeShell` で分岐 | low |
| `web/src/components/DownloadProgressModal.tsx` | modify | 保存モード | `mode` プロップ追加、`aria-live` 追加、警告文言 | low |
| `web/src/app/api/native/manifest/route.ts` | create | 認可済み URL 配布 | 9.3。Phase 2 | high |
| `web/public/.well-known/apple-app-site-association` | create | ユニバーサルリンク | `appIDs` と `paths` | medium |
| `web/public/.well-known/assetlinks.json` | create | App Links | `package_name` と実際の SHA-256 | medium |
| `web/next.config.ts` | modify | MIME 明示 | AASA の `Content-Type`（`curl` で確認して必要な場合のみ） | low |
| `web/src/components/AppPromoBanner.tsx` | create | アプリ導線 | Smart App Banner と Android 用バナー | low |
| `web/src/app/layout.tsx` | modify | アプリ導線 | `apple-itunes-app` メタタグ | low |
| `web/src/lib/nativeBridge.test.ts` | create | テスト | 検出・フィーチャ判定・フォールバック | low |
| `web/src/components/DownloadButton.test.tsx` | create | テスト | ネイティブ時とブラウザ時の分岐 | low |
| `web/src/components/IosSaveGuide.test.tsx` | modify | 既存テスト追随 | ネイティブ時非表示のケース追加 | low |
| `web/src/components/AndroidSaveGuide.test.tsx` | modify | 既存テスト追随 | 同上 | low |
| `CLAUDE.md` | modify | ドキュメント整合 | `mobile/` の節、コマンド、ブリッジの説明、`front/` との違い | low |

## 12. Implementation Order

ゲート（コード変更なし。人間の判断・作業が必要）

- `task_000` Web Share API による代替の可否 → **判断済み: 却下（UX が成立しないため）。アプリを実装する**
- `task_001` 配布形態と配信ドメイン → **一部判断済み: 公開ストアを第一候補・TestFlight 外部配布を代替、独自ドメインを用意。ドメイン名と開発者アカウント登録、`eas login` / `eas init` は未了（人間が実施）**

Phase 1（ネイティブシェルと保存）

1. `task_002` `mobile/` の土台（SDK pin、権限文言、`blockedPermissions`）
2. `task_003` WebView シェル、厳密な origin 制限、クラッシュ復帰
3. `task_004` ブリッジ（多重検出、nonce、バージョン交渉）
4. `task_005` 単体保存
5. `task_006` 一括保存（容量・通信量・中断対策込み）
6. `task_007` web 側のネイティブ分岐（hydration 対策込み）

Phase 2（認可の是正。**ストア公開前に必須**）

7. `task_008` 認可済みマニフェスト API と、ネイティブの URL 直接受け取りの廃止
8. `task_009` 別計画 task_001 / task_002 / task_004 の完了確認

Phase 3（導線と配布）

9. `task_010` ディープリンク（scheme / universal links / app links）
10. `task_011` 起動 URL 解決（パス・クエリ保持）と未リンク起動画面
11. `task_012` Android マニフェストの権限監査
12. `task_014` EAS Build と実機確認 → **ここを通るまで web 側のネイティブ分岐を本番デプロイしない**
13. `task_015` ストア提出準備と 4.2 の go/no-go 判断
14. `task_013` web 側のアプリ導線（Smart App Banner。App Store の app-id 発行後に着手するため task_015 の後）

Phase 4（回帰とドキュメント）

15. `task_016` web 側テスト追加
16. `task_017` アクセシビリティ確認
17. `task_018` `CLAUDE.md` 更新

Phase 5（任意）

18. `task_019` アルバム分け（フル権限時のみ）
19. `task_020` バックグラウンド転送（`expo-task-manager`）

## 13. Verification Commands

リポジトリに実在するコマンドのみを記載する。

```bash
# web（web/package.json に定義あり。本セッションで実行し結果を確認済み）
cd web && npm test
cd web && npm run lint
cd web && npm run build
```

`mobile/`（task_002 で作成済み。本セッションで実行し結果を確認済み）:

```bash
cd mobile && npm run typecheck   # tsc --noEmit
cd mobile && npm test            # jest-expo
cd mobile && npx expo-doctor
```

**ローカル環境の前提（本セッションで判明）**:

- iOS のネイティブビルドは**このマシンでは実行できない**。Xcode 26.2 が入っているが対応する iOS プラットフォームコンポーネントが未インストールで、`xcodebuild -showdestinations` がシミュレータを1つも返さない（インストール済みのシミュレータランタイムは iOS 18.4 / 18.5 のみ）。Xcode > Settings > Components から iOS のプラットフォームを入れるまで、iOS の実機・シミュレータ検証はできない。CocoaPods の依存解決（`npx pod-install ios`）自体は成功する。
- Android は `ANDROID_HOME=$HOME/Library/Android/sdk` を設定すれば `./gradlew :app:assembleDebug` が使える。

**エージェントが実行してはいけないコマンド**（対話が必須でハングするため、人間が実施する）:

```bash
npx eas login
npx eas init
npx eas credentials
npx eas build --platform ios --profile preview
npx eas build --platform android --profile preview
npx eas submit
```

存在しないため使えないもの:

- `cd web && npm run typecheck`（未定義。型検査は `npm run build` が実行する）
- `cd admin && npm run lint` / `cd admin && npm test`（別計画 task_011 の対象）
- Firebase エミュレータ関連コマンド（`firebase.json` に `emulators` 設定なし）

ベースライン（本セッションで実測した値）:

- `cd web && npm test` → 5 files / 22 tests passed
- `cd web && npm run lint` → 16 errors / 7 warnings

## 14. Acceptance Criteria

**保存（本計画の主目的）**

- iOS 実機で、保存ボタン1回で写真アプリに画像が追加される。ブラウザ遷移も長押しも発生しない。
- Android 実機で、同じ操作でギャラリーに画像が追加される。
- iOS の権限ダイアログが**書き込み専用**の文言で表示され、読み取り権限を要求しない。
- **Android の生成マニフェストに `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` / `READ_EXTERNAL_STORAGE` が含まれない**（保存専用アプリとして Google Play の写真アクセスポリシーに抵触しない）。
- お気に入り一括保存で **200枚以上**が保存され、進捗が `current/total` で更新される。
- 空き容量が必要量に満たない端末では保存を開始せず、必要容量を提示する。アプリはクラッシュしない。
- セルラー接続時の一括保存でデータ量の警告が出る。
- 一括保存中にキャンセルすると以降が止まり、保存済み件数が報告される。保存済みの画像は消えない。
- 一括保存中にアプリをバックグラウンドへ回して戻したとき、進捗が固まったまま復旧不能にならない（中断が検知され、再実行できる状態になる）。
- 権限拒否・機内モード・ディスク満杯のいずれでもクラッシュせず、対応するエラーコードが返る。

**ブリッジの安全性**

- 許可 origin 以外（`https://firebasestorage.googleapis.com.evil.tld` を含む）が `invalid_url` で拒否される（自動テスト）。
- `filename` の path traversal が拒否または無害化される（自動テスト）。
- `nonce` を持たない、または誤った `nonce` のメッセージが無視される（自動テスト）。
- WebView 内で自オリジン外へのリンクを踏むと WebView 内では遷移せず、OS の既定ブラウザが開く。
- **Phase 2 完了後**: 招待に含まれない `imageId` を要求すると `403` で拒否され、ネイティブは保存しない。
- **Phase 2 完了後**: ネイティブが web から直接受け取った URL を保存する経路が存在しない（コードから削除されている）。

**互換性とバージョン skew**

- 古いアプリ binary に対して新しい web が未対応機能を使おうとしたとき、web はブラウザと同じ従来挙動にフォールバックし、黙って失敗しない。
- Android で `injectedJavaScriptBeforeContentLoaded` の注入が間に合わなかった場合でも、User-Agent による検出でネイティブと判定される。
- WebView プロセスがクラッシュしても白画面のまま止まらず、自動でリロードされる。

**ディープリンクと起動**

- インストール済み端末で `https://<domain>/gallery/{token}` を開くとアプリが起動し、そのトークンのギャラリーが表示される。
- **`https://<domain>/liked?token={token}` を開いた場合も、お気に入り画面がそのトークンで表示される**（パスとクエリが保持される）。
- 未インストール端末では同じ URL がブラウザで開き、従来どおり動作する。
- ブラウザで web ギャラリーを開いているユーザーに「アプリで開く」導線が提示される。
- リンクなしで起動すると直近のギャラリーが表示され、履歴がなければ案内画面が出る。

**web の回帰**

- 通常のブラウザ（PC Chrome / iOS Safari / Android Chrome）で保存ボタン・保存ガイド・ZIP・共有の挙動が現状と同一である。
- **ネイティブ分岐によるコンソールの hydration 警告が出ない。**
- `cd web && npm test` が全パス。`cd web && npm run build` が成功。`cd web && npm run lint` のエラーが 16 以下。

**アクセシビリティ**

- 保存の開始・進捗・完了・失敗が VoiceOver / TalkBack で読み上げられる。
- 権限拒否モーダルがフォーカストラップを持ち、閉じたら発火元へフォーカスが戻る。

**ネイティブ側の検証**

- `cd mobile && npm run typecheck` と `cd mobile && npm test` が通る。`npx expo-doctor` が致命的な問題を報告しない。

**前提の確認**

- 別計画 task_004 完了後、同じ招待リンクをブラウザとアプリの両方で開いたときお気に入りが一致する。**task_004 未完了の時点でこの項目は不合格であり、ストア公開の前提条件として扱う。**

## 15. Repair Loop

1. 変更範囲に対応する検証コマンドを実行する。web を触ったら `cd web && npm test` → `npm run build` → `npm run lint`、`mobile/` を触ったら `cd mobile && npm run typecheck` → `npm test` → `npx expo-doctor`。
2. 失敗した出力をそのまま記録する。要約や推測に置き換えない。
3. エラーを task_id に対応づける。判別できない場合は直前に変更したファイルを含む task を起点にする。
4. 当該 task の `files_to_modify` / `files_to_create` に列挙されたファイルのみを修正する。
5. 検証コマンドを再実行し、ベースライン（web lint 16 errors、web test 22 passed）を下回っていないことも確認する。
6. **実機でしか確認できない項目（保存・権限ダイアログ・ディープリンク・マニフェスト権限）は、シミュレータの結果で代替しない。** 未実施なら「未検証」と明記し、合格扱いにしない。
7. **対話が必要なコマンド（`eas login` 等）に遭遇したら実行せず停止し、ユーザーに依頼する。** ハングするまで待たない。
8. **Expo SDK のバージョンを変更した場合は、`saveToLibraryAsync` / `File.downloadFileAsync` / `requestPermissionsAsync(writeOnly)` の3つの API が pin したバージョンに存在するかを公式ドキュメントで確認してから進む。** この3点は敵対的レビューで両レビュアーの判断が割れた箇所であり、バージョン依存が高い。差異があれば本計画の「6. Assumptions」を更新する。
9. 実装が計画と乖離した場合、`docs/native-app/` の3ファイルの該当箇所を更新してから次へ進む。乖離を黙って残さない。
