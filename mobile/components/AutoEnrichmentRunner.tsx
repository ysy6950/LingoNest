import { useEffect } from 'react';
import { AppState } from 'react-native';
import { startAutoEnrichment } from '../autoEnrichment';
import { requestWordAnalysis } from '../localServer/ai';
import { requestWordPronunciation } from '../localServer/dictionary';
import { useAutoEnrichment } from '../store/useAutoEnrichment';
import { useComputerConnection, withComputerConnection } from '../store/useComputerConnection';
import { useLingoStore } from '../store/useLingoStore';

export function AutoEnrichmentRunner() {
  useEffect(() => {
    const runner = startAutoEnrichment({
      lingo: useLingoStore, queue: useAutoEnrichment, connection: useComputerConnection,
      dictionary: (connection, word) => withComputerConnection(() => requestWordPronunciation(connection, word)),
      analyze: (connection, word, meaning) => withComputerConnection(() => requestWordAnalysis(connection, word, meaning)),
    });
    runner.setActive(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
    const subscription = AppState.addEventListener('change', (state) => runner.setActive(state === 'active'));
    return () => { subscription.remove(); runner.stop(); };
  }, []);
  return null;
}
