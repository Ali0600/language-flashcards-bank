import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useScan, type ScanRow } from '@/hooks/use-scan';

export default function ScanResultsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const { loading, photo, rows, error } = useScan(id);

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
        <ThemedText>Could not load scan: {error.message}</ThemedText>
      </ThemedView>
    );
  }

  if (!photo) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText>Scan not found.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.summary}>
        <ThemedText type="subtitle">
          {rows.length} word{rows.length === 1 ? '' : 's'} extracted
        </ThemedText>
        <ThemedText style={styles.subtle}>
          via {photo.ocrSource === 'gemini-vision' ? 'Gemini Vision' : 'on-device OCR'}
        </ThemedText>
      </View>

      {rows.length === 0 ? (
        <View style={styles.empty}>
          <ThemedText style={styles.subtle}>
            No German content words found in this photo. Try a clearer photo with visible text.
          </ThemedText>
          {photo.rawOcrText && (
            <View style={styles.rawBox}>
              <ThemedText style={styles.rawLabel}>Raw OCR text:</ThemedText>
              <ThemedText style={styles.raw}>{photo.rawOcrText}</ThemedText>
            </View>
          )}
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.sightingId}
          renderItem={({ item }) => (
            <Row item={item} tint={tint} onPress={() => router.push(`/card/${item.cardId}`)} />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.list}
        />
      )}

      <Pressable
        style={[styles.doneBtn, { backgroundColor: tint }]}
        onPress={() => router.dismissTo('/(tabs)')}>
        <ThemedText style={styles.doneBtnText}>Done</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

function Row({
  item,
  tint,
  onPress,
}: {
  item: ScanRow;
  tint: string;
  onPress: () => void;
}) {
  const isNew = item.totalSightings === 1;
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.rowLeft}>
        <View style={styles.titleLine}>
          {item.gender && <ThemedText style={styles.gender}>{item.gender}</ThemedText>}
          <ThemedText type="defaultSemiBold" style={styles.lemma}>
            {item.lemma}
          </ThemedText>
          {item.surfaceForm.toLowerCase() !== item.lemma.toLowerCase() && (
            <ThemedText style={styles.surface}>· “{item.surfaceForm}”</ThemedText>
          )}
        </View>
        {item.translationEn && (
          <ThemedText style={styles.translation} numberOfLines={1}>
            {item.translationEn}
          </ThemedText>
        )}
      </View>
      <View style={styles.rowRight}>
        {isNew ? (
          <View style={[styles.badge, { backgroundColor: tint }]}>
            <ThemedText style={styles.badgeText}>NEW</ThemedText>
          </View>
        ) : (
          <ThemedText style={styles.subtle}>×{item.totalSightings}</ThemedText>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  summary: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, gap: 4 },
  subtle: { opacity: 0.6, fontSize: 14 },
  empty: { padding: 24, gap: 16, alignItems: 'center' },
  rawBox: { width: '100%', padding: 12, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.05)' },
  rawLabel: { fontSize: 12, opacity: 0.6, marginBottom: 6 },
  raw: { fontFamily: 'Courier', fontSize: 13 },
  list: { paddingHorizontal: 16, paddingBottom: 80 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  rowLeft: { flex: 1, gap: 4 },
  titleLine: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 4 },
  gender: { opacity: 0.6, fontSize: 15 },
  lemma: { fontSize: 18 },
  surface: { opacity: 0.5, fontSize: 14 },
  translation: { opacity: 0.7, fontSize: 14 },
  rowRight: { alignItems: 'flex-end', justifyContent: 'center' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { color: 'white', fontSize: 11, fontWeight: '700' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: '#888', opacity: 0.2 },
  doneBtn: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneBtnText: { color: 'white', fontWeight: '600', fontSize: 16 },
});
