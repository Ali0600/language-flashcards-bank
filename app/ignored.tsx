import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useIgnoredWords } from '@/hooks/use-ignored';
import { removeLemmaFromIgnoreList } from '@/services/ignored';

export default function IgnoredWordsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const onTint = Colors[colorScheme].background;
  const { loading, data: words, refetch } = useIgnoredWords();
  const [removingLemma, setRemovingLemma] = useState<string | null>(null);

  const onRemove = async (lemma: string) => {
    if (removingLemma) return;
    setRemovingLemma(lemma);
    try {
      await removeLemmaFromIgnoreList(lemma);
      await refetch();
    } catch (e) {
      Alert.alert('Could not remove', e instanceof Error ? e.message : String(e));
    } finally {
      setRemovingLemma(null);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText style={styles.help}>
          Words you&apos;ve told the app to skip. Removing one here means future
          photos containing it will create flashcards again.
        </ThemedText>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : words.length === 0 ? (
        <ThemedText style={styles.empty}>
          No words ignored yet. You can add words from the Scan Results screen.
        </ThemedText>
      ) : (
        <FlatList
          data={words}
          keyExtractor={(w) => w.lemma}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <ThemedText type="defaultSemiBold" style={styles.lemma}>
                  {item.lemma}
                </ThemedText>
                <ThemedText style={styles.added}>
                  added {new Date(item.addedAt).toLocaleDateString()}
                </ThemedText>
              </View>
              <Pressable
                onPress={() => onRemove(item.lemma)}
                disabled={removingLemma === item.lemma}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${item.lemma} from ignore list`}
                style={[styles.removeBtn, { borderColor: tint }]}>
                {removingLemma === item.lemma ? (
                  <ActivityIndicator size="small" color={tint} />
                ) : (
                  <ThemedText style={[styles.removeBtnText, { color: tint }]}>Remove</ThemedText>
                )}
              </Pressable>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.list}
        />
      )}

      <Pressable style={[styles.doneBtn, { backgroundColor: tint }]} onPress={() => router.back()}>
        <ThemedText style={[styles.doneBtnText, { color: onTint }]}>Done</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  help: { opacity: 0.7, fontSize: 14, lineHeight: 20 },
  empty: { textAlign: 'center', marginTop: 48, opacity: 0.6, paddingHorizontal: 32 },
  list: { paddingHorizontal: 16, paddingBottom: 80 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  rowLeft: { flex: 1, gap: 2 },
  lemma: { fontSize: 16 },
  added: { fontSize: 12, opacity: 0.55 },
  removeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 80,
    alignItems: 'center',
  },
  removeBtnText: { fontSize: 14, fontWeight: '600' },
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
  doneBtnText: { fontWeight: '600', fontSize: 16 },
});
