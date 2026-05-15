import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  FOLDER_ICONS,
  folderLabel,
  hasSubCategories,
} from '@/constants/folders';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useFolderCards, type FolderCard } from '@/hooks/use-folders';
import {
  useSubCategoryCards,
  useSubCategorySummaries,
} from '@/hooks/use-subcategories';
import type { SubCategorySummary } from '@/services/subcategory';

/**
 * Single folder screen with three modes:
 *
 *   1. Parent slug doesn't support sub-categories → flat card list.
 *   2. Parent supports sub-categories, no `sub` query → sub-category grid
 *      (one tile per sub-cat, plus "Uncategorized" if any exist).
 *   3. Parent supports sub-categories, `sub` query present → flat card list
 *      filtered to that sub-cat (or to `sub_category_id IS NULL` for the
 *      "Uncategorized within this parent" bucket, encoded as `sub=null`).
 */
export default function FolderScreen() {
  const { slug, sub } = useLocalSearchParams<{ slug: string; sub?: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;

  const parentSupportsSubCats = hasSubCategories(slug);
  // sub param present means we're in mode #3 (card list filtered by sub).
  // The literal string 'null' means the Uncategorized bucket.
  const subFilterActive = parentSupportsSubCats && typeof sub === 'string';
  const subId: string | null | undefined = subFilterActive
    ? sub === 'null'
      ? null
      : sub
    : undefined;

  if (parentSupportsSubCats && !subFilterActive) {
    return <SubCategoryGrid slug={slug} tint={tint} />;
  }

  return (
    <CardsList
      slug={slug}
      subId={subId === undefined ? false : subId}
      tint={tint}
      onPressCard={(cardId) => router.push(`/card/${cardId}`)}
    />
  );
}

/**
 * Mode 2: grid of sub-category tiles for a parent like `screenshots`.
 */
function SubCategoryGrid({ slug, tint }: { slug: string; tint: string }) {
  const router = useRouter();
  const { loading, data, error, refetch } = useSubCategorySummaries(slug);
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
        <ThemedText style={styles.subtitle}>Pick an app to drill in.</ThemedText>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : error ? (
        <ThemedText style={styles.error}>Error: {error.message}</ThemedText>
      ) : data.length === 0 ? (
        <ThemedText style={styles.empty}>
          No apps yet. Categorize a screenshot scan to start one.
        </ThemedText>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(s) => (s.subCategory?.id ?? '__uncat__')}
          numColumns={2}
          columnWrapperStyle={styles.folderRow}
          contentContainerStyle={styles.folderGrid}
          renderItem={({ item }) => (
            <SubCategoryTile
              item={item}
              parentSlug={slug}
              tint={tint}
              onPress={() => {
                const target =
                  item.subCategory === null
                    ? `/folder/${slug}?sub=null`
                    : `/folder/${slug}?sub=${item.subCategory.id}`;
                router.push(target as never);
              }}
            />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tint} />
          }
        />
      )}
    </ThemedView>
  );
}

function SubCategoryTile({
  item,
  parentSlug,
  tint,
  onPress,
}: {
  item: SubCategorySummary;
  parentSlug: string;
  tint: string;
  onPress: () => void;
}) {
  const name =
    item.subCategory === null ? 'Uncategorized' : item.subCategory.name;
  // For the Uncategorized tile we use the parent's "uncategorized" icon to
  // match the rest of the app's visual vocabulary; otherwise the parent's own
  // icon (e.g. `iphone` for screenshots) so the tiles feel uniform.
  const icon =
    item.subCategory === null
      ? FOLDER_ICONS.uncategorized
      : FOLDER_ICONS[parentSlug as keyof typeof FOLDER_ICONS] ?? 'square.stack.fill';
  return (
    <Pressable style={[styles.folderTile, { borderColor: tint }]} onPress={onPress}>
      <View style={[styles.folderIcon, { backgroundColor: tint + '22' }]}>
        <IconSymbol name={icon} size={26} color={tint} />
      </View>
      <ThemedText type="defaultSemiBold" style={styles.folderLabel} numberOfLines={2}>
        {name}
      </ThemedText>
      <ThemedText style={styles.folderCount}>
        {item.cardCount} card{item.cardCount === 1 ? '' : 's'}
      </ThemedText>
    </Pressable>
  );
}

/**
 * Modes 1 + 3: flat card list. When `subId` is `false`, the parent has no
 * sub-categories and we use the original `useFolderCards`. When it's a string
 * or null, we use the sub-cat-aware query.
 */
function CardsList({
  slug,
  subId,
  tint,
  onPressCard,
}: {
  slug: string;
  /** `false` = no sub-cat filter (parent without sub-cats). `string | null` = filter active. */
  subId: false | string | null;
  tint: string;
  onPressCard: (cardId: string) => void;
}) {
  const flat = useFolderCards(slug);
  const subFiltered = useSubCategoryCards(slug, subId === false ? null : subId);
  const usingSubFilter = subId !== false;

  const { loading, data, error, refetch } = usingSubFilter ? subFiltered : flat;
  const [refreshing, setRefreshing] = useState(false);

  const label = (() => {
    if (!usingSubFilter) return folderLabel(slug);
    if (subId === null) return `${folderLabel(slug)} · Uncategorized`;
    // For named sub-cats we don't have the name here without an extra fetch;
    // the items in `data` don't carry it. Fall back to a generic header — the
    // user came from the sub-cat tile so they know which one they tapped.
    return folderLabel(slug);
  })();

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const cards = data as FolderCard[];

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="title" style={styles.title}>
          {label}
        </ThemedText>
        <ThemedText style={styles.subtitle}>
          {cards.length} card{cards.length === 1 ? '' : 's'}
        </ThemedText>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : error ? (
        <ThemedText style={styles.error}>Error: {error.message}</ThemedText>
      ) : cards.length === 0 ? (
        <ThemedText style={styles.empty}>No cards in this folder.</ThemedText>
      ) : (
        <FlatList
          data={cards}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <CardRow item={item} onPress={() => onPressCard(item.id)} />
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
        {/* sightingCount only exists on `FolderCard`; sub-cat query returns
            cards without it. Render only when present. */}
        {'sightingCount' in item && typeof item.sightingCount === 'number' && (
          <ThemedText style={styles.freq}>×{item.sightingCount}</ThemedText>
        )}
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
