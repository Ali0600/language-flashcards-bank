import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { HEATMAP_DAYS, useStats } from '@/hooks/use-stats';
import { exportCardsToCsv } from '@/services/export';
import type { DayBucket } from '@/services/streaks';

export default function StatsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const onTint = Colors[colorScheme].background;
  const { data: stats, loading, refetch } = useStats();
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const onExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await exportCardsToCsv();
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tint} />}>
      <View style={styles.grid}>
        <Tile label="Total cards" value={stats.totalCards} tint={tint} />
        <Tile label="Photos taken" value={stats.totalPhotos} tint={tint} />
        <Tile label="Total reviews" value={stats.totalReviews} tint={tint} />
        <Tile label="Reviews today" value={stats.reviewsToday} tint={tint} />
      </View>

      <Section title="Activity">
        <View style={styles.streakRow}>
          <View style={styles.streakBlock}>
            <ThemedText style={styles.streakValue}>{stats.currentStreak}</ThemedText>
            <ThemedText style={styles.streakLabel}>
              day{stats.currentStreak === 1 ? '' : 's'} current
            </ThemedText>
          </View>
          <View style={styles.streakBlock}>
            <ThemedText style={styles.streakValue}>{stats.longestStreak}</ThemedText>
            <ThemedText style={styles.streakLabel}>
              day{stats.longestStreak === 1 ? '' : 's'} longest
            </ThemedText>
          </View>
        </View>
        <Heatmap heatmap={stats.heatmap} tint={tint} />
        <ThemedText style={styles.heatmapHint}>Last {HEATMAP_DAYS} days</ThemedText>
      </Section>

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
                <ThemedText style={[styles.badgeText, { color: onTint }]}>
                  ×{row.sightingCount}
                </ThemedText>
              </View>
            </Pressable>
          ))}
        </Section>
      )}

      <Pressable
        onPress={onExport}
        disabled={exporting || stats.totalCards === 0}
        style={[
          styles.exportBtn,
          { borderColor: tint },
          (exporting || stats.totalCards === 0) && styles.exportBtnDisabled,
        ]}>
        <ThemedText style={{ color: tint, fontWeight: '600' }}>
          {exporting ? 'Exporting…' : 'Export cards to CSV'}
        </ThemedText>
      </Pressable>
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

function Heatmap({ heatmap, tint }: { heatmap: DayBucket[]; tint: string }) {
  // Layout: 12 columns × 7 rows. The right-most column contains today; the
  // grid is left-padded so today lands on the correct weekday row.
  // Heatmap is ordered oldest → newest. The last bucket is today.
  // We want columns going left (oldest) → right (today). Each column has 7
  // cells (Mon..Sun). The bottom-right of the rightmost column = today, with
  // earlier weekdays this week stacked above; cells after today in that
  // column are blank.
  const last = heatmap[heatmap.length - 1];
  if (!last) {
    return <View style={styles.heatmapPlaceholder} />;
  }
  // 0=Sun..6=Sat in JS; convert to Mon..Sun (0=Mon..6=Sun) for European convention.
  const todayDow = (new Date(`${last.date}T00:00:00`).getDay() + 6) % 7;
  const blanksAtEnd = 6 - todayDow;
  // Total cells we want: 12 weeks × 7 = 84. Left-pad if heatmap is shorter
  // than that. The last week is partially blank to align today on its weekday.
  const padded: (DayBucket | null)[] = [...heatmap];
  for (let i = 0; i < blanksAtEnd; i++) padded.push(null);
  // Pad leading nulls if needed to reach 7 × 12 = 84.
  while (padded.length < 84) padded.unshift(null);
  // Trim if somehow longer.
  while (padded.length > 84) padded.shift();

  const maxCount = heatmap.reduce((m, b) => Math.max(m, b.count), 0);

  // Build 7 rows of 12 cells. row i picks indices [i, i+7, i+14, ...] —
  // wait, no, that's column-major. Easier: iterate columns explicitly.
  const rows: ((DayBucket | null)[])[] = Array.from({ length: 7 }, () => []);
  for (let col = 0; col < 12; col++) {
    for (let row = 0; row < 7; row++) {
      const cell = padded[col * 7 + row] ?? null;
      rows[row]!.push(cell);
    }
  }

  const intensity = (n: number): number => {
    if (n <= 0 || maxCount <= 0) return 0;
    // Buckets: 1, 25%, 50%, 75%, 100%. Quantize to 4 levels.
    const pct = n / maxCount;
    if (pct >= 0.75) return 1;
    if (pct >= 0.5) return 0.75;
    if (pct >= 0.25) return 0.55;
    return 0.35;
  };

  return (
    <View style={styles.heatmap}>
      {rows.map((row, ri) => (
        <View key={ri} style={styles.heatmapRow}>
          {row.map((cell, ci) => (
            <View
              key={ci}
              style={[
                styles.heatmapCell,
                !cell && styles.heatmapCellBlank,
                cell && cell.count === 0 && styles.heatmapCellEmpty,
                cell && cell.count > 0 && {
                  backgroundColor: tint,
                  opacity: intensity(cell.count),
                },
              ]}
            />
          ))}
        </View>
      ))}
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
  tileValue: { fontSize: 28, fontWeight: '600', lineHeight: 36 },
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
  streakRow: { flexDirection: 'row', gap: 24, marginBottom: 4 },
  streakBlock: { gap: 2 },
  streakValue: { fontSize: 32, fontWeight: '700', lineHeight: 38 },
  streakLabel: { fontSize: 12, opacity: 0.6 },
  heatmap: { gap: 3 },
  heatmapRow: { flexDirection: 'row', gap: 3 },
  heatmapCell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 3,
  },
  heatmapCellEmpty: { backgroundColor: 'rgba(150, 150, 150, 0.15)' },
  heatmapCellBlank: { backgroundColor: 'transparent' },
  heatmapPlaceholder: { height: 80 },
  heatmapHint: { fontSize: 11, opacity: 0.5, marginTop: 4 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  topRowLeft: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  gender: { opacity: 0.6, fontSize: 14 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  exportBtn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  exportBtnDisabled: { opacity: 0.4 },
});
