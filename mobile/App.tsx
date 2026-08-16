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

  const applyLink = useCallback(async (rawUrl: string): Promise<boolean> => {
    const resolved = resolveDeepLink(rawUrl, WEB_ORIGIN, SCHEME);
    if (!resolved) return false;

    try {
      await SecureStore.setItemAsync(TOKEN_KEY, resolved.token);
    } catch {
      // 保存に失敗しても今回の表示は続行する
    }
    if (mounted.current) setSourceUrl(resolved.url);
    return true;
  }, []);

  useEffect(() => {
    mounted.current = true;

    const resolveInitial = async () => {
      try {
        const initial = await Linking.getInitialURL();
        if (initial && (await applyLink(initial))) return;

        const savedToken = await SecureStore.getItemAsync(TOKEN_KEY);
        if (savedToken && mounted.current) {
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
        <GalleryWebView key={sourceUrl} sourceUrl={sourceUrl} />
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
