import { StyleSheet, Text, View } from 'react-native';

/**
 * 招待リンクを経由せずアプリが起動され、履歴も無いときの画面。
 * アプリ単体の入口（トークン手入力など）はあえて作らない。
 * このアプリは招待リンクの受け皿であり、リンクなしで見られるものは無い。
 */
export default function NoInvitationScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>招待リンクから開いてください</Text>
      <Text style={styles.body}>
        お送りしたギャラリーのリンクをタップすると、このアプリで写真が表示されます。
      </Text>
      <Text style={styles.note}>
        リンクが見つからない場合は、撮影担当者にお問い合わせください。
      </Text>
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
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    color: '#6b6b6b',
    textAlign: 'center',
    marginBottom: 16,
  },
  note: {
    fontSize: 12,
    lineHeight: 18,
    color: '#9b9b9b',
    textAlign: 'center',
  },
});
