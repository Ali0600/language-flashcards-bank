import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useDueCards, useFrequencyRanking, type FrequentNewCard } from '@/hooks/use-cards';
import { rateCard, type ReviewRating } from '@/services/review';
import { Rating } from '@/services/scheduler';

const RATINGS: { label: string; rating: ReviewRating; color: string }[] = [
  { label: 'Again', rating: Rating.Again, color: '#E74C3C' },
  { label: 'Hard', rating: Rating.Hard, color: '#F39C12' },
  { label: 'Good', rating: Rating.Good, color: '#27AE60' },
  { label: 'Easy', rating: Rating.Easy, color: '#2980B9' },
];

export default function StudyScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const { loading, data: dueCards, error } = useDueCards();
  const { data: suggested } = useFrequencyRanking(5);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);

  if (loading) {
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

  if (dueCards.length === 0) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText type="title">All caught up</ThemedText>
        <ThemedText style={styles.empty}>
          No cards are due right now. Snap a photo of some German text to add new vocabulary.
        </ThemedText>
        {suggested.length > 0 && (
          <View style={styles.suggestedBlock}>
            <ThemedText type="subtitle" style={styles.suggestedHeader}>
              Suggested next
            </ThemedText>
            <SuggestedRail items={suggested} tint={tint} onTap={(c) => router.push(`/card/${c.id}`)} />
          </View>
        )}
      </ThemedView>
    );
  }

  if (index >= dueCards.length) {
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
          }}>
          <ThemedText>Start over</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const card = dueCards[index];

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
      {suggested.length > 0 && (
        <SuggestedRail items={suggested} tint={tint} onTap={(c) => router.push(`/card/${c.id}`)} />
      )}
      <ThemedText style={styles.progress}>
        {index + 1} / {dueCards.length}
      </ThemedText>

      <Pressable
        style={[styles.card, { borderColor: tint }]}
        onPress={() => setRevealed((r) => !r)}>
        {card.gender && <ThemedText style={styles.gender}>{card.gender}</ThemedText>}
        <ThemedText type="title" style={styles.lemma}>
          {card.lemma}
        </ThemedText>
        {revealed ? (
          <View style={styles.back}>
            <ThemedText type="subtitle" style={styles.translation}>
              {card.translationEn}
            </ThemedText>
            {card.exampleDe && (
              <ThemedText style={styles.example}>{card.exampleDe}</ThemedText>
            )}
            {card.exampleEn && (
              <ThemedText style={styles.exampleEn}>{card.exampleEn}</ThemedText>
            )}
            {card.plural && (
              <ThemedText style={styles.plural}>plural: {card.plural}</ThemedText>
            )}
          </View>
        ) : (
          <ThemedText style={styles.tapHint}>tap to reveal</ThemedText>
        )}
      </Pressable>

      <View style={styles.actions}>
        {revealed ? (
          RATINGS.map((r) => (
            <Pressable
              key={r.label}
              disabled={submitting}
              style={[styles.ratingBtn, { backgroundColor: r.color }, submitting && styles.btnDisabled]}
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
  onTap,
}: {
  items: FrequentNewCard[];
  tint: string;
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
              <ThemedText style={styles.railBadgeText}>×{c.sightingCount}</ThemedText>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  empty: {
    textAlign: 'center',
    opacity: 0.6,
    maxWidth: 320,
  },
  progress: {
    textAlign: 'center',
    opacity: 0.6,
    marginBottom: 8,
  },
  card: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  gender: {
    fontSize: 18,
    opacity: 0.7,
  },
  lemma: {
    fontSize: 40,
    lineHeight: 52,
    textAlign: 'center',
  },
  tapHint: {
    opacity: 0.5,
    marginTop: 24,
  },
  back: {
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  translation: {
    textAlign: 'center',
  },
  example: {
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 12,
  },
  exampleEn: {
    textAlign: 'center',
    opacity: 0.6,
  },
  plural: {
    opacity: 0.6,
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    justifyContent: 'space-between',
  },
  ratingBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  ratingLabel: {
    color: 'white',
    fontWeight: '600',
  },
  btnDisabled: { opacity: 0.5 },
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
  railBadgeText: { color: 'white', fontSize: 11, fontWeight: '700' },
  suggestedBlock: { width: '100%', marginTop: 24, gap: 8 },
  suggestedHeader: { textAlign: 'center', fontSize: 16, opacity: 0.85 },
});
