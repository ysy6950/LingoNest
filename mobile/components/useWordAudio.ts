import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';

export function useWordAudio(word: string, audioUrl?: string) {
  const player = useAudioPlayer(null, { updateInterval: 100 });
  const [phase, setPhase] = useState<'idle' | 'loading' | 'playing'>('idle');
  const [error, setError] = useState('');
  const generation = useRef(0);
  const cleanup = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    generation.current += 1;
    cleanup.current?.();
    cleanup.current = null;
    player.pause();
    void Speech.stop().catch(() => {});
    setPhase('idle');
  }, [player]);

  useEffect(() => {
    setError('');
    return stop;
  }, [word, audioUrl, stop]);
  useFocusEffect(useCallback(() => stop, [stop]));

  async function playAmerican() {
    stop();
    setError('');
    if (!audioUrl) { setError('暂无美式词典音频，请尝试重新获取音标。'); return; }
    const request = generation.current;
    const current = () => request === generation.current;
    setPhase('loading');
    const fail = (message: string) => {
      if (!current()) return;
      stop();
      setError(message);
    };
    try {
      await Speech.stop();
      if (!current()) return;
      let started = false;
      const timer = setTimeout(() => fail('美式音频加载超时，请检查手机网络后重试。'), 10000);
      const subscription = player.addListener('playbackStatusUpdate', (status) => {
        if (!current()) return;
        if (status.error) { fail('美式词典音频加载失败，请检查手机网络后重试。'); return; }
        if (status.didJustFinish) { stop(); return; }
        if (status.playing && !status.isBuffering) {
          clearTimeout(timer);
          setPhase('playing');
        }
        if (status.isLoaded && !started) {
          started = true;
          void player.seekTo(0).then(() => { if (current()) player.play(); })
            .catch(() => fail('美式音频暂时无法播放，请重试。'));
        }
      });
      cleanup.current = () => { clearTimeout(timer); subscription.remove(); };
      // A fresh source also retries a previous failed load and resets playback to the start.
      player.replace(audioUrl);
    } catch { fail('美式词典音频暂时无法播放，请检查手机网络后重试。'); }
  }

  async function speakBritish() {
    stop();
    setError('');
    const request = generation.current;
    try {
      await Speech.stop();
      if (request !== generation.current) return;
      Speech.speak(word, {
        language: 'en-GB',
        onError: () => {
          if (request === generation.current) setError('英式设备朗读不可用，请检查系统语音设置。');
        },
      });
    } catch {
      if (request === generation.current) setError('英式设备朗读不可用，请检查系统语音设置。');
    }
  }

  return { phase, error, playAmerican, speakBritish };
}
