import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radius, spacing } from './theme';

export type WordPreviewCardProps = {
  word: string;
  meaning: string;
  onPress: () => void;
  groupName?: string;
  due?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** A compact library item. Review actions belong on the review screen. */
export function WordPreviewCard({
  word,
  meaning,
  onPress,
  groupName,
  due = false,
  style,
  testID,
}: WordPreviewCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${word}，${meaning}${due ? '，待复习' : ''}`}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}
    >
      <View style={styles.topRow}>
        <View style={[styles.dot, due && styles.dueDot]} />
        {due ? <Text style={styles.dueLabel}>待复习</Text> : <Text style={styles.savedLabel}>已收录</Text>}
      </View>
      <Text numberOfLines={1} ellipsizeMode="tail" style={styles.word}>
        {word}
      </Text>
      <Text numberOfLines={2} ellipsizeMode="tail" style={styles.meaning}>
        {meaning}
      </Text>
      {groupName ? (
        <Text numberOfLines={1} style={styles.group}>
          {groupName}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    elevation: 1,
    height: 160,
    minWidth: 0,
    padding: spacing.lg,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  pressed: { backgroundColor: colors.surfaceMuted, opacity: 0.9 },
  topRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  dot: { backgroundColor: colors.primarySoft, borderRadius: radius.pill, height: 7, width: 7 },
  dueDot: { backgroundColor: colors.accent },
  dueLabel: { color: colors.accent, fontSize: 11, fontWeight: '700' },
  savedLabel: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  word: { color: colors.ink, fontSize: 21, fontWeight: '700', marginTop: spacing.md },
  meaning: { color: colors.inkSoft, fontSize: 12, lineHeight: 18, marginTop: spacing.xs },
  group: { color: colors.muted, fontSize: 11, marginTop: 'auto' },
});
