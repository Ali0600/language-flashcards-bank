import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useCard, useCardSightings } from '@/hooks/use-cards';

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { loading, data: card, error } = useCard(id);
  const sightings = useCardSightings(id);

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (error || !card) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText>Card not found.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        {card.gender && <ThemedText style={styles.gender}>{card.gender}</ThemedText>}
        <ThemedText type="title">{card.lemma}</ThemedText>
        {card.plural && <ThemedText style={styles.plural}>plural: {card.plural}</ThemedText>}
        {card.pos && <ThemedText style={styles.pos}>{card.pos}</ThemedText>}
      </View>

      {card.translationEn && (
        <Section title="Translation">
          <ThemedText>{card.translationEn}</ThemedText>
        </Section>
      )}

      {card.exampleDe && (
        <Section title="Example">
          <ThemedText style={styles.exampleDe}>{card.exampleDe}</ThemedText>
          {card.exampleEn && (
            <ThemedText style={styles.exampleEn}>{card.exampleEn}</ThemedText>
          )}
        </Section>
      )}

      <Section title="Sightings">
        <ThemedText>
          Seen {sightings.length} time{sightings.length === 1 ? '' : 's'}
        </ThemedText>
        {sightings.slice(0, 5).map((s, i) => (
          <ThemedText key={`${s.photoId}-${i}`} style={styles.sighting}>
            {`"${s.surfaceForm}" — ${new Date(s.seenAt).toLocaleDateString()}`}
          </ThemedText>
        ))}
      </Section>

      <Section title="FSRS state">
        <ThemedText style={styles.mono}>
          state: {['New', 'Learning', 'Review', 'Relearning'][card.state] ?? card.state}
        </ThemedText>
        <ThemedText style={styles.mono}>
          due: {new Date(card.due).toLocaleString()}
        </ThemedText>
        <ThemedText style={styles.mono}>
          stability: {card.stability.toFixed(2)} · difficulty: {card.difficulty.toFixed(2)}
        </ThemedText>
        <ThemedText style={styles.mono}>
          reps: {card.reps} · lapses: {card.lapses}
        </ThemedText>
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="subtitle" style={styles.sectionTitle}>
        {title}
      </ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { gap: 6 },
  gender: { fontSize: 18, opacity: 0.7 },
  plural: { fontSize: 14, opacity: 0.7 },
  pos: { fontSize: 14, opacity: 0.6, fontStyle: 'italic' },
  section: { gap: 6 },
  sectionTitle: { fontSize: 16, marginBottom: 4 },
  exampleDe: { fontStyle: 'italic' },
  exampleEn: { opacity: 0.65 },
  sighting: { opacity: 0.7, fontSize: 14 },
  mono: { fontFamily: 'Courier', fontSize: 13, opacity: 0.7 },
});
