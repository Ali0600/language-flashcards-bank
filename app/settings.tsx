import { setAudioModeAsync } from 'expo-audio';
import { useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useAsyncQuery } from '@/hooks/use-async-query';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  useAutoCreateReverseCards,
  useAutoPlayWord,
  useDailyNewCardLimit,
  useGermanVoiceId,
  usePlayInSilentMode,
} from '@/hooks/use-settings';
import { bulkCreateReverses, deleteAllCards, getCardCount } from '@/services/card';
import { previewGermanVoice } from '@/services/speech';
import { sortGermanVoices, voiceTier } from '@/services/speech-helpers';

const STEPS = [0, 5, 10, 15, 20, 30, 50];

export default function SettingsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const onTint = Colors[colorScheme].background;
  const { limit, setLimit, loading } = useDailyNewCardLimit();
  const { enabled: playInSilentMode, setEnabled: setPlayInSilentMode } = usePlayInSilentMode();
  const { enabled: autoReverse, setEnabled: setAutoReverse } = useAutoCreateReverseCards();
  const { enabled: autoPlayWord, setEnabled: setAutoPlayWord } = useAutoPlayWord();
  const { voiceId, setVoiceId } = useGermanVoiceId();
  const [generatingReverses, setGeneratingReverses] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  // Installed German voices. `useAsyncQuery` re-runs on focus, which is
  // exactly right here: the user leaves for iOS Settings to download a
  // voice and the list refreshes when they come back — no manual reload.
  const {
    loading: voicesLoading,
    data: germanVoices,
    error: voicesError,
  } = useAsyncQuery<Speech.Voice[]>(
    [],
    useCallback(async () => {
      const all = await Speech.getAvailableVoicesAsync();
      return sortGermanVoices(all.filter((v) => v.language === 'de-DE'));
    }, []),
  );

  const onPickVoice = (identifier: string | null) => {
    setVoiceId(identifier).catch((e) => console.error('Saving German voice failed', e));
    // Audition immediately so the choice is self-evident. `previewGermanVoice`
    // stops any in-flight utterance first, so rapid taps don't stack up.
    previewGermanVoice(identifier);
  };

  const onDeleteAllCards = async () => {
    if (deletingAll) return;
    // Pull the current count so the confirmation prompt shows the actual
    // scope of the destruction — single-tap "delete all" with no number is
    // too easy to fire by accident.
    let total = 0;
    try {
      total = await getCardCount();
    } catch (e) {
      Alert.alert('Could not read card count', e instanceof Error ? e.message : String(e));
      return;
    }
    if (total === 0) {
      Alert.alert('No cards to delete', 'Your library is already empty.');
      return;
    }
    Alert.alert(
      `Delete all ${total} card${total === 1 ? '' : 's'}?`,
      'This permanently removes every flashcard, its review history, and its sightings. Photos, your ignore list, and settings are kept. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete all',
          style: 'destructive',
          onPress: async () => {
            setDeletingAll(true);
            try {
              const { deletedCount } = await deleteAllCards();
              Alert.alert(
                'Library cleared',
                deletedCount === 0
                  ? 'No cards were present.'
                  : `Deleted ${deletedCount} card${deletedCount === 1 ? '' : 's'}.`,
              );
            } catch (e) {
              Alert.alert('Delete failed', e instanceof Error ? e.message : String(e));
            } finally {
              setDeletingAll(false);
            }
          },
        },
      ],
    );
  };

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
              <ThemedText type="subtitle">Auto-play word on reveal</ThemedText>
              <ThemedText style={styles.help}>
                When on, the German lemma is pronounced automatically the moment you flip a
                flashcard. The speaker icon in the study header shows the current state and
                toggles it.
              </ThemedText>
            </View>
            <Switch
              value={autoPlayWord}
              onValueChange={setAutoPlayWord}
              trackColor={{ true: tint }}
            />
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText type="subtitle">German voice</ThemedText>
          <ThemedText style={styles.help}>
            iOS ships higher-quality German voices, but they aren&apos;t installed by default.
            Download one in iOS Settings → Accessibility → Spoken Content → Voices → German
            (&quot;Anna&quot; at Premium quality is the best of them), then come back here and pick
            it. Apps can&apos;t trigger that download, so it&apos;s a one-time manual step.
          </ThemedText>

          {voicesLoading ? (
            <ActivityIndicator style={{ alignSelf: 'flex-start' }} />
          ) : voicesError ? (
            <ThemedText style={styles.help}>
              Could not read the installed voices: {voicesError.message}
            </ThemedText>
          ) : (
            <View style={styles.voiceList}>
              <VoiceRow
                label="System default"
                sublabel="Whichever German voice iOS picks."
                selected={voiceId === null}
                tint={tint}
                onPress={() => onPickVoice(null)}
              />
              {germanVoices.map((v) => {
                const tier = voiceTier(v.identifier);
                return (
                  <VoiceRow
                    key={v.identifier}
                    label={v.name}
                    sublabel={
                      tier === 'premium'
                        ? 'Premium — best quality'
                        : tier === 'enhanced'
                          ? 'Enhanced — better than default'
                          : 'Compact — the basic built-in voice'
                    }
                    selected={voiceId === v.identifier}
                    tint={tint}
                    onPress={() => onPickVoice(v.identifier)}
                  />
                );
              })}
              {/* The stored voice was uninstalled (an iOS upgrade can drop
                  downloaded voices). Surface it rather than silently showing
                  nothing selected, so the state isn't confusing. */}
              {voiceId !== null && !germanVoices.some((v) => v.identifier === voiceId) && (
                <ThemedText style={styles.help}>
                  Your selected voice isn&apos;t installed on this device right now, so German
                  plays with the system default. Re-download it in iOS Settings, or pick another
                  above.
                </ThemedText>
              )}
            </View>
          )}
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

        <View style={styles.section}>
          <ThemedText type="subtitle">Danger zone</ThemedText>
          <ThemedText style={styles.help}>
            Permanently delete every flashcard along with its review history and sightings.
            Photos, ignored words, and your settings are kept.
          </ThemedText>
          <Pressable
            onPress={onDeleteAllCards}
            disabled={deletingAll}
            style={[styles.dangerBtn, deletingAll && styles.linkBtnDisabled]}>
            <ThemedText style={styles.dangerBtnText}>
              {deletingAll ? 'Deleting…' : 'Delete all cards'}
            </ThemedText>
          </Pressable>
        </View>
      </ScrollView>

      <Pressable style={[styles.doneBtn, { backgroundColor: tint }]} onPress={() => router.back()}>
        <ThemedText style={[styles.doneBtnText, { color: onTint }]}>Done</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

/**
 * One selectable voice in the German-voice picker. Tapping both selects and
 * auditions, so the row is the whole affordance — there's no separate play
 * button to hunt for.
 */
function VoiceRow({
  label,
  sublabel,
  selected,
  tint,
  onPress,
}: {
  label: string;
  sublabel: string;
  selected: boolean;
  tint: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}. ${sublabel}${selected ? '. Selected' : ''}`}
      style={({ pressed }) => [
        styles.voiceRow,
        { borderColor: selected ? tint : 'rgba(150,150,150,0.3)' },
        selected && { borderWidth: 2 },
        pressed && styles.voiceRowPressed,
      ]}>
      <View style={styles.voiceLabels}>
        <ThemedText type="defaultSemiBold">{label}</ThemedText>
        <ThemedText style={styles.voiceSublabel}>{sublabel}</ThemedText>
      </View>
      {selected ? (
        <IconSymbol name="checkmark.circle.fill" size={22} color={tint} />
      ) : (
        <IconSymbol name="speaker.wave.2.fill" size={20} color="rgba(150,150,150,0.7)" />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 24 },
  section: { gap: 12 },
  help: { opacity: 0.7, fontSize: 14, lineHeight: 20 },
  voiceList: { gap: 8 },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  voiceRowPressed: { opacity: 0.7 },
  voiceLabels: { flex: 1, gap: 2 },
  voiceSublabel: { opacity: 0.65, fontSize: 13 },
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
  dangerBtn: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E74C3C',
    alignItems: 'center',
  },
  dangerBtnText: { color: '#E74C3C', fontWeight: '600' },
});
