import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';

import { WEB_ORIGIN } from './src/config';
import {
  galleryUrlForToken,
  resolveDeepLink,
} from './src/navigation/resolveInitialUrl';
import GalleryWebView from './src/screens/GalleryWebView';
import NoInvitationScreen from './src/screens/NoInvitationScreen';

const SCHEME = 'photogallery';
/** 直近に開いた招待トークン。これ以外の個人情報は端末に保存しない。 */
const TOKEN_KEY = 'last_invitation_token';

export default function App() {
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(true);
  const mounted = useRef(true);

  /** 現在表示している招待のトークン。無効通知の照合に使う。 */
  const currentToken = useRef<string | null>(null);

  /**
   * 直前に開いていた招待のトークン。
   *
   * `applyLink` は形式が解決できた時点でトークンを保存する（有効性は確認しない）。
   * そのため、有効な招待Aを開いている人が打ち間違えたリンクBを開くと、
   * その時点でAが失われる。無効通知を受けたときにAへ戻せるよう覚えておく。
   * セッション内のみで、端末には保存しない。
   */
  const previousToken = useRef<string | null>(null);

  const applyLink = useCallback(async (rawUrl: string): Promise<boolean> => {
    const resolved = resolveDeepLink(rawUrl, WEB_ORIGIN, SCHEME);
    if (!resolved) return false;

    // 別の招待に移るときだけ、直前のものを退避する。
    // 同じ招待を開き直した場合に自分自身を退避先にしない。
    if (currentToken.current && currentToken.current !== resolved.token) {
      previousToken.current = currentToken.current;
    }
    currentToken.current = resolved.token;

    try {
      await SecureStore.setItemAsync(TOKEN_KEY, resolved.token);
    } catch {
      // 保存に失敗しても今回の表示は続行する
    }
    if (mounted.current) setSourceUrl(resolved.url);
    return true;
  }, []);

  /**
   * web が「この招待は確かに無効だ」と通知してきたときの処理。
   *
   * これが無いと、無効なトークンを一度保存したアプリは回復できない。
   * 無効な招待でも web は HTTP 200 とエラーページを返し、そのページには
   * 脱出手段が無いため、以後アイコン起動のたびにそこへ直行し続ける。
   *
   * **表示中の招待に対する通知だけを受け付ける。** ページ内のスクリプトは
   * 注入された nonce を読めるため通知自体は偽装できるが、この照合により
   * 「いま開いている招待以外のトークンを消す」ことはできない。
   */
  const handleInvitationInvalid = useCallback(async (token: string) => {
    if (currentToken.current !== token) return;

    // 直前に有効だった招待があればそこへ戻す。無ければ入口へ。
    const fallback = previousToken.current;
    previousToken.current = null;
    currentToken.current = fallback;

    try {
      if (fallback) {
        await SecureStore.setItemAsync(TOKEN_KEY, fallback);
      } else {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
      }
    } catch {
      // 端末側の保存に失敗しても、この起動中の表示は切り替える
    }

    if (!mounted.current) return;
    setSourceUrl(fallback ? galleryUrlForToken(fallback, WEB_ORIGIN) : null);
  }, []);

  useEffect(() => {
    mounted.current = true;

    const resolveInitial = async () => {
      try {
        const initial = await Linking.getInitialURL();
        if (initial && (await applyLink(initial))) return;

        const savedToken = await SecureStore.getItemAsync(TOKEN_KEY);
        if (savedToken && mounted.current) {
          currentToken.current = savedToken;
          setSourceUrl(galleryUrlForToken(savedToken, WEB_ORIGIN));
        }
      } catch {
        // 解決に失敗したら未リンク起動として扱う
      } finally {
        if (mounted.current) setIsResolving(false);
      }
    };

    void resolveInitial();

    // 起動中に別の招待リンクを受け取ったら表示を切り替える
    const subscription = Linking.addEventListener('url', ({ url }) => {
      void applyLink(url);
    });

    return () => {
      mounted.current = false;
      subscription.remove();
    };
  }, [applyLink]);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {isResolving ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : sourceUrl ? (
        <GalleryWebView
          key={sourceUrl}
          sourceUrl={sourceUrl}
          onInvitationInvalid={handleInvitationInvalid}
        />
      ) : (
        <NoInvitationScreen />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
});
