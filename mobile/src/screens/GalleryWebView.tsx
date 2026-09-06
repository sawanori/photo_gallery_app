import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Linking, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import Constants from 'expo-constants';

import { WEB_ORIGIN } from '../config';
import {
  buildDispatchScript,
  buildInjectedScript,
  createNonce,
  userAgentSuffix,
} from '../bridge/inject';
import { createMessageHandler } from '../bridge/handleMessage';
import type { OutboundMessage } from '../bridge/protocol';
import { decideNavigation } from '../navigation/isAllowedNavigation';
import LoadErrorScreen from './LoadErrorScreen';

/** レンダラが連続でクラッシュしたらリロードを諦めてエラー画面に落とす。 */
const MAX_RENDERER_RESTARTS = 3;

/**
 * WebView を四方の safe area に収める。**下端を外さないこと。**
 *
 * 外すと、システムのナビゲーションバーが写真カードのボタンに重なる。
 * Android 15 以降は targetSdk 35 以上のアプリを edge-to-edge で描くため、
 * WebView がナビゲーションバーの裏まで広がる。3 ボタン操作の端末では
 * 最下段のカードのハートと保存ボタンがバーの真下に入り、押しても
 * システム側に取られる（2026-09-06 に SCG21 / Android 16 の実機で確認）。
 *
 * web 側で `env(safe-area-inset-bottom)` を使う手もあるが、Android の WebView が
 * その値を返すかは端末と WebView のバージョンに依存する。ここで空けるほうが確実。
 */
const SAFE_AREA_EDGES = ['top', 'bottom', 'left', 'right'] as const;

interface Props {
  sourceUrl: string;
  /** web が「この招待は確かに無効だ」と通知してきたときに呼ばれる。 */
  onInvitationInvalid?: (token: string) => void;
  /** 利用者が web 上の「別のギャラリーを開く」を押したときに呼ばれる。 */
  onLeaveGallery?: (token: string) => void;
}

export default function GalleryWebView({
  sourceUrl,
  onInvitationInvalid,
  onLeaveGallery,
}: Props) {
  const webViewRef = useRef<WebView>(null);
  const [hasError, setHasError] = useState(false);
  const restartCount = useRef(0);
  /**
   * WebView の履歴を戻れるか。
   *
   * state ではなく ref に置く。state にすると遷移のたびに BackHandler を
   * 登録し直すことになり、その隙間に押された戻るキーが取りこぼされる。
   */
  const canGoBack = useRef(false);

  const appVersion = Constants.expoConfig?.version ?? '0.0.0';
  const nonce = useMemo(() => createNonce(), []);
  const injectedScript = useMemo(
    () => buildInjectedScript(nonce, appVersion),
    [nonce, appVersion]
  );

  const sendToWeb = useCallback((message: OutboundMessage) => {
    webViewRef.current?.injectJavaScript(buildDispatchScript(message));
  }, []);

  const handler = useMemo(
    () => createMessageHandler(nonce, sendToWeb, onInvitationInvalid, onLeaveGallery),
    [nonce, sendToWeb, onInvitationInvalid, onLeaveGallery]
  );

  const handleShouldStartLoad = useCallback(
    // ShouldStartLoadRequest はパッケージのルートから公開されていないため、
    // WebViewNavigation に isTopFrame を足した形で受ける。
    (request: WebViewNavigation & { isTopFrame: boolean }): boolean => {
      const decision = decideNavigation(request, WEB_ORIGIN);

      if (decision === 'external') {
        Linking.openURL(request.url).catch(() => {
          // 開けなくてもアプリは落とさない
        });
      }
      return decision === 'allow';
    },
    []
  );

  /**
   * Android の戻るキー。
   *
   * 既定では戻るキーでアプリごと終了する。ライトボックスや /liked から
   * 一覧へ戻れないと、利用者にはアプリが落ちたようにしか見えない。
   * iOS には物理的な戻るキーが無く、BackHandler も Android 専用なので登録しない。
   * iOS の戻るは画面内の導線（お気に入り一覧のヘッダーにある戻るボタン）で完結する。
   */
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack.current) return false; // 履歴が無ければ既定動作（アプリ終了）
      webViewRef.current?.goBack();
      return true;
    });
    return () => subscription.remove();
  }, []);

  const reload = useCallback(() => {
    setHasError(false);
    webViewRef.current?.reload();
  }, []);

  const handleRendererGone = useCallback(() => {
    // WebView のプロセスが落ちても白画面のまま放置しない
    restartCount.current += 1;
    if (restartCount.current > MAX_RENDERER_RESTARTS) {
      setHasError(true);
      return false;
    }
    webViewRef.current?.reload();
    return true;
  }, []);

  if (hasError) {
    return (
      <SafeAreaView style={styles.container}>
        <LoadErrorScreen
          onRetry={() => {
            restartCount.current = 0;
            reload();
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={SAFE_AREA_EDGES}>
      <View style={styles.container}>
        <WebView
          ref={webViewRef}
          source={{ uri: sourceUrl }}
          // ここは意図的に緩くしてある。判定は下の onShouldStartLoadWithRequest で行う。
          //
          // このリストで弾かれた URL は、こちらのハンドラを通らずライブラリが直接
          // Linking.openURL に渡してしまう。つまりページが読み込む iframe ひとつで
          // アプリが勝手にブラウザへ切り替わり、こちらでは制御できない
          // （Vercel のプレビュー用ツールバーの iframe で実際に発生した）。
          //
          // なお値にパスを含めてはいけない。この照合は URL 全体ではなく**オリジンだけ**
          // （`https://host`。末尾スラッシュもパスも無い）に対して行われるため、
          // `${WEB_ORIGIN}/*` と書くと決して一致しない。詳細は originWhitelist.test.ts。
          originWhitelist={['https://*', 'http://*']}
          applicationNameForUserAgent={userAgentSuffix(appVersion)}
          onShouldStartLoadWithRequest={handleShouldStartLoad}
          onNavigationStateChange={(navState) => {
            canGoBack.current = navState.canGoBack;
          }}
          injectedJavaScriptBeforeContentLoaded={injectedScript}
          // Android では上記が確実に届かないため、読み込み後にも冪等に注入する
          injectedJavaScript={injectedScript}
          onMessage={(event) => {
            void handler.handle(event.nativeEvent.data);
          }}
          onError={() => setHasError(true)}
          onHttpError={({ nativeEvent }) => {
            if (nativeEvent.statusCode >= 500) setHasError(true);
          }}
          onContentProcessDidTerminate={handleRendererGone}
          onRenderProcessGone={handleRendererGone}
          pullToRefreshEnabled
          /*
            iOS の画面端スワイプによる「戻る」は無効にする。
            ライトボックスは左右スワイプで写真を送るため、前の写真へ戻そうとして
            左端から払うと、OS の端ジェスチャが先に反応してギャラリー自体から
            出てしまう。web は履歴を積まないので、戻った先は写真一覧ですらない。
            画面内の移動はギャラリーとお気に入り一覧の2つだけで、
            お気に入り一覧のヘッダーには戻るボタンがある。失うものは無い。
          */
          allowsBackForwardNavigationGestures={false}
          setSupportMultipleWindows={false}
          javaScriptEnabled
          domStorageEnabled
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
});
