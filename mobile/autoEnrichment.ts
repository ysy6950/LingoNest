import { ENRICHMENT_KINDS, matchesEnrichmentSource, needsEnrichment } from './store/useAutoEnrichment.ts';
import type { EnrichmentJob, EnrichmentKind, useAutoEnrichment } from './store/useAutoEnrichment.ts';
import type { AiNote, Pronunciation, useLingoStore } from './store/useLingoStore.ts';
import type { ComputerConnection, useComputerConnection } from './store/useComputerConnection.ts';

type Dependencies = {
  lingo: typeof useLingoStore;
  queue: typeof useAutoEnrichment;
  connection: typeof useComputerConnection;
  dictionary: (connection: ComputerConnection, word: string) => Promise<Pronunciation>;
  analyze: (connection: ComputerConnection, word: string, meaning: string) => Promise<AiNote>;
};

export function startAutoEnrichment({ lingo, queue, connection, dictionary, analyze }: Dependencies) {
  let stopped = false;
  let active = true;
  let busy = false;
  let scheduled = false;
  let applying = false;
  let epoch = 0;

  function wake() {
    if (scheduled || stopped) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; void run(); });
  }
  function resetRunning() {
    for (const job of queue.getState().jobs) for (const kind of ENRICHMENT_KINDS) {
      const part = job[kind];
      if (part?.status === 'running') queue.getState().updatePart(job.id, kind, { status: 'pending', automatic: part.automatic });
    }
  }
  function prune() {
    for (const job of queue.getState().jobs) {
      const card = lingo.getState().cards.find((item) => item.id === job.cardId);
      if (!card || !matchesEnrichmentSource(job, card)) queue.getState().remove(job.cardId);
    }
  }
  function ready() {
    const data = lingo.getState();
    const tasks = queue.getState();
    return !stopped && active && data.isHydrated && !data.isRestoring && !data.isSaving && !data.error &&
      tasks.isHydrated && !tasks.isSaving && !tasks.error && connection.getState().paired;
  }
  async function run() {
    if (busy || !ready()) return;
    prune();
    if (!ready()) return;
    const job = queue.getState().jobs.find((item) => ENRICHMENT_KINDS.some((kind) => item[kind]?.status === 'pending'));
    const kind = job && ENRICHMENT_KINDS.find((item) => job[item]?.status === 'pending');
    if (!job || !kind) return;
    busy = true;
    const runEpoch = epoch;
    const pending = job[kind]!;
    const running = { status: 'running' as const, automatic: pending.automatic };
    queue.getState().updatePart(job.id, kind, running);
    const current = () => !stopped && active && epoch === runEpoch && !lingo.getState().isRestoring &&
      queue.getState().jobs.find((item) => item.id === job.id)?.[kind] === running;
    try {
      if (!await queue.getState().waitForSave() || !await lingo.getState().waitForSave() || !current()) return;
      let card = lingo.getState().cards.find((item) => item.id === job.cardId);
      if (!card || !matchesEnrichmentSource(job, card)) return;
      if (needsEnrichment(card, kind)) {
        const targetConnection = connection.getState();
        const captured = { address: targetConnection.address, token: targetConnection.token };
        const result = kind === 'dictionary' ? await dictionary(captured, job.word) : await analyze(captured, job.word, job.meaning);
        if (!current()) return;
        card = lingo.getState().cards.find((item) => item.id === job.cardId);
        if (!card || !matchesEnrichmentSource(job, card)) return;
        applying = true;
        let saved: boolean;
        try {
          saved = kind === 'dictionary'
            ? lingo.getState().savePronunciation(card.id, card.word, { ...result as Pronunciation, ...card.pronunciation })
            : !!card.aiNote || lingo.getState().saveAiNote(card.id, card.word, card.meaning, result as AiNote);
        } finally { applying = false; }
        if (!saved) throw new Error('invalid_result');
        if (!await lingo.getState().waitForSave()) throw new Error('save_failed');
      }
      if (current()) queue.getState().updatePart(job.id, kind);
    } catch (cause) {
      if (current()) queue.getState().updatePart(job.id, kind, {
        status: 'failed', automatic: running.automatic, error: failureMessage(cause, kind),
      });
    } finally {
      busy = false;
      // If storage temporarily failed, retain a resumable pending job without a retry loop.
      if (current() && queue.getState().jobs.find((item) => item.id === job.id)?.[kind]?.status === 'running') {
        queue.getState().updatePart(job.id, kind, pending);
      }
      wake();
    }
  }

  const unsubscribeLingo = lingo.subscribe((state, previous) => {
    if (state.isRestoring && !previous.isRestoring) {
      epoch += 1;
      queue.getState().remove();
    } else if (state.isHydrated && previous.isHydrated && !state.isRestoring && state.cards !== previous.cards) {
      const before = new Map(previous.cards.map((card) => [card.id, card]));
      prune();
      if (!applying) for (const job of queue.getState().jobs) {
        const old = before.get(job.cardId);
        const card = state.cards.find((item) => item.id === job.cardId);
        if (old && card) for (const kind of ENRICHMENT_KINDS) {
          if ((kind === 'ai' ? old.aiNote !== card.aiNote : old.pronunciation !== card.pronunciation) && job[kind]) {
            queue.getState().updatePart(job.id, kind);
          }
        }
      }
      for (const card of state.cards) if (!before.has(card.id)) queue.getState().enqueue(card, ENRICHMENT_KINDS, true);
    }
    wake();
  });
  const unsubscribeQueue = queue.subscribe(wake);
  const unsubscribeConnection = connection.subscribe((state, previous) => {
    if (state.address !== previous.address || state.token !== previous.token || state.paired !== previous.paired) {
      epoch += 1;
      resetRunning();
      if (state.paired) queue.getState().retry();
    }
    wake();
  });
  prune();
  wake();
  return {
    setActive(value: boolean) {
      if (active !== value) { active = value; epoch += 1; resetRunning(); wake(); }
    },
    stop() {
      stopped = true; epoch += 1;
      unsubscribeLingo(); unsubscribeQueue(); unsubscribeConnection(); resetRunning();
    },
  };
}

function failureMessage(cause: unknown, kind: EnrichmentKind): string {
  const label = kind === 'dictionary' ? '词典' : 'AI';
  const code = cause instanceof Error && 'code' in cause ? cause.code : undefined;
  const messages: Record<string, string> = {
    auth: '电脑配对已过期，请重新连接。', network: '无法连接电脑，请检查网络和后端后重试。',
    timeout: `${label}请求超时，请重试。`, disabled: `电脑尚未配置${label}服务。`,
    provider_auth: `${label}密钥未通过验证，请检查电脑配置。`, not_found: '词典暂未提供这个词的发音资料。',
    rate_limited: `${label}服务请求过于频繁，请稍后重试。`, invalid_response: `${label}返回格式不符合要求，请重试。`,
    mode: '电脑服务未启用配对模式，请检查启动方式。',
  };
  if (cause instanceof Error && cause.message === 'save_failed') return '资料尚未保存到手机，请先重试本地保存。';
  return typeof code === 'string' && messages[code] ? messages[code] : `${label}补全失败，请检查电脑服务后重试。`;
}
