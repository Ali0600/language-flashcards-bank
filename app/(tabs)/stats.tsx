import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useStats } from '@/hooks/use-stats';

export default function StatsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const { stats, loading } = useStats();

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.grid}>
        <Tile label="Total cards" value={stats.totalCards} tint={tint} />
        <Tile label="Photos taken" value={stats.totalPhotos} tint={tint} />
        <Tile label="Total reviews" value={stats.totalReviews} tint={tint} />
        <Tile label="Reviews today" value={stats.reviewsToday} tint={tint} />
      </View>

      <Section title="Card states">
        <Bar label="New" value={stats.breakdown.new} total={stats.totalCards} tint="#888" />
        <Bar
          label="Learning"
          value={stats.breakdown.learning}
          total={stats.totalCards}
          tint="#F39C12"
        />
        <Bar
          label="Review"
          value={stats.breakdown.review}
          total={stats.totalCards}
          tint="#27AE60"
        />
        <Bar
          label="Relearning"
          value={stats.breakdown.relearning}
          total={stats.totalCards}
          tint="#E74C3C"
        />
      </Section>

      <Section title="Word sightings">
        <ThemedText style={styles.subtle}>
          {stats.totalSightings} total sightings across {stats.totalPhotos} photo
          {stats.totalPhotos === 1 ? '' : 's'}
        </ThemedText>
      </Section>

      {stats.topFrequency.length > 0 && (
        <Section title="Most-seen, not yet learned">
          {stats.topFrequency.map((row) => (
            <Pressable
              key={row.cardId}
              onPress={() => router.push(`/card/${row.cardId}`)}
              style={styles.topRow}>
              <View style={styles.topRowLeft}>
                {row.gender && <ThemedText style={styles.gender}>{row.gender}</ThemedText>}
                <ThemedText type="defaultSemiBold">{row.lemma}</ThemedText>
              </View>
              <View style={[styles.badge, { backgroundColor: tint }]}>
                <ThemedText style={styles.badgeText}>×{row.sightingCount}</ThemedText>
              </View>
            </Pressable>
          ))}
        </Section>
      )}
    </ScrollView>
  );
}

function Tile({ label, value, tint }: { label: string; value: number; tint: string }) {
  return (
    <View style={[styles.tile, { borderColor: tint }]}>
      <ThemedText style={styles.tileValue}>{value}</ThemedText>
      <ThemedText style={styles.tileLabel}>{label}</ThemedText>
    </View>
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

function Bar({ label, value, total, tint }: { label: string; value: number; total: number; tint: string }) {
  const pct = total > 0 ? Math.max(2, (value / total) * 100) : 0;
  return (
    <View style={styles.barWrap}>
      <View style={styles.barLabel}>
        <ThemedText style={styles.barLabelText}>{label}</ThemedText>
        <ThemedText style={styles.barLabelValue}>{value}</ThemedText>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: tint }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    flexBasis: '48%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  tileValue: { fontSize: 28, fontWeight: '600' },
  tileLabel: { opacity: 0.6, fontSize: 13 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 16, marginBottom: 4 },
  subtle: { opacity: 0.7, fontSize: 14 },
  barWrap: { gap: 4 },
  barLabel: { flexDirection: 'row', justifyContent: 'space-between' },
  barLabelText: { fontSize: 13 },
  barLabelValue: { fontSize: 13, opacity: 0.7 },
  barTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(150, 150, 150, 0.2)',
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 4 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  topRowLeft: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  gender: { opacity: 0.6, fontSize: 14 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { color: 'white', fontSize: 12, fontWeight: '700' },
});
