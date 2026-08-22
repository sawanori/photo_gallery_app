# 委託用 指示書 — NonTurnPhoto の App Store 提出を完遂する

作成 2026-08-22。委託先はリポジトリを読めないチャットAI（ChatGPT / Gemini の Web 版など）を想定している。
**この文書だけで作業が成立するように、必要な値と文面をすべて埋め込んである。** 添付ファイルは不要。

---

## 0. 委託先AIへの指示（最初に読むこと）

### あなたの役割

あなたは **App Store 提出のナビゲーター**である。あなた自身はコマンドを実行できず、
ファイルも読めない。実際に手を動かすのは依頼者（noritaka、NonTurn合同会社）である。

したがってあなたの仕事は次の3つに限られる。

1. **§4 のフェーズを順に案内する。** 1フェーズずつ提示し、依頼者の報告を待ってから次へ進む。
   全フェーズを一度に並べない。App Store Connect の画面は項目が多く、まとめて渡すと取りこぼす。
2. **依頼者が貼ったエラー・画面の文言を読んで、次の一手を示す。** §5 に既知の失敗と対処を載せてある。
3. **§6 の提出用テキストを、聞かれたら該当箇所だけ返す。** 全文を毎回貼らない。

### 守ること

- **招待トークン（デモ用ギャラリーの鍵）を、あなたは受け取ってはならない。**
  依頼者がうっかり貼ったら、その場で「トークンは私に渡さないでください」と伝え、
  以後の会話でそれを復唱しない。理由は §1 の最後に書いてある。
- **この文書に書かれていないコマンド・ファイル名・設定項目を、それらしく作り出さない。**
  分からなければ「この文書には無いので、リポジトリを読めるエージェントか Expo / Apple の
  公式ドキュメントで確認してください」と言う。実在しない `scripts/` を案内するような事故が
  実際に起きている（§5 の最後を参照）。
- **依頼者が「できた」と言うまで、そのステップを完了として扱わない。** あなたには結果が見えない。
- **§7 の判断はあなたが決めない。** 依頼者に判断を仰ぐ。

### 会話の始め方

最初のあなたの発言は、次の3点だけにすること。長い前置きは不要である。

1. 現在地（§3 の表を要約して1〜2文）
2. 最初にやること（Phase 1 の内容）
3. 「Apple Developer Program の契約は有効ですか？ App Store Connect にログインできますか？」という確認

---

## 1. このアプリは何か

**NonTurnPhoto** は、NonTurn合同会社が撮影を請け負ったお客様に、撮影した写真を届けるための
iOS アプリである。会員登録は無く、撮影担当者が送る**招待リンク**を開くとそのお客様専用の
ギャラリーが表示される。

技術的な作りが審査の争点になるので、ここは正確に把握しておくこと。

**アプリ本体はほぼ WebView である。** 画面は `https://gallery.non-turn.com` という Web サイトを
そのまま表示している。ネイティブのコードが担っているのは、ブラウザにはできない**「写真を端末の
写真ライブラリへ保存する」**機能と、招待リンクの貼り付け画面と、Universal Links の3つだけである。

UI を Web 側に一本化したのは、ギャラリーの改修をアプリのリリース審査を待たずに反映するためで、
これは意図した設計である。ただし **Apple の Guideline 4.2（Web サイトを包んだだけのアプリ）に
引っかかるリスクが構造的に残る。** これが今回の提出で唯一、実装では消せないリスクである
（対処は §8）。

写真の権限は**書き込み専用**で要求している。`NSPhotoLibraryAddUsageDescription` だけを宣言し、
読み取り用の `NSPhotoLibraryUsageDescription` は意図的に宣言していない。つまりアプリは
利用者の既存の写真を見ることができない。これは審査でも説明の柱になる。

### 招待トークンを外部サービスに渡してはいけない理由

デモ用ギャラリーを開くための招待トークンは、**ギャラリーを開く鍵そのもの**である。
持っていれば誰でも中の写真を見られる。そしてそのデモギャラリーには**顔が判別できる人物**が
写っている。トークンを渡すことは、その人物の写真を渡すことと同じである。

リポジトリは GitHub 上で公開されており（`sawanori/photo_gallery_app`、PUBLIC）、
2026-08-22 に、テストコードにトークンが直書きされたまま公開されかけた事故が実際に起きている。
チャットAIも外部サービスであり、同じ扱いをする。

**トークンを置いてよい場所は3つだけ。** App Store Connect の審査メモ欄、依頼者の手元のメモ、
コマンド実行時の環境変数。この文書にも会話にも書かない。

---

## 2. 確定している値（そのまま使ってよい）

| 項目 | 値 |
| --- | --- |
| App Store の掲載名 | `NonTurnPhoto` |
| ホーム画面のアプリ名 | `NT-photo`（設定済み。変更不要） |
| Bundle Identifier | `com.nonturn.photogallery` |
| バージョン | `1.0.0` |
| Apple Team ID | `2WWB6ZA7A9`（NONTURN LIMITED LIABILITY COMPANY） |
| Apple Provider ID | `128363407` |
| EAS プロジェクト | `@nonturn/photo-gallery` |
| EAS projectId | `123b6397-936a-43b7-8aae-82cf8ad96f40` |
| ギャラリーの本番URL | `https://gallery.non-turn.com` |
| プライバシーポリシー URL | `https://gallery.non-turn.com/privacy` |
| サポート URL | `https://non-turn.com/` |
| 連絡先メール | `info@non-turn.com` |
| 対応端末 | **iPhone のみ**（`supportsTablet: false`。iPad を宣言すると iPad のスクリーンショットが必須になり、審査も iPad で行われるため意図的に外している） |
| リポジトリの場所 | `/Users/noritakasawada/AI_P/practice/photo_gallery_app` |

配布証明書とプロビジョニングプロファイルは Expo のサーバー側に保管されている（remote credentials）。
**2回目以降のビルドは Apple の対話認証なしで通る。**

---

## 3. 現在地（2026-08-22 時点、すべて実測で確認済み）

### 済んでいること

| 項目 | 状態 |
| --- | --- |
| コード | 全 20 コミットが master にマージ済み（マージコミット `3b70837`） |
| テスト | admin 173件 / web 118件 / mobile 76件 パス、mobile の型チェックもクリーン |
| Firestore のセキュリティルール | 本番へデプロイ済み。リポジトリと本番が一致していることを確認済み |
| Web ギャラリーの本番 | デプロイ済み。`/privacy` が HTTP 200 で開く |
| 管理画面の本番 | デプロイ済み。招待の閲覧日数を設定・延長できる |
| Universal Links の設定ファイル | 本番で HTTP 200・`application/json`。Team ID `2WWB6ZA7A9` が正しく入っている |
| アプリアイコン | 設定済み |
| スクリーンショット | 6枚撮影済み（`/Volumes/DB/illustration_design/appstore-screenshots/`） |
| デモ用の招待 | 作成済み。閲覧期限は 2026年11月20日（残り約90日） |
| 輸出コンプライアンスの宣言 | `ITSAppUsesNonExemptEncryption: false` を設定済み。アップロードのたびに聞かれない |

### 残っていること（＝今回の委託範囲）

1. スクリーンショットに写っている人物の許諾確認、必要なら差し替え
2. App Store Connect でアプリレコードを作成し、メタデータを登録
3. `eas build` で提出用ビルドを作成
4. ビルドの中身を検査（意図しない設定が入っていないか）
5. 実機で保存機能の未検証項目を確認
6. 提出直前の機械チェック → `eas submit` → 審査に提出

---

## 4. 手順

各フェーズは**依頼者が実行し、あなたが案内する**。コマンドはすべて依頼者のターミナルで、
リポジトリのルート（`/Users/noritakasawada/AI_P/practice/photo_gallery_app`）から実行する。

---

### Phase 1 — スクリーンショットの人物許諾を確認する

**これを最初に置くのは、差し替えが必要なら Phase 2 のメタデータ登録より前に決着させたいからである。**

依頼者に確認してもらうこと:

```
/Volumes/DB/illustration_design/appstore-screenshots/
```

このフォルダの `01-gallery.png` と `04-gallery-scrolled.png` の**下部に、顔が判別できる人物**が
写っている。App Store の掲載画像は世界中に公開される。

依頼者に聞くこと: **「この人物ご本人から、App Store への掲載許諾を得ていますか？」**

- **許諾がある** → そのまま使う。Phase 2 へ。
- **許諾が無い / 分からない** → 差し替える。最も確実なのは、人物が写っていない写真だけの
  デモ用プロジェクトを管理画面で作り、その招待で撮り直すことである。撮り直しのコマンド:

  ```
  cd web && DEMO_TOKEN=<新しい招待トークン> npx playwright test e2e/appstore-screenshots.spec.ts
  ```

  `<新しい招待トークン>` は依頼者が入力する。**あなたには見せなくてよい。**

- **6枚のうち人物が写っていない4枚だけを使う**という選択肢もある。App Store の必要枚数は
  3〜10枚なので、`00` `02` `03` `05` の4枚で足りる。ただし `01` `04` はギャラリー一覧という
  最も説明力のある画面なので、差し替えられるなら差し替えたほうがよい。

### スロットと寸法が食い違う（2026-08-23 に実画面で判明）

**撮影スクリプトが出すのは 1290 × 2796 px（6.9インチ用）だが、
App Store Connect のバージョン画面が最初に開くのは 6.5インチのスロットで、
このスロットは 1290 × 2796 を受け付けない。**

6.5インチのスロットが受け付ける寸法は次の4つだけである。

```
1242 × 2688   2688 × 1242   1284 × 2778   2778 × 1284
```

1290 × 2796 を入れると
**「1個以上のスクリーンショットの寸法が正しくありません」**というエラーになる。

**進め方は2通りあり、どちらでも提出できる。** 6.5インチのスロットを埋めれば要件は満たされる。

#### A. 6.5インチのスロットに合わせる（速い・推奨）

手元の 1290 × 2796 を 1284 × 2778 に縮小して、いま開いているスロットにそのまま入れる。

```
cd <スクリーンショットのあるフォルダ>
for f in *.png; do sips --resampleHeightWidth 2778 1284 "$f"; done
```

**縮小率は 0.5% 未満で、縦横比も 0.4613 → 0.4622 とほぼ変わらない。** 目視で歪みは分からない。
`sips` は macOS に最初から入っている。**元のファイルを直接書き換えるので、
原本を別フォルダに残してから実行すること。**

#### B. 6.9インチのスロットを開く

スクリーンショット欄の **「メディアマネージャーですべてのサイズを表示」** から
6.9インチのスロットを選ぶと、1290 × 2796 をそのまま入れられる。

#### 撮り直す場合（画質を最優先するとき）

リサイズではなく最初から目的の寸法で撮ると、文字が再サンプリングされずシャープになる。
`web/e2e/appstore-screenshots.spec.ts` の viewport を変えて撮り直す。

| 欲しい寸法 | viewport（pt） | deviceScaleFactor |
| --- | --- | --- |
| 1284 × 2778 | 428 × 926 | 3 |
| 1242 × 2688 | 414 × 896 | 3 |
| 1290 × 2796 | 430 × 932 | 3（現在の設定） |

**ただし 0.5% の縮小が掲載画像として問題になることはない。** 通常は A で足りる。

**委託先AIへ**: 依頼者が寸法エラーを報告したら、まず**どのスロットに入れようとしているか**を確認すること。
「6.9インチで撮ったのだから正しいはずだ」と押し返さない。スロットが 6.5インチなら A の縮小を案内する。

| ファイル | 内容 |
| --- | --- |
| `00-welcome.png` | 初回ガイド |
| `01-gallery.png` | ギャラリー一覧（枚数と閲覧期限がヘッダーに出る）**要許諾確認** |
| `02-favourites.png` | お気に入りを3枚付けた状態 |
| `03-lightbox.png` | 写真を1枚開いた状態（保存・お気に入り・共有の導線） |
| `04-gallery-scrolled.png` | 下までスクロールした一覧 **要許諾確認** |
| `05-save-actions.png` | 保存の導線 |

---

### Phase 2 — App Store Connect にアプリレコードを作り、メタデータを登録する

https://appstoreconnect.apple.com にログインし、「マイ App」→「＋」→「新規 App」。

**新規作成時に入力する項目:**

| 欄 | 入力する値 |
| --- | --- |
| プラットフォーム | iOS |
| 名前 | `NonTurnPhoto` |
| プライマリ言語 | 日本語 |
| バンドルID | `com.nonturn.photogallery`（プルダウンに出る。出なければ §5 を参照） |
| SKU | `nonturnphoto-001`（社内管理用の任意の文字列。後から見えない） |
| ユーザーアクセス | フルアクセス |

作成後、以下を登録する。**文面はすべて §6 にある。** あなたは聞かれた項目だけを返すこと。

- サブタイトル、プロモーションテキスト、説明文、キーワード（§6.1〜6.4）
- URL 3種（§2 の表）
- スクリーンショット（Phase 1 で決めたもの）— **スロットと寸法が合っているか先に確かめる。
  バージョン画面の初期表示は 6.5インチのスロットで、1290 × 2796 は受け付けない（Phase 1 参照）**
- カテゴリ: **写真/ビデオ**（第2カテゴリは任意。設定するなら**ライフスタイル**）
- 年齢制限: 質問にすべて「なし」で答えて **4+**（§6.5 に判断根拠あり）
- App のプライバシー（§6.6）
- 審査メモとサインイン情報（§6.7）← **最重要。ここを飛ばすと確実に却下される**

---

### Phase 3 — 提出用ビルドを作る

```
cd mobile && npx eas-cli build --platform ios --profile production
```

10〜20分かかる。クラウドでビルドされるので、実行後は待つだけでよい。

**このコマンドが埋め込む設定（確認済み）:**

- 読み込み先のオリジン: `https://gallery.non-turn.com`（`eas.json` の production プロファイルに
  明示してある。2026-08-22 に追加した。それ以前は preview にしか無く、production ビルドが
  意図しないオリジンを向く穴があった）
- ビルド番号: 自動採番（`autoIncrement: true`）
- バージョン: `1.0.0`

**依頼者に伝えること:** ビルドが始まったら EAS のダッシュボード URL が出力される。
失敗したらそのページのログ末尾を貼ってもらうこと。§5 に既知の失敗を載せてある。

---

### Phase 4 — ビルドの中身を検査する

ビルドが成功したら、IPA をダウンロードして中身を確認する。
**「設定したつもり」と「ビルドに入っている」は別物なので、この工程は省かない。**

```
# 作業用ディレクトリで（IPA のパスは依頼者が EAS からダウンロードしたもの）
unzip -o <ダウンロードした.ipa> -d ipa-check
cd ipa-check

# 1. iPad 対応を宣言していないこと（出力に 2 が含まれないこと。1 だけならOK）
plutil -extract UIDeviceFamily json -o - Payload/*.app/Info.plist

# 2. 輸出コンプライアンスが false であること
plutil -extract ITSAppUsesNonExemptEncryption json -o - Payload/*.app/Info.plist

# 3. 写真の「追加」権限の説明があること
plutil -extract NSPhotoLibraryAddUsageDescription json -o - Payload/*.app/Info.plist

# 4. 写真の「読み取り」権限が無いこと（エラーになるのが正解）
plutil -extract NSPhotoLibraryUsageDescription json -o - Payload/*.app/Info.plist
```

**期待される結果:**

| 項目 | 期待 | 違っていたら |
| --- | --- | --- |
| 1. UIDeviceFamily | `[1]`（iPhone のみ） | `2` が含まれていたら iPad のスクリーンショットが必須になる。`app.config.ts` の `supportsTablet` を確認する必要があるので、リポジトリを読めるエージェントか開発者に戻す |
| 2. ITSAppUsesNonExemptEncryption | `false` | アップロードのたびに輸出コンプライアンスを聞かれるが、提出は可能。「いいえ（標準の暗号化のみ）」と答えればよい |
| 3. NSPhotoLibraryAddUsageDescription | 日本語の説明文が出る | 出なければ保存機能で権限ダイアログが出ずアプリが機能しない。**提出を止めて開発者に戻す** |
| 4. NSPhotoLibraryUsageDescription | **エラー（キーが無い）** | 値が出たら、アプリが写真の読み取り権限を求めることになる。審査メモの説明と食い違い、5.1.1 の指摘対象になる。**提出を止めて開発者に戻す** |

読み込み先のオリジンの確認は、次のどちらかで行う。

```
# 方法A: JS バンドルから拾う（Hermes バイトコードだと拾えないことがある）
strings -a Payload/*.app/main.jsbundle | grep -oE '[a-z0-9.-]+\.(vercel\.app|non-turn\.com)' | sort -u

# 方法B: Aで何も出ないときの代替
cd /Users/noritakasawada/AI_P/practice/photo_gallery_app/mobile && npx expo config --type public
# 出力の extra.webOrigin が https://gallery.non-turn.com であることを確認する
```

`gallery.non-turn.com` 以外のホストが出た場合は提出を止める。本番アプリが白画面になる。

---

### Phase 5 — 実機で保存機能を確認する

**Phase 3 のビルドを実機に入れて、審査メモで宣伝している機能が実際に動くことを確かめる。**
アプリ名とオリジンが今回変わっているため、以前の検証結果は使えない。

`iPhone 16 Pro Max（iOS 26.6）` で表示までは合格しているが、**次の項目が未検証のまま残っている。**

| 確認すること | なぜ必要か |
| --- | --- |
| **権限ダイアログの文言** | 「写真の**追加**のみ」を求めるものであること。読み取りを求めていたら設計と食い違う |
| **一括保存の途中でキャンセル** | 止まること・アプリが落ちないこと・保存済み枚数が正しく報告されること。**全プラットフォームで一度も試されていない** |
| **一括保存中にホームに戻す** | 復帰後の挙動 |
| **権限を拒否した状態で保存** | 案内が出ること・「設定を開く」が機能すること |
| **保存された写真のファイル名** | 「写真」アプリで写真を開いて上にスワイプすると出る。元の撮影ファイル名（`DSC05695.jpg` など）であること。LINE 等の他アプリ経由だと名前が変わるので判定材料にしない |
| 機内モードで保存を試す | 誤ってトークンを破棄しないこと（可能なら） |

**動かない項目が見つかったら、それは提出を止める理由になりうる。** 審査メモ（§6.7）は
「1枚保存」「すべて保存」が動くことを前提に書いてある。宣伝した機能が動かないのは
Guideline 2.1 の直撃コースである。依頼者が「キャンセルが効かない」等を報告したら、
**提出を進めず、開発者（リポジトリを読めるエージェント）に戻すよう案内すること。**

---

### Phase 6 — 提出直前の機械チェックと提出

**この順番を守る。チェックを飛ばして submit しない。**

**1. デモ招待が生きていることを本番で確認する**

```
cd web && DEMO_TOKEN=<招待トークン> npx playwright test e2e/review-demo.spec.ts
```

依頼者がトークンを入力する。**あなたに見せる必要はない。** このテストは本番に対して3点を確認する。

1. ギャラリーが開くこと
2. 写真が実際に表示されること
3. **閲覧できる残り日数が14日以上あること**

3番目が最重要である。審査は数日〜1週間かかることがあり、その間に招待が期限切れになると
レビュアーが「開けない」状態になって Guideline 2.1 で却下される。
実際、この落とし穴は 2026-08-22 に発見されている。管理画面が表示していた「有効期限」は
クライアントが実際に見られる期限ではなく、画面上「10月31日」と出ていた招待が
本番では**残り6日**だった。

**残り日数が足りなければ、提出前に延長する。** 管理画面（https://admin-photo-gallery-app.vercel.app）で
該当の招待の詳細を開き、「閲覧日数」の数字を変えて「変更」を押す。
**招待を作り直さないこと。** 作り直すとトークンが変わり、審査メモの URL も差し替えになる。

**2. 提出する**

```
cd mobile && npx eas-cli submit --platform ios
```

**3. App Store Connect で審査に出す**

ビルドが App Store Connect に表示されるまで数分〜30分ほどかかる（Apple 側の処理）。
表示されたら、Phase 2 で作ったバージョンにそのビルドを紐付け、
**§6.7 の審査メモが入っていることを再確認してから**「審査へ提出」を押す。

---

## 5. 既知の失敗と対処

| 症状 | 原因と対処 |
| --- | --- |
| `Failed to register bundle identifier` | Apple Developer Program License Agreement の更新に未同意。Account Holder が https://developer.apple.com/account で新しい契約に同意すると解消する。過去に実際に発生した |
| App Store Connect のバンドルIDのプルダウンに `com.nonturn.photogallery` が出ない | Apple Developer の Identifiers に登録されていない。https://developer.apple.com/account/resources/identifiers で確認する。登録済みのはず（2026-08-16 に登録） |
| `git clone ... exited with non-zero code: 128` | 実体は Mac のディスク不足。EAS はクラウドでビルドするので `mobile/ios`（320MB）と `mobile/android`（2.3GB）はローカルに不要。削除してよい（どちらも再生成できる） |
| ビルドは通るがアプリが白画面 | 読み込み先のオリジンが違う。Phase 4 の確認をやり直す |
| `eas submit` が Apple のログインを求める | 初回のみ。2回目以降は remote credentials で通る |
| EU の trader status（デジタルサービス法）を聞かれる | App Store 配信の要件。事業者情報の登録が必要。依頼者（NonTurn合同会社）の情報を入力する |

**古い資料に注意。** リポジトリ内の `docs/app-store/task-list.json` の task_014 は
`node scripts/verify-demo-invitation.mjs` というコマンドを指示しているが、
**このスクリプトは存在しない**（2026-08-22 に確認）。正しいのは Phase 6 の Playwright のコマンドである。
同様に `docs/native-app/eas-build-setup.md` の Vercel の ID と「Universal Links 未設定」の記述も
古い。**この指示書に書いてある値のほうが新しい。**

---

## 6. App Store Connect に貼るテキスト

### 6.1 サブタイトル（30文字以内）

```
撮影した写真をそのまま端末へ
```

英語ローカライズを出す場合:

```
Save your delivered photos
```

### 6.2 プロモーションテキスト（170文字以内・審査なしで随時変更可）

```
撮影担当者からお受け取りになった招待リンクを開くだけ。写真を1枚ずつ、またはまとめて、端末の写真アプリへ保存できます。会員登録は不要です。
```

### 6.3 説明文（4,000文字以内）

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

### 6.4 キーワード（100文字以内・カンマ区切り）

```
写真,フォト,ギャラリー,納品,撮影,アルバム,保存,ダウンロード,共有,カメラマン,前撮り,出張撮影
```

**スペースを入れないこと。** スペースも文字数を消費する。

### 6.5 年齢制限

質問にすべて「なし」で回答して **4+** になる。判断根拠が要る項目だけ:

| 質問 | 回答 | 理由 |
| --- | --- | --- |
| 無制限のWebアクセス | **いいえ** | WebView の遷移先はギャラリーのオリジン完全一致に限定している。それ以外は WebView 内で開かない |
| ユーザー生成コンテンツ | **いいえ** | 閲覧者は写真を投稿できない。表示されるのは撮影担当者が納品した写真のみ |
| 医療・薬物・暴力・ギャンブル等 | すべて**なし** | 該当なし |

### 6.6 App のプライバシー

**「トラッキング」は「いいえ」。** 解析ツールも広告SDKも一切入れていない（依存パッケージに
該当が無いことを確認済み）。

申告するのは次の2つだけ。

| データの種類 | 用途 | ユーザーIDに紐付けるか | トラッキングに使うか |
| --- | --- | --- | --- |
| 識別子 → ユーザーID | App の機能 | **いいえ** | いいえ |
| 使用状況データ → 製品のインタラクション | App の機能 | **いいえ** | いいえ |

「ユーザーID」は Firebase の匿名認証が発行する識別子で、氏名やメールアドレスとは結び付かない。
「製品のインタラクション」はお気に入りの選択とアクセス回数である。

**申告しないもの:** 連絡先情報、健康、金融、位置情報、連絡先、**写真**（アプリは端末の写真を
読み取らない）、閲覧履歴、検索履歴、購入履歴、機微情報。

判断が要る点が1つある。ホスティング（Vercel）のアクセスログに IP アドレスが残る。
Apple の申告項目に IP 単体の欄は無く、一般的なサーバーログを申告しない運用が広く行われている。
より保守的にするなら「診断 → その他の診断データ」を足す。**推奨は足さない。**
ログは障害対応目的で、アプリが能動的に送信しているものではないためである。

### 6.7 審査メモ（App Review Information → Notes）— 最重要

**このアプリは招待制で、レビュアーは招待を持っていない。これを書かないと確実に却下される。**

「サインインが必要」は**オフ**にする（アカウントの概念が無いため）。
Notes 欄に以下を貼り、`<DEMO_TOKEN>` を実際の招待トークンに置き換える。
**置き換えは依頼者が App Store Connect の入力欄で直接行う。あなたは置き換えた文面を受け取らない。**

```
This app is an invitation-based photo delivery service for clients of a
photography studio. There is no sign-up: access is granted by an invitation
link that the photographer sends to each client.

HOW TO REVIEW
1. Launch the app. The "Open your gallery" screen appears.
2. Paste the following invitation link into the input field and tap "Open":

   https://gallery.non-turn.com/gallery/<DEMO_TOKEN>

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

---

## 7. あなたが決めてはいけないこと

次の判断は依頼者のものである。あなたは選択肢と根拠を示して、決定を待つ。

1. **スクリーンショットの人物を掲載してよいか**（Phase 1）
2. **未検証の保存機能に不具合が見つかったとき、提出を強行するか止めるか**（Phase 5）
3. **却下されたときに配布形態を変えるか**（§8）
4. **アプリ名を `NT-Photo` と大文字にするか**（見栄えの好みの問題。変えるなら開発者の作業が要る）

---

## 8. 却下されたときの対応

却下理由を分類してから動く。理由の文面を依頼者に貼ってもらうこと。

### Guideline 2.1（レビュアーが中身に到達できない・デモが動かない）

**これは実装の問題である。** 最も多い原因はデモ招待の期限切れなので、
まず管理画面で閲覧日数を確認・延長し、Phase 6 のチェックを通してから再提出する。

「そもそもリンクを貼る方式が分かりにくい」という理由なら、**ID＋合言葉でのサインイン**を
実装する計画が `docs/app-signin/` に用意されている（全15タスク・未着手）。
これを実装すると App Store Connect の「サインイン情報」欄にデモ資格情報を登録できるようになり、
レビュアーの期待に沿う標準的な形になる。実装は開発者（リポジトリを読めるエージェント）の仕事である。

### Guideline 4.2（Web サイトを包んだだけ）

**これは実装では解決しない可能性がある。** 対処は次の順で試す。

1. **保存の進捗表示をネイティブ化する。** 現在は保存の進捗も完了表示も Web 側が描画している。
   これをネイティブの UI に移すと、レビュアーが最も注目する「アプリらしさ」の瞬間が
   ネイティブになる。実装計画は `docs/app-store/task-list.json` の task_015 にある。
   **審査メモの文章をいくら足しても binary の中身は変わらない**ので、文章での反論は効きにくい。
2. **Unlisted App Distribution を申請する。** 検索に出ず、URL を知る人だけがインストールできる形態。
   ただし**審査基準は通常審査と同一であり、4.2 の免除ではない。**
3. **TestFlight の外部配布に切り替える。** ただし**90日でビルドが失効し、3か月ごとの
   上げ直しが恒久的な運用になる。** これを依頼者に伝えたうえで判断してもらう。

### 審査が終わったら（合否を問わず）

**デモ用の招待を無効化する（`isActive: false`）。** 管理画面から行う。
再審査のときに再度有効化する。これを忘れると、審査用のギャラリーが公開されたまま残る。

---

## 9. この指示書の情報源

すべてリポジトリ内の資料と、2026-08-22 に本番環境へ対して実測した結果に基づく。

- `docs/app-store/submission-materials.md` — §6 の文面、§6.5・§6.6 の判断根拠
- `docs/app-store/task-list.json` — Phase 4 の検査項目（task_014）、§8 の対処（task_015 / task_016 / task_017）
- `docs/native-app/eas-build-setup.md` — §2 の Apple 資格情報、§5 の既知の失敗
- `docs/native-app/device-test-log.md` — Phase 5 の未検証項目
- `mobile/app.config.ts` / `mobile/eas.json` — §2 の確定値、Phase 3 のビルド設定
- 本番環境への実測 — §3 の「済んでいること」（HTTP ステータス、AASA の Team ID、デプロイ状態）
