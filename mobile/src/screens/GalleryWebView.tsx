import { useCallback, useMemo, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
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

interface Props {
  sourceUrl: string;
}

export default function GalleryWebView({ sourceUrl }: Props) {
  const webViewRef = useRef<WebView>(null);
  const [hasError, setHasError] = useState(false);
  const restartCount = useRef(0);

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
    () => createMessageHandler(nonce, sendToWeb),
    [nonce, sendToWeb]
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
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
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
          allowsBackForwardNavigationGestures
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
