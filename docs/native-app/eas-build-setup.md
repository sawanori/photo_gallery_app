# EAS ビルドの環境設定

実施日: 2026-08-16

iOS 実機ビルドをローカルで行うと Mac の空き容量が尽きるため、EAS Build（Expo のクラウドビルド）へ
切り替えた。その過程で行った設定を記録する。**未実施の項目は「未実施」と明記している。**

---

## 1. アプリが読み込む web のオリジン

ネイティブアプリは UI を持たず、`/web` をそのまま WebView で表示する。したがってビルド前に
**web が https で公開されていること**が前提になる。本番の納品先に影響を与えないよう、
Vercel のプレビューデプロイを検証用のオリジンとして使う。

| 項目 | 値 |
|---|---|
| 固定オリジン（アプリに埋める値） | `https://photo-gallery-native-test.vercel.app` |
| 実体のデプロイ | `web-photo-gallery-pbymfkrxd-sawanoris-projects.vercel.app` |
| 本番（触っていない） | `https://web-photo-gallery-app.vercel.app` |

**なぜ別名を割り当てたか。** Vercel のプレビュー URL はデプロイのたびにハッシュが変わる。
アプリは `WEB_ORIGIN` の**完全一致**でナビゲーションを制限しているため（`mobile/src/config.ts`）、
URL が変わるとアプリが自分のギャラリーを開けなくなる。固定の別名を1つ挟むことで、
web を再デプロイしてもアプリを作り直さずに済む。

### web を再デプロイしたときの手順

```bash
# リポジトリのルートで（プロジェクトの Root Directory が web のため）
vercel deploy --yes
vercel alias set <出力された新しいデプロイURL> photo-gallery-native-test.vercel.app
```

アプリ側の変更は不要。

## 2. Vercel の認証保護を無効化した

プレビューには Vercel Authentication がかかっており、`/` が Vercel のログインへ 302、
`/api/native/manifest` が 401 を返してアプリから読み込めなかった。
プロジェクト設定の `ssoProtection` を無効にして解消した（ユーザー判断）。

- 設定前: `ssoProtection: { enabled: true, deploymentType: "all_except_custom_domains" }`
- 設定後: `ssoProtection: null`
- 変更方法: Vercel REST API の `PATCH /v9/projects/{id}` に `{"ssoProtection": null}`
  （MCP 経由の接続は読み取り権限しか無く 403 だった）

**`.vercel.app` の別名では保護は外れない。** 別名を割り当てたうえで確認したが 401 のままだった。
`all_except_custom_domains` の「カスタムドメイン」に `.vercel.app` は含まれない。
独自ドメイン（`gallery.non-turn.com` など）を割り当てる場合は、この保護を再有効化しても
そのドメインからは開ける。

**影響**: このプロジェクトのプレビュー URL は、URL を知っていれば誰でも開ける。
写真そのものへのアクセスは従来どおり招待トークンで制御されており、本番と同じ条件である。
戻す場合は Vercel ダッシュボードの Deployment Protection から再有効化する。

## 3. リポジトリのルートを Vercel にリンクし直した

`web/.vercel/project.json` に入っていた `orgId` が現在のチーム（`sawanoris-projects`）と
一致せず、`Could not retrieve Project Settings` で deploy が失敗していた。
プロジェクトの Root Directory は `web` に設定されているため、**リンクはリポジトリのルートに置く**。

| 項目 | 値 |
|---|---|
| projectId | `prj_NRYiF0sBOby6q8llPB9hI2vERAqP` |
| orgId | `team_g0GuhaYdxY6YHAPc5Xr8okrO` |

`.vercelignore` をルートに追加した。CLI からのアップロードを `web/` だけに絞るためのもので、
Git 連携のデプロイには影響しない。

## 4. eas.json にオリジンを直接埋めた

`mobile/.env` は `.gitignore` に入っているため**クラウドビルドには届かない**。
`preview` プロファイルの `env` に `EXPO_PUBLIC_WEB_ORIGIN` を書いた。
`.env` はローカル開発（`adb reverse` 経由の `localhost:3002`）用として残してある。

なお EAS はデフォルト（`requireCommit` 未設定 = false）で**未コミット・未追跡のファイルも
ビルドアーカイブに含める**ため、ビルドのためにコミットする必要はない。
アーカイブは git のルートから作られ、現状 125MB（うち 110MB は `back/uploads` の旧 API 用画像）。

---

## 確認済みの動作（デプロイ済みプレビューに対する実測）

| 対象 | 結果 |
|---|---|
| `/` | 200 |
| `/gallery/7AA53aP_hAqR-x3qXEqY7` | 200 |
| `/liked` | 200 |
| `/.well-known/apple-app-site-association` | 200（ただし `TEAMID` はプレースホルダのまま） |
| `/.well-known/assetlinks.json` | 200（SHA-256 はプレースホルダのまま） |
| `POST /api/native/manifest` 空ボディ | 400 `bad_request` |
| `POST /api/native/manifest` 存在しないトークン | 404 `not_found` |
| エラー応答の `Cache-Control` | `no-store` |

404 が返るのは Firestore を実際に読んだ結果であり、プレビュー環境の Firebase 接続が
生きていることを示す。**成功パス（200）は未確認**で、実機でアプリを動かしたときに確認する。

`mobile` 側は `tsc --noEmit` がエラーなし、Jest 40 件が合格。
`npx expo config` で `extra.webOrigin` がプレビュー URL になること、
`NSPhotoLibraryAddUsageDescription` のみがあり読み取り用の `NSPhotoLibraryUsageDescription` が
無いことを確認した。

---

## 5. EAS プロジェクトと Apple のクレデンシャル

| 項目 | 値 |
|---|---|
| EAS プロジェクト | `@nonturn/photo-gallery` |
| projectId | `123b6397-936a-43b7-8aae-82cf8ad96f40` |
| Apple Team ID | `2WWB6ZA7A9`（NONTURN LIMITED LIABILITY COMPANY） |
| Apple Provider | `128363407` |
| Bundle Identifier | `com.nonturn.photogallery`（この作業で Apple に新規登録） |
| 登録済みデバイス | `Noritaka iPhone` / UDID `00008140-00111C222893C01C` |
| 配布証明書 | Serial `155998DF6967A24CBFCF2A6D1A598A2`、有効期限 2027-08-16 |
| プロビジョニングプロファイル | Developer Portal ID `5FMUC5Z59R`、Ad Hoc、有効期限 2027-08-16 |

証明書とプロファイルは Expo サーバー側に保管される（remote credentials）。**2回目以降のビルドは
Apple の認証なしで実行できる**（`--non-interactive` が通る）。

`app.config.ts` には `owner: 'nonturn'` と `extra.eas.projectId` を手で追加した。
動的設定のため `eas init` が自動で書き込めないためである。

### 詰まった点

**ダッシュボードで作られたプロジェクトは使えなかった。** 先に expo.dev 上で作られていた
プロジェクトは、アカウント `nonturm`（タイプミス）配下でスラッグが `nonturn` だった。
EAS はスラッグと `app.config.ts` の `slug` の一致を要求するため、
`eas init --force` で `@nonturn/photo-gallery` を作り直した。旧プロジェクトは未使用。

**Apple Developer Program License Agreement の更新が未承諾でビルドが落ちた。**
`Failed to register bundle identifier` として現れる。Account Holder が
https://developer.apple.com/account で更新後の契約に同意すると解消する。
同時に EU の trader status（デジタルサービス法）の案内も出るが、これは App Store 配信の要件で、
内部配布ビルドには不要。

**ディスク不足でアップロードが失敗した。** `git clone ... exited with non-zero code: 128` として
現れるが、実体は `No space left on device`。EAS はクラウドでビルドするため、
ローカルの `mobile/ios`（320MB）と `mobile/android`（2.3GB）は不要になった。削除して解消。
どちらも `.gitignore` 済みで `app.config.ts` から再生成できる。

なお、ローカルビルドのために入れた `~/Library/Developer`（12GB、Xcode の iOS プラットフォームと
シミュレータ）と `~/.gradle`（3.6GB）も、EAS に切り替えた今は不要である。

---

## 未実施

| 項目 | 備考 |
|---|---|
| iPhone 実機でのアプリ動作確認 | ビルド完了後。`docs/native-app/device-test-log.md` に追記する |
| ユニバーサルリンク | `apple-app-site-association` の `TEAMID` を `2WWB6ZA7A9` に差し替えれば有効化できる。ただし配信ドメインが未確定（`decisions.md` D3）のため保留 |
| Android 署名鍵の SHA-256 | `assetlinks.json` のプレースホルダ。EAS の Android クレデンシャル作成後に判明 |
| `.easignore` | アーカイブが 211MB ある（`back/uploads` の旧 API 用画像が 110MB）。追加すると nested `.gitignore` の扱いが変わるため未対応 |

iPhone 実機ビルドには**有料の Apple Developer Program が必須**（Expo 公式ドキュメントで確認:
"all builds intended for physical iPhone devices require a paid Apple Developer account for proper
signing"）。登録済み。
