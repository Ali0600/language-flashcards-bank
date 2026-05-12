import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { folderLabel } from '@/constants/folders';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useFolderCards, type FolderCard } from '@/hooks/use-folders';

export default function FolderScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const { loading, data, error, refetch } = useFolderCards(slug);
  const [refreshing, setRefreshing] = useState(false);

  const label = folderLabel(slug);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="title" style={styles.title}>
          {label}
        </ThemedText>
        <ThemedText style={styles.subtitle}>
          {data.length} card{data.length === 1 ? '' : 's'}
        </ThemedText>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : error ? (
        <ThemedText style={styles.error}>Error: {error.message}</ThemedText>
      ) : data.length === 0 ? (
        <ThemedText style={styles.empty}>No cards in this folder.</ThemedText>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <CardRow item={item} onPress={() => router.push(`/card/${item.id}`)} />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tint} />
          }
        />
      )}
    </ThemedView>
  );
}

function CardRow({ item, onPress }: { item: FolderCard; onPress: () => void }) {
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
  header: { marginBottom: 12, gap: 4 },
  title: { fontSize: 26, lineHeight: 34 },
  subtitle: { opacity: 0.6, fontSize: 14 },
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
