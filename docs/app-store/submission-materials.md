# App Store 提出物（コピペ用）

作成 2026-08-22。`docs/app-store/task-list.json` の task_007 / task_012 / task_013 の実物。

**〔要確認〕が付いた項目は、私が決められない情報です。** それ以外はそのまま貼れます。

---

## 0. このセッションで済ませたこと

| 項目 | 状態 |
| --- | --- |
| プライバシーポリシーのページ | `web/src/app/privacy/page.tsx` を作成。ビルド確認済み（`/privacy` として静的生成）。**デプロイはまだ** |
| 輸出コンプライアンスの宣言 | `mobile/app.config.ts` に `ITSAppUsesNonExemptEncryption: false` を追加。`expo config` で反映を確認済み |
| iPad 対応 | `supportsTablet: false` に変更（理由は §7）。`npm run typecheck` 通過 |
| アプリアイコン | 設定済み（`mobile/assets/icon.png`） |
| スクリーンショット | 6枚撮影済み。`/Volumes/DB/illustration_design/appstore-screenshots/`（§7）|
| アプリ名 | ホーム画面 `NT-photo` 適用済み。掲載名は `NonTurnPhoto`（§1）|
| デモ招待 | 閲覧期限を90日に変更済み（11月20日まで）。**トークンはこのファイルに書かない**（§15）|

---

## 1. アプリ名（決定済み）

**名前は2か所にあり、別々に決められる。**

| どこ | 値 | 設定場所 |
| --- | --- | --- |
| ホーム画面のアイコンの下 | **NT-photo** | `mobile/app.config.ts` の `name`（= `CFBundleDisplayName`）**適用済み** |
| App Store の掲載名・検索対象 | **NonTurnPhoto** | App Store Connect のアプリ情報。**登録時に入力する** |

分けた理由:

- **ホーム画面のラベルは幅で切られる。** 文字数の固定上限ではないが、12文字前後を超えると
  `NonTurnPh…` のように省略される。`NT-photoGallery`（15文字）は確実に切れる。
  `NT-photo`（8文字）なら切れない。
- **掲載名は検索対象になる。** `NT-photo` だけでは "NT" が何を指すか伝わらず、屋号にも当たらない。
  `NonTurnPhoto` なら non-turn.com の屋号がそのまま入り、既存アプリとの衝突も避けられる。

〔任意〕`NT-Photo` と P を大文字にすると見栄えが整う。変えるなら `app.config.ts` の1行だけ。

**`slug: 'photo-gallery'` は変えないこと。** EAS のプロジェクト識別子に紐づいている。

**ネイティブ判定は名前と無関係。** User-Agent の目印は `mobile/src/bridge/inject.ts` の
`'PhotoGalleryApp/'` というリテラルで、`web/src/lib/nativeBridge.ts` がその文字列を見ている。
名前を変えても壊れない（確認済み）。

---

## 2. サブタイトル（30文字以内）

```
撮影した写真をそのまま端末へ
```

英語（英語ローカライズを出す場合）:

```
Save your delivered photos
```

---

## 3. プロモーションテキスト（170文字以内・審査なしで随時変更可）

```
撮影担当者からお受け取りになった招待リンクを開くだけ。写真を1枚ずつ、またはまとめて、端末の写真アプリへ保存できます。会員登録は不要です。
```

---

## 4. 説明文（4,000文字以内）

```
NonTurnPhoto は、写真撮影をご依頼いただいたお客様に、撮影した写真をお届けするためのアプリです。

■ 招待リンクを開くだけ
撮影担当者からお送りしたリンクを開くと、お客様専用のギャラリーが表示されます。
会員登録やパスワードの設定は必要ありません。

■ 端末にそのまま保存
気に入った写真は、1枚ずつでも、まとめてでも、端末の写真アプリに保存できます。
保存した写真は、いつもの写真アプリからそのままご覧いただけます。

■ お気に入りを選んでお伝えできる
写真にハートを付けると、撮影担当者にそのまま選定結果としてお伝えできます。
アルバム制作やレタッチのご相談がスムーズになります。

■ お客様の写真は他の方には見えません
ギャラリーは、お渡しした招待リンクをお持ちの方だけが開けます。
リンクには閲覧期限があります。

■ 端末の写真は読み取りません
このアプリは、写真を「保存する」ための権限だけを求めます。
お客様の端末に既にある写真を読み取ることはありません。


ご利用にあたって
本アプリのご利用には、NonTurn合同会社の撮影サービスをご依頼いただき、
撮影担当者から招待リンクをお受け取りいただく必要があります。

お問い合わせ: info@non-turn.com
```

英語版:

```
NonTurnPhoto delivers the photos we shot for you, straight to your phone.

Open your invitation
Tap the link your photographer sent you and your private gallery appears.
There is no sign-up and no password to remember.

Save to your device
Save any photo you like — one at a time, or all of them at once — directly to
your photo library, ready to use anywhere.

Mark your favourites
Tap the heart on the photos you want. Your photographer sees your picks,
which makes album and retouching decisions much easier.

Private to you
Your gallery can only be opened by someone holding your invitation link,
and every link has an expiry date.

We never read your photos
This app only asks for permission to add photos to your library.
It cannot see the photos already on your device.

Note: this app requires an invitation link from NonTurn LLC.

Contact: info@non-turn.com
```

---

## 5. キーワード（100文字以内・カンマ区切り・スペースを入れない）

```
写真,フォト,ギャラリー,納品,撮影,アルバム,保存,ダウンロード,共有,カメラマン,前撮り,出張撮影
```

**スペースを入れると文字数を消費する。** 上の形のまま貼ること。

---

## 6. URL

| 欄 | 値 |
| --- | --- |
| プライバシーポリシー URL | `https://gallery.non-turn.com/privacy` （**デプロイ後に到達確認が必要**） |
| サポート URL | `https://non-turn.com/` 〔要確認：連絡先が明記されているページであること。Apple はサポート手段が分かることを求める〕 |
| マーケティング URL（任意） | `https://non-turn.com/` |

---

## 7. スクリーンショット

**撮影済み。** 出力先:

```
/Volumes/DB/illustration_design/appstore-screenshots/
```

| ファイル | 内容 | 寸法 |
| --- | --- | --- |
| `00-welcome.png` | 初回ガイド（利用者が最初に見る画面） | 1290 × 2796 |
| `01-gallery.png` | ギャラリー一覧。ヘッダーに枚数と閲覧期限 | 1290 × 2796 |
| `02-favourites.png` | お気に入りを3枚付けた状態 | 1290 × 2796 |
| `03-lightbox.png` | 写真を1枚開いた状態。保存・お気に入り・共有の導線 | 1290 × 2796 |
| `04-gallery-scrolled.png` | 下までスクロールした一覧 | 1290 × 2796 |
| `05-save-actions.png` | 保存の導線（ZIP・LINE共有）が見える状態 | 1290 × 2796 |

6.9インチ用（1290 × 2796）で撮ってあります。これを登録すれば他のサイズには自動で流用されます。
3〜10枚の範囲なので、この中から5枚選べば足ります。

### 撮り方

`web/e2e/appstore-screenshots.spec.ts` で撮っています。撮り直しは:

```
cd web && npx playwright test e2e/appstore-screenshots.spec.ts
```

viewport を 430 × 932 pt、`deviceScaleFactor` を 3 にして 1290 × 2796 を出しています。
**アプリの画面はほぼ全部この web の中身**（ネイティブ側は WebView を表示しているだけ）なので、
同じ URL・同じ寸法で撮れば実機の見え方と一致します。

### まだ撮れていないもの

**招待の貼り付け画面**（`mobile/src/screens/OpenByLinkScreen.tsx`）はネイティブの画面なので、
この方法では撮れません。必要なら実機か Xcode のシミュレータで撮ってください。
ただし上の6枚で最低枚数は満たしているため、無くても提出できます。

### 〔要確認〕写っている人物

`01` `04` の下部に**顔が判別できる人物**が写っています。App Store の掲載画像は公開されるため、
**ご本人の許諾がないなら、その部分が入らない写真に差し替えてください。**
差し替える場合は、人物が写っていないデモ用プロジェクトを作って撮り直すのが確実です。

---

## 8. 年齢制限（Age Rating）

質問はすべて「なし」で回答 → **4+**。

判断の根拠になる項目だけ挙げます。

| 質問 | 回答 | 理由 |
| --- | --- | --- |
| 無制限のWebアクセス | **いいえ** | WebView の遷移先はギャラリーのオリジン完全一致に限定している（`mobile/src/navigation/isAllowedNavigation.ts`）。それ以外は WebView 内で開かない |
| ユーザー生成コンテンツ | **いいえ** | 閲覧者は写真を投稿できない。表示されるのは撮影担当者が納品した写真のみ |
| 医療・薬物・暴力・ギャンブル等 | すべて**なし** | 該当なし |

---

## 9. App のプライバシー（App Privacy）

**「トラッキング」は「いいえ」**。解析ツールも広告SDKも一切入れていません
（`web` / `mobile` の依存に該当パッケージが無いことを確認済み）。

収集するものとして申告するのは次の2つです。

| データの種類 | 用途 | ユーザーIDに紐付けるか | トラッキングに使うか |
| --- | --- | --- | --- |
| **識別子 → ユーザーID** | App の機能 | **いいえ** | いいえ |
| **使用状況データ → 製品のインタラクション** | App の機能 | **いいえ** | いいえ |

- 「ユーザーID」は Firebase の匿名認証が発行する識別子です。氏名やメールアドレスとは結び付きません。
- 「製品のインタラクション」はお気に入りの選択とアクセス回数です。

**申告しないもの**: 連絡先情報、健康、金融、位置情報、連絡先、写真（アプリは端末の写真を読み取らない）、
閲覧履歴、検索履歴、購入履歴、機微情報。

〔判断が要る点〕ホスティング（Vercel）のアクセスログに IP アドレスが残ります。
Apple の申告項目に IP そのものの欄はなく、一般的なサーバーログを申告しない運用が広く行われています。
より保守的にするなら「診断 → その他の診断データ」を足してください。**私の推奨は足さない**です。
ログは障害対応目的で、アプリが能動的に送信しているものではないためです。

---

## 10. 輸出コンプライアンス

`ITSAppUsesNonExemptEncryption: false` を Info.plist に入れたので、
アップロードのたびに聞かれなくなります。App Store Connect 側の質問には
**「いいえ（標準の暗号化のみ）」**で回答してください。HTTPS しか使っていません。

---

## 11. 審査メモ（App Review Information → Notes）

**この App は招待制です。レビュアーは招待を持っていないため、必ず以下を書いてください。**

```
This app is an invitation-based photo delivery service for clients of a
photography studio. There is no sign-up: access is granted by an invitation
link that the photographer sends to each client.

HOW TO REVIEW
1. Launch the app. The "Open your gallery" screen appears.
2. Paste the following invitation link into the input field and tap "Open":

   https://gallery.non-turn.com/gallery/<DEMO_TOKEN>
   ※ <DEMO_TOKEN> は実際の招待トークンに置き換えて App Store Connect に入力する。
   ※ この文書には実トークンを書かない（§15）。

3. The client's gallery appears with the delivered photos.
4. Tap any photo to view it full screen.
5. Tap the heart icon to mark a favourite.
6. Tap the save icon to save a photo to the device photo library.
   iOS will ask for permission to ADD photos. This app never requests
   permission to READ the photo library.
7. Tap "Save all" to save every photo in the gallery at once.

You can also tap the link on a device where the app is installed; it opens
directly in the app via Universal Links.

ABOUT THE PHOTO PERMISSION
The app declares NSPhotoLibraryAddUsageDescription only. It does not declare
NSPhotoLibraryUsageDescription, so it cannot read the user's existing photos.
Saving is the sole reason the app exists as a native app rather than a website.

PRIVACY
No account, no analytics, no advertising, no tracking. See
https://gallery.non-turn.com/privacy

CONTACT
info@non-turn.com
```

**「サインイン情報」欄**: この App にはアカウントが無いので「サインインが必要」は
**オフ**にし、上のメモに招待リンクを書いてください。

---

## 12. 提出前チェックリスト

このうち **A は私が済ませました。B は実機・アカウントが要るのでお願いします。**

### A（済）

- [x] プライバシーポリシーのページを作った（`web/src/app/privacy/page.tsx`、ビルド確認済み）
- [x] `ITSAppUsesNonExemptEncryption: false` を追加
- [x] `supportsTablet: false`（iPad のスクリーンショット要求を回避）
- [x] 写真の読み取り権限を宣言していないことを確認（`photosPermission: false`）
- [x] WebView の遷移先がギャラリーのオリジンに限定されていることを確認

### B

**2026-09-03 に本番へ対して自動確認した項目**（`cd web && DEMO_TOKEN=<トークン> npx playwright test e2e/review-demo.spec.ts`）:

- [x] デモ用の招待の閲覧できる日数を 90 日にした（11月20日まで。残り 77 日）
- [x] `web` を本番にデプロイし、`https://gallery.non-turn.com/privacy` が開く（200 応答を確認）
- [x] デモ招待でギャラリーが開き、**48 枚すべてが表示される**
      （以前のテストは1枚読めれば合格だったので、枚数が揃うまで待つように直した）
- [x] **保存の認可 API が動く。** 招待の画像 ID を渡すと item が返り、その URL から
      実際にダウンロードできる（先頭 1 件で 2.9MB 取得）。審査で必ず試される中核機能
- [x] デモ招待の有効期限が審査期間中に切れない
- [x] スクリーンショットを撮る（§7）— **人物の許諾だけ確認してください**
- [x] `eas build --profile production --platform ios` で提出用ビルドを作る（1.0.0 (6)）

**残り（アカウント操作が要るのでお願いします）**

- [ ] **デモギャラリーに実在のお客様の写真が含まれていないか確認する。**
      現在のデモ招待はクライアント名が `sawada` で 48 枚。写っている人物の許諾を確認してください
- [ ] App Store Connect でアプリレコードを作り、§1〜§11 を登録する
- [ ] 審査メモ（§6.7）にデモ招待の URL を入れる。**トークンはリポジトリに書かないこと**
- [ ] `eas submit` またはアップロード後、審査に提出する

### 提出直前に必ず走らせるもの

```bash
cd web && DEMO_TOKEN=<デモ招待のトークン> npx playwright test e2e/review-demo.spec.ts
```

3 件すべて通ることを確認してから提出する。1 件でも落ちたら、レビュアーにも同じことが起きる。

---

## 13. 却下されやすい点と、こちらの備え

| 想定される指摘 | こちらの状態 |
| --- | --- |
| **Guideline 2.1**: レビュアーが中身に到達できない | 貼り付け入口があり、審査メモに招待リンクを書く。**デモ招待の期限が最大のリスク** |
| **Guideline 4.2**: WebView を包んだだけの最低限の機能 | 写真ライブラリへの保存（ブラウザにはできない）、ネイティブの招待入力画面、Universal Links。**これが唯一の実質的なリスク**。却下された場合の対応は `docs/app-store/task-list.json` の task_017 |
| **Guideline 5.1.1**: 不要なデータ収集 | 氏名・メール・電話を一切求めない。写真の読み取り権限も宣言しない |
| **Guideline 4.8**: Sign in with Apple | 他社ログインを提供しないため**対象外** |
| 権限の説明文が曖昧 | 「選んだ写真を端末の写真アプリに保存するために使用します。既存の写真を読み取ることはありません。」と用途を明示済み |

---

## 14. 閲覧期限の落とし穴（2026-08-22 に発覚・修正済み）

**管理画面が表示していた「有効期限」は、クライアントが実際に見られる期限ではなかった。**

招待には2つの期限がある。

| 期限 | 実体 | 誰が見ていたか |
| --- | --- | --- |
| **閲覧期限** | `createdAt` ＋ `viewingDays` 日（**未設定なら7日**） | web の `validateInvitation`。**クライアントが見られなくなるのはこちら** |
| 失効日 | `expiresAt` | Firestore ルールと管理画面の表示 |

管理画面には `viewingDays` が**一切実装されていなかった**ため、すべての招待が既定の7日で
閲覧不能になる一方、画面には `expiresAt` が「有効期限」として出ていた。
実際、デモ招待は画面上「有効期限 2026年10月31日」だったが、
本番で確認したところ**残り6日**（8月29日まで）だった。

**このまま提出していたら、審査中にレビュアーがギャラリーを開けなくなり、
Guideline 2.1 で却下されていた。**

### 直したもの

- `admin/src/utils/viewingWindow.ts` を新設（`web/src/utils/viewingWindow.ts` の写し）
- 招待作成に「閲覧できる日数」の入力欄を追加（既定7日）
- 招待詳細の表示を「**閲覧できる期限**（クライアントに見えるのはこの日まで）」「閲覧日数」
  「失効日（システム上）」の3行に分けた
- 「有効／期限切れ」の判定も、`expiresAt` ではなく実効期限で行うようにした
  （閲覧期限切れの招待が「有効」と表示され続けていた）

### 既存の招待の閲覧日数を変える

招待詳細の「閲覧日数」が入力欄になっている。数字を変えて隣の「変更」を押せば反映される。
**招待を作り直す必要はない**（作り直すとトークンが変わり、審査メモの URL も差し替えになる）。
クライアントから「もう少し見たい」と言われたときもここで延ばす。

**この欄はデプロイ済みの admin にはまだ無い。** ローカル（`cd admin && npm run dev`）か、
admin を本番へデプロイしてから使うこと。

### 提出直前に必ず走らせる確認

```
cd web && npx playwright test e2e/review-demo.spec.ts
```

デモ招待について3点を本番で確認します。
(1) ギャラリーが開く (2) 写真が実際に表示される (3) 残り日数が14日以上ある。
招待を作り直したら、spec の `DEMO_TOKEN` を差し替えるか
`DEMO_TOKEN=xxxx npx playwright test e2e/review-demo.spec.ts` で渡してください。

---

## 15. 招待トークンをリポジトリに書かない

**このリポジトリは GitHub 上で公開されている**（`sawanori/photo_gallery_app`、visibility: PUBLIC）。

招待トークンはギャラリーを開く鍵そのものである。書けば誰でも中の写真を見られる。
デモギャラリーには**顔が判別できる人物**も写っているため、トークンの公開はその写真の公開に等しい。

実トークンを置いてよい場所:

- App Store Connect の審査メモ欄
- 手元のメモ（リポジトリの外）
- 実行時の環境変数

```
DEMO_TOKEN=<招待トークン> npx playwright test e2e/review-demo.spec.ts
DEMO_TOKEN=<招待トークン> npx playwright test e2e/appstore-screenshots.spec.ts
```

両方の spec は `DEMO_TOKEN` が未設定なら**明示的に落ちる**。
既定値を持たせるとそこに実トークンを書くことになり、スキップにすると
「チェックが通った」と誤読されるため、どちらも採らない。

**コミット前の確認**:

```
grep -rn "<招待トークン>" --exclude-dir=node_modules --exclude-dir=.git .
```

`git grep` は**使わない**。未追跡ファイルを見ないため、新しく作った spec を取りこぼす
（2026-08-22 に実際に取りこぼした）。
