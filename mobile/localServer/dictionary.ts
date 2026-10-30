import { buildHealthUrl } from './health.ts';
import { normalizeWebsterAudioUrl } from './websterAudio.ts';
import type { Pronunciation } from '../store/useLingoStore';

export type DictionaryConnection = { address: string; token?: string };

export class DictionaryRequestError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.name = 'DictionaryRequestError'; this.code = code; }
}

const errors: Record<string, { code: string; message: string }> = {
  dictionary_disabled: { code: 'disabled', message: '电脑后端尚未配置词典服务。' },
  provider_auth: { code: 'provider_auth', message: '词典服务拒绝了密钥，请检查电脑后端配置。' },
  not_found: { code: 'not_found', message: '词典中没有找到这个单词的发音信息。' },
  invalid_response: { code: 'invalid_response', message: '词典返回格式不符合预期。' },
  timeout: { code: 'timeout', message: '词典请求超时，请稍后再试。' },
};

export async function requestWordPronunciation(connection: DictionaryConnection, word: string, timeoutMs = 15000): Promise<Pronunciation> {
  const healthUrl = buildHealthUrl(connection.address);
  if (!healthUrl) throw new DictionaryRequestError('address', '请输入电脑的局域网 IPv4 和端口。');
  if (!connection.token || !/^[a-f0-9]{32}$/i.test(connection.token.trim())) throw new DictionaryRequestError('auth', '请先输入当前电脑服务显示的配对码。');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(healthUrl.replace(/\/health$/, '/dictionary/word'), {
      method: 'POST',
      headers: { authorization: `Bearer ${connection.token.trim()}`, 'content-type': 'application/json' },
      body: JSON.stringify({ word }),
      signal: controller.signal,
    });
    if (response.status === 401) throw new DictionaryRequestError('auth', '配对码不正确或已过期。');
    if (!response.ok) {
      let errorCode: unknown;
      try { errorCode = (await response.json())?.error; } catch { /* Keep a safe generic message. */ }
      const known = typeof errorCode === 'string' ? errors[errorCode] : undefined;
      if (known) throw new DictionaryRequestError(known.code, known.message);
      if (response.status === 404) throw new DictionaryRequestError('mode', '电脑服务没有启用配对模式，请检查后端启动信息。');
      if (response.status === 504) throw new DictionaryRequestError('timeout', errors.timeout.message);
      throw new DictionaryRequestError('server', '电脑词典服务暂时不可用，请查看电脑终端。');
    }
    const value: unknown = await response.json();
    if (!isPronunciation(value)) throw new DictionaryRequestError('invalid_response', errors.invalid_response.message);
    return { ...value, ...(value.audioUrl ? { audioUrl: normalizeWebsterAudioUrl(value.audioUrl)! } : {}) };
  } catch (error) {
    if (error instanceof DictionaryRequestError) throw error;
    throw new DictionaryRequestError(controller.signal.aborted ? 'timeout' : 'network', controller.signal.aborted ? errors.timeout.message : '无法连接电脑词典服务。');
  } finally { clearTimeout(timer); }
}

function isPronunciation(value: unknown): value is Pronunciation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.ipa === 'string' && !!item.ipa.trim() && item.ipa.length <= 100 &&
    (item.partOfSpeech === undefined || (typeof item.partOfSpeech === 'string' && !!item.partOfSpeech.trim() && item.partOfSpeech.length <= 50)) &&
    (item.audioUrl === undefined || normalizeWebsterAudioUrl(item.audioUrl) !== null) &&
    (item.audioAccent === undefined || item.audioAccent === 'us') &&
    (item.audioUrl === undefined || item.audioAccent === 'us') &&
    item.source === 'merriam-webster-learners' &&
    typeof item.fetchedAt === 'number' && Number.isFinite(item.fetchedAt) && item.fetchedAt > 0;
}
