import { setAudioModeAsync } from 'expo-audio';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  useAutoCreateReverseCards,
  useDailyNewCardLimit,
  useFocusRegionBeforeScan,
  usePlayInSilentMode,
} from '@/hooks/use-settings';
import { bulkCreateReverses } from '@/services/card';

const STEPS = [0, 5, 10, 15, 20, 30, 50];

export default function SettingsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const onTint = Colors[colorScheme].background;
  const { limit, setLimit, loading } = useDailyNewCardLimit();
  const { enabled: playInSilentMode, setEnabled: setPlayInSilentMode } = usePlayInSilentMode();
  const { enabled: autoReverse, setEnabled: setAutoReverse } = useAutoCreateReverseCards();
  const { enabled: focusBeforeScan, setEnabled: setFocusBeforeScan } = useFocusRegionBeforeScan();
  const [generatingReverses, setGeneratingReverses] = useState(false);

  const onGenerateAllReverses = () => {
    Alert.alert(
      'Generate reverses for all cards?',
      'This creates an English → German sibling for every German → English card that doesn\'t already have one. Your total card count will roughly double.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          onPress: async () => {
            setGeneratingReverses(true);
            try {
              const created = await bulkCreateReverses();
              Alert.alert(
                created === 0 ? 'Nothing to do' : 'Done',
                created === 0
                  ? 'Every card already has a reverse sibling.'
                  : `Created ${created} reverse card${created === 1 ? '' : 's'}.`,
              );
            } catch (e) {
              Alert.alert('Failed', e instanceof Error ? e.message : String(e));
            } finally {
              setGeneratingReverses(false);
            }
          },
        },
      ],
    );
  };

  const onTogglePlayInSilentMode = async (next: boolean) => {
    await setPlayInSilentMode(next);
    setAudioModeAsync({ playsInSilentMode: next }).catch((e) =>
      console.error('setAudioModeAsync failed', e),
    );
  };

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

        <View style={styles.section}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleLabels}>
              <ThemedText type="subtitle">Play sound through silent switch</ThemedText>
              <ThemedText style={styles.help}>
                When on, German pronunciation plays even when the iPhone silent switch is engaged.
                Turn off to respect the silent switch.
              </ThemedText>
            </View>
            <Switch
              value={playInSilentMode}
              onValueChange={onTogglePlayInSilentMode}
              trackColor={{ true: tint }}
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleLabels}>
              <ThemedText type="subtitle">Focus region before scanning</ThemedText>
              <ThemedText style={styles.help}>
                When on, every photo (camera or library) opens a preview where you can drag
                a rectangle to focus the scan on one region. Smaller scans use less Gemini
                quota and finish faster.
              </ThemedText>
            </View>
            <Switch
              value={focusBeforeScan}
              onValueChange={setFocusBeforeScan}
              trackColor={{ true: tint }}
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleLabels}>
              <ThemedText type="subtitle">Auto-create reverse cards</ThemedText>
              <ThemedText style={styles.help}>
                When on, every new card captured from a photo gets an English → German sibling
                for active recall. Existing cards aren&apos;t affected — use the button below to
                backfill.
              </ThemedText>
            </View>
            <Switch
              value={autoReverse}
              onValueChange={setAutoReverse}
              trackColor={{ true: tint }}
            />
          </View>
          <Pressable
            onPress={onGenerateAllReverses}
            disabled={generatingReverses}
            style={[
              styles.linkBtn,
              { borderColor: tint },
              generatingReverses && styles.linkBtnDisabled,
            ]}>
            <ThemedText style={{ color: tint, fontWeight: '600' }}>
              {generatingReverses ? 'Generating…' : 'Generate reverses for existing cards'}
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.section}>
          <ThemedText type="subtitle">Ignored words</ThemedText>
          <ThemedText style={styles.help}>
            Words you&apos;ve told the app to skip. Future photos containing them won&apos;t
            create flashcards.
          </ThemedText>
          <Pressable
            onPress={() => router.push('/ignored' as never)}
            style={[styles.linkBtn, { borderColor: tint }]}>
            <ThemedText style={{ color: tint, fontWeight: '600' }}>Manage ignored words</ThemedText>
          </Pressable>
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  toggleLabels: { flex: 1, gap: 6 },
  doneBtn: {
    marginHorizontal: 20,
    marginBottom: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneBtnText: { fontWeight: '600', fontSize: 16 },
  linkBtn: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  linkBtnDisabled: { opacity: 0.4 },
});
