import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radius, spacing } from './theme';

export type FlipCardProps = {
  word: string;
  meaning: string;
  ipa?: string;
  partOfSpeech?: string;
  frontAccessory?: ReactNode;
  /** Omit this for a card that manages its own face. */
  revealed?: boolean;
  onRevealChange?: (revealed: boolean) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** A tap rotates the current face away, swaps content at the edge, then rotates in. */
export function FlipCard({
  word,
  meaning,
  ipa,
  partOfSpeech,
  frontAccessory,
  revealed,
  onRevealChange,
  style,
  testID,
}: FlipCardProps) {
  const [internalRevealed, setInternalRevealed] = useState(false);
  const targetRevealed = revealed ?? internalRevealed;
  const [displayedRevealed, setDisplayedRevealed] = useState(targetRevealed);
  const edge = useRef(new Animated.Value(0)).current;
  const animating = useRef(false);

  useEffect(() => {
    if (displayedRevealed === targetRevealed) {
      return;
    }

    animating.current = true;
    let entering: Animated.CompositeAnimation | undefined;
    let entryFrame: number | undefined;
    const leaving = Animated.timing(edge, {
      toValue: 1,
      duration: 120,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    });

    leaving.start(({ finished }) => {
      if (!finished) {
        return;
      }
      setDisplayedRevealed(targetRevealed);
      // Let React paint the new face before it rotates back into view.
      entryFrame = requestAnimationFrame(() => {
        entering = Animated.timing(edge, {
          toValue: 0,
          duration: 170,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        });
        entering.start(() => {
          animating.current = false;
        });
      });
    });

    return () => {
      leaving.stop();
      if (entryFrame !== undefined) {
        cancelAnimationFrame(entryFrame);
      }
      entering?.stop();
      animating.current = false;
    };
    // displayedRevealed changes halfway through this effect. A new animation
    // should start only when the requested face changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetRevealed, edge]);

  const rotateY = edge.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '88deg'],
  });
  const opacity = edge.interpolate({
    inputRange: [0, 0.8, 1],
    outputRange: [1, 0.85, 0.3],
  });

  function flip() {
    if (animating.current) {
      return;
    }
    const nextRevealed = !targetRevealed;
    if (revealed === undefined) {
      setInternalRevealed(nextRevealed);
    }
    onRevealChange?.(nextRevealed);
  }

  return (
      <Animated.View
        testID={testID}
        style={[
          styles.frame,
          style,
          {
            opacity,
            transform: [{ perspective: 900 }, { rotateY }],
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={displayedRevealed ? `解释：${meaning}，点击翻回单词` : `单词：${word}，点击查看解释`}
          accessibilityHint="点击翻转单词卡"
          onPress={flip}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.content} pointerEvents="box-none">
          <View style={styles.topRow} pointerEvents="none">
            <View style={styles.accentLine} />
            <Text style={styles.sideLabel}>{displayedRevealed ? '释义' : '单词'}</Text>
            <Text style={styles.sideCount}>{displayedRevealed ? '02 / 02' : '01 / 02'}</Text>
          </View>

          <View style={styles.center} pointerEvents="box-none">
            {displayedRevealed ? <Text selectable onPress={flip} style={styles.meaning}>{meaning}</Text> : (
              <View style={styles.wordBlock} pointerEvents="box-none">
                <Text selectable onPress={flip} style={styles.word}>{word}</Text>
                {ipa ? <Text onPress={flip} style={styles.ipa}>/{ipa}/</Text> : null}
                {partOfSpeech ? <Text onPress={flip} style={styles.partOfSpeech}>{partOfSpeech}</Text> : null}
                {frontAccessory}
              </View>
            )}
          </View>

          <View style={styles.footer} pointerEvents="none">
            <View style={styles.footerDot} />
            <Text style={styles.hint}>
              {displayedRevealed ? '轻点翻回单词' : '轻点查看解释'}
            </Text>
          </View>
        </View>
      </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    minHeight: 260,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    minHeight: 258,
    padding: spacing.xxl,
  },
  topRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  accentLine: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    height: 4,
    width: 20,
  },
  sideLabel: {
    color: colors.inkSoft,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  sideCount: {
    color: colors.muted,
    fontSize: 12,
    marginLeft: 'auto',
  },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.section },
  wordBlock: { alignItems: 'center', gap: spacing.xs },
  word: {
    color: colors.ink,
    fontSize: 36,
    fontWeight: '700',
    lineHeight: 44,
    textAlign: 'center',
  },
  ipa: { color: colors.primary, fontSize: 18, fontWeight: '600', lineHeight: 24, textAlign: 'center' },
  partOfSpeech: { color: colors.muted, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  meaning: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 32,
    textAlign: 'center',
  },
  footer: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 7 },
  footerDot: { backgroundColor: colors.primary, borderRadius: 4, height: 6, width: 6 },
  hint: { color: colors.muted, fontSize: 12 },
});
