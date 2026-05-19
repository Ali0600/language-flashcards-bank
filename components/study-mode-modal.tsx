import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * The three study modes. `flashcards` is the long-standing default behavior
 * (`<StudySession>` flip-and-rate). `written` is the typing drill — see
 * `<StudyWritten>` and `services/written-grading.ts`. `multiple` is a
 * placeholder reserved for a future multiple-choice mode; the picker shows
 * it grayed-out with "Coming soon" until it's built.
 */
export type StudyMode = 'flashcards' | 'written' | 'multiple';

export type StudyModeModalProps = {
  visible: boolean;
  onClose: () => void;
  onPick: (mode: StudyMode) => void;
};

/**
 * Modal sheet opened by the per-folder Study button. Three rows, one per
 * mode. Tapping a row closes the modal and fires `onPick`. Tapping the
 * backdrop (or the iOS hardware back gesture) just closes.
 *
 * Lives at the component level (not inside `app/folder/[slug].tsx`) so the
 * picker can be reused later — e.g. if we add a Study button to the global
 * Library tab or Stats, both surfaces would route through this same modal.
 */
export function StudyModeModal({ visible, onClose, onPick }: StudyModeModalProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Inner Pressable swallows taps so they don't bubble to the
            backdrop and close the sheet from inside it. */}
        <Pressable
          onPress={() => {}}
          style={[
            styles.card,
            {
              backgroundColor: Colors[colorScheme].background,
              borderColor: 'rgba(150,150,150,0.3)',
            },
          ]}>
          <ThemedText type="subtitle" style={styles.title}>
            Study mode
          </ThemedText>

          <ModeRow
            icon="rectangle.stack.fill"
            label="Flashcards"
            description="Tap to flip, then rate yourself. Default."
            tint={tint}
            onPress={() => onPick('flashcards')}
          />

          <ModeRow
            icon="keyboard"
            label="Written"
            description="Type the German word yourself."
            tint={tint}
            onPress={() => onPick('written')}
          />

          <ModeRow
            icon="list.bullet"
            label="Multiple choice"
            description="Coming soon."
            tint={tint}
            disabled
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ModeRow({
  icon,
  label,
  description,
  tint,
  onPress,
  disabled,
}: {
  icon: Parameters<typeof IconSymbol>[0]['name'];
  label: string;
  description: string;
  tint: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${description}`}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.row,
        { borderColor: 'rgba(150,150,150,0.3)' },
        pressed && !disabled && styles.rowPressed,
        disabled && styles.rowDisabled,
      ]}>
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: tint + '22' },
        ]}>
        <IconSymbol name={icon} size={22} color={tint} />
      </View>
      <View style={styles.rowLabels}>
        <ThemedText type="defaultSemiBold" style={styles.rowLabel}>
          {label}
        </ThemedText>
        <ThemedText style={styles.rowDescription}>{description}</ThemedText>
      </View>
      {!disabled && (
        <IconSymbol name="chevron.right" size={18} color="rgba(150,150,150,0.6)" />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  title: { fontSize: 18, paddingHorizontal: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  rowPressed: { opacity: 0.7 },
  rowDisabled: { opacity: 0.45 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabels: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 16 },
  rowDescription: { fontSize: 13, opacity: 0.7 },
});
