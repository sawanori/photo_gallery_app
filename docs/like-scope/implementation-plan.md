# Implementation Plan: 招待ごとのいいね範囲（likeScope）

**状態: 計画のみ（v2、レビュー反映済み）。実装未着手。**（2026-10-30 更新）

## v2 での修正（2026-10-30、GPT-6 Astra のレビューとユーザーの指定）

| # | v1 の問題 | v2 の対応 |
| --- | --- | --- |
| 1 | 「他の参加者の匿名 UID を知る経路は無い」と書いたが、`shared` の招待の一覧には `userId` が含まれる。UID を知れば `perDevice` の文書を `get` で読める | `likes` の `get` を、自分のセッションの招待と自分の鍵の範囲に限定する |
| 2 | いいね一覧の到着前にハートを押せる。後着の一覧が選択を上書きし、写真が保存対象から抜ける。失敗も「0 枚」と同じ扱いになる | 一覧の状態（読み込み中、完了、失敗）を持ち、完了するまでハートを押せないようにする。`/liked` で 3 つの状態を区別する |
| 3 | `toggleLike` はサーバーの状態を読んで反転するので、画面と逆の操作になることがある。同じ UID の 2 タブでは `setDoc` が拒否される | 目的の状態を渡す `setLiked` に置き換える。既に目的の状態なら成功として扱う |
| 4 | 全件保存も `likedIds` を使うと書いたが、誤り | `likedIds` を使うのは `/liked` の保存だけ。全件保存は `allImages` のままで変更しない |
| 5 | いいねした写真の保存が目的なのに、環境をまたぐと選択が消える問題を防げない | いいねの前に案内を表示する。保存経路の実機測定を最初のタスクにする |
| 6 | 「いいねした端末数」は物理的な端末数ではない | 表記を「いいねした端末・ブラウザ数」にする |

## 1. Overview

招待に `likeScope: 'shared' | 'perDevice'` を追加する。

- `shared`（既定）: 同じ招待リンクを開いた全員が 1 つの選択を共有する。
- `perDevice`（新規）: いいねを端末（匿名 UID）に紐づける。参加者は自分の選択だけを見て、変更し、保存する。

既存の招待は `likeScope` を持たないため `shared` として扱う。

## 2. Goal

- **利用者の目標**: パーティーなどの参加者が、自分がいいねした写真だけを確実に自分の端末へ保存できる。他の参加者のいいねは混ざらない。
- **事業上の目標**: 1 組のクライアントが選ぶ納品に加えて、複数人が見るイベント写真の配布に同じ仕組みを使えるようにする。納品の選定フローは壊さない。

**成否の基準は「いいねした写真を保存できること」とする。** いいねが分離できても保存できなければ達成とみなさない。

## 3. Current State

調査はコードの読解による。

- いいねは `likes/{invitationId}_{imageId}` の 1 文書で、匿名 UID は鍵に入らない（`web/src/services/likeService.ts`）。2026-08-17 の `860f930` で、ブラウザとアプリで選択を共有するために意図して導入した。
- `firestore.rules` の `likes` は、作成時に ID 形式を固定し、一覧と削除を「セッションが指す有効な招待」に限定する。`get` は認証済みなら誰でも通る。`rules-tests` に `likes` の `get` のテストは無い。
- `useInvitation.ts` は写真の表示を先に完了させ、いいね一覧を後から `setLikedIds` で丸ごと置き換える。一覧の取得失敗は空の配列として扱う。
- `LikeButton.tsx` は `user` と `invitation` があれば押せる。`toggleLike` はサーバーの状態を読んで反転し、戻り値は使われていない。
- `/liked`（`web/src/app/(gallery)/liked/page.tsx`）は `likedImages` が 0 枚だと「お気に入りの写真はまだありません」を表示し、保存ボタンを出さない。読み込み中や失敗と区別できない。
- `/liked` の保存は `likedImages` を、アプリでは `saveMany`（`/api/native/manifest` 経由）、それ以外では ZIP で保存する。
- ギャラリーの全件保存（`BulkDownloadButton.tsx`）は `allImages` を使い、いいねとは無関係。
- `likeCount` は web・admin のどの画面にも表示されていない。
- 管理画面の招待詳細は `getLikedImageIdsByInvitation` の結果をそのまま画像に変換する。同じ画像の文書が複数あると重複して表示される。
- 画像削除時のいいね削除（`admin/src/services/imageService.ts`）は `imageId` で検索するので、文書 ID の形式に依存しない。
- `mobile/src` に likes や likeCount への参照は無い。`/mobile` は `/web` を WebView で表示するだけなので、web のデプロイで公開済みアプリにも反映される。
- アプリの一括保存の上限は 500 枚、合計 2GB（`mobile/src/config.ts`）。ZIP はブラウザのメモリ上で作る。
- 閲覧日数の既定は 7 日。
- 現在の招待トークンの文字集合は `_` を含まない。匿名 UID と自動生成の画像 ID も含まないため、`_` 区切りの鍵は曖昧にならない。古いトークンに `_` があっても、作成時の検証は完全一致で比較するので問題にならない。

## 4. Scope

- 保存経路の実機測定（実装前）。
- 招待の新フィールド `likeScope`。作成時にだけ指定できる。
- `perDevice` のいいね文書 `likes/{invitationId}_{uid}_{imageId}`。
- `firestore.rules` の `likes` の分岐（`get` を含む）と、その `rules-tests`。
- web の `likeService`、`LikeButton`、`useInvitation`、`GalleryContext`、招待の型と変換処理。
- いいね一覧の状態管理と、`/liked` およびギャラリーの表示。
- `perDevice` の招待での案内の表示。
- admin の招待作成フォーム、招待詳細の表示、集計用のサービス関数。
- プライバシーポリシーの文言、`CLAUDE.md` のスキーマとルールの記述。
- 本番デプロイと本番での確認（実施前にユーザーの確認を取る）。

いいね一覧の状態管理と `setLiked` は `shared` の招待にも適用する。既存の不具合の修正を含むためで、見た目の変化は読み込み中にハートが押せないことだけである。

## 5. Non-Scope

- 環境をまたいで選択を引き継ぐ「引き継ぎリンク」。task_000 の結果と、公開後に案内で足りないと判明した場合に別の計画で検討する。
- 同じ人の複数端末を束ねる機能（名前入力、ログイン、合言葉）。
- 既存招待の `likeScope` 変更と、既存いいねの移行。ルールでの不変性の強制もしない（管理画面に変更手段を作らない）。
- ネイティブアプリの変更と再申請。
- 参加者ごとの選択内容を管理画面で一覧する機能。
- ギャラリー画面へのいいね数の表示。
- `images.likeCount` のルールの厳格化と、招待削除時に残るいいね文書の掃除。
- ギャラリーの全件保存の変更。
- `AGENTS.md`（未追跡の Codex 用ファイル）の更新。

## 6. Assumptions

1. 参加者は基本的に 1 つの端末・1 つのブラウザかアプリで、いいねから保存までを行う。
2. 管理画面では招待全体の集計が見られれば足りる。**ユーザーへの確認は未回答のため、この想定で計画する。**
3. `perDevice` の招待では `images.likeCount` を更新しない。理由は §7。
4. 既定値は `shared`。
5. 計画ファイルは `docs/like-scope/` に置く。機能別フォルダの慣例に合わせ、`docs/` 直下にある別機能の計画を上書きしないため。
6. アプリ内ブラウザの判定は User-Agent で行うので、すべてのアプリ内ブラウザを検出できるわけではない。LINE を必須の対象とし、それ以外は task_000 の結果で決める。

### 受け入れる制約

| 場面 | 結果 |
| --- | --- |
| 同じ端末の別ブラウザ、LINE 内ブラウザと Safari、ブラウザとアプリ | 別の端末として扱われ、選択は引き継がれない。§8 の案内で事前に知らせる |
| サイトデータの削除、アプリの再インストール | 匿名 UID が変わり、以前の選択は見えなくなる。文書は残り、管理画面の集計には数えられる |
| 長期間開かなかった場合の Safari のストレージ削除 | 同上の可能性がある。WebKit の方針として知られているが、この環境では**未検証**。発生しても許容する |

## 7. Architecture Impact

- **フロントエンド**: `likeService` が招待を受け取り、鍵と問い合わせを切り替える。`GalleryContext` がいいね一覧の状態を持つ。
- **バックエンド**: サーバーの処理は増えない。`/api/native/manifest` は変更しない。
- **データベース**: 新フィールド 1 つと新しい ID 形式。§10。
- **認証**: 既存の匿名認証の UID を使う。
- **Storage**: 影響なし。
- **インフラ**: Firestore ルールの再デプロイが必要。**順序はルールが先、web と admin が後。** 新しいルールでも既存の web の正規の操作は通る（セッション確立後の `get` だけを使っているため）。逆の順序だと、`perDevice` の書き込みが古いルールに拒否される。

### `perDevice` で `likeCount` を更新しない理由

1. Firestore の文書は 1 秒あたり約 1 回までの更新を前提としている（公式ドキュメントの aggregation の制限事項）。参加者が同じ写真へ同時にいいねすると、`images/{id}` の更新が競合し、いいねが失敗して画面が元に戻る。
2. `likeCount` はどの画面にも表示されていない。
3. 集計は、招待ごとのいいね文書を数えるほうが正確にできる。

## 8. UI Plan

**web: 一覧の状態（両方の範囲）**
- `likesStatus`: `'loading' | 'ready' | 'failed'`。
- ハートは `ready` になるまで押せない。写真の表示は待たせない。
- ギャラリー: `failed` のとき、グリッドの上に「お気に入りを読み込めませんでした」と「再試行」ボタンを表示する。
- `/liked`:
  - `loading`: スピナーを表示し、「まだありません」も保存ボタンも出さない。
  - `failed`: 「お気に入りを読み込めませんでした」と「再試行」ボタン。
  - `ready` で 0 枚: 既存の「お気に入りの写真はまだありません」。
  - `ready` で 1 枚以上: 一覧と保存ボタン。

**web: 案内（`perDevice` のみ。新規 `LikeScopeNotice`）**
- ギャラリーと `/liked` のヘッダー下に 1 行で「お気に入りは、この画面で開いている場所にだけ保存されます」を常に表示する。閉じるボタンは付けない。
- アプリ内ブラウザ（`isInAppBrowser()` が true、かつネイティブシェルではない）では、強調した表示で「このブラウザではお気に入りの保存がうまくいかないことがあります。Safari や Chrome、またはアプリで開いてからお選びください」と「リンクをコピー」ボタンを出す。文言は task_000 の結果で確定する。
- スマートフォン幅では折り返して全文を表示し、ヘッダーのボタンと写真に重ならない。
- `shared` の招待では何も表示しない。

**admin: 招待作成フォーム**
- 「閲覧できる日数」の前に `Radio.Group`（`name="likeScope"`、既定 `shared`）を追加する。
  - `shared`: 「1組で選ぶ（全員で同じ選択を共有）」
  - `perDevice`: 「参加者ごとに選ぶ（端末ごとに別々。パーティーなど）」
- `tooltip`: 「作成後は変更できません。」
- `perDevice` を選んでいるとき、「参加者が見るのが遅れやすいので、閲覧できる日数は長めをおすすめします。」を表示する。日数は自動で変えない。

**admin: 招待詳細**
- `Descriptions` に読み取り専用の「いいねの扱い」を追加する。
- `shared`: 既存の「クライアントの選定」カードを変更しない。
- `perDevice`:
  - カード名を「参加者のいいね」にする。
  - `Statistic` は「いいねされた枚数」と「いいねした端末・ブラウザ数」の 2 つ。
  - 各サムネイルの下に「♥ N」を表示する。並びは件数の多い順、同数はファイル名の自然順。
  - 読み込み中、失敗と再試行は既存の表示を使い、空の文言は「まだいいねがありません」にする。

## 9. API Plan

HTTP エンドポイントの追加と変更は無い。

**web `likeService`**（`LikeTarget = Pick<Invitation, 'id' | 'likeScope'>`）

| 関数 | 変更後 |
| --- | --- |
| `setLiked(invitation, imageId, userId, liked)` | **新規。`toggleLike` を置き換える。** 目的の状態を受け取り、既にその状態なら何も書かずに成功する |
| `getLikedImageIds(invitation, userId)` | `perDevice` は `where('userId', '==', userId)` を追加 |
| `hasLiked`、`toggleLike` | 呼び出し元が無くなるので削除 |

`setLiked` の処理（どちらも `runTransaction` の中で、まず like 文書を読む）:

| 範囲 | 作成するとき | 解除するとき | `likeCount` |
| --- | --- | --- | --- |
| `shared` | 無ければ作成 | あれば削除 | 変化があるときだけ ±1 |
| `perDevice` | 無ければ作成 | あれば削除 | 更新しない |

`invitation.likeScope === 'perDevice'` のときだけ端末別とし、未設定や未知の値は `shared` として扱う。

**web `useInvitation`**: 戻り値に `retryLikes` を追加する。セッションの確保といいね一覧の取得をやり直す。

**web `GalleryContext`**: `likesStatus` と `setLikesStatus` を追加する。

**web `utils/device.ts`**: `isInAppBrowser(): boolean` を追加する。

**admin `likeService`**

```ts
getLikeSummaryByInvitation(invitationId): Promise<{
  counts: { imageId: string; count: number }[];
  deviceCount: number; // userId の重複を除いた数
}>
```

**エラー処理**:
- 書き込み失敗: `LikeButton` が画面を元に戻す。
- 読み込み失敗: `likesStatus` を `failed` にする。写真の閲覧は止めず、選択を変更させない。
- 保存の失敗: 既存の `NativeSaveNotice` と `BulkDownloadNotice` のまま。

## 10. Database Plan

**`invitations/{token}`**: `likeScope?: 'shared' | 'perDevice'` を追加する。バックフィルはしない。

**`likes`**

| 範囲 | ドキュメント ID | `userId` の意味 |
| --- | --- | --- |
| `shared` | `{invitationId}_{imageId}` | 最後に操作した UID（監査用） |
| `perDevice` | `{invitationId}_{uid}_{imageId}` | 所有者の UID |

**インデックス**: 追加しない。`invitationId` と `userId` の等価条件は、自動の単一フィールドインデックスのマージで処理できる（公式ドキュメントの index merging）。エミュレータでは確かめられないため、本番で `failed-precondition` が出ないことを task_007 で確認する。出た場合は `firestore.indexes.json` に複合インデックスを追加する。

**ルール**（`firestore.rules`）

```
function sessionLikesPerDevice() {
  return invitationData(sessionInvitationId()).get('likeScope', 'shared') == 'perDevice';
}

function likeIdMatchesScope(likeId, data) {
  return sessionLikesPerDevice()
    ? likeId == data.invitationId + '_' + request.auth.uid + '_' + data.imageId &&
      data.userId == request.auth.uid
    : likeId == data.invitationId + '_' + data.imageId;
}

// ID だけで判定する。文書の有無で許可を変えると、拒否されたこと自体が
// 「相手がいいねしている」という情報になる。
function likeIdInOwnScope(likeId) {
  return sessionLikesPerDevice()
    ? likeId.matches(sessionInvitationId() + '_' + request.auth.uid + '_.+')
    : likeId.matches(sessionInvitationId() + '_.+');
}

function likeOwnedInScope(data) {
  return !sessionLikesPerDevice() || data.userId == request.auth.uid;
}

match /likes/{likeId} {
  allow get: if isAdmin() ||
    (hasValidSession() &&
     sessionInvitationUsable() &&
     likeIdInOwnScope(likeId));
  allow list: if isAdmin() ||
    (hasValidSession() &&
     resource.data.invitationId == sessionInvitationId() &&
     sessionInvitationUsable() &&
     likeOwnedInScope(resource.data));
  allow create: if hasValidSession() &&
    request.resource.data.invitationId == sessionInvitationId() &&
    request.resource.data.imageId is string &&
    likeIdMatchesScope(likeId, request.resource.data) &&
    imageInSessionInvitation(request.resource.data.imageId);
  allow delete: if isAdmin() ||
    (hasValidSession() &&
     resource.data.invitationId == sessionInvitationId() &&
     sessionInvitationUsable() &&
     likeOwnedInScope(resource.data));
}
```

- 未設定の招待は `Map.get` の既定値で `shared` になる（公式ドキュメントで確認）。
- 招待トークンは `-` を含むが、正規表現の文字クラスの外では文字どおりに扱われる。`matches` の挙動はルールテストで固定する。
- `shared` の `list` の結果には他の人の `userId` が残る。この UID を使っても `perDevice` の文書は読めない。
- ルールの `get()` と `exists()` の上限は単一操作で 10 回。参照するのは `sessions`、`invitations`、`users` の 3 文書で、同じ文書への呼び出しはキャッシュされる場合がある。テストで拒否されないことを確かめる。

## 11. File-by-File Plan

| ファイル | 種別 | 変更内容 | リスク |
| --- | --- | --- | --- |
| `docs/like-scope/measurement.md` | 作成 | task_000 の測定結果。招待トークンは書かない | 低 |
| `firestore.rules` | 変更 | §10 の分岐。`likes` のコメントを更新 | 高 |
| `rules-tests/test/helpers.ts` | 変更 | `perDevice` の招待、失効版、2 人分のいいねを seed に追加 | 低 |
| `rules-tests/test/firestore.test.ts` | 変更 | `perDevice` のテストと `get` のテストを追加。既存テストは変更しない | 低 |
| `web/src/types/index.ts` | 変更 | `LikeScope` 型、`Invitation.likeScope?` | 低 |
| `web/src/services/invitationService.ts` | 変更 | `toInvitation` で `likeScope` を写す | 低 |
| `web/src/services/likeService.ts` | 変更 | §9 の関数。先頭コメントを更新 | 中 |
| `web/src/services/likeService.test.ts` | 変更 | `setLiked` に合わせて書き直す。`shared` の ID 形式と `likeCount` の期待値は維持。`perDevice` と冪等性のテストを追加 | 中 |
| `web/src/contexts/GalleryContext.tsx` | 変更 | `likesStatus` を追加 | 低 |
| `web/src/hooks/useInvitation.ts` | 変更 | 状態の更新、`retryLikes`、新しい呼び出し | 中 |
| `web/src/hooks/useInvitation.test.tsx` | 変更 | 状態遷移、失敗、再試行、引数のテスト | 中 |
| `web/src/components/LikeButton.tsx` | 変更 | `setLiked` を呼ぶ。`ready` まで無効 | 中 |
| `web/src/components/LikeButton.test.tsx` | 作成 | 無効状態、目的の状態の引き渡し、失敗時の巻き戻し | 低 |
| `web/src/components/ImageCard.test.tsx`、`MasonryGrid.test.tsx`、`ImageLightbox.test.tsx` | 変更 | モックを `setLiked` と `likesStatus: 'ready'` に合わせる | 低 |
| `web/src/components/ImageCard.tsx` | 変更 | 招待単位と書いているコメントのみ修正 | 低 |
| `web/src/app/(gallery)/liked/page.tsx` | 変更 | 3 つの状態の表示、案内 | 中 |
| `web/src/app/(gallery)/liked/page.test.tsx` | 作成 | 状態ごとの表示、保存対象が `likedImages` であること | 低 |
| `web/src/app/(gallery)/gallery/[token]/page.tsx` | 変更 | 失敗時の再試行、案内 | 低 |
| `web/src/utils/device.ts`、`device.test.ts` | 変更 | `isInAppBrowser` とテスト | 低 |
| `web/src/components/LikeScopeNotice.tsx`、`LikeScopeNotice.test.tsx` | 作成 | 案内の表示 | 低 |
| `web/src/app/privacy/page.tsx` | 変更 | task_006 の文言 | 低 |
| `admin/src/services/invitationService.ts` | 変更 | 型、`docToInvitation`、`createInvitation`（既定 `shared` を保存） | 低 |
| `admin/src/services/__tests__/invitationService.test.ts` | 変更 | 保存と既定値のテスト | 低 |
| `admin/src/services/likeService.ts` | 変更 | `getLikeSummaryByInvitation` を追加 | 低 |
| `admin/src/services/__tests__/likeService.test.ts` | 作成 | 集計と数のテスト | 低 |
| `admin/src/app/admin/projects/[projectId]/invitations/create/page.tsx` | 変更 | `Radio.Group` と日数の案内 | 低 |
| `admin/src/app/admin/projects/[projectId]/invitations/create/__tests__/page.test.tsx` | 変更 | 既定値と選択の引き渡し | 低 |
| `admin/src/app/admin/projects/[projectId]/invitations/[id]/page.tsx` | 変更 | §8 の表示の分岐 | 中 |
| `admin/src/app/admin/projects/[projectId]/invitations/[id]/__tests__/page.test.tsx` | 変更 | 両方の範囲の表示。既存の `shared` のテストは維持 | 低 |
| `CLAUDE.md` | 変更 | スキーマ、Security Rules、likeService の説明 | 低 |

## 12. Implementation Order

1. **task_000**: 保存経路の実機測定。実機が要るためユーザーが実施する。結果で案内の文言を確定する。
2. **task_001**: ルールと `rules-tests`。
3. **task_002**: web のサービスと型。
4. **task_003**: web の状態管理、ハート、`/liked`。
5. **task_008**: 案内の表示。
6. **task_004**: admin の招待作成。
7. **task_005**: admin の招待詳細と集計。
8. **task_006**: プライバシーポリシーと `CLAUDE.md`。
9. **task_007**: 本番反映と確認。ルールのデプロイと `master` への push は外部に公開される操作なので、実施前にユーザーの確認を取る。

## 13. Verification Commands

```bash
cd rules-tests && npm run test:emu
cd web && npm test && npm run lint && npm run build
cd admin && npx vitest run && npm run lint && npm run build
git diff --stat -- mobile front back   # 出力が空であること
```

`rules-tests` の通過は本番で動くことの証拠にならない（`CLAUDE.md` の注意事項）。task_007 で本番を確認する。

## 14. Acceptance Criteria

詳細は `acceptance-checks.json`。

1. `perDevice` の招待で、いいねした写真だけを、アプリと主要なブラウザで保存できる。
2. `perDevice` の招待を 2 台で開くと、片方のいいねがもう片方に表示されず、片方の解除がもう片方に影響しない。
3. 他の端末のいいねの読み取り（`get` と一覧）、作成、削除が、ルールで拒否される。`shared` の招待から得た UID でも読めない。
4. 読み込み完了前にハートを押せず、読み込み失敗が「0 枚」として表示されない。
5. アプリ内ブラウザと通常のブラウザの `perDevice` の招待で、いいねの前に案内が見える。
6. `likeScope` が無い招待と `shared` の招待で、選択の共有が続いて動き、既存のルールテストが無修正で通る。全件保存は変わらない。
7. 管理画面で範囲を選べ、`perDevice` の集計が重複なく表示され、`shared` の表示は変わらない。
8. `/mobile` に差分が無く、公開済みアプリの WebView で `perDevice` が動く。
9. §13 のコマンドがすべて成功する。

## 15. Repair Loop

1. §13 の検証コマンドを実行する。
2. エラーの出力をそのまま記録する。
3. エラーを `task_id` に対応付ける。
4. そのタスクに関係するファイルだけを修正する。
5. 検証を再度実行する。
6. 実装が計画と異なることになったら、この計画と `task-list.json` を更新する。

テストを通すためにルールテストの期待値を緩めない。テストが誤っていると判断した場合は、理由を添えて報告する。
