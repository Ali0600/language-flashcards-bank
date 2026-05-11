import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
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
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const { loading, data, error, refetch } = useLibrary(sort);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data;
    return data.filter((c) => {
      if (c.lemma.toLowerCase().includes(q)) return true;
      if (c.translationEn && c.translationEn.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [data, query]);

  const onRefresh = async () => {
    setRefreshing(true);
    refetch();
    setTimeout(() => setRefreshing(false), 400);
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.topRow}>
        <View style={[styles.search, { borderColor: tint }]}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search lemma or translation"
            placeholderTextColor="rgba(150,150,150,0.7)"
            autoCapitalize="none"
            autoCorrect={false}
            value={query}
            onChangeText={setQuery}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} style={styles.clearBtn}>
              <IconSymbol name="xmark.circle.fill" size={18} color="rgba(150,150,150,0.8)" />
            </Pressable>
          )}
        </View>
        <Pressable
          onPress={() => router.push('/settings' as never)}
          style={[styles.gearBtn, { borderColor: tint }]}>
          <IconSymbol name="gearshape.fill" size={18} color={tint} />
        </Pressable>
      </View>

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
      ) : filtered.length === 0 ? (
        <ThemedText style={styles.empty}>No cards match &ldquo;{query}&rdquo;.</ThemedText>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <CardRow item={item} onPress={() => router.push(`/card/${item.id}`)} />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tint} />}
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
          <ThemedText type="defaultSemiBold" style={styles.lemma} numberOfLines={1}>
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
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    height: 38,
  },
  searchInput: { flex: 1, fontSize: 15 },
  clearBtn: { padding: 4 },
  gearBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
