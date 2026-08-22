# Implementation Plan: admin の画像アップロード高速化

> **出力先について**: `docs/` 直下は別機能の計画（招待制ギャラリーのセキュリティ修正）、`docs/native-app/` はネイティブ化の計画が既に占めている。上書きすると未コミットの成果が失われるため、本計画は `docs/admin-upload/` に分離する。他計画との関係は「6. Assumptions」に記す。

## 1. Overview

管理画面から写真を大量にアップロードすると極端に遅い問題を解消する。原因は機能不足ではなく処理の組み立て方にある。現状は **1枚ずつ完全に直列**で処理し、しかも **1枚あたりサーバーと約11往復**している。さらに、そのうち3往復は同じドキュメント（プロジェクト・招待）への書き込みで、枚数分だけ同一ドキュメントに書き込みが集中している。

本計画では、処理を「1枚ごとに必要なもの」と「バッチ全体で1回でよいもの」に分離し、後者をまとめる。そのうえで1枚ごとの処理を並列化する。加えて画像の二重デコードを解消する。

機能・UI・保存されるデータの形は変えない。**速くなるだけで、見た目も結果も同じ**であることを受け入れ条件に含める。

## 2. Goal

**ユーザー（撮影者 / NonTurn LLC）のゴール**: 数百枚の納品写真を管理画面から現実的な時間でアップロードできる。アップロード待ちが納品作業のボトルネックにならない。

**技術的なゴール**:

- 1枚あたりのサーバー往復を約11回から7回に減らす。
- 同一ドキュメント（`projects/{projectId}`、各招待）への書き込みを、枚数分から**バッチあたり数回**に減らし、Firestore の競合を発生させない。
- 1枚ごとの処理を並列化する。
- 大きな写真の二重デコードをやめる。

**非ゴール**: 保存される画像・サムネイル・Firestore ドキュメントの内容を変えること。これらは現状と一致させる。

## 3. Current State

本セッションで実際に読んだコードに基づく。

### 3.1 アップロード画面（`admin/src/app/admin/projects/[projectId]/images/upload/page.tsx`）

- 127行目の `for (const file of files)` が `await` で1枚ずつ待つ。**並列度は1**。
- 129行目で `compressImage(file)`、131行目で `uploadImage(...)` を呼ぶ。
- 137行目で進捗カウンタを更新する。
- 1ファイル失敗しても `try/catch` で続行し、最後に成功/失敗件数を出す。
- 最大1000枚（`MAX_FILES = 1000`）。フォルダ選択にも対応している。
- `uploadImage` の戻り値は使っていない（成功カウントのみ）。

### 3.2 1枚あたりの処理（`admin/src/services/imageService.ts:207-299`）

| 行 | 処理 | サーバー往復 |
|---|---|---|
| 227 | `uploadBytes` 元画像 | 1 |
| 228 | `generateThumbnails(file)` | 0（CPU） |
| 238 | `uploadBytes` サムネイル × 2 | 2 |
| 239 | `getDownloadURL` サムネイル × 2 | 2 |
| 244 | `getDownloadURL` 元画像 | 1 |
| 278 | `runTransaction`（プロジェクト読み → 画像書き + `imageCount` +1） | 2 |
| 292 | `getDoc(imageDocRef)` **書いたばかりのドキュメントの読み直し** | 1 |
| 296 → 118 | `getActiveInvitationsByProject` **毎回クエリ** | 1 |
| 296 → 120 | 各アクティブ招待に `arrayUnion` | 招待数 |

アクティブ招待が1件の場合で合計 **約11往復**。これが枚数分、直列に並ぶ。

### 3.3 同一ドキュメントへの書き込み集中

- `projects/{projectId}` の `imageCount` を **1枚ごとに** `increment(1)`。しかも `runTransaction` 内なので読み取りも伴う。
- 各アクティブ招待の `imageIds` に **1枚ごとに** `arrayUnion`。
- Firebase 公式は具体的な上限値を公開していないが、「同一ドキュメントへの高頻度な書き込みは競合・遅延・エラーを招く」と明記している（[Best practices](https://firebase.google.com/docs/firestore/best-practices)）。トランザクションは競合時に自動リトライするため、待ち時間として表面化する。
- 実データ側の裏付け: 既存の招待に `imageIds` が 633件 / 469件のものが存在する。この規模の `arrayUnion` が1枚ごとに撃たれていたことになる。

### 3.4 二重デコード

- `compressImage`（`admin/src/utils/imageCompression.ts`）は **4MB を超えるファイルのみ** `createImageBitmap` する。4MB 以下は元ファイルをそのまま返し、デコードしない。
- `generateThumbnails`（`admin/src/utils/thumbnailGenerator.ts`）は渡されたファイルを必ず `createImageBitmap` する。
- したがって **4MB 超の写真は2回デコードされる**。納品用の原本は 4MB を超えることが多く、実害が出る。

### 3.5 テストと検証コマンドのベースライン（本セッションで実測）

- `cd admin && npx vitest run` → **10 files / 103 tests passed**
- `cd admin && npx eslint src` → **0 errors / 1 warning**（`no-img-element` の警告1件）
- `cd admin && npm run lint` は **使えない**。`next lint` が Next.js 16 で廃止されたため。`admin/package.json` に `test` スクリプトも存在しない。
- `admin/src/services/__tests__/imageService.test.ts` に `uploadImage` の招待同期を検証するテストが4件ある（371-512行）。本計画は同期の実行場所を変えるため、これらの更新が必要になる。

## 4. Scope

**Phase 1: 往復の削減（1枚あたり）**

- `getDoc` による書き込み直後の読み直しを廃止し、手元のデータから戻り値を組み立てる。
- 画像ドキュメントの作成を `runTransaction` から単純な `setDoc` に変える。新規ドキュメントへの書き込みで競合は起きないため、トランザクションは不要。
- 「プロジェクトが存在するか」の確認を、1枚ごとではなく**バッチ開始時に1回**に移す。

**Phase 2: 同一ドキュメント書き込みの集約**

- `imageCount` の更新を1枚ごとの `increment(1)` から、**バッチ単位の `increment(n)`** に変える。
- 招待への `arrayUnion` を1枚ごとから、**バッチ単位で複数IDをまとめて1回**に変える。アクティブ招待の取得もバッチごとに1回にする。
- ブラウザを閉じた場合の不整合を限定するため、集約は**50枚ごと**に実行し、最後にも実行する。全件終了時にまとめて1回ではない。

**Phase 3: 二重デコードの解消**

- 1回のデコードから「圧縮後ファイル」と「サムネイル2枚」の両方を作る前処理関数を追加する。
- `compressImage` と `generateThumbnails` は残す（他からの利用と単体テストのため）が、アップロード経路は新しい前処理関数を通す。

**Phase 4: 並列化**

- アップロード画面の直列ループを、同時実行数を制限したワーカープールに置き換える。
- 進捗表示・成功/失敗カウント・エラー時の続行は現状の挙動を維持する。

**Phase 5: 実測と回帰**

- 変更前後で同一条件の実測値を記録する。
- 既存テストの更新と、新規ロジックのテスト追加。

## 5. Non-Scope

- **画像・サムネイル・Firestore ドキュメントの内容の変更**。保存結果は現状と一致させる。
- **削除処理（`deleteImage` / `deleteImages`）の最適化**。今回報告された問題ではない。`deleteImage` は引き続き `runTransaction` + `increment(-1)` のままとする。
- **アップロードの再開機能**（中断したところから続ける）。
- **サーバー側（Cloud Functions 等）でのサムネイル生成への移行**。クライアント生成のまま維持する。
- **`MAX_FILES = 1000` の上限変更**。
- **Storage の再開可能アップロード（`uploadBytesResumable`）への移行**。進捗をバイト単位で出す要求は今回ない。
- **`admin/package.json` の `lint` / `test` スクリプト修復**。別計画 `docs/task-list.json` の task_011 の管轄。本計画では `npx` 直接起動で検証する。
- **`web` と `mobile` への変更**。触らない。

## 6. Assumptions

- アップロード対象は納品用の写真で、多くが 4MB を超える。したがって二重デコードの解消は実効がある。4MB 以下ばかりの場合、Phase 3 の効果は小さい。
- 1回のアップロードで扱う枚数は数百枚規模。`MAX_FILES` は1000。
- 対象プロジェクトにアクティブな招待が存在し得る（既存データに `imageIds` 633件の招待がある）。招待が0件の場合、Phase 2 の効果は `imageCount` の分だけになる。
- `uploadImage` の呼び出し元はアップロード画面1箇所のみ（`grep` で確認済み）。したがって関数のシグネチャを変えても他への影響はない。
- `uploadImage` の戻り値は呼び出し元で使われていない。`getDoc` の読み直しを廃止して戻り値の `createdAt` / `updatedAt` がクライアント時刻の近似になっても、画面の挙動は変わらない。**Firestore に保存される値は引き続き `serverTimestamp()` のまま**であり、そこは変えない。
- `arrayUnion` に複数の値を一度に渡せる。ただし1回あたりの要素数の上限は公式に明示されていないため、**300件ずつに分割**して安全側に倒す。ドキュメントサイズ上限（1MiB）に対しては、ID 1件あたり約20バイトで1000件でも20KB程度なので問題にならない。
- 別計画（`docs/implementation-plan.md`）の task_007 が `web` 側の並び順を自然順に統一する。本計画は並び順に影響しない（アップロード順ではなくファイル名で並べ替えているため）が、両方が完了するまで表示順の検証は保留とする。
- 同時実行数の初期値は 4 とする。これは推測値であり、Phase 5 の実測で調整する。**「4が最適」と決め打ちしない。**

## 7. Architecture Impact

**Frontend (admin)**: アップロード画面のループがワーカープールに変わる。`imageService` にバッチ用の関数が増え、`uploadImage` の責務が「1枚を Storage と Firestore に書く」ことだけに縮小する。UI の見た目と操作は変えない。

**Backend**: なし。

**Database (Firestore)**: スキーマ変更なし。書き込みの**回数と粒度**だけが変わる。
- `images/{id}`: 変更なし（1枚1ドキュメント）。作成方法がトランザクションから `setDoc` に変わる。
- `projects/{projectId}.imageCount`: 加算のタイミングが1枚ごとからバッチごとに変わる。最終的な値は同じ。
- `invitations/{id}.imageIds`: 追記のタイミングが1枚ごとからバッチごとに変わる。最終的な内容は同じ。

**Auth**: 変更なし。

**Storage**: 変更なし。保存先パス・ファイル形式・メタデータはすべて現状維持。

**Infrastructure**: 変更なし。Firestore ルール・インデックスの変更も不要。

## 8. UI Plan

**変更する画面**: `admin/src/app/admin/projects/[projectId]/images/upload/page.tsx` の1画面のみ。

**見た目の変更**: 原則なし。以下のみ挙動が変わる。

- **進捗バー**: 現状は1枚ずつ順に進む。並列化後は複数枚が同時に完了するため、進捗が飛び飛びに増える。完了枚数 / 総数の表示形式は変えない。
- **完了メッセージ**: 現状どおり「N枚の画像をアップロードしました」「N枚成功、M枚失敗」を維持する。

**変えないもの**: ファイル選択・フォルダ選択の切り替え、重複除去、自然順ソート、1000枚上限、システムファイル除外、アップロード中のボタン無効化。

**状態**: 「待機」「アップロード中（進捗）」「完了」の3状態は現状のまま。新しい状態は追加しない。

**レスポンシブ**: 変更なし。既存の Ant Design のレイアウトをそのまま使う。

## 9. API Plan

**新規のサーバー API は作らない。** 変更するのは `admin/src/services/imageService.ts` の関数構成のみ。

### 9.1 変更後の関数

```
uploadImageFile(projectId, userId, file, thumbnails, title, description?)
  → Storage に元画像とサムネイルを置き、images/{id} を setDoc する。
  → projects と invitations には一切触れない。
  → 戻り値は手元で組み立てた Image（getDoc しない）。

assertProjectExists(projectId)
  → プロジェクトの存在を1回だけ確認する。バッチ開始時に呼ぶ。

finalizeUploadBatch(projectId, imageIds)
  → projects/{projectId} に increment(imageIds.length)
  → アクティブ招待を1回クエリし、各招待に arrayUnion(...imageIds) を300件ずつ分割して適用
  → 失敗してもアップロード済みの画像は残す（現状の best-effort 方針を維持）
```

### 9.2 エラーハンドリング

- `uploadImageFile` の失敗は1枚分の失敗として扱い、バッチ全体は続行する（現状と同じ）。
- `assertProjectExists` の失敗はバッチ全体を中止する。現状は1枚目のトランザクションで `Project not found` が投げられるため、**挙動として等価**である。
- `finalizeUploadBatch` の失敗は警告ログに留め、例外を投げない（現状の `syncInvitationsOnImageUpload` と同じ方針）。ただし `imageCount` の更新失敗は招待同期の失敗と区別してログに出す。
- 中断時の不整合: 50枚ごとに集約するため、最悪でも直近49枚分の `imageCount` と招待同期が抜ける。**現状も1枚ごとの集約が途中で止まれば同じ性質の不整合が起きる**ため、性質は変わらず窓が広がるだけである。この点は受け入れ条件に明記する。

## 10. Database Plan

**スキーマ変更・マイグレーション・インデックス追加はいずれも不要。**

- `images` / `projects` / `invitations` のフィールド構成は変えない。
- `getActiveInvitationsByProject` は `projectId` + `isActive` + `createdAt` の複合インデックスを使う。`firestore.indexes.json` に既に定義がある（`invitations`: `projectId` ASC + `isActive` ASC + `createdAt` DESC）。**追加不要**。
- 既存データの移行は不要。本計画は書き込みのタイミングを変えるだけで、保存される値は変わらない。

## 11. File-by-File Plan

| ファイル | 区分 | 目的 | 変更内容 | リスク |
|---|---|---|---|---|
| `admin/src/utils/prepareUpload.ts` | create | デコードの一本化 | `createImageBitmap` を1回だけ実行し、圧縮後ファイルとサムネイル2枚を同じビットマップから作る。既存の `compressImage` / `generateThumbnails` と同じ出力仕様（サイズ・品質・形式）を守る | medium |
| `admin/src/utils/prepareUpload.test.ts` | create | 出力の同一性を固定 | 圧縮の閾値（4MB）、最大寸法（3840）、サムネ幅（384 / 640）、WebP 変換、非画像のスキップを検証 | low |
| `admin/src/services/imageService.ts` | modify | 往復削減と責務分離 | `uploadImage` を `uploadImageFile` に変更（サムネイルを引数で受け取る、`runTransaction` → `setDoc`、`getDoc` 廃止、招待同期とカウント更新を削除）。`assertProjectExists` と `finalizeUploadBatch` を追加。`syncInvitationsOnImageUpload` を複数ID対応に書き換え | high |
| `admin/src/services/__tests__/imageService.test.ts` | modify | 契約の変更に追随 | `uploadImage` のテストを新シグネチャに更新。招待同期のテスト4件（371-512行）を `finalizeUploadBatch` に対する検証へ移す。**カバレッジを落とさない**（同期される / されない / 失敗しても継続 / 非アクティブは対象外 の4観点を維持） | high |
| `admin/src/utils/uploadQueue.ts` | create | 並列実行 | 同時実行数を制限して順に処理するワーカープール。完了ごとにコールバックを呼ぶ。純関数に近い形にしてテスト可能にする | low |
| `admin/src/utils/uploadQueue.test.ts` | create | 並列制御の検証 | 同時実行数を超えないこと、1件失敗しても残りが継続すること、全件の結果が入力順で返ること | low |
| `admin/src/app/admin/projects/[projectId]/images/upload/page.tsx` | modify | 直列ループの置き換え | `for` ループをワーカープールに置換。開始時に `assertProjectExists`、50枚ごとと最後に `finalizeUploadBatch`。進捗・メッセージ・エラー継続の挙動は維持 | medium |
| `docs/admin-upload/measurement.md` | create | 実測の記録 | 変更前後の所要時間を同一条件で記録する。枚数・合計サイズ・回線・所要時間・1枚あたり平均 | low |
| `CLAUDE.md` | modify | ドキュメント整合 | アップロードがバッチ集約 + 並列である旨と、`imageCount` / 招待同期のタイミングを1〜2文で追記 | low |

## 12. Implementation Order

**Phase 0（着手前）**

1. `task_001` 変更前の所要時間を実測して記録する

**Phase 1〜3（1枚あたりのコスト削減）**

2. `task_002` `prepareUpload` を作りデコードを1回にする
3. `task_003` `imageService` を分割する（`uploadImageFile` / `assertProjectExists` / `finalizeUploadBatch`）
4. `task_004` 既存テストを新しい契約に更新する

**Phase 4（並列化）**

5. `task_005` `uploadQueue` を作る
6. `task_006` アップロード画面をワーカープールに置き換える

**Phase 5（検証）**

7. `task_007` 変更後の所要時間を実測し、同時実行数を調整する
8. `task_008` `CLAUDE.md` を更新する

**任意**

9. `task_009` [任意] 中断時の不整合を復旧する管理画面上の再同期ボタン

## 13. Verification Commands

リポジトリに実在するコマンドのみを記載する。

```bash
# admin（本セッションで実行し結果を確認済み）
cd admin && npx vitest run
cd admin && npx eslint src
cd admin && npm run build
```

**使えないもの**（存在しない、または壊れている）:

- `cd admin && npm run lint` — `next lint` が Next.js 16 で廃止済み。`npx eslint src` を使う
- `cd admin && npm test` — `admin/package.json` に `test` スクリプトが無い。`npx vitest run` を使う
- `cd admin && npm run typecheck` — 未定義。型検査は `npm run build` が行う

ベースライン（本セッションで実測した値）:

- `cd admin && npx vitest run` → 10 files / 103 tests passed
- `cd admin && npx eslint src` → 0 errors / 1 warning

## 14. Acceptance Criteria

**速度（本計画の主目的）**

- 同一条件（同じ枚数・同じ画像・同じ回線）での所要時間を変更前後で計測し、`docs/admin-upload/measurement.md` に記録している。
- 1枚あたりのサーバー往復が11回前後から7回前後に減っている（コード上で数えられること）。
- 100枚以上のアップロードで、変更前より明確に速くなっている。**具体的な倍率は事前に約束せず、実測値で報告する。**

**結果の同一性（最重要の回帰条件）**

- アップロード後の `images/{id}` のフィールド構成が変更前と一致する（`projectId` / `url` / `storagePath` / `title` / `description` / `userId` / `likeCount` / `thumbnails` / `thumbnailPaths` / `createdAt` / `updatedAt`）。
- `createdAt` / `updatedAt` が Firestore 上で**サーバー時刻**である（クライアント時刻になっていない）。
- Storage 上のパスとファイル形式が変更前と一致する（元画像は `images/{userId}/{filename}`、サムネイルは `thumbnails/{userId}/{filename}_{width}.webp`）。
- サムネイルの寸法（384 / 640）と品質設定が変更前と一致する。
- アップロード後の `projects/{projectId}.imageCount` が、実際の画像枚数と一致する。
- アップロード後、アクティブな招待の `imageIds` に新規画像が全件含まれ、**重複がない**。
- 非アクティブな招待の `imageIds` には追加されていない。

**エラー処理**

- 1枚が失敗しても残りのアップロードが継続し、「N枚成功、M枚失敗」が表示される。
- 存在しないプロジェクトIDでアップロードを開始すると、1枚もアップロードせずにエラーになる。
- 招待同期に失敗しても、画像自体のアップロードは成功として扱われる。

**UI**

- 進捗表示が完了枚数 / 総数で更新され、最終的に総数に達する。
- アップロード中はボタンが無効化される。
- 完了後にプロジェクト詳細画面へ遷移する。

**回帰と検証**

- `cd admin && npx vitest run` が全パスし、テスト数がベースライン（103）を下回らない。
- `cd admin && npx eslint src` のエラーが 0 のまま。
- `cd admin && npm run build` が成功する。
- 招待同期の4観点（同期される / 非アクティブは対象外 / 失敗しても継続 / 複数招待に反映）のテストカバレッジが維持されている。

**既知の制約（合格条件ではなく明示事項）**

- アップロード中にブラウザを閉じると、直近49枚分の `imageCount` と招待同期が反映されない場合がある。現状も同種の不整合は起こり得るが、窓が広がることを受け入れる。復旧手段は任意タスク `task_009` とする。

## 15. Repair Loop

1. 変更範囲に対応する検証コマンドを実行する（`cd admin && npx vitest run` → `npx eslint src` → `npm run build`）。
2. 失敗した出力をそのまま記録する。要約や推測に置き換えない。
3. エラーを task_id に対応づける。判別できない場合は直前に変更したファイルを含む task を起点にする。
4. 当該 task の `files_to_modify` / `files_to_create` に列挙されたファイルのみを修正する。
5. 検証コマンドを再実行し、ベースライン（103 tests / 0 errors）を下回っていないことを確認する。
6. **既存テストが落ちたとき、テストを消したり期待値を緩めたりして通さない。** 本計画は招待同期の実行場所を意図的に変えるため、テストの更新は正当だが、**カバレッジの4観点を落とすことは正当ではない**。観点を維持したまま検証対象を移す。
7. **速度の改善は必ず実測で確認する。** コードが変わったことをもって「速くなった」と報告しない。変更前の記録がなければ `task_001` に戻る。
8. **保存結果の同一性は Firebase コンソールで実データを見て確認する。** ユニットテストのモックだけで合格としない。
9. 実装が計画と乖離した場合、`docs/admin-upload/` の3ファイルの該当箇所を更新してから次へ進む。
