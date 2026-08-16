# 前提条件の充足状況（別計画のセキュリティ修正）

本計画（`docs/native-app/`）は、別計画 `docs/implementation-plan.md` の task_001 / task_002 / task_004 の完了を**ストア公開の前提条件**としている。その現況を実際のコードで確認した記録。

確認日: 2026-08-16
確認方法: 該当ファイルを直接読んだ。推測では書いていない。

| 別計画のタスク | 状態 | 根拠 |
|---|---|---|
| task_001 `images` / `likes` の read を get / list に分離 | **未完了** | `firestore.rules:49` が `allow read: if isAuthenticated();`、`firestore.rules:61` も同じ。get / list への分離は行われていない |
| task_002 招待トークンをドキュメント ID にし `invitations` の list を管理者のみに | **未完了** | `firestore.rules:69` が `allow read: if isAuthenticated();`。`web/src/services/invitationService.ts:22` も `where('token', '==', token)` のコレクションクエリのまま |
| task_004 いいねを招待単位に変更 | **未完了** | `web/src/services/likeService.ts:17` の `getLikeId` が `${userId}_${imageId}`（匿名UID基準）のまま。`invitationId` フィールドは存在しない |

## これが本計画に与える影響

**3件すべて未完了である。したがって現時点ではストア公開に進めない。**

1. **お気に入りがアプリに引き継がれない（task_004 未完了の影響）。**
   WebView は Safari とは別のストレージを持つため、同じ人でも別の匿名 UID になる。like が匿名 UID をキーにしている限り、ブラウザで選んだお気に入りがアプリでは空になる。`acceptance-checks.json` の check_034 はこの状態では不合格である。

2. **匿名認証だけで全招待・全画像が列挙できる（task_001 / task_002 未完了の影響）。**
   これはネイティブ化以前からある問題だが、ネイティブの保存機能がその情報の受け皿になり得る。
   ただし本計画の Phase 2 で実装した `/api/native/manifest`（`web/src/services/manifestService.ts`）により、**ネイティブが保存できる画像は招待に属するものだけに限定されている**。web から URL を渡す経路は廃止済みで、招待に属さない `imageId` を要求すると 403 で全体が拒否される（`manifestService.test.ts` で自動検証）。
   したがって「アプリが他クライアントの写真を保存する道具になる」というレビュー指摘（Codex A1）については、別計画の完了を待たずに本計画側で塞いである。残っているのは Firestore を直接叩く経路の問題であり、そちらは別計画の管轄。

## 次に確認すべきこと

別計画の3タスクが完了したら、以下を実施してこのファイルを更新する。

- ブラウザのコンソールで匿名サインイン後に `getDocs(collection(db,'invitations'))` と `getDocs(collection(db,'images'))` を実行し、`permission-denied` になることを確認する（check_035）。
- 同じ招待リンクを2つの異なるブラウザで開き、お気に入りが共有されることを確認する（check_034）。
- `/api/native/manifest` が task_002 後のドキュメント ID 直接取得の経路で動くことを確認する（`manifestService.ts` は ID 直接取得を先に試し、失敗したら `token` フィールドのクエリにフォールバックする実装なので、移行の前後どちらでも動く想定）。
