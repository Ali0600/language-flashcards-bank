import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useScan, type ScanRow } from '@/hooks/use-scan';
import { addLemmasToIgnoreList } from '@/services/ignored';
import { removeSighting } from '@/services/sighting';

export default function ScanResultsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const onTint = Colors[colorScheme].background;
  const { loading, data, error } = useScan(id);
  const { photo, rows } = data;
  // Default state: every row is checked. We only track the UNCHECKED ids so a
  // fresh scan with no toggles has an empty set and Done is a fast-path nav.
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const toggle = (sightingId: string) => {
    setUnchecked((prev) => {
      const next = new Set(prev);
      if (next.has(sightingId)) next.delete(sightingId);
      else next.add(sightingId);
      return next;
    });
  };

  const applyRemovals = async (alsoIgnore: boolean) => {
    if (submitting) return;
    const uncheckedRows = rows.filter((r) => unchecked.has(r.sightingId));
    setSubmitting(true);
    try {
      // Remove sightings one at a time — each is its own transaction so a
      // partial failure leaves the DB consistent.
      for (const r of uncheckedRows) {
        await removeSighting(r.sightingId);
      }
      if (alsoIgnore && uncheckedRows.length > 0) {
        await addLemmasToIgnoreList(uncheckedRows.map((r) => r.lemma));
      }
      router.dismissTo('/(tabs)');
    } catch (e) {
      Alert.alert('Could not apply changes', e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const onDone = () => {
    if (unchecked.size === 0) {
      router.dismissTo('/(tabs)');
      return;
    }
    const uncheckedRows = rows.filter((r) => unchecked.has(r.sightingId));
    const lemmaList = uncheckedRows
      .map((r) => r.lemma)
      .slice(0, 5)
      .join(', ');
    const more = uncheckedRows.length > 5 ? ` and ${uncheckedRows.length - 5} more` : '';
    Alert.alert(
      `Remove ${uncheckedRows.length} word${uncheckedRows.length === 1 ? '' : 's'}?`,
      `${lemmaList}${more} will be removed from this scan. Also add them to the ignore list so they don't appear in future scans?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Just remove from scan', onPress: () => applyRemovals(false) },
        { text: 'Add to ignore list', onPress: () => applyRemovals(true) },
      ],
    );
  };

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
        {rows.length > 0 && (
          <ThemedText style={styles.subtle}>
            Uncheck any you don&apos;t want as flashcards.
          </ThemedText>
        )}
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
            <Row
              item={item}
              tint={tint}
              onTint={onTint}
              checked={!unchecked.has(item.sightingId)}
              onToggle={() => toggle(item.sightingId)}
              onPress={() => router.push(`/card/${item.cardId}`)}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.list}
        />
      )}

      <Pressable
        style={[styles.doneBtn, { backgroundColor: tint }, submitting && styles.doneBtnDisabled]}
        onPress={onDone}
        disabled={submitting}>
        <ThemedText style={[styles.doneBtnText, { color: onTint }]}>
          {submitting ? 'Saving…' : 'Done'}
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

function Row({
  item,
  tint,
  onTint,
  checked,
  onToggle,
  onPress,
}: {
  item: ScanRow;
  tint: string;
  onTint: string;
  checked: boolean;
  onToggle: () => void;
  onPress: () => void;
}) {
  const isNew = item.totalSightings === 1;
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onToggle}
        hitSlop={8}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={`${checked ? 'Uncheck' : 'Check'} ${item.lemma}`}
        style={styles.checkbox}>
        <IconSymbol
          name={checked ? 'checkmark.circle.fill' : 'circle'}
          size={24}
          color={checked ? tint : 'rgba(150, 150, 150, 0.7)'}
        />
      </Pressable>
      <Pressable
        style={[styles.rowBody, !checked && styles.rowBodyMuted]}
        onPress={onPress}>
        <View style={styles.rowLeft}>
          <View style={styles.titleLine}>
            {item.gender && <ThemedText style={styles.gender}>{item.gender}</ThemedText>}
            <ThemedText type="defaultSemiBold" style={styles.lemma}>
              {item.lemma}
            </ThemedText>
            {item.surfaceForm.toLowerCase() !== item.lemma.toLowerCase() && (
              <ThemedText style={styles.surface}>· &ldquo;{item.surfaceForm}&rdquo;</ThemedText>
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
              <ThemedText style={[styles.badgeText, { color: onTint }]}>NEW</ThemedText>
            </View>
          ) : (
            <ThemedText style={styles.subtle}>×{item.totalSightings}</ThemedText>
          )}
        </View>
      </Pressable>
    </View>
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
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8 },
  checkbox: { padding: 6 },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 12 },
  rowBodyMuted: { opacity: 0.4 },
  rowLeft: { flex: 1, gap: 4 },
  titleLine: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 4 },
  gender: { opacity: 0.6, fontSize: 15 },
  lemma: { fontSize: 18 },
  surface: { opacity: 0.5, fontSize: 14 },
  translation: { opacity: 0.7, fontSize: 14 },
  rowRight: { alignItems: 'flex-end', justifyContent: 'center' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '700' },
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
  doneBtnDisabled: { opacity: 0.5 },
  doneBtnText: { fontWeight: '600', fontSize: 16 },
});
