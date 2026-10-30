import { websterAudioUrl } from './websterAudio.js';

export type DictionaryConfig = {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
};

export type DictionaryResult = {
  ipa?: string;
  partOfSpeech?: string;
  audioUrl?: string;
  audioAccent?: 'us';
  source: 'merriam-webster-learners';
  fetchedAt: number;
};

export type DictionaryConfigState = 'disabled' | 'misconfigured' | 'configured';

export class DictionaryServiceError extends Error {
  code: 'invalid_response' | 'provider_auth' | 'not_found' | 'provider_error' | 'timeout';
  status: number;
  providerStatus?: number;

  constructor(code: DictionaryServiceError['code'], message: string, status: number, providerStatus?: number) {
    super(message);
    this.name = 'DictionaryServiceError';
    this.code = code;
    this.status = status;
    this.providerStatus = providerStatus;
  }
}

export function readDictionaryConfig(env: Record<string, string | undefined> = process.env): DictionaryConfig | null {
  const apiKey = env.LINGONEST_WEBSTER_KEY?.trim() ?? '';
  const baseUrl = env.LINGONEST_WEBSTER_BASE_URL?.trim() || 'https://www.dictionaryapi.com/api/v3/references/learners/json';
  if (!apiKey || !isSafeBaseUrl(baseUrl)) return null;
  return { apiKey, baseUrl: baseUrl.replace(/\/$/, ''), timeoutMs: 10000 };
}

export function getDictionaryConfigState(env: Record<string, string | undefined> = process.env): DictionaryConfigState {
  const key = env.LINGONEST_WEBSTER_KEY?.trim() ?? '';
  const baseUrl = env.LINGONEST_WEBSTER_BASE_URL?.trim() || 'https://www.dictionaryapi.com/api/v3/references/learners/json';
  if (!key && !env.LINGONEST_WEBSTER_BASE_URL?.trim()) return 'disabled';
  return key && isSafeBaseUrl(baseUrl) ? 'configured' : 'misconfigured';
}

export function dictionaryUrl(config: DictionaryConfig, word: string): string {
  const url = new URL(`${config.baseUrl}/${encodeURIComponent(word)}`);
  url.searchParams.set('key', config.apiKey);
  return url.toString();
}

type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type DictionaryService = {
  state: DictionaryConfigState;
  lookupWord: (word: string) => Promise<DictionaryResult>;
  checkWord: (word: string) => Promise<'found' | 'not_found'>;
};

export function createDictionaryService(config: DictionaryConfig | null, state: DictionaryConfigState = config ? 'configured' : 'disabled', fetcher: Fetcher = fetch): DictionaryService {
  async function fetchEntry(word: string): Promise<unknown> {
      if (!config || state !== 'configured') throw new DictionaryServiceError('provider_error', 'Dictionary service is disabled.', 503);
      const normalizedWord = word.trim();
      if (!normalizedWord || normalizedWord.length > 100) throw new DictionaryServiceError('invalid_response', 'Invalid dictionary word.', 400);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeoutMs);
      try {
        const response = await fetcher(dictionaryUrl(config, normalizedWord), { signal: controller.signal });
        if (response.status === 401 || response.status === 403) throw new DictionaryServiceError('provider_auth', 'Dictionary provider rejected the key.', 502, response.status);
        if (response.status === 404) throw new DictionaryServiceError('not_found', 'Word was not found.', 404, response.status);
        if (!response.ok) throw new DictionaryServiceError('provider_error', 'Dictionary provider failed.', 502, response.status);
        const body = await response.text();
        if (/invalid.{0,30}key|key.{0,30}invalid/i.test(body)) {
          throw new DictionaryServiceError('provider_auth', 'Dictionary provider rejected the key.', 502);
        }
        let raw: unknown;
        try { raw = JSON.parse(body); }
        catch { throw new DictionaryServiceError('invalid_response', 'Dictionary provider returned invalid JSON.', 502); }
        if (!Array.isArray(raw)) throw new DictionaryServiceError('invalid_response', 'Dictionary response must be an array.', 502);
        return raw;
      } catch (error) {
        if (error instanceof DictionaryServiceError) throw error;
        throw new DictionaryServiceError(controller.signal.aborted ? 'timeout' : 'provider_error', controller.signal.aborted ? 'Dictionary request timed out.' : 'Dictionary provider is unavailable.', controller.signal.aborted ? 504 : 502);
      } finally {
        clearTimeout(timer);
      }
  }
  return {
    state,
    lookupWord: async (word) => {
      const result = parseDictionaryResponse(await fetchEntry(word));
      if (!result) throw new DictionaryServiceError('not_found', 'No pronunciation was found for this word.', 404);
      return { ...result, fetchedAt: Date.now() };
    },
    checkWord: async (word) => dictionaryContainsWord(await fetchEntry(word), word) ? 'found' : 'not_found',
  };
}

// A spelling suggestion or an unrelated entry is not evidence of a match.
// This checks lexical presence only, never the AI's meaning or relationship.
export function dictionaryContainsWord(value: unknown, word: string): boolean {
  if (!Array.isArray(value)) return false;
  const normalize = (text: string) => text.replace(/\*/g, '').replace(/:\d+$/, '').trim().replace(/\s+/g, ' ').toLowerCase();
  const target = normalize(word);
  return value.some((entry) => {
    if (!isRecord(entry)) return false;
    const meta = isRecord(entry.meta) ? entry.meta : {};
    const hwi = isRecord(entry.hwi) ? entry.hwi : {};
    return [meta.id, hwi.hw, ...(Array.isArray(meta.stems) ? meta.stems : [])]
      .some((candidate) => typeof candidate === 'string' && normalize(candidate) === target);
  });
}

function parseDictionaryResponse(value: unknown): Omit<DictionaryResult, 'fetchedAt'> | null {
  if (!Array.isArray(value)) return null;
  const entry = value.find((item) => isRecord(item) && isRecord(item.hwi));
  if (!entry || !isRecord(entry.hwi)) return null;
  const pronunciations: unknown[] = Array.isArray(entry.hwi.prs) ? entry.hwi.prs : [];
  const ipa = pronunciations.find((item) => isRecord(item) && typeof item.ipa === 'string' && item.ipa.trim() && item.ipa.length <= 100) as Record<string, unknown> | undefined;
  const audioName = pronunciations
    .map((item) => isRecord(item) && isRecord(item.sound) && typeof item.sound.audio === 'string' ? item.sound.audio.trim() : '')
    .find((item) => /^[a-z0-9_-]{1,80}$/i.test(item));
  const partOfSpeech = typeof entry.fl === 'string' && entry.fl.trim() && entry.fl.length <= 50 ? entry.fl.trim() : undefined;
  if (!ipa) return null;
  return {
    ...(ipa ? { ipa: String(ipa.ipa).trim() } : {}),
    ...(partOfSpeech ? { partOfSpeech } : {}),
    ...(audioName ? {
      audioUrl: websterAudioUrl(audioName)!,
      audioAccent: 'us' as const,
    } : {}),
    source: 'merriam-webster-learners',
  };
}

function isSafeBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
    return (url.protocol === 'https:' || (url.protocol === 'http:' && local)) && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
