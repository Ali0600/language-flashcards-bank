import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActionSheetIOS,
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
import { FOLDER_ICONS, FOLDER_LABELS, type AnyFolderSlug } from '@/constants/folders';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLibrary, type LibrarySort, type CardWithFreq } from '@/hooks/use-cards';
import { useFolders, type FolderSummary } from '@/hooks/use-folders';

type ViewMode = 'cards' | 'folders';

const SORTS: { key: LibrarySort; label: string }[] = [
  { key: 'frequency', label: 'Frequency' },
  { key: 'alphabetical', label: 'A–Z' },
  { key: 'due', label: 'Due' },
];

const MODES: { key: ViewMode; label: string }[] = [
  { key: 'cards', label: 'Cards' },
  { key: 'folders', label: 'Folders' },
];

export default function LibraryScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const textColor = Colors[colorScheme].text;
  const bgColor = Colors[colorScheme].background;
  // Default to the Folders view — the Cards list is overwhelming on first
  // open, while Folders gives a high-level sense of what's been captured.
  const [mode, setMode] = useState<ViewMode>('folders');
  const [sort, setSort] = useState<LibrarySort>('frequency');
  const [query, setQuery] = useState('');
  const [folderFilter, setFolderFilter] = useState<AnyFolderSlug | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const library = useLibrary(sort, folderFilter);
  const folders = useFolders();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return library.data;
    return library.data.filter((c) => {
      if (c.lemma.toLowerCase().includes(q)) return true;
      if (c.translationEn && c.translationEn.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [library.data, query]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      if (mode === 'cards') await library.refetch();
      else await folders.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.modeSwitch}>
          {MODES.map((m) => (
            <Pressable
              key={m.key}
              onPress={() => setMode(m.key)}
              style={[
                styles.modeChip,
                { borderColor: tint },
                mode === m.key && { backgroundColor: tint },
              ]}>
              <ThemedText
                style={[styles.modeChipText, mode === m.key && { color: bgColor }]}>
                {m.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>
        <Pressable
          onPress={() => router.push('/settings' as never)}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          style={[styles.gearBtn, { borderColor: tint }]}>
          <IconSymbol name="gearshape.fill" size={20} color={tint} />
        </Pressable>
      </View>

      {mode === 'cards' ? (
        <CardsView
          tint={tint}
          textColor={textColor}
          bgColor={bgColor}
          query={query}
          setQuery={setQuery}
          sort={sort}
          setSort={setSort}
          folderFilter={folderFilter}
          setFolderFilter={setFolderFilter}
          availableFolders={folders.data}
          loading={library.loading}
          error={library.error}
          data={library.data}
          filtered={filtered}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onCardPress={(id) => router.push(`/card/${id}`)}
        />
      ) : (
        <FoldersView
          tint={tint}
          loading={folders.loading}
          error={folders.error}
          data={folders.data}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onFolderPress={(slug) => router.push(`/folder/${slug}` as never)}
        />
      )}
    </ThemedView>
  );
}

function CardsView({
  tint,
  textColor,
  bgColor,
  query,
  setQuery,
  sort,
  setSort,
  folderFilter,
  setFolderFilter,
  availableFolders,
  loading,
  error,
  data,
  filtered,
  refreshing,
  onRefresh,
  onCardPress,
}: {
  tint: string;
  textColor: string;
  bgColor: string;
  query: string;
  setQuery: (q: string) => void;
  sort: LibrarySort;
  setSort: (s: LibrarySort) => void;
  folderFilter: AnyFolderSlug | null;
  setFolderFilter: (f: AnyFolderSlug | null) => void;
  availableFolders: FolderSummary[];
  loading: boolean;
  error: Error | null;
  data: CardWithFreq[];
  filtered: CardWithFreq[];
  refreshing: boolean;
  onRefresh: () => void;
  onCardPress: (id: string) => void;
}) {
  const openFolderPicker = () => {
    if (availableFolders.length === 0) return;
    const slugs: (AnyFolderSlug | null)[] = [null, ...availableFolders.map((f) => f.slug)];
    const options = ['All folders', ...availableFolders.map((f) => f.label), 'Cancel'];
    const cancelButtonIndex = options.length - 1;
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Filter by folder',
        options,
        cancelButtonIndex,
      },
      (selectedIndex) => {
        if (selectedIndex === cancelButtonIndex) return;
        if (selectedIndex < 0 || selectedIndex >= slugs.length) return;
        setFolderFilter(slugs[selectedIndex] ?? null);
      },
    );
  };

  const folderChipLabel =
    folderFilter ? FOLDER_LABELS[folderFilter] ?? 'Folder' : 'All folders';
  const folderChipActive = folderFilter !== null;

  return (
    <>
      <View style={[styles.search, { borderColor: tint }]}>
        <TextInput
          style={[styles.searchInput, { color: textColor }]}
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
              style={[styles.sortChipText, sort === s.key && { color: bgColor }]}>
              {s.label}
            </ThemedText>
          </Pressable>
        ))}
        <Pressable
          onPress={openFolderPicker}
          disabled={availableFolders.length === 0}
          accessibilityRole="button"
          accessibilityLabel={`Filter by folder, currently ${folderChipLabel}`}
          style={[
            styles.sortChip,
            styles.folderFilterChip,
            { borderColor: tint },
            folderChipActive && { backgroundColor: tint },
            availableFolders.length === 0 && styles.folderFilterChipDisabled,
          ]}>
          <IconSymbol
            name="folder.fill"
            size={12}
            color={folderChipActive ? bgColor : tint}
          />
          <ThemedText
            style={[
              styles.sortChipText,
              folderChipActive && { color: bgColor },
            ]}
            numberOfLines={1}>
            {folderChipLabel}
          </ThemedText>
          {folderChipActive && (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                setFolderFilter(null);
              }}
              hitSlop={8}>
              <IconSymbol
                name="xmark.circle.fill"
                size={14}
                color={bgColor}
              />
            </Pressable>
          )}
        </Pressable>
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
            <CardRow item={item} onPress={() => onCardPress(item.id)} />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tint} />
          }
        />
      )}
    </>
  );
}

function FoldersView({
  tint,
  loading,
  error,
  data,
  refreshing,
  onRefresh,
  onFolderPress,
}: {
  tint: string;
  loading: boolean;
  error: Error | null;
  data: FolderSummary[];
  refreshing: boolean;
  onRefresh: () => void;
  onFolderPress: (slug: string) => void;
}) {
  if (loading) {
    return <ActivityIndicator style={{ marginTop: 32 }} />;
  }
  if (error) {
    return <ThemedText style={styles.error}>Error: {error.message}</ThemedText>;
  }
  if (data.length === 0) {
    return (
      <ThemedText style={styles.empty}>
        No folders yet — capture a photo and we&apos;ll organize it for you.
      </ThemedText>
    );
  }
  return (
    <FlatList
      data={data}
      keyExtractor={(f) => f.slug}
      numColumns={2}
      columnWrapperStyle={styles.folderRow}
      contentContainerStyle={styles.folderGrid}
      renderItem={({ item }) => (
        <FolderTile item={item} tint={tint} onPress={() => onFolderPress(item.slug)} />
      )}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tint} />
      }
    />
  );
}

function FolderTile({
  item,
  tint,
  onPress,
}: {
  item: FolderSummary;
  tint: string;
  onPress: () => void;
}) {
  const icon = FOLDER_ICONS[item.slug] ?? 'square.stack.fill';
  return (
    <Pressable style={[styles.folderTile, { borderColor: tint }]} onPress={onPress}>
      <View style={[styles.folderIcon, { backgroundColor: tint + '22' }]}>
        <IconSymbol name={icon} size={28} color={tint} />
      </View>
      <ThemedText type="defaultSemiBold" style={styles.folderLabel} numberOfLines={2}>
        {item.label}
      </ThemedText>
      <ThemedText style={styles.folderCount}>
        {item.cardCount} card{item.cardCount === 1 ? '' : 's'}
      </ThemedText>
    </Pressable>
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
  modeSwitch: { flex: 1, flexDirection: 'row', gap: 8 },
  modeChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  modeChipText: { fontSize: 14, fontWeight: '600' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    height: 38,
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 15 },
  clearBtn: { padding: 4 },
  gearBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  sortChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  sortChipText: { fontSize: 14 },
  folderFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 220,
  },
  folderFilterChipDisabled: { opacity: 0.4 },
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
  folderGrid: { paddingBottom: 24, gap: 12 },
  folderRow: { gap: 12 },
  folderTile: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    minHeight: 130,
    gap: 8,
    justifyContent: 'space-between',
  },
  folderIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderLabel: { fontSize: 15, lineHeight: 20 },
  folderCount: { fontSize: 13, opacity: 0.6 },
});
