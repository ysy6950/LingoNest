import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { colors, radius, spacing } from './theme';

export type AppTextFieldProps = TextInputProps & {
  label: string;
  helperText?: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

export function AppTextField({
  label,
  helperText,
  error,
  containerStyle,
  multiline,
  style,
  placeholderTextColor = colors.muted,
  ...inputProps
}: AppTextFieldProps) {
  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        multiline={multiline}
        placeholderTextColor={placeholderTextColor}
        selectionColor={colors.primary}
        style={[styles.input, multiline && styles.multiline, error && styles.errorInput, style]}
        {...inputProps}
      />
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : helperText ? (
        <Text style={styles.helper}>{helperText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  label: { color: colors.inkSoft, fontSize: 14, fontWeight: '700' },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  errorInput: { borderColor: colors.danger },
  helper: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 17 },
});
