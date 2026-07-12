import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function App() {
  const [result, setResult] = useState<string>('(not called yet)');

  const callSwift = () => {
    try {
      // Lazy import so the app still boots in Expo Go / web, where the
      // native module doesn't exist.
      const { hello, isCaptured } = require('./modules/spike-native');
      setResult(`${hello()}\nscreen captured: ${isCaptured()}`);
    } catch (e) {
      setResult(`Native module unavailable: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>TASK-318 Spike — Part D</Text>
      <Text style={styles.subtitle}>
        Q4: does a Swift module built on EAS from Windows run on this iPhone?
      </Text>
      <Pressable style={styles.button} onPress={callSwift}>
        <Text style={styles.buttonText}>Call Swift</Text>
      </Pressable>
      <Text style={styles.result}>{result}</Text>
      <Text style={styles.hint}>
        PASS = a "Hello from Swift on iOS ..." line appears above.
      </Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    color: '#555',
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  result: {
    fontSize: 15,
    fontFamily: 'Courier',
    textAlign: 'center',
    color: '#0a5c36',
  },
  hint: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
});
