import { useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { aiFailureLabels, aiTaskLabels, clearAiCache, requestAiUsage, type AiUsage } from '../localServer/ai';
import { useComputerConnection, withComputerConnection } from '../store/useComputerConnection';
import { AppButton } from './AppButton';
import { colors, spacing } from './theme';

export function AiUsagePanel() {
  const { address, token, paired } = useComputerConnection();
  const [usage, setUsage] = useState<AiUsage | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const request = useRef(0);
  const pending = useRef(false);

  useEffect(() => {
    request.current++; pending.current = false;
    setUsage(null); setBusy(false); setConfirm(false); setError(''); setNotice('');
    return () => { request.current++; };
  }, [address, token, paired]);

  async function load(clear = false) {
    if (pending.current || !paired) return;
    pending.current = true;
    const id = ++request.current;
    setBusy(true); setError(''); setNotice(''); setConfirm(false);
    try {
      const result = await withComputerConnection(clear ? clearAiCache : requestAiUsage);
      if (id === request.current) {
        setUsage(result);
        if (clear) setNotice('电脑缓存已清理，手机上的笔记和单词已保留。');
      }
    } catch (cause) {
      if (id === request.current) { setUsage(null); setError(cause instanceof Error ? cause.message : '读取失败，请重试。'); }
    } finally {
      if (id === request.current) { pending.current = false; setBusy(false); }
    }
  }

  const tasks = usage ? Object.values(usage.tasks) : [];
  const total = (key: keyof AiUsage['tasks']['analysis']) => tasks.reduce((sum, task) => sum + task[key], 0);
  const failures = usage ? Object.entries(usage.failures).filter(([, count]) => count > 0) : [];
  return <View style={styles.section}>
    <Text style={styles.heading}>AI 服务用量</Text>
    {!paired ? <Text style={styles.hint}>连接电脑后可查看用量。</Text> : null}
    <AppButton label={busy ? '处理中…' : '查询用量'} variant="secondary" disabled={!paired || busy} onPress={() => void load()} />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={styles.hint}>{notice}</Text> : null}
    {usage ? <>
      <Text style={styles.hint}>自 {new Date(usage.startedAt).toLocaleString('zh-CN')} 启动以来 · {usage.status === 'configured' ? 'AI 已配置' : usage.status === 'disabled' ? 'AI 未开启' : 'AI 配置不完整'}</Text>
      <View style={styles.totals}>
        <Text style={styles.metric}>服务商调用 {total('providerRequests')}</Text>
        <Text style={styles.metric}>缓存命中 {total('cacheHits')}</Text>
        <Text style={styles.metric}>重复合并 {total('coalesced')}</Text>
        <Text style={styles.metric}>进行中 {usage.inFlight} / {usage.maxConcurrent}</Text>
      </View>
      {Object.entries(usage.tasks).map(([task, count]) => <View key={task} style={styles.row}>
        <Text style={styles.label}>{aiTaskLabels[task as keyof typeof aiTaskLabels]}</Text>
        <Text style={styles.hint}>请求 {count.requests} · 调用 {count.providerRequests} · 成功 {count.succeeded} · 失败 {count.failed}{count.busyRejected ? ` · 忙碌拒绝 ${count.busyRejected}` : ''}</Text>
      </View>)}
      <Text style={styles.hint}>失败原因：{failures.length ? failures.map(([code, count]) => `${aiFailureLabels[code as keyof typeof aiFailureLabels]} ${count}`).join('；') : '暂无'}</Text>
      <Text style={styles.hint}>缓存 {usage.cache.entries} / {usage.cache.maxEntries} 条 · 有效期 {usage.cache.ttlMs / 3600000} 小时</Text>
      <AppButton label="清理电脑 AI 缓存" variant="quiet" disabled={busy || !usage.cache.entries} onPress={() => setConfirm(true)} />
      <Text style={styles.hint}>统计不含词典请求，费用以服务商账单为准。电脑服务重启后统计和缓存清空。</Text>
    </> : null}
    <Modal visible={confirm} transparent animationType="fade" onRequestClose={() => setConfirm(false)}>
      <View style={styles.backdrop}><View style={styles.dialog}>
        <Text style={styles.heading}>清理电脑 AI 缓存？</Text>
        <Text style={styles.hint}>手机上的单词和已保存笔记会保留。下次生成可能再次调用服务商；正在处理的任务会继续，其结果不再写入本次缓存。</Text>
        <AppButton label="确认清理" variant="danger" onPress={() => void load(true)} />
        <AppButton label="返回" variant="secondary" onPress={() => setConfirm(false)} />
      </View></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.xl, paddingTop: spacing.lg, borderTopWidth: 1, borderColor: colors.border, gap: spacing.md },
  heading: { color: colors.ink, fontSize: 18, fontWeight: '700' },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 20 },
  totals: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  metric: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  row: { gap: spacing.xs, borderBottomWidth: 1, borderColor: colors.border, paddingBottom: spacing.sm },
  label: { color: colors.ink, fontWeight: '600', fontSize: 14 },
  backdrop: { flex: 1, justifyContent: 'center', padding: spacing.xl, backgroundColor: 'rgba(15, 36, 31, 0.38)' },
  dialog: { width: '100%', maxWidth: 520, alignSelf: 'center', backgroundColor: colors.surface, borderRadius: 8, padding: spacing.xl, gap: spacing.lg },
});
