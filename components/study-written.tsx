import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Ratings } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Card } from '@/db/schema';
import { rateCard } from '@/services/review';
import { Rating } from '@/services/scheduler';
import { shuffleArray } from '@/services/shuffle';
import { speakGerman, stopSpeech } from '@/services/speech';
import { spokenLemma } from '@/services/speech-helpers';
import { useShuffleCards } from '@/hooks/use-settings';
import { gradeWrittenAnswer } from '@/services/written-grading';

export type StudyWrittenProps = {
  loading: boolean;
  error: Error | null;
  dueCards: Card[];
  refetch: () => Promise<void>;
  emptyTitle: string;
  emptyBody: string;
};

/**
 * Written-mode study UI. Sibling to `<StudySession>`. Same queue source
 * (`useFolderDueCards` / `useDueCards`), same FSRS rating pipeline — but
 * instead of flip-and-rate, the user types the German lemma in response to
 * an English prompt. Grading goes through `gradeWrittenAnswer` (umlaut +
 * article + case tolerant).
 *
 * Rating mapping:
 *   - Correct first try  → Good
 *   - "Show answer" tap  → Again (user gave up before typing)
 *   - Wrong submission   → Again
 *
 * Edge cases worth flagging in this file:
 *   - Queue snapshot mirrors `<StudySession>`: snapshotted once on first
 *     non-empty fetch so the order is stable for the whole session. Shuffle
 *     setting is read at snapshot time only.
 *   - Submitting state guards against double-rates (return key + button
 *     race during the ~30ms SQLite write).
 *   - We don't have card-detail navigation or sighting deletion paths
 *     here, so the focus-prune dance from `<StudySession>` isn't needed —
 *     the user can't delete cards from this screen. If they do externally
 *     and come back mid-session, the next-card advance will hit a deleted
 *     row in the queue but `rateCard` will throw "Card not found"; the
 *     catch swallows it (logged) and the queue advances anyway, which is
 *     the right outcome.
 *   - Empty/whitespace-only input is graded incorrect (no free passes).
 *   - The TextInput uses `autoCapitalize="none"` because we normalize case
 *     in the grader — forcing caps would be friction without value.
 */
export function StudyWritten({
  loading,
  error,
  dueCards,
  refetch,
  emptyTitle,
  emptyBody,
}: StudyWrittenProps) {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const onTint = Colors[colorScheme].background;

  const [queue, setQueue] = useState<Card[] | null>(null);
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<'typing' | 'graded'>('typing');
  const [result, setResult] = useState<{ correct: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);

  // Read once at snapshot time, matching the StudySession convention.
  const { enabled: shuffleCards } = useShuffleCards();
  const shuffleCardsRef = useRef(shuffleCards);
  shuffleCardsRef.current = shuffleCards;

  // Snapshot the queue once when data first arrives. Mid-session re-renders
  // (a refetch triggered by another screen invalidating the cache) must not
  // shuffle the order. Mirror of the StudySession behavior.
  useEffect(() => {
    if (queue === null && !loading && dueCards.length > 0) {
      setQueue(shuffleCardsRef.current ? shuffleArray(dueCards) : dueCards);
    }
  }, [queue, loading, dueCards]);

  // Autofocus the TextInput when a new card is presented (on mount and on
  // advancing to the next card). Done via ref so we can also blur on grade
  // (so iOS can dismiss the keyboard during the "see the answer" pause).
  const inputRef = useRef<TextInput>(null);
  const currentCard = queue && index < queue.length ? queue[index] : null;
  const currentCardId = currentCard?.id ?? null;
  useEffect(() => {
    if (phase === 'typing' && currentCardId) {
      // Tiny delay because the TextInput hasn't always remounted yet on the
      // tick we transition phase. focus() called too early no-ops.
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [phase, currentCardId]);

  if (loading && queue === null) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText>Error: {error.message}</ThemedText>
      </ThemedView>
    );
  }

  if (queue === null || queue.length === 0) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText type="title">{emptyTitle}</ThemedText>
        <ThemedText style={styles.empty}>{emptyBody}</ThemedText>
      </ThemedView>
    );
  }

  if (index >= queue.length) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText type="title">Session complete</ThemedText>
        <ThemedText style={styles.empty}>
          Reviewed {sessionCount} card{sessionCount === 1 ? '' : 's'}. Come back later when more
          are due.
        </ThemedText>
        <Pressable
          style={[styles.detailBtn, { borderColor: tint, marginTop: 16, paddingHorizontal: 24 }]}
          onPress={() => {
            setIndex(0);
            setSessionCount(0);
            setInput('');
            setPhase('typing');
            setResult(null);
            setQueue(null);
            refetch();
          }}>
          <ThemedText>Start over</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const card = currentCard;
  if (!card) return null;

  // English on front. Same convention as <StudySession>: production-recall
  // direction (EN→DE) for both forward and reverse cards.
  const frontWord = card.translationEn ?? card.lemma;

  const submit = () => {
    if (submitting || phase !== 'typing') return;
    const grade = gradeWrittenAnswer(input, card.lemma, card.gender);
    const rating = grade.correct ? Rating.Good : Rating.Again;
    if (grade.correct) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setResult({ correct: grade.correct });
    setPhase('graded');
    inputRef.current?.blur();
    setSubmitting(true);
    // Fire FSRS rate in the background. Same optimistic pattern as the
    // flashcard mode — we don't need to await before showing the result.
    rateCard(card.id, rating)
      .catch((e) => console.error('rateCard failed (written)', e))
      .finally(() => setSubmitting(false));
    // Auto-play the German pronunciation so the user hears the correct
    // form alongside the visual reveal. Only when the user actually got
    // there — wrong answers shouldn't play (would be confusing to hear
    // success-sounding audio after a fail).
    if (grade.correct && card.lemma) {
      speakGerman(spokenLemma(card.lemma, card.gender));
    }
  };

  const reveal = () => {
    // User gave up before typing. Counts as Again (zero recall signal).
    if (submitting || phase !== 'typing') return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setResult({ correct: false });
    setPhase('graded');
    inputRef.current?.blur();
    setSubmitting(true);
    rateCard(card.id, Rating.Again)
      .catch((e) => console.error('rateCard failed (reveal)', e))
      .finally(() => setSubmitting(false));
  };

  const next = () => {
    stopSpeech();
    setInput('');
    setResult(null);
    setPhase('typing');
    setSessionCount((n) => n + 1);
    setIndex((i) => i + 1);
  };

  const playSentence = () => {
    if (!card.exampleDe) return;
    stopSpeech();
    speakGerman(card.exampleDe);
  };

  const replayWord = () => {
    if (!card.lemma) return;
    stopSpeech();
    speakGerman(spokenLemma(card.lemma, card.gender));
  };

  // Expected answer for display on the result screen. Includes the article
  // for nouns (the canonical "der Tag" form) so the user reinforces gender
  // even when the input wasn't graded against it.
  const expectedDisplay = card.gender ? `${card.gender} ${card.lemma}` : card.lemma;

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        // iOS pushes content up by the keyboard height with `padding`;
        // Android handles it natively, so we skip the behavior there.
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <View style={styles.topBar}>
          <ThemedText style={styles.progress}>
            {index + 1} / {queue.length}
          </ThemedText>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          {/* Prompt card. English on top — translation + English example
              if one exists. Smaller than a flashcard since we don't need
              the full visual weight; the focus is the input below. */}
          <View style={[styles.promptCard, { borderColor: tint }]}>
            <ThemedText style={styles.promptLabel}>Type the German for</ThemedText>
            <ThemedText type="title" style={styles.promptWord}>
              {frontWord}
            </ThemedText>
            {card.exampleEn && (
              <ThemedText style={styles.promptExample}>{card.exampleEn}</ThemedText>
            )}
          </View>

          {phase === 'typing' ? (
            <View style={styles.inputBlock}>
              <TextInput
                ref={inputRef}
                value={input}
                onChangeText={setInput}
                onSubmitEditing={submit}
                placeholder="Type here…"
                placeholderTextColor={Colors[colorScheme].icon}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                spellCheck={false}
                returnKeyType="done"
                style={[
                  styles.input,
                  {
                    borderColor: tint,
                    color: Colors[colorScheme].text,
                  },
                ]}
              />
              <View style={styles.actionsRow}>
                <Pressable
                  onPress={reveal}
                  accessibilityRole="button"
                  accessibilityLabel="Show the answer (counts as wrong)"
                  style={[styles.secondaryBtn, { borderColor: tint }]}>
                  <ThemedText style={[styles.secondaryBtnText, { color: tint }]}>
                    Show me
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={submit}
                  disabled={input.trim().length === 0}
                  accessibilityRole="button"
                  accessibilityLabel="Submit your answer"
                  style={[
                    styles.primaryBtn,
                    { backgroundColor: tint },
                    input.trim().length === 0 && styles.btnDisabled,
                  ]}>
                  <ThemedText style={[styles.primaryBtnText, { color: onTint }]}>
                    Check
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.resultBlock}>
              <View
                style={[
                  styles.resultBanner,
                  {
                    backgroundColor: result?.correct ? Ratings.good : Ratings.again,
                  },
                ]}>
                <IconSymbol
                  name={result?.correct ? 'checkmark.circle.fill' : 'xmark.circle.fill'}
                  size={24}
                  color="white"
                />
                <ThemedText style={styles.resultBannerText}>
                  {result?.correct ? 'Correct' : 'Not quite'}
                </ThemedText>
              </View>

              <View style={[styles.answerCard, { borderColor: tint }]}>
                <ThemedText style={styles.answerLabel}>Answer</ThemedText>
                <View style={styles.answerRow}>
                  <ThemedText type="title" style={styles.answerWord}>
                    {expectedDisplay}
                  </ThemedText>
                  <Pressable
                    onPress={replayWord}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Play pronunciation of ${card.lemma}`}
                    style={styles.iconBtn}>
                    <IconSymbol name="speaker.wave.2.fill" size={22} color={tint} />
                  </Pressable>
                </View>
                {card.plural && (
                  <ThemedText style={styles.plural}>plural: {card.plural}</ThemedText>
                )}
                {card.exampleDe && (
                  <ThemedText style={styles.exampleDe}>{card.exampleDe}</ThemedText>
                )}
                {card.exampleEn && (
                  <ThemedText style={styles.exampleEn}>{card.exampleEn}</ThemedText>
                )}
                {card.exampleDe && (
                  <Pressable
                    onPress={playSentence}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="Play example sentence"
                    style={[styles.speakBtn, { borderColor: tint }]}>
                    <IconSymbol name="speaker.wave.2.fill" size={18} color={tint} />
                    <ThemedText style={[styles.speakBtnText, { color: tint }]}>
                      Listen
                    </ThemedText>
                  </Pressable>
                )}
              </View>

              <Pressable
                onPress={next}
                accessibilityRole="button"
                accessibilityLabel="Next card"
                style={[styles.primaryBtn, styles.primaryBtnFull, { backgroundColor: tint }]}>
                <ThemedText style={[styles.primaryBtnText, { color: onTint }]}>
                  Next
                </ThemedText>
              </Pressable>

              <Pressable
                onPress={() => router.push(`/card/${card.id}`)}
                style={[styles.detailBtn, { borderColor: tint }]}>
                <ThemedText>View details</ThemedText>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  empty: { textAlign: 'center', opacity: 0.6, maxWidth: 320 },
  topBar: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, justifyContent: 'center' },
  progress: { opacity: 0.6 },
  scrollContent: { gap: 20, paddingBottom: 24 },
  promptCard: {
    borderWidth: 2,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  promptLabel: { opacity: 0.6, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
  promptWord: { fontSize: 34, lineHeight: 44, textAlign: 'center' },
  promptExample: { opacity: 0.7, fontStyle: 'italic', textAlign: 'center', marginTop: 4 },
  inputBlock: { gap: 12 },
  input: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 22,
  },
  actionsRow: { flexDirection: 'row', gap: 12 },
  primaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryBtnFull: { flex: undefined },
  primaryBtnText: { fontWeight: '600', fontSize: 16 },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
  secondaryBtnText: { fontWeight: '600', fontSize: 16 },
  btnDisabled: { opacity: 0.5 },
  resultBlock: { gap: 16 },
  resultBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  resultBannerText: { color: 'white', fontWeight: '700', fontSize: 16 },
  answerCard: {
    borderWidth: 2,
    borderRadius: 16,
    padding: 20,
    gap: 8,
    alignItems: 'center',
  },
  answerLabel: { opacity: 0.6, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
  answerRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  answerWord: { fontSize: 32, lineHeight: 42, textAlign: 'center' },
  iconBtn: { padding: 4 },
  plural: { opacity: 0.6, marginTop: 4 },
  exampleDe: { fontStyle: 'italic', textAlign: 'center', marginTop: 8 },
  exampleEn: { opacity: 0.6, textAlign: 'center' },
  speakBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  speakBtnText: { fontSize: 14, fontWeight: '600' },
  detailBtn: {
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
});
