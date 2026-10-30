const AUDIO_ROOT = 'https://media.merriam-webster.com/audio/prons/en/us/mp3/';

export function websterAudioUrl(name: string): string | null {
  if (!/^[a-z0-9_-]{1,80}$/i.test(name)) return null;
  const lower = name.toLowerCase();
  const directory = lower.startsWith('bix') ? 'bix' : lower.startsWith('gg') ? 'gg'
    : /^[a-z]/.test(lower) ? lower[0] : 'number';
  return `${AUDIO_ROOT}${directory}/${name}.mp3`;
}

// Accept the previous release's flat path only to repair existing saved cards.
export function normalizeWebsterAudioUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith(AUDIO_ROOT)) return null;
  const path = value.slice(AUDIO_ROOT.length);
  const match = /^(?:([a-z]+)\/)?([a-z0-9_-]{1,80})\.mp3$/i.exec(path);
  if (!match) return null;
  const canonical = websterAudioUrl(match[2]);
  return !match[1] || canonical === value ? canonical : null;
}
