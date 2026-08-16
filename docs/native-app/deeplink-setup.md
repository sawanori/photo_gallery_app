# ディープリンク設定の残作業

`web/public/.well-known/` に2つのファイルを置いた。**どちらもプレースホルダが入っており、そのままでは動かない。**
実際の値は Apple / Google の開発者アカウントを作らないと取得できないため、ここに手順を残す。

配信ドメイン: `web-photo-gallery-app.vercel.app`（2026-08-16 にユーザーから提供された招待URLで確定）
独自ドメインに移す場合は、下記の作業をそのドメインでやり直す。

---

## 1. iOS: `apple-app-site-association`

現在の内容は `"appIDs": ["TEAMID.com.nonturn.photogallery"]` になっている。
`TEAMID` を実際の **Apple Team ID**（10文字の英数字）に置き換える。

**取得方法**: Apple Developer にログイン → Membership → Team ID

置き換え後の例:

```json
"appIDs": ["ABCDE12345.com.nonturn.photogallery"]
```

**注意点**:

- ファイルは**拡張子なし**で置く（`.json` を付けない）。既にそうしてある。
- レスポンスの `Content-Type` が `application/json` である必要がある。Vercel が正しく返すかを、デプロイ後に必ず確認する。

```bash
curl -I https://web-photo-gallery-app.vercel.app/.well-known/apple-app-site-association
```

`content-type: application/json` でなければ、`web/next.config.ts` の `headers()` で明示する。

---

## 2. Android: `assetlinks.json`

現在の内容は `"sha256_cert_fingerprints": ["REPLACE_WITH_SHA256_FINGERPRINT"]` になっている。
アプリの署名鍵の **SHA-256 フィンガープリント**に置き換える。

**取得方法**（EAS を使う場合）:

```bash
cd mobile
npx eas credentials
# Android → production → Keystore を選ぶと SHA-256 Fingerprint が表示される
```

形式は `AB:CD:EF:...` のようにコロン区切りの64桁。そのまま貼る。

**注意点**:

- Google Play の「アプリ署名」を使う場合、**Play Console が再署名する**ため、アップロード鍵ではなく
  **Play Console に表示される「アプリ署名鍵」の SHA-256** を使う。
  Play Console → 設定 → アプリの完全性 → アプリ署名 で確認できる。
- 開発ビルドでも試したい場合は、デバッグ鍵の SHA-256 を配列に**追加**する（置き換えではなく併記）。

デプロイ後の確認:

```bash
curl -I https://web-photo-gallery-app.vercel.app/.well-known/assetlinks.json
adb shell pm get-app-links com.nonturn.photogallery
```

`verified` と表示されれば成功。

---

## 3. アプリ側の設定

`mobile/app.config.ts` は環境変数から読むようにしてある。既定値は上記のドメインと
`com.nonturn.photogallery` になっている。変える場合は `mobile/.env` に書く。

```
GALLERY_DOMAIN=gallery.non-turn.com
IOS_BUNDLE_ID=com.nonturn.photogallery
ANDROID_PACKAGE=com.nonturn.photogallery
```

`associatedDomains` と `intentFilters` は `GALLERY_DOMAIN` から自動で組み立てられる。

---

## 4. 順序の注意

**この2ファイルは、アプリを配布する前にデプロイしておく必要がある。**
iOS はアプリのインストール時に AASA を取得するため、後から置いてもすぐには反映されない
（アプリの再インストールか、しばらく待つ必要がある）。

したがって順序は次になる。

1. 開発者アカウントを作り、Team ID と署名鍵の SHA-256 を得る
2. この2ファイルのプレースホルダを実値に置き換える
3. web をデプロイする
4. `curl` で2ファイルが 200 と `application/json` で返ることを確認する
5. アプリをビルドして実機に入れる
6. 招待リンクをタップしてアプリが開くことを確認する

---

## 5. 現時点の状態

| 項目 | 状態 |
|---|---|
| AASA の配置 | 済（`TEAMID` がプレースホルダ） |
| assetlinks.json の配置 | 済（フィンガープリントがプレースホルダ） |
| `app.config.ts` の `associatedDomains` | 済（ドメインは環境変数で差し替え可能） |
| `app.config.ts` の `intentFilters` | 済（`/gallery` と `/liked` の両方） |
| 起動 URL の解決 | 済（`resolveInitialUrl.ts`。`/gallery/:token` と `/liked?token=` の両方に対応、テスト9件） |
| Team ID の取得 | **未**（Apple Developer 登録が必要） |
| SHA-256 の取得 | **未**（EAS のクレデンシャル作成が必要） |
| デプロイと疎通確認 | **未** |
| 実機での動作確認 | **未** |
