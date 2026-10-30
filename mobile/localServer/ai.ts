import { buildHealthUrl } from './health.ts';
import { normalizeWord } from '../wordIdentity.ts';
import { parseExerciseDrafts, type ExerciseWord, type ExerciseDraft } from '../exercises.ts';
export { normalizeWord } from '../wordIdentity.ts';

export type WordAnalysis = { definition: string; chineseHint: string; examples: string[] };
export type AiConnection = { address: string; token?: string };
export const aiTaskLabels = { analysis: '学习笔记', related: '关联词', exercise: '语境练习' };
export const aiFailureLabels = { timeout: '等待超时', provider_error: '服务商或网络错误', provider_auth: '密钥或权限错误', provider_not_found: '接口或模型不存在', provider_rejected: '请求参数被拒绝', rate_limited: '服务商限流', invalid_response: '返回格式错误', unexpected_error: '其他错误' };
type TaskUsage = { requests: number; providerRequests: number; cacheHits: number; coalesced: number; succeeded: number; failed: number; busyRejected: number };
export type AiUsage = {
  status: 'configured' | 'disabled' | 'misconfigured';
  startedAt: number;
  cache: { ttlMs: number; maxEntries: number; entries: number };
  maxConcurrent: number;
  inFlight: number;
  tasks: Record<keyof typeof aiTaskLabels, TaskUsage>;
  failures: Record<keyof typeof aiFailureLabels, number>;
};

function parseUsage(value: unknown): AiUsage {
  const invalid = () => new AiRequestError('invalid_response', '电脑返回的 AI 用量格式无效，请更新并重启后端。');
  const object = (value: unknown, fields: string): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== fields.split(',').sort().join(',')) throw invalid();
    return value as Record<string, unknown>;
  };
  const count = (value: unknown): number => { if (!Number.isSafeInteger(value) || (value as number) < 0) throw invalid(); return value as number; };
  const row = object(value, 'status,startedAt,cache,maxConcurrent,inFlight,tasks,failures');
  if (!['configured', 'disabled', 'misconfigured'].includes(String(row.status))) throw invalid();
  const cache = object(row.cache, 'ttlMs,maxEntries,entries');
  const tasks = object(row.tasks, Object.keys(aiTaskLabels).join(','));
  const failures = object(row.failures, Object.keys(aiFailureLabels).join(','));
  const parsed = {
    status: row.status as AiUsage['status'], startedAt: count(row.startedAt), maxConcurrent: count(row.maxConcurrent), inFlight: count(row.inFlight),
    cache: { ttlMs: count(cache.ttlMs), maxEntries: count(cache.maxEntries), entries: count(cache.entries) },
    tasks: Object.fromEntries(Object.entries(tasks).map(([task, data]) => {
      const metrics = object(data, 'requests,providerRequests,cacheHits,coalesced,succeeded,failed,busyRejected');
      return [task, Object.fromEntries(Object.entries(metrics).map(([key, value]) => [key, count(value)]))];
    })) as AiUsage['tasks'],
    failures: Object.fromEntries(Object.entries(failures).map(([key, value]) => [key, count(value)])) as AiUsage['failures'],
  };
  if (!parsed.cache.ttlMs || !parsed.cache.maxEntries || !parsed.maxConcurrent || parsed.cache.entries > parsed.cache.maxEntries || parsed.inFlight > parsed.maxConcurrent) throw invalid();
  return parsed;
}

export async function requestAiUsage(connection: AiConnection): Promise<AiUsage> {
  return requestAiPayload(connection, '/ai/usage', undefined, parseUsage, 10000, 'GET');
}

export async function clearAiCache(connection: AiConnection): Promise<AiUsage> {
  return requestAiPayload(connection, '/ai/cache', undefined, parseUsage, 10000, 'DELETE');
}

// Leave time for the server's 90-second AI request and parallel dictionary checks.
const AI_REQUEST_TIMEOUT_MS = 120000;
const AI_TIMEOUT_MESSAGE = 'AI 响应等待超时，服务商可能仍已处理本次请求；请勿连续重试。';

export class AiRequestError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.name = 'AiRequestError'; this.code = code; }
}

const serverErrors: Record<string, { code: string; message: string }> = {
  ai_disabled: { code: 'disabled', message: '电脑后端尚未配置 AI。' },
  provider_auth: { code: 'provider_auth', message: 'AI 服务商拒绝了密钥或模型权限，请检查电脑后端配置。' },
  provider_not_found: { code: 'provider_not_found', message: 'AI 接口地址或模型不存在，请检查电脑后端配置。' },
  provider_rejected: { code: 'provider_rejected', message: 'AI 服务商拒绝请求参数，请检查模型和接口协议。' },
  rate_limited: { code: 'rate_limited', message: 'AI 服务商限流，请稍后再试。' },
  busy: { code: 'busy', message: '电脑已有两个 AI 任务正在处理，请等任务完成后再试。' },
  invalid_response: { code: 'invalid_response', message: 'AI 返回格式不符合预期，请检查服务商模型。' },
  timeout: { code: 'timeout', message: AI_TIMEOUT_MESSAGE },
  provider_error: { code: 'provider_error', message: 'AI 服务商暂时不可用。' },
  invalid_request: { code: 'invalid_request', message: '单词应为 1～120 字符，原解释不超过 500 字符，请先调整后重试。' },
};

function parseAnalysis(value: unknown): WordAnalysis {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new AiRequestError('invalid', 'AI 返回格式无效。');
  const result = value as Record<string, unknown>;
  if (
    Object.keys(result).sort().join(',') !== 'chineseHint,definition,examples' ||
    typeof result.definition !== 'string' || !result.definition.trim() || result.definition.length > 500 ||
    typeof result.chineseHint !== 'string' || !result.chineseHint.trim() || result.chineseHint.length > 200 ||
    !Array.isArray(result.examples) || result.examples.length !== 3 ||
    result.examples.some((example) => typeof example !== 'string' || !example.trim() || example.length > 500) ||
    new Set(result.examples.map((example: string) => example.trim().toLocaleLowerCase())).size !== 3
  ) throw new AiRequestError('invalid', 'AI 返回格式无效。');
  return { definition: result.definition.trim(), chineseHint: result.chineseHint.trim(), examples: result.examples.map((example: string) => example.trim()) };
}

export async function requestWordAnalysis(connection: AiConnection, word: string, meaning = '', timeoutMs = AI_REQUEST_TIMEOUT_MS): Promise<WordAnalysis> {
  return requestAi(connection, '/ai/word-analysis', word, meaning, parseAnalysis, timeoutMs);
}

export type RelationCategory = 'synonym' | 'antonym' | 'collocation' | 'word_family';
export type WordFamily = {
  kind: 'shared_root' | 'derivation' | 'inflection' | 'uncertain';
  base: string | null;
  meaning: string | null;
  affix: string | null;
};
export const wordFamilyLabels: Record<WordFamily['kind'], string> = {
  shared_root: '共同词根', derivation: '派生词', inflection: '词形变化', uncertain: '构词待确认',
};
export type RelatedWord = {
  word: string;
  category: RelationCategory;
  definition: string;
  chineseHint: string;
  reason: string;
  wordFamily?: WordFamily;
  dictionaryStatus: 'found' | 'not_found' | 'unavailable' | 'not_configured';
};

function parseWordFamily(value: unknown): WordFamily {
  const invalid = () => new AiRequestError('invalid', '构词说明格式无效，请重新生成。');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const row = value as Record<string, unknown>;
  const text = (value: unknown, max: number): value is string =>
    typeof value === 'string' && !!value.trim() && value.length <= max && !/[\r\n\u0000-\u001f]/.test(value);
  if (Object.keys(row).sort().join(',') !== 'affix,base,kind,meaning' ||
      typeof row.kind !== 'string' || !Object.hasOwn(wordFamilyLabels, row.kind)) throw invalid();
  if (row.kind === 'uncertain') {
    if (row.base !== null || row.meaning !== null || row.affix !== null) throw invalid();
    return { kind: 'uncertain', base: null, meaning: null, affix: null };
  }
  if (!text(row.base, 80) || !text(row.meaning, 200) ||
      (row.kind === 'derivation' ? !text(row.affix, 80) : row.affix !== null)) throw invalid();
  return { kind: row.kind as WordFamily['kind'], base: row.base.trim(), meaning: row.meaning.trim(), affix: row.kind === 'derivation' ? (row.affix as string).trim() : null };
}
export const relationLabels: Record<RelationCategory, string> = {
  synonym: '近义词', antonym: '反义词', collocation: '常见搭配', word_family: '同词根 / 词形家族',
};

export function parseRelatedWords(value: unknown, sourceWord: string): RelatedWord[] {
  const invalid = () => new AiRequestError('invalid', '关联词返回格式无效，请重新生成。');
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).join(',') !== 'candidates') throw invalid();
  const candidates = (value as { candidates: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length > 8) throw invalid();
  const seen = new Set([normalizeWord(sourceWord)]);
  const counts = new Map<string, number>();
  return candidates.map((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw invalid();
    const row = item as Record<string, unknown>;
    // Older local servers can omit the new explanation; never infer a root from their reason text.
    const hasFamily = Object.hasOwn(row, 'wordFamily');
    const fields = row.category === 'word_family' && hasFamily ? 'category,chineseHint,definition,dictionaryStatus,reason,word,wordFamily' : 'category,chineseHint,definition,dictionaryStatus,reason,word';
    if (Object.keys(row).sort().join(',') !== fields ||
        typeof row.word !== 'string' || row.word.length > 100 || !/^[a-zA-Z]+(?:[ '\u2019-][a-zA-Z]+)*$/.test(row.word.trim()) ||
        typeof row.category !== 'string' || !Object.hasOwn(relationLabels, row.category) ||
        typeof row.definition !== 'string' || !row.definition.trim() || row.definition.length > 500 ||
        typeof row.chineseHint !== 'string' || !row.chineseHint.trim() || row.chineseHint.length > 200 ||
        typeof row.reason !== 'string' || !row.reason.trim() || row.reason.length > 300 ||
        !['found', 'not_found', 'unavailable', 'not_configured'].includes(String(row.dictionaryStatus))) throw invalid();
    const key = normalizeWord(row.word);
    const count = (counts.get(row.category) ?? 0) + 1;
    if (seen.has(key) || count > 2) throw invalid();
    seen.add(key);
    counts.set(row.category, count);
    return { word: row.word.trim(), category: row.category as RelationCategory, definition: row.definition.trim(), chineseHint: row.chineseHint.trim(), reason: row.reason.trim(), dictionaryStatus: row.dictionaryStatus as RelatedWord['dictionaryStatus'],
      ...(hasFamily ? { wordFamily: parseWordFamily(row.wordFamily) } : {}) };
  });
}

export async function requestRelatedWords(connection: AiConnection, word: string, meaning = '', timeoutMs = AI_REQUEST_TIMEOUT_MS): Promise<RelatedWord[]> {
  return requestAi(connection, '/ai/related-words', word, meaning, (value) => parseRelatedWords(value, word), timeoutMs);
}

export async function requestExercises(connection: AiConnection, words: ExerciseWord[], timeoutMs = AI_REQUEST_TIMEOUT_MS): Promise<ExerciseDraft[]> {
  parseExerciseDrafts({ questions: [] }, words);
  return requestAiPayload(connection, '/ai/exercises', { words: words.map(({ id, word, meaning }) => ({ id, word, meaning })) },
    (value) => {
      try { return parseExerciseDrafts(value, words); }
      catch { throw new AiRequestError('invalid_response', 'AI 练习题格式不符合预期，请重新生成。'); }
    }, timeoutMs);
}

async function requestAi<T>(connection: AiConnection, path: string, word: string, meaning: string, parse: (value: unknown) => T, timeoutMs: number): Promise<T> {
  return requestAiPayload(connection, path, { word, meaning }, parse, timeoutMs);
}

async function requestAiPayload<T>(connection: AiConnection, path: string, payload: unknown, parse: (value: unknown) => T, timeoutMs: number, method = 'POST'): Promise<T> {
  const healthUrl = buildHealthUrl(connection.address);
  if (!healthUrl) throw new AiRequestError('address', '请输入电脑的局域网 IPv4 和端口。');
  if (!connection.token || !/^[a-f0-9]{32}$/i.test(connection.token.trim())) throw new AiRequestError('auth', '请先输入当前电脑服务显示的配对码。');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(healthUrl.replace(/\/health$/, path), {
      method,
      headers: { authorization: `Bearer ${connection.token.trim()}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (response.status === 401) throw new AiRequestError('auth', '配对码不正确或已过期。');
    if (response.status === 404) throw new AiRequestError('mode', '电脑服务没有此接口，请更新并重启后端，确认使用配对模式。');
    if (path === '/ai/exercises' && response.status === 400) throw new AiRequestError('invalid_request', '请选择 4～5 个不同的英文单词，每个解释不超过 500 字符。');
    if (!response.ok) {
      let errorCode: unknown;
      try { errorCode = (await response.json())?.error; } catch { /* Keep a safe generic message. */ }
      const known = typeof errorCode === 'string' && Object.hasOwn(serverErrors, errorCode) ? serverErrors[errorCode] : undefined;
      if (known) throw new AiRequestError(known.code, known.message);
      if (response.status === 504) throw new AiRequestError('timeout', AI_TIMEOUT_MESSAGE);
      throw new AiRequestError('server', '电脑 AI 服务暂时不可用，请查看电脑终端的 AI 错误类别。');
    }
    return parse(await response.json());
  } catch (error) {
    if (error instanceof AiRequestError) throw error;
    const timeoutMessage = method === 'GET'
      ? '等待电脑返回用量超时，请确认电脑服务仍在运行后再试。'
      : method === 'DELETE'
        ? '等待电脑确认清理结果超时，请先查询用量确认是否已清理。'
        : '等待电脑返回结果超时，服务商可能仍已处理本次请求；请勿连续重试。';
    throw new AiRequestError(controller.signal.aborted ? 'timeout' : 'network', controller.signal.aborted ? timeoutMessage : '无法连接电脑 AI 服务。');
  } finally { clearTimeout(timer); }
}
