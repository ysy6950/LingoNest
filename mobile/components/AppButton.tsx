import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radius, spacing } from './theme';

export type AppButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

export type AppButtonProps = {
  label: string;
  onPress: () => void;
  variant?: AppButtonVariant;
  disabled?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
  icon?: ReactNode;
};

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  compact = false,
  style,
  accessibilityLabel,
  testID,
  icon,
}: AppButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'quiet' && styles.quiet,
        variant === 'danger' && styles.danger,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {icon}
      <Text
        numberOfLines={1}
        style={[
          styles.label,
          compact && styles.compactLabel,
          variant === 'primary' && styles.primaryLabel,
          variant === 'secondary' && styles.secondaryLabel,
          variant === 'quiet' && styles.quietLabel,
          variant === 'danger' && styles.dangerLabel,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  compact: { minHeight: 38, paddingHorizontal: spacing.md },
  primary: { backgroundColor: colors.primary },
  secondary: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  quiet: { backgroundColor: colors.primarySoft },
  danger: { backgroundColor: colors.dangerSoft },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.45 },
  label: { fontSize: 15, fontWeight: '700', letterSpacing: 0.1 },
  compactLabel: { fontSize: 13 },
  primaryLabel: { color: colors.white },
  secondaryLabel: { color: colors.ink },
  quietLabel: { color: colors.primary },
  dangerLabel: { color: colors.danger },
});
