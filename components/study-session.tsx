import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Ratings } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Card } from '@/db/schema';
import { rateCard, type ReviewRating } from '@/services/review';
import { Rating } from '@/services/scheduler';
import { speakGerman, stopSpeech } from '@/services/speech';
import type { FrequentNewCard } from '@/hooks/use-cards';
import { useAutoPlayWord } from '@/hooks/use-settings';

const RATINGS: { label: string; rating: ReviewRating; color: string }[] = [
  { label: 'Again', rating: Rating.Again, color: Ratings.again },
  { label: 'Hard', rating: Rating.Hard, color: Ratings.hard },
  { label: 'Good', rating: Rating.Good, color: Ratings.good },
  { label: 'Easy', rating: Rating.Easy, color: Ratings.easy },
];

export type StudySessionProps = {
  loading: boolean;
  error: Error | null;
  dueCards: Card[];
  refetch: () => Promise<void>;
  /** Optional frequency-weighted "seen often" rail rendered above the card. */
  suggested?: FrequentNewCard[];
  /** Headline shown when no cards are due. */
  emptyTitle: string;
  /** Body copy under `emptyTitle`. */
  emptyBody: string;
};

/**
 * Shared study UI. Renders a flippable card with FSRS rating buttons and
 * tracks queue progression locally so mid-session tab-switches or query
 * refetches don't shuffle the order. Used by both the global Study tab
 * (`app/(tabs)/study.tsx`) and per-folder study (`app/study-folder/[slug].tsx`).
 */
export function StudySession({
  loading,
  error,
  dueCards,
  refetch,
  suggested,
  emptyTitle,
  emptyBody,
}: StudySessionProps) {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const onTint = Colors[colorScheme].background;

  const [queue, setQueue] = useState<Card[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  // Driven by expo-speech callbacks. Controls the pulsing halo on the inline
  // speaker icon next to the lemma — true while audio is actually playing.
  const [isPlayingWord, setIsPlayingWord] = useState(false);
  const haloAnim = useRef(new Animated.Value(0)).current;
  // Persistent "auto-play the lemma when the card flips" preference. Mirror
  // it into a ref so the auto-play effect can read the latest value without
  // re-running (and interrupting in-flight audio) every time the user
  // toggles the speaker icon mid-card. The toggle takes effect on the NEXT
  // flip rather than disturbing the current playback.
  const { enabled: autoPlayWord, setEnabled: setAutoPlayWord } = useAutoPlayWord();
  const autoPlayRef = useRef(autoPlayWord);
  autoPlayRef.current = autoPlayWord;

  // Snapshot the queue once, the first time we have data. Re-rendering
  // mid-session (a tab switch causing a re-query) must NOT reshuffle order.
  useEffect(() => {
    if (queue === null && !loading && dueCards.length > 0) {
      setQueue(dueCards);
    }
  }, [queue, loading, dueCards]);

  // The current card is computed below; capture its id + lemma here so the
  // auto-play effect's dependencies are primitive (the card object itself
  // wouldn't be a stable identity across renders).
  const currentCard = queue && index < queue.length ? queue[index] : null;
  const currentLemma = currentCard?.lemma ?? null;
  const currentCardId = currentCard?.id ?? null;

  // Auto-play the lemma the moment the back of the card is revealed. Gated
  // by the persistent `autoPlayWord` setting (read via ref so a mid-card
  // toggle doesn't disturb in-flight audio). Tapping the inline speaker
  // icon below always replays the word regardless of the setting.
  useEffect(() => {
    if (!revealed || !currentLemma) return;
    if (!autoPlayRef.current) return;
    stopSpeech();
    speakGerman(currentLemma, {
      onStart: () => setIsPlayingWord(true),
      onDone: () => setIsPlayingWord(false),
      onStopped: () => setIsPlayingWord(false),
      onError: () => setIsPlayingWord(false),
    });
    return () => {
      stopSpeech();
      setIsPlayingWord(false);
    };
  }, [revealed, currentCardId, currentLemma]);

  // Loop a scale+opacity pulse on the halo behind the inline speaker while
  // the word is playing. Stops cleanly when playback ends and resets the
  // animated value so the next play starts from zero opacity.
  useEffect(() => {
    if (!isPlayingWord) {
      haloAnim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(haloAnim, { toValue: 1, duration: 550, useNativeDriver: true }),
        Animated.timing(haloAnim, { toValue: 0, duration: 550, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isPlayingWord, haloAnim]);

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
        {suggested && suggested.length > 0 && (
          <View style={styles.suggestedBlock}>
            <ThemedText type="subtitle" style={styles.suggestedHeader}>
              Suggested next
            </ThemedText>
            <SuggestedRail
              items={suggested}
              tint={tint}
              onTint={onTint}
              onTap={(c) => router.push(`/card/${c.id}`)}
            />
          </View>
        )}
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
            setRevealed(false);
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

  const replayWord = (e?: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.();
    if (!card.lemma) return;
    stopSpeech();
    speakGerman(card.lemma, {
      onStart: () => setIsPlayingWord(true),
      onDone: () => setIsPlayingWord(false),
      onStopped: () => setIsPlayingWord(false),
      onError: () => setIsPlayingWord(false),
    });
  };

  const playSentence = (e?: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.();
    if (!card.exampleDe) return;
    stopSpeech();
    speakGerman(card.exampleDe);
  };

  // Always show the English translation on the front. German lemma (+ gender,
  // example, etc.) is the answer revealed on the back — production-recall
  // direction, the user's preference.
  const frontWord = card.translationEn ?? card.lemma;

  const onRate = async (rating: ReviewRating) => {
    if (submitting) return;
    if (rating === Rating.Again) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else if (rating === Rating.Hard) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else if (rating === Rating.Good) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSubmitting(true);
    try {
      await rateCard(card.id, rating);
      setRevealed(false);
      setIndex((i) => i + 1);
      setSessionCount((n) => n + 1);
    } catch (e) {
      console.error('rateCard failed', e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      {suggested && suggested.length > 0 && (
        <SuggestedRail
          items={suggested}
          tint={tint}
          onTint={onTint}
          onTap={(c) => router.push(`/card/${c.id}`)}
        />
      )}
      <View style={styles.topBar}>
        <View style={styles.topBarSide} />
        <ThemedText style={styles.progress}>
          {index + 1} / {queue.length}
        </ThemedText>
        <View style={styles.topBarSide}>
          <Pressable
            onPress={() => setAutoPlayWord(!autoPlayWord)}
            hitSlop={10}
            accessibilityRole="switch"
            accessibilityState={{ checked: autoPlayWord }}
            accessibilityLabel={
              autoPlayWord ? 'Auto-play word: on. Tap to turn off.' : 'Auto-play word: off. Tap to turn on.'
            }
            style={styles.autoPlayToggle}>
            <IconSymbol
              name={autoPlayWord ? 'speaker.wave.2.fill' : 'speaker.slash.fill'}
              size={20}
              color={autoPlayWord ? tint : 'rgba(150,150,150,0.7)'}
            />
          </Pressable>
        </View>
      </View>

      <Pressable
        style={[styles.card, { borderColor: tint }]}
        onPress={() => setRevealed((r) => !r)}>
        {revealed ? (
          <View style={styles.back}>
            <View style={styles.lemmaRow}>
              {card.gender && <ThemedText style={styles.gender}>{card.gender}</ThemedText>}
              <ThemedText type="title" style={styles.lemma}>
                {card.lemma}
              </ThemedText>
              <Pressable
                onPress={(e) => replayWord(e)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`Replay pronunciation of ${card.lemma}`}
                style={styles.wordSpeakBtn}>
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.wordSpeakHalo,
                    { backgroundColor: tint },
                    {
                      opacity: haloAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 0.35],
                      }),
                      transform: [
                        {
                          scale: haloAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.7, 1.35],
                          }),
                        },
                      ],
                    },
                  ]}
                />
                <IconSymbol name="speaker.wave.2.fill" size={22} color={tint} />
              </Pressable>
            </View>
            {card.plural && (
              <ThemedText style={styles.plural}>plural: {card.plural}</ThemedText>
            )}
            {card.exampleDe && (
              <ThemedText style={styles.example}>{card.exampleDe}</ThemedText>
            )}
            {card.exampleEn && (
              <ThemedText style={styles.exampleEn}>{card.exampleEn}</ThemedText>
            )}
            {card.notes && <ThemedText style={styles.notes}>{card.notes}</ThemedText>}
            {card.exampleDe && (
              <Pressable
                onPress={(e) => playSentence(e)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Play example sentence"
                style={[styles.speakBtn, { borderColor: tint }]}>
                <IconSymbol name="speaker.wave.2.fill" size={20} color={tint} />
                <ThemedText style={[styles.speakBtnText, { color: tint }]}>Listen</ThemedText>
              </Pressable>
            )}
          </View>
        ) : (
          <>
            <ThemedText type="title" style={styles.lemma}>
              {frontWord}
            </ThemedText>
            <ThemedText style={styles.tapHint}>tap to reveal</ThemedText>
          </>
        )}
      </Pressable>

      <View style={styles.actions}>
        {revealed ? (
          RATINGS.map((r) => (
            <Pressable
              key={r.label}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel={`Rate ${r.label}`}
              style={[
                styles.ratingBtn,
                { backgroundColor: r.color },
                submitting && styles.btnDisabled,
              ]}
              onPress={() => onRate(r.rating)}>
              <ThemedText style={styles.ratingLabel}>{r.label}</ThemedText>
            </Pressable>
          ))
        ) : (
          <Pressable
            style={[styles.detailBtn, { borderColor: tint }]}
            onPress={() => router.push(`/card/${card.id}`)}>
            <ThemedText>View details</ThemedText>
          </Pressable>
        )}
      </View>
    </ThemedView>
  );
}

function SuggestedRail({
  items,
  tint,
  onTint,
  onTap,
}: {
  items: FrequentNewCard[];
  tint: string;
  onTint: string;
  onTap: (card: FrequentNewCard) => void;
}) {
  return (
    <View style={styles.rail}>
      <ThemedText style={styles.railLabel}>Seen often, not yet learned</ThemedText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railRow}>
        {items.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => onTap(c)}
            style={[styles.railChip, { borderColor: tint }]}>
            {c.gender && <ThemedText style={styles.railGender}>{c.gender}</ThemedText>}
            <ThemedText type="defaultSemiBold" style={styles.railLemma}>
              {c.lemma}
            </ThemedText>
            <View style={[styles.railBadge, { backgroundColor: tint }]}>
              <ThemedText style={[styles.railBadgeText, { color: onTint }]}>
                ×{c.sightingCount}
              </ThemedText>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  empty: { textAlign: 'center', opacity: 0.6, maxWidth: 320 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  topBarSide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  progress: { textAlign: 'center', opacity: 0.6 },
  autoPlayToggle: { padding: 4 },
  card: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  gender: { fontSize: 18, opacity: 0.7 },
  lemma: { fontSize: 40, lineHeight: 52, textAlign: 'center' },
  lemmaRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  tapHint: { opacity: 0.5, marginTop: 24 },
  back: { alignItems: 'center', gap: 10, marginTop: 8 },
  example: { textAlign: 'center', fontStyle: 'italic', marginTop: 12 },
  exampleEn: { textAlign: 'center', opacity: 0.6 },
  plural: { opacity: 0.6, marginTop: 4 },
  notes: {
    opacity: 0.75,
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 8,
  },
  actions: { flexDirection: 'row', gap: 8, marginTop: 16, justifyContent: 'space-between' },
  ratingBtn: { flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  ratingLabel: { color: 'white', fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
  speakBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  speakBtnText: { fontSize: 14, fontWeight: '600' },
  wordSpeakBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  wordSpeakHalo: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  detailBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  rail: { marginBottom: 12, gap: 6 },
  railLabel: { fontSize: 12, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.5 },
  railRow: { gap: 8, paddingRight: 8 },
  railChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 999,
  },
  railGender: { fontSize: 13, opacity: 0.6 },
  railLemma: { fontSize: 15 },
  railBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  railBadgeText: { fontSize: 11, fontWeight: '700' },
  suggestedBlock: { width: '100%', marginTop: 24, gap: 8 },
  suggestedHeader: { textAlign: 'center', fontSize: 16, opacity: 0.85 },
});
