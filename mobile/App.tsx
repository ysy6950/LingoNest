import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function App() {
  const [showMeaning, setShowMeaning] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>LingoNest</Text>
      <Text style={styles.subtitle}>我的第一个单词卡</Text>

      <View style={styles.card}>
        <Text style={styles.word}>persist</Text>
        {showMeaning ? (
          <Text style={styles.meaning}>to continue doing something</Text>
        ) : (
          <Text style={styles.hint}>先想想它是什么意思</Text>
        )}
      </View>

      <Pressable
        style={styles.button}
        onPress={() => setShowMeaning((current) => !current)}
      >
        <Text style={styles.buttonText}>
          {showMeaning ? '隐藏解释' : '查看解释'}
        </Text>
      </Pressable>

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FB',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: '#1F2937',
    fontSize: 32,
    fontWeight: '700',
  },
  subtitle: {
    color: '#6B7280',
    fontSize: 16,
    marginTop: 8,
  },
  card: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    elevation: 3,
    marginTop: 32,
    minHeight: 220,
    justifyContent: 'center',
    padding: 24,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    width: '100%',
  },
  word: {
    color: '#111827',
    fontSize: 40,
    fontWeight: '700',
  },
  hint: {
    color: '#9CA3AF',
    fontSize: 16,
    marginTop: 24,
  },
  meaning: {
    color: '#2563EB',
    fontSize: 20,
    marginTop: 24,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    marginTop: 24,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
