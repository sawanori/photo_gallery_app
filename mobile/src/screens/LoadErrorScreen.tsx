import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  onRetry: () => void;
}

export default function LoadErrorScreen({ onRetry }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>接続できませんでした</Text>
      <Text style={styles.body}>
        通信状況を確認して、もう一度お試しください。
      </Text>
      <TouchableOpacity
        style={styles.button}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="再試行"
      >
        <Text style={styles.buttonLabel}>再試行</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    color: '#6b6b6b',
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#1a1a1a',
  },
  buttonLabel: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '500',
  },
});
