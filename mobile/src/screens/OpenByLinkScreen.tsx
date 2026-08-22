import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { WEB_ORIGIN } from '../config';
import { normalizeInvitationInput } from '../navigation/resolveInitialUrl';

/**
 * 招待を開く入口。
 *
 * このアプリは招待リンクの受け皿であり、リンク無しで見られるものは無い。
 * それでもこの画面が要るのは、リンクをタップする経路が使えない場面があるためである。
 *
 * - メールソフトや LINE のアプリ内ブラウザがリンクを横取りする
 * - 招待が無効になってトークンを破棄した直後（自力で開き直せる必要がある）
 * - App Store の審査。**レビュアーは招待リンクを持っていない。**
 *   中身に到達できないと Guideline 2.1 で却下される
 *
 * **文言は日英併記にする。** レビュアーが日本語話者とは限らない。
 */

interface Props {
  /** 正規化済みの URL を渡す。解決に成功したら true。 */
  onOpen: (url: string) => Promise<boolean>;
  /** 直前の招待が無効だった場合に上部へ出す案内。 */
  notice?: string | null;
}

export default function OpenByLinkScreen({ onOpen, notice }: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isOpening, setIsOpening] = useState(false);

  const handleOpen = async () => {
    if (isOpening) return;
    setError(null);

    const url = normalizeInvitationInput(value, WEB_ORIGIN);
    if (!url) {
      setError(
        value.trim().length === 0
          ? 'リンクまたは招待コードを入力してください\nEnter a link or invitation code'
          : 'このリンクは開けません\nThis link cannot be opened'
      );
      return;
    }

    setIsOpening(true);
    const opened = await onOpen(url);
    setIsOpening(false);

    if (!opened) {
      // resolveDeepLink が拒否した（別オリジン、危険なスキーム等）。
      // どう拒否されたかは伝えない。伝えても利用者にできることは変わらない。
      setError('このリンクは開けません\nThis link cannot be opened');
    }
  };

  const canOpen = value.trim().length > 0 && !isOpening;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {notice ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}

        <Text style={styles.title}>ギャラリーを開く</Text>
        <Text style={styles.titleEn}>Open your gallery</Text>

        <Text style={styles.body}>
          撮影担当者からお送りしたリンク、または招待コードを入力してください。
        </Text>
        <Text style={styles.bodyEn}>
          Paste the link or enter the invitation code you received.
        </Text>

        <TextInput
          style={styles.input}
          value={value}
          onChangeText={(text) => {
            setValue(text);
            if (error) setError(null);
          }}
          placeholder="https://... / ABCD-1234"
          placeholderTextColor="#b5b0aa"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          keyboardType={Platform.OS === 'ios' ? 'url' : 'default'}
          multiline
          editable={!isOpening}
          onSubmitEditing={handleOpen}
          accessibilityLabel="招待リンクまたは招待コード / Invitation link or code"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.button, !canOpen && styles.buttonDisabled]}
          onPress={handleOpen}
          disabled={!canOpen}
          accessibilityRole="button"
          accessibilityLabel="開く / Open"
        >
          {isOpening ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>開く / Open</Text>
          )}
        </Pressable>

        <Text style={styles.note}>
          リンクをタップしても開けます{'\n'}Tapping the link also works
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#faf8f5' },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  notice: {
    backgroundColor: '#f5f3f0',
    borderColor: '#e8e5e0',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 24,
  },
  noticeText: { fontSize: 13, lineHeight: 19, color: '#6b6b6b', textAlign: 'center' },
  title: { fontSize: 20, fontWeight: '600', color: '#2d2a26', textAlign: 'center' },
  titleEn: {
    fontSize: 14,
    color: '#8b8680',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 16,
  },
  body: { fontSize: 14, lineHeight: 21, color: '#6b6b6b', textAlign: 'center' },
  bodyEn: {
    fontSize: 12,
    lineHeight: 18,
    color: '#8b8680',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e8e5e0',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#2d2a26',
    minHeight: 88,
    textAlignVertical: 'top',
  },
  error: { fontSize: 13, lineHeight: 19, color: '#c9652e', marginTop: 12 },
  button: {
    backgroundColor: '#2d2a26',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  note: { fontSize: 11, lineHeight: 17, color: '#9b9b9b', textAlign: 'center', marginTop: 24 },
});
