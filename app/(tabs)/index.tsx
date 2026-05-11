import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLibrary, type LibrarySort, type CardWithFreq } from '@/hooks/use-cards';

const SORTS: { key: LibrarySort; label: string }[] = [
  { key: 'frequency', label: 'Frequency' },
  { key: 'alphabetical', label: 'A–Z' },
  { key: 'due', label: 'Due' },
];

export default function LibraryScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const [sort, setSort] = useState<LibrarySort>('frequency');
  const { loading, data, error } = useLibrary(sort);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.sortRow}>
        {SORTS.map((s) => (
          <Pressable
            key={s.key}
            onPress={() => setSort(s.key)}
            style={[
              styles.sortChip,
              { borderColor: tint },
              sort === s.key && { backgroundColor: tint },
            ]}>
            <ThemedText
              style={[
                styles.sortChipText,
                sort === s.key && { color: 'white' },
              ]}>
              {s.label}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : error ? (
        <ThemedText style={styles.error}>Error: {error.message}</ThemedText>
      ) : data.length === 0 ? (
        <ThemedText style={styles.empty}>No cards yet — capture a photo to start.</ThemedText>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <CardRow item={item} onPress={() => router.push(`/card/${item.id}`)} />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </ThemedView>
  );
}

function CardRow({ item, onPress }: { item: CardWithFreq; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={styles.rowLeft}>
        <View style={styles.rowTitleLine}>
          {item.gender && <ThemedText style={styles.gender}>{item.gender}</ThemedText>}
          <ThemedText type="defaultSemiBold" style={styles.lemma}>
            {item.lemma}
          </ThemedText>
        </View>
        {item.translationEn && (
          <ThemedText style={styles.translation} numberOfLines={1}>
            {item.translationEn}
          </ThemedText>
        )}
      </View>
      <View style={styles.rowRight}>
        <ThemedText style={styles.freq}>×{item.sightingCount}</ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  sortRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  sortChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  sortChipText: { fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 12,
  },
  rowLeft: { flex: 1, gap: 4 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  gender: { opacity: 0.6, fontSize: 15 },
  lemma: { fontSize: 18 },
  translation: { opacity: 0.7, fontSize: 14 },
  rowRight: { alignItems: 'flex-end' },
  freq: { fontVariant: ['tabular-nums'], opacity: 0.6 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: '#888', opacity: 0.2 },
  empty: { textAlign: 'center', marginTop: 48, opacity: 0.6 },
  error: { color: 'red', marginTop: 32 },
});
