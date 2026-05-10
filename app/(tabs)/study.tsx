import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useDueCards } from '@/hooks/use-cards';

const RATINGS = [
  { label: 'Again', rating: 1, color: '#E74C3C' },
  { label: 'Hard', rating: 2, color: '#F39C12' },
  { label: 'Good', rating: 3, color: '#27AE60' },
  { label: 'Easy', rating: 4, color: '#2980B9' },
];

export default function StudyScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const { loading, data: dueCards, error } = useDueCards();
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

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
      </ThemedView>
    );
  }

  const card = dueCards[index % dueCards.length];
  const isLast = index >= dueCards.length - 1;

  const advance = () => {
    setRevealed(false);
    if (isLast) {
      setIndex(0);
    } else {
      setIndex((i) => i + 1);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.progress}>
        {index + 1} / {dueCards.length}
      </ThemedText>

      <Pressable
        style={[styles.card, { borderColor: tint }]}
        onPress={() => setRevealed((r) => !r)}>
        {card.gender && (
          <ThemedText style={styles.gender}>{card.gender}</ThemedText>
        )}
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
              style={[styles.ratingBtn, { backgroundColor: r.color }]}
              onPress={advance}>
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
  detailBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
});
