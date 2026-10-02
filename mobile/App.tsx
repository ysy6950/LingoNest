import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export default function App() {
  const [showMeaning, setShowMeaning] = useState(false);
  const [wordInput, setWordInput] = useState('');
  const [meaningInput, setMeaningInput] = useState('');
  const [savedWord, setSavedWord] = useState('persist');
  const [savedMeaning, setSavedMeaning] = useState(
    'to continue doing something',
  );

  function handleAddWord() {
    const nextWord = wordInput.trim();
    const nextMeaning = meaningInput.trim();

    if (nextWord === '' || nextMeaning === '') {
      return;
    }

    setSavedWord(nextWord);
    setSavedMeaning(nextMeaning);
    setWordInput('');
    setMeaningInput('');
    setShowMeaning(false);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>LingoNest</Text>
      <Text style={styles.subtitle}>我的第一个单词卡</Text>

      <TextInput
        placeholder="输入一个单词，例如 resilient"
        value={wordInput}
        onChangeText={setWordInput}
        style={styles.input}
        autoCapitalize="none"
      />
      <TextInput
        placeholder="输入英语或中文解释"
        value={meaningInput}
        onChangeText={setMeaningInput}
        style={styles.input}
      />
      <Pressable style={styles.addButton} onPress={handleAddWord}>
        <Text style={styles.buttonText}>添加单词</Text>
      </Pressable>

      <View style={styles.card}>
        <Text style={styles.word}>{savedWord}</Text>
        {showMeaning ? (
          <Text style={styles.meaning}>{savedMeaning}</Text>
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
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D1D5DB',
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    width: '100%',
  },
  addButton: {
    backgroundColor: '#059669',
    borderRadius: 12,
    marginTop: 12,
    paddingHorizontal: 28,
    paddingVertical: 14,
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
