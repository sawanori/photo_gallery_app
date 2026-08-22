# 敵対的レビューの記録と裁定

対象: `docs/native-app/implementation-plan.md` v1（初版）
レビュアー: Gemini（`gemini-3.5-flash`）／ Codex（`mcp__codex__codex`、read-only サンドボックス）
実施日: 2026-08-16

> `gemini-3.5-pro` はこのアカウントで `ModelNotFoundError`（`models/gemini-3.5-pro is not found for API version v1beta`）となり利用できなかった。利用可能だったのは `gemini-3-pro-preview` と `gemini-3.5-flash` で、「3.5 以上」の指定を満たす `gemini-3.5-flash` を使用した。

指摘は鵜呑みにせず、争点になった技術的主張は Expo 公式ドキュメント（context7 経由で取得）に照らして裁定した。以下、**採用**／**部分採用**／**却下**に分けて記録する。

---

## 0. 両者が正面から衝突した論点（公式ドキュメントで裁定）

**争点: 画像のダウンロードと保存に使う API はどれか。**

| 主張 | 判定 |
|---|---|
| Gemini: `File.downloadFileAsync` / `Directory` / `Paths` は Expo に存在しない。`FileSystem.downloadAsync` と `FileSystem.cacheDirectory` が正しい | **誤り**。SDK 55 の `expo-file-system` ドキュメントは `import { Directory, File, Paths } from 'expo-file-system'` と `File.downloadFileAsync(url, destination)` を正規 API として記載しており、逆に **`FileSystem.downloadAsync` の方が deprecated** と明記されている |
| Codex: `MediaLibrary.saveToLibraryAsync` は最新 SDK で deprecated かつ runtime throw | **正しい（2026-08-16 実装時に実物で確認）**。当初はドキュメントだけを見て「runtime throw の根拠は確認できない」と半分却下したが、実際に `expo-media-library@57.0.4` をインストールして `node_modules/expo-media-library/build/legacyWarnings.js` を読んだところ、主エントリ `expo-media-library` から import した `saveToLibraryAsync` は **`throw errorOnLegacyMethodUse('saveToLibraryAsync')` で必ず例外を投げる実装**だった。正しい import 元は `expo-media-library/legacy`（package.json の `exports` に定義されたサブパス）。Codex の指摘どおりである |

**裁定と計画への反映**:

1. **Expo SDK のバージョンを明示的に pin する**。「作成時点の最新安定版」という書き方が両者の混乱の原因だった。SDK 55 を pin し、`saveToLibraryAsync` + `requestPermissionsAsync(true)`（書き込み専用）を使う。
2. **ダウンロード先は `Directory` ではなく `new File(Paths.cache, <検証済みファイル名>)` を明示指定する**（Codex の指摘 2 が正しい）。最新版の公式サンプル「Save a new asset from the web」も `new File(Paths.cache, 'test_image.jpg')` を destination にしている。`Directory` 渡しだと保存名がレスポンス由来になり、拡張子が付かず `saveToLibraryAsync` の「URI に拡張子が必要」という要件を満たせない可能性がある。
3. **モダン API への移行はリスクとして明記する**。`Asset.create()` は生成した Asset を返す（＝読み取りを伴う）ため、**書き込み専用権限で動作するかが未確認**である。書き込み専用で完結させたい本計画の方針とは緊張関係にある。SDK 更新時の検証項目として残す。

---

## 1. 採用した指摘

| # | 指摘者 | 内容 | 反映先 |
|---|---|---|---|
| A1 | Codex | **URL 許可リストは認可ではない。** ホスト名だけ検証しても、同じ Firebase Storage ホスト上の他クライアントの写真を保存させられる。`storage.rules` が `allow read: if true` であるため被害面が広い | 設計を変更。Phase 1 に厳格化（バケット・パス接頭辞の固定、nonce、WebView 現在 URL の検証）を入れ、**サーバー側の認可済みマニフェスト API を必須タスクに追加**（Non-Scope から移動）。別計画の task_001 / task_002 / task_004 をストア公開の**前提条件**に格上げ |
| A2 | Codex | **`startsWith(WEB_ORIGIN)` は origin 比較として壊れている。** `https://<origin>.evil.tld/` が通る。`javascript:` / `data:` / `blob:` / `intent:` の扱いも未定義 | `new URL(u).origin === WEB_ORIGIN` に修正。許可スキームを `https:` に限定。task_003 と check に追加 |
| A3 | Codex | **Android の `injectedJavaScriptBeforeContentLoaded` は experimental で 100% 信頼できない**（react-native-webview 公式 Reference の警告） | ネイティブ検出を多重化（カスタム User-Agent 接尾辞 + `window.ReactNativeWebView` の存在 + 注入グローバル）。「初回描画でちらつかない」という記述と受け入れ条件を削除 |
| A4 | Gemini | **SSR とクライアントで `window.__NATIVE_GALLERY__` の有無が食い違い、hydration mismatch を起こす** | マークアップを分岐させないことを原則にする。挙動の差はイベントハンドラ内で決め、文言など DOM が変わる箇所のみ mount 後に切り替える。task_007 の実装手順に明記 |
| A5 | Codex | **`/liked?token=` を App Links 対象にしているのに、起動 URL の解決が `/gallery/<token>` しか parse しない** | resolver をパス＋クエリを保持する方式に変更。task_011 と check_022 を修正 |
| A6 | Codex | **Android の `READ_MEDIA_IMAGES` などがマニフェストに混入すると Google Play の写真アクセスポリシーに抵触する**（保存専用アプリなのに広範な読み取り権限を宣言することになる） | 生成された AndroidManifest の権限監査を task と check に追加 |
| A7 | Codex | **token は個人情報に準ずる。** `clientName` / `clientEmail` と写真に到達する bearer credential であり、「個人情報は保持しない」は虚偽になる | 「10. Database Plan」の記述を訂正。保存期間・失効・ログマスキングを task_015 に追加 |
| A8 | Codex | **同一ドメイン内で universal link をタップしても Safari に留まる**（Apple 仕様）。web を先に開いたユーザーがアプリへ移れない | task_013（Smart App Banner）を任意から**必須**へ格上げ |
| A9 | Codex | **アプリ binary と web のバージョン skew。** web は即時デプロイされるがアプリは遅れる。未知のメッセージ型を送ると保存が黙って失敗する | ブリッジのバージョン交渉を設計に追加。web は `bridgeVersion` を見て未対応機能ではブラウザ挙動にフォールバックする。check を追加 |
| A10 | Gemini | **ネイティブモジュール依存のコードは Node のテストランナーで落ちる** | `validate.ts` を expo 非依存の純関数に限定することを明記。`jest-expo` の設定手順を task_002 に追加 |
| A11 | Gemini | **`eas login` / `eas init` は対話必須で、自律実行中にハングする** | 認証情報の登録を「人間が事前に行う前提タスク」として分離。エージェントの責務は `eas.json` の作成までとする |
| A12 | Gemini | **WebView プロセスのクラッシュ（白画面）とディスク容量不足が受け入れ条件にない** | `onContentProcessDidTerminate`（iOS）/ `onRenderProcessGone`（Android）でのリカバリを task_003 に追加。空き容量チェックを task_006 に、両方を check に追加 |
| A13 | Codex | **一括保存の上限が件数のみ。総バイト数・空き容量・セルラー通信・重複保存が未考慮** | 総バイト上限、空き容量事前チェック、セルラー時の警告、重複方針を task_006 に追加。実機テストを 30 枚から 200 枚以上・低容量端末へ拡張 |
| A14 | Codex | **アクセシビリティが受け入れ条件に一切ない** | 進捗・完了・失敗の読み上げ（`aria-live` / ネイティブアナウンス）と VoiceOver / TalkBack の手動確認を check に追加 |
| A15 | 両者 | **App Store 4.2（Minimum Functionality）のリスクを過小評価している** | 配布形態の選択（公開ストア / TestFlight / Play internal・unlisted）を明示的な意思決定にし、go/no-go ゲートを設ける |
| A16 | 両者 | **Web Share API による一括共有の実測を任意にしているのは順序が逆** | 任意タスクから**ゲート0（着手前の実測）**へ格上げ。ただし中止の判断はユーザーが行い、実測結果は材料として提示する |

---

## 2. 部分採用

| # | 指摘者 | 内容 | 判断 |
|---|---|---|---|
| B1 | Gemini | 一括保存で **OOM が起きる** | **フレーミングは誤り**。`File.downloadFileAsync` はディスクへ書き出すため、web の ZIP 生成（`JSZip` が全 Blob をメモリ保持）と違ってメモリに全量を載せない。ただし**バックグラウンド移行による中断は実在する**ため、その部分だけ採用し、「アプリを閉じないでください」の警告表示と空き容量チェックを追加した |
| B2 | Gemini | **Android のアプリ専用キャッシュに置いたファイルは MediaStore にスキャンされない** | 生の `MediaScannerConnection` を使う場合は正しいが、`expo-media-library` はファイルを公開メディア領域へコピーして MediaStore に登録する。既存の `front/src/screens/ImagesScreen.tsx:283-291` も同じ経路（documentDirectory → createAssetAsync）で実装されている。**設計変更はせず、実機検証項目として残す**（task_005 に既に手順あり、文言を強化） |
| B3 | Gemini | **task_007（web 側改修）が実機検証より前にあるため本番 web が壊れる** | 検出は `window.__NATIVE_GALLERY__` とカスタム User-Agent の存在に依存し、通常ブラウザでは分岐が発火しないため「本番全ユーザーが保存不能になる」は成立しない。ただし**順序のリスク自体は妥当**なので、task_007 の完了条件に「ブラウザ挙動が不変であることの3環境確認」を必須化し、デプロイ判断を task_014 の実機確認後に置いた |

---

## 3. 却下した指摘

| # | 指摘者 | 内容 | 却下の理由 |
|---|---|---|---|
| C1 | Gemini | `File.downloadFileAsync` / `Directory` / `Paths` は存在しない。`FileSystem.downloadAsync` を使うべき | 事実誤認。SDK 55 の公式ドキュメントが新 API を正規として記載し、`FileSystem.downloadAsync` を deprecated としている（上記「0.」参照） |
| ~~C2~~ | Codex | `saveToLibraryAsync` は **runtime throw** する | **却下を撤回。指摘は正しかった。** ドキュメントだけでは判断できなかったが、実際に SDK 57 をインストールして型と実装を読んだところ、主エントリからの import は必ず throw する。詳細は上記「0.」。実装は `expo-media-library/legacy` からの import に変更済み |
| C3 | Gemini | ブラウザとアプリのセッションを引き継ぐため、**移行トークンを URL クエリに載せる** | 却下。招待トークン自体が bearer credential であるところに、さらにセッション移行用の credential を URL に載せると漏洩経路が増える。同じ問題は別計画の task_004（いいねを招待単位に紐付ける）で、追加の credential なしに解決する |
| C4 | Gemini | 4.2 で「即座に却下」される | 断定の根拠がない。ネイティブ固有機能（フォトライブラリへの一括保存）を備えた WebView ベースのアプリが承認された事例は多数ある。**リスクとしては採用**するが、確定事項としては扱わず、go/no-go ゲートと代替配布経路で対処する |

---

## 4. このレビューで変わらなかった中核方針

- UI は既存 web UI をそのまま使う（ユーザー指示。両レビュアーもこの制約は破っていない）。
- ネイティブ側は Firestore に直接アクセスせず、アクセス制御の実装を web に集約する（Codex の A1 対応でサーバー側マニフェスト API を足すが、native が Firebase SDK を持たない方針は維持する）。
- `front/` には手を触れない。

---

## 5. 実装後の追記（2026-08-16）

Phase 1 を実装した際に、レビューの指摘が実物で裏付けられた／覆った点を記録する。

- **Codex A6（Android の読み取り権限混入）は実際に起きた。** `npx expo prebuild --platform android` で生成した `AndroidManifest.xml` に、`expo-media-library` の config plugin が `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` / `READ_MEDIA_AUDIO` / `READ_MEDIA_VISUAL_USER_SELECTED` / `READ_EXTERNAL_STORAGE` を注入していた。`blockedPermissions` に列挙したものだけが `tools:node="remove"` になるため、**列挙漏れは素通りする**。実際に最初の設定では `READ_MEDIA_AUDIO` と `READ_MEDIA_VISUAL_USER_SELECTED` が残っていた。5件すべてを列挙して解消済み。
- **iOS 側にも同種の混入があった（レビューでは指摘されていない）。** プラグインは既定で `NSPhotoLibraryUsageDescription`（読み取り）を `Allow $(PRODUCT_NAME) to access your photos` として Info.plist に入れる。書き込み専用の方針と食い違うため、`photosPermission: false` を渡して削除した（`@expo/config-plugins` の実装で `false` はキーの削除を意味する）。
- **Gemini C1（`File.downloadFileAsync` は存在しない）は SDK 57 でも誤り。** 実物の型定義に `static downloadFileAsync: (url, destination: Directory | File, options?) => Promise<File>` がある。逆に Gemini が推奨した `FileSystem.downloadAsync` の方が、`expo-file-system` の主エントリからは runtime throw する側だった。
- **destination には `Directory` ではなく `File` を渡す必要がある（Codex の指摘 2 が正しい）。** さらに実装時に判明した点として、同名ファイルが残っていると `DestinationAlreadyExists` で reject されるため `{ idempotent: true }` の指定も要る。
