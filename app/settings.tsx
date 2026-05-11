import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useDailyNewCardLimit } from '@/hooks/use-settings';

const STEPS = [0, 5, 10, 15, 20, 30, 50];

export default function SettingsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const onTint = Colors[colorScheme].background;
  const { limit, setLimit, loading } = useDailyNewCardLimit();

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <ThemedText type="subtitle">Daily new-card limit</ThemedText>
          <ThemedText style={styles.help}>
            Maximum number of new (never-reviewed) cards that can enter your study queue each day.
            Frequency-prioritized — the most-seen words appear first.
          </ThemedText>

          <View style={styles.stepperRow}>
            <Pressable
              style={[styles.stepBtn, { borderColor: tint }]}
              onPress={() => setLimit(Math.max(0, limit - 1))}
              disabled={loading}>
              <ThemedText style={styles.stepBtnText}>−</ThemedText>
            </Pressable>
            <View style={styles.stepValue}>
              <ThemedText style={styles.stepValueText}>{limit}</ThemedText>
              <ThemedText style={styles.stepValueLabel}>per day</ThemedText>
            </View>
            <Pressable
              style={[styles.stepBtn, { borderColor: tint }]}
              onPress={() => setLimit(limit + 1)}
              disabled={loading}>
              <ThemedText style={styles.stepBtnText}>+</ThemedText>
            </Pressable>
          </View>

          <View style={styles.presetRow}>
            {STEPS.map((s) => {
              const active = s === limit;
              return (
                <Pressable
                  key={s}
                  onPress={() => setLimit(s)}
                  style={[
                    styles.preset,
                    { borderColor: tint },
                    active && { backgroundColor: tint },
                  ]}>
                  <ThemedText style={[styles.presetText, active && { color: onTint }]}>
                    {s}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <ThemedText style={styles.note}>
            {`Set to 0 to pause introducing new cards entirely (you'll still see learning/review cards).`}
          </ThemedText>
        </View>
      </ScrollView>

      <Pressable style={[styles.doneBtn, { backgroundColor: tint }]} onPress={() => router.back()}>
        <ThemedText style={[styles.doneBtnText, { color: onTint }]}>Done</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 24 },
  section: { gap: 12 },
  help: { opacity: 0.7, fontSize: 14, lineHeight: 20 },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 12,
  },
  stepBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { fontSize: 24, fontWeight: '600' },
  stepValue: { flex: 1, alignItems: 'center', gap: 2 },
  stepValueText: { fontSize: 48, fontWeight: '600', lineHeight: 56 },
  stepValueLabel: { fontSize: 13, opacity: 0.6 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  presetText: { fontSize: 14 },
  note: { opacity: 0.5, fontSize: 13, fontStyle: 'italic', marginTop: 4 },
  doneBtn: {
    marginHorizontal: 20,
    marginBottom: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneBtnText: { fontWeight: '600', fontSize: 16 },
});
