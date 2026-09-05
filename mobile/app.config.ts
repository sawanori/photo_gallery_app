import type { ExpoConfig } from 'expo/config';

/**
 * ネイティブ設定。
 *
 * 未確定の値は環境変数で差し替えられるようにしてある。
 * ドメインとバンドル識別子が確定したら .env を書き換えるだけでよい。
 *  - EXPO_PUBLIC_WEB_ORIGIN: ギャラリー web のオリジン
 *  - GALLERY_DOMAIN: ユニバーサルリンク / App Links に使うホスト名
 *  - IOS_BUNDLE_ID / ANDROID_PACKAGE: ストアの識別子
 */

const WEB_ORIGIN =
  process.env.EXPO_PUBLIC_WEB_ORIGIN ?? 'https://gallery.non-turn.com';

const GALLERY_DOMAIN =
  process.env.GALLERY_DOMAIN ?? new URL(WEB_ORIGIN).host;

const IOS_BUNDLE_ID = process.env.IOS_BUNDLE_ID ?? 'com.nonturn.photogallery';
const ANDROID_PACKAGE = process.env.ANDROID_PACKAGE ?? 'com.nonturn.photogallery';

const PHOTO_ADD_PERMISSION_TEXT =
  '選んだ写真を端末の写真アプリに保存するために使用します。既存の写真を読み取ることはありません。';

const config: ExpoConfig = {
  // ホーム画面に出る名前（CFBundleDisplayName）。App Store の掲載名とは別物で、
  // 掲載名は App Store Connect 側で設定する（そちらは NonTurnPhoto）。
  //
  // ホーム画面のラベルは**幅で切られる**。文字数の固定上限ではないが、
  // 12文字前後を超えると "NonTurnPh…" のように省略される。
  // ここを短くしているのはそのため。
  //
  // ここを変えてもネイティブ判定は壊れない。User-Agent の目印は
  // mobile/src/bridge/inject.ts の 'PhotoGalleryApp/' というリテラルで、
  // web/src/lib/nativeBridge.ts がその文字列を見ている。両者は name と無関係。
  name: 'NT-photo',
  // slug は EAS のプロジェクト識別子に紐づく。変えないこと。
  slug: 'photo-gallery',
  // EAS 上のプロジェクトを所有するアカウント。
  owner: 'nonturn',
  version: '1.0.1',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  scheme: 'photogallery',
  // SDK 57 では新アーキテクチャが既定のため newArchEnabled の指定は不要（型にも存在しない）

  ios: {
    // iPad 対応を宣言すると、App Store Connect が **13インチ iPad のスクリーンショットを
    // 必須**にし、審査も iPad で行われる（Guideline 2.1: 宣言した端末で正しく動くこと）。
    // 手元に iPad が無く動作確認ができないため、1.0 では iPhone のみで出す。
    // iPad を用意して確認できたら true に戻す。変更はこの1行だけ。
    supportsTablet: false,
    bundleIdentifier: IOS_BUNDLE_ID,
    // ユニバーサルリンク。ドメイン確定前でも形は正しく保つ。
    associatedDomains: [`applinks:${GALLERY_DOMAIN}`],
    infoPlist: {
      // 書き込み専用の認可で完結させるため、NSPhotoLibraryUsageDescription（読み取り）は
      // 意図的に設定しない。
      NSPhotoLibraryAddUsageDescription: PHOTO_ADD_PERMISSION_TEXT,
      // 輸出コンプライアンス。このアプリが使う暗号は HTTPS だけで、Apple の適用除外に当たる。
      // 宣言しておくと、App Store Connect でビルドを上げるたびに聞かれずに済む。
      ITSAppUsesNonExemptEncryption: false,
    },
  },

  android: {
    package: ANDROID_PACKAGE,
    adaptiveIcon: {
      backgroundColor: '#FFFFFF',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // 保存専用アプリなので、メディアの読み取り権限は一切宣言しない。
    // これらがマニフェストに残ると Google Play の写真・動画権限の申告対象になる。
    //
    // expo-media-library の config plugin は既定でこれらを注入するため、
    // 明示的に列挙して除去する必要がある。列挙漏れがあると素通りする
    // （実際に READ_MEDIA_AUDIO と READ_MEDIA_VISUAL_USER_SELECTED が残っていた）。
    // WRITE_EXTERNAL_STORAGE は Android 12L 以前で MediaStore への書き込みに必要なため残す
    // （maxSdkVersion="32" 付きで宣言され、写真アクセスポリシーの対象外）。
    blockedPermissions: [
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_AUDIO',
      'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
      'android.permission.READ_EXTERNAL_STORAGE',
    ],
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          { scheme: 'https', host: GALLERY_DOMAIN, pathPrefix: '/gallery' },
          { scheme: 'https', host: GALLERY_DOMAIN, pathPrefix: '/liked' },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },

  plugins: [
    [
      'expo-media-library',
      {
        savePhotosPermission: PHOTO_ADD_PERMISSION_TEXT,
        // false を渡すと NSPhotoLibraryUsageDescription（読み取り）が Info.plist から削除される。
        // 省略すると既定の説明文が入ってしまい、書き込み専用の方針と食い違う。
        photosPermission: false,
        // 読み取り権限を要求しないので、限定アクセスの自動アラートも出さない
        preventAutomaticLimitedAccessAlert: true,
      },
    ],
    'expo-secure-store',
    [
      /**
       * 対応言語を日本語として宣言する。
       *
       * これが無いと iOS はアプリを英語のものとして扱い、設定アプリの言語欄も
       * App Store の表示も英語になる。アプリの文言はもともと日本語なので、
       * 実態に合わせるための宣言である。
       *
       * `['ja', 'en']` にはしない。切り替えの選択肢が設定アプリに出るのに、
       * 切り替えても文言は変わらないため、かえって誤解を招く。
       */
      'expo-localization',
      {
        supportedLocales: {
          ios: ['ja'],
          android: ['ja'],
        },
      },
    ],
  ],

  extra: {
    webOrigin: WEB_ORIGIN,
    galleryDomain: GALLERY_DOMAIN,
    // EAS のプロジェクト識別子（@nonturn/photo-gallery）。
    // 動的設定（app.config.ts）のため eas init が自動で書き込めず、手で入れている。
    eas: {
      projectId: '123b6397-936a-43b7-8aae-82cf8ad96f40',
    },
  },
};

export default config;
