import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { radius, spacing, typography } from '../../constants/theme';
import { Icon } from '../shared/Icon';
import { useThemedStyles } from '../shared/ThemeProvider';

export function ChatInputBar({
  value,
  onChangeText,
  onSend,
  onMicPress,
  isRecording,
  isTranscribing,
  disabled,
}) {
  const { styles, colors } = useThemedStyles(makeStyles);
  const canSend = value.trim().length > 0 && !disabled;

  return (
    <View style={styles.bar}>
      <Pressable
        onPress={onMicPress}
        disabled={isTranscribing}
        style={[styles.mic, isRecording && styles.micActive]}
        accessibilityRole="button"
        accessibilityLabel={isRecording ? 'Stop recording' : 'Record a voice note'}
      >
        {isTranscribing ? (
          <ActivityIndicator size="small" color={colors.text.mid} />
        ) : (
          <Icon name="mic" size={19} color={isRecording ? colors.text.inverse : colors.text.mid} />
        )}
      </Pressable>

      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={isRecording ? 'Listening...' : 'Ask your AI coach...'}
        placeholderTextColor={colors.text.faint}
        style={styles.input}
        multiline
        onSubmitEditing={canSend ? onSend : undefined}
      />

      <Pressable
        onPress={canSend ? onSend : undefined}
        disabled={!canSend}
        style={[styles.send, !canSend && styles.sendDisabled]}
        accessibilityRole="button"
        accessibilityLabel="Send message"
      >
        <Icon name="send" size={17} color={colors.text.inverse} />
      </Pressable>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border.soft,
    backgroundColor: colors.surface.primary,
  },
  mic: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.surface.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micActive: { backgroundColor: colors.brand.red },
  input: {
    flex: 1,
    maxHeight: 110,
    minHeight: 42,
    paddingHorizontal: spacing.lg,
    paddingTop: 11,
    paddingBottom: 11,
    borderRadius: radius.xl,
    backgroundColor: colors.surface.secondary,
    ...typography.body,
    color: colors.text.primary,
  },
  send: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.brand.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.35 },
});
