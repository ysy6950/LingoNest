import { useState } from 'react';
import { router } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '../components/AppButton';
import { AiUsagePanel } from '../components/AiUsagePanel';
import { ComputerConnectionFields } from '../components/ComputerConnectionFields';
import { colors, spacing } from '../components/theme';
import { checkComputerPairing } from '../localServer/pairing';
import { ENRICHMENT_KINDS, useAutoEnrichment, type EnrichmentKind } from '../store/useAutoEnrichment';
import { useComputerConnection, withComputerConnection } from '../store/useComputerConnection';

const labels = { dictionary: '自动补充词典资料', ai: '自动生成 AI 学习笔记' };

export default function SettingsScreen() {
  const queue = useAutoEnrichment();
  const paired = useComputerConnection((state) => state.paired);
  const [consent, setConsent] = useState<EnrichmentKind | 'clear' | null>(null);
  const [busy, setBusy] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const failed = queue.jobs.some((job) => job.ai?.status === 'failed' || job.dictionary?.status === 'failed');

  async function connect() {
    setBusy(true); setConnectionError('');
    try { await withComputerConnection(checkComputerPairing); }
    catch (cause) { setConnectionError(cause instanceof Error ? cause.message : '连接失败，请重试。'); }
    finally { setBusy(false); }
  }

  return <SafeAreaView style={styles.safe}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}><Text style={styles.back}>‹ 返回</Text></Pressable>
      <Text style={styles.title}>设置</Text>
      <View style={styles.section}>
        <Text style={styles.heading}>新词自动补全</Text>
        {ENRICHMENT_KINDS.map((kind) => <View key={kind} style={styles.settingRow}>
          <View style={styles.settingText}>
            <Text style={styles.label}>{labels[kind]}</Text>
            <Text style={styles.hint}>{kind === 'dictionary' ? '音标、词性及词典可用的美式音频' : '英语解释、中文提示和三条例句'}</Text>
          </View>
          <Switch accessibilityLabel={labels[kind]} value={queue.enabled[kind]} disabled={!queue.isHydrated}
            trackColor={{ false: colors.border, true: colors.primary }}
            onValueChange={(enabled) => enabled ? setConsent(kind) : queue.setEnabled(kind, false)} />
        </View>)}
        <Text style={styles.hint}>适用于开启后新添加的单词，包括你确认加入的关联词。旧词可在详情页单独补全。</Text>
        {queue.error ? <>
          <Text accessibilityRole="alert" style={styles.error}>{queue.error}</Text>
          <AppButton label={queue.isHydrated ? '重试保存设置' : '重试读取设置'} variant="secondary" disabled={queue.isSaving}
            onPress={() => void (queue.isHydrated ? queue.retrySave() : queue.hydrate())} />
        </> : null}
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>电脑连接</Text>
        <ComputerConnectionFields disabled={busy} />
        {!paired ? <AppButton label={busy ? '连接中…' : '连接电脑'} onPress={() => void connect()} disabled={busy} variant="secondary" /> : null}
        {connectionError ? <Text accessibilityRole="alert" style={styles.error}>{connectionError}</Text> : null}
      </View>
      <AiUsagePanel />
      <View style={styles.section}>
        <View style={styles.headingRow}>
          <Text style={styles.heading}>补全待办 · {queue.jobs.length}</Text>
          {failed ? <AppButton label="重试失败项" compact variant="secondary" onPress={() => queue.retry()} /> : null}
        </View>
        {!paired && queue.jobs.length > 0 ? <Text style={styles.waiting}>等待连接电脑，单词已保存在手机上。</Text> : null}
        {queue.jobs.length === 0 ? <Text style={styles.hint}>暂无待补全单词</Text> : null}
        {queue.jobs.map((job) => <View key={job.id} style={styles.job}>
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/cards/[id]', params: { id: String(job.cardId) } })}>
            <Text style={styles.jobWord}>{job.word}</Text>
          </Pressable>
          {ENRICHMENT_KINDS.map((kind) => job[kind] ? <Text key={kind} style={job[kind]?.status === 'failed' ? styles.error : styles.hint}>
            {kind === 'dictionary' ? '词典' : 'AI 笔记'} · {job[kind]?.status === 'running' ? '补全中' : job[kind]?.status === 'failed' ? job[kind]?.error : paired ? '等待补全' : '等待连接电脑'}
          </Text> : null)}
          <AppButton label="取消此项" compact variant="quiet" onPress={() => queue.remove(job.cardId)} />
        </View>)}
        {queue.jobs.length ? <AppButton label="取消全部待办" variant="quiet" onPress={() => setConsent('clear')} /> : null}
        <Text style={styles.hint}>关闭 App 后补全会暂停。待办保存在此手机，重新打开并配对后继续；电脑备份只包含已保存的学习资料。</Text>
      </View>
    </ScrollView>
    <Modal visible={consent !== null} transparent animationType="fade" onRequestClose={() => setConsent(null)}>
      <View style={styles.backdrop}><View style={styles.dialog}>
        <Text style={styles.heading}>{consent === 'clear' ? '取消全部待办？' : consent ? `开启${labels[consent]}？` : ''}</Text>
        <Text style={styles.body}>{consent === 'clear' ? '已保存的单词和资料会保留，未完成的补全将取消。' : consent === 'dictionary'
          ? '此后添加的新词会经电脑后端发送到 Merriam-Webster 词典。可用的音标、词性和美式音频将自动保存到手机。'
          : '此后添加的单词和你填写的解释会经电脑后端发送到配置的 AI 服务商。生成的解释和三条例句会自动保存为独立学习笔记，内容可能有误，可在详情页编辑或删除。'}</Text>
        {consent !== 'clear' ? <Text style={styles.hint}>原解释和已有资料不会被覆盖，旧词不会批量上传。可随时关闭，停止未完成的自动补全。</Text> : null}
        <AppButton label={consent === 'clear' ? '确认取消全部' : '同意并开启'} onPress={() => {
          if (consent === 'clear') queue.remove();
          else if (consent) queue.setEnabled(consent, true);
          setConsent(null);
        }} />
        <AppButton label="返回" variant="secondary" onPress={() => setConsent(null)} />
      </View></View>
    </Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: spacing.xl, paddingBottom: 48 },
  backButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }, back: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  title: { color: colors.ink, fontSize: 28, fontWeight: '800', marginTop: spacing.md },
  section: { marginTop: spacing.xl, paddingTop: spacing.lg, borderTopWidth: 1, borderColor: colors.border, gap: spacing.md },
  heading: { color: colors.ink, fontSize: 18, fontWeight: '700', flexShrink: 1 },
  headingRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  settingText: { flex: 1, gap: spacing.xs, minWidth: 0 }, label: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 20 }, body: { color: colors.inkSoft, fontSize: 15, lineHeight: 24 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 20 }, waiting: { color: colors.primary, fontSize: 13, lineHeight: 20 },
  job: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface, padding: spacing.lg, gap: spacing.sm },
  jobWord: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  backdrop: { flex: 1, justifyContent: 'center', padding: spacing.xl, backgroundColor: 'rgba(15, 36, 31, 0.38)' },
  dialog: { width: '100%', maxWidth: 520, alignSelf: 'center', backgroundColor: colors.surface, borderRadius: 8, padding: spacing.xl, gap: spacing.lg },
});
