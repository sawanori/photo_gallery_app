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
  process.env.EXPO_PUBLIC_WEB_ORIGIN ?? 'https://web-photo-gallery-app.vercel.app';

const GALLERY_DOMAIN =
  process.env.GALLERY_DOMAIN ?? new URL(WEB_ORIGIN).host;

const IOS_BUNDLE_ID = process.env.IOS_BUNDLE_ID ?? 'com.nonturn.photogallery';
const ANDROID_PACKAGE = process.env.ANDROID_PACKAGE ?? 'com.nonturn.photogallery';

const PHOTO_ADD_PERMISSION_TEXT =
  '選んだ写真を端末の写真アプリに保存するために使用します。既存の写真を読み取ることはありません。';

const config: ExpoConfig = {
  name: 'Photo Gallery',
  slug: 'photo-gallery',
  // EAS 上のプロジェクトを所有するアカウント。
  owner: 'nonturn',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  scheme: 'photogallery',
  // SDK 57 では新アーキテクチャが既定のため newArchEnabled の指定は不要（型にも存在しない）

  ios: {
    supportsTablet: true,
    bundleIdentifier: IOS_BUNDLE_ID,
    // ユニバーサルリンク。ドメイン確定前でも形は正しく保つ。
    associatedDomains: [`applinks:${GALLERY_DOMAIN}`],
    infoPlist: {
      // 書き込み専用の認可で完結させるため、NSPhotoLibraryUsageDescription（読み取り）は
      // 意図的に設定しない。
      NSPhotoLibraryAddUsageDescription: PHOTO_ADD_PERMISSION_TEXT,
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
