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
  useCategoryTotals,
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
  const onTint = Colors[colorScheme].background;

  const parentSupportsSubCats = hasSubCategories(slug);
  // sub param present means we're in mode #3 (card list filtered by sub).
  // Sentinel values:
  //   'null' — Uncategorized bucket within this parent
  //   'all'  — all cards across the parent regardless of sub-cat
  // Otherwise the param is a specific sub-category id.
  const subFilterActive = parentSupportsSubCats && typeof sub === 'string';

  if (parentSupportsSubCats && !subFilterActive) {
    return <SubCategoryGrid slug={slug} tint={tint} />;
  }

  // Translate the query param into the subId shape `CardsList` expects.
  // `false` = no sub-cat filter (use useFolderCards). string = specific id.
  // null = the Uncategorized bucket.
  let subId: false | string | null;
  let viewMode: 'flat' | 'all' | 'one' | 'uncat' = 'flat';
  if (!subFilterActive) {
    subId = false;
    viewMode = 'flat';
  } else if (sub === 'all') {
    subId = false;
    viewMode = 'all';
  } else if (sub === 'null') {
    subId = null;
    viewMode = 'uncat';
  } else {
    subId = sub as string;
    viewMode = 'one';
  }

  // Study button mirrors the folder URL so the underlying scope is identical.
  // `sub=all` translates to "no sub-cat filter" in `useFolderDueCards` too.
  const studyPath = (() => {
    if (typeof sub === 'string') return `/study-folder/${slug}?sub=${sub}`;
    return `/study-folder/${slug}`;
  })();

  return (
    <CardsList
      slug={slug}
      subId={subId}
      viewMode={viewMode}
      tint={tint}
      onTint={onTint}
      onPressCard={(cardId) => router.push(`/card/${cardId}`)}
      onStudy={() => router.push(studyPath as never)}
    />
  );
}

/**
 * Mode 2: grid of sub-category tiles for a parent like `screenshots`. When
 * there's more than one sub-cat (or a sub-cat plus an Uncategorized bucket),
 * we prepend an "All" tile that shows every card in the parent regardless of
 * its sub-cat. Card count on the All tile is the *deduplicated* total — a
 * card seen across two sub-cats only counts once.
 */
function SubCategoryGrid({ slug, tint }: { slug: string; tint: string }) {
  const router = useRouter();
  const { loading, data, error, refetch } = useSubCategorySummaries(slug);
  const totalsQuery = useCategoryTotals(slug);
  const [refreshing, setRefreshing] = useState(false);
  const label = folderLabel(slug);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetch(), totalsQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  // Sentinel "All" pseudo-item for the FlatList. Real items are
  // SubCategorySummary; the All tile is rendered when there's more than one
  // bucket so it isn't redundant.
  type GridItem = { kind: 'all' } | { kind: 'sub'; summary: SubCategorySummary };
  const gridItems: GridItem[] = [];
  if (data.length > 1) gridItems.push({ kind: 'all' });
  for (const s of data) gridItems.push({ kind: 'sub', summary: s });

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
          data={gridItems}
          keyExtractor={(item) =>
            item.kind === 'all' ? '__all__' : (item.summary.subCategory?.id ?? '__uncat__')
          }
          numColumns={2}
          columnWrapperStyle={styles.folderRow}
          contentContainerStyle={styles.folderGrid}
          renderItem={({ item }) =>
            item.kind === 'all' ? (
              <AllTile
                cardCount={totalsQuery.data.cardCount}
                tint={tint}
                onPress={() => router.push(`/folder/${slug}?sub=all` as never)}
              />
            ) : (
              <SubCategoryTile
                item={item.summary}
                parentSlug={slug}
                tint={tint}
                onPress={() => {
                  const target =
                    item.summary.subCategory === null
                      ? `/folder/${slug}?sub=null`
                      : `/folder/${slug}?sub=${item.summary.subCategory.id}`;
                  router.push(target as never);
                }}
              />
            )
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tint} />
          }
        />
      )}
    </ThemedView>
  );
}

function AllTile({
  cardCount,
  tint,
  onPress,
}: {
  cardCount: number;
  tint: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`All apps, ${cardCount} card${cardCount === 1 ? '' : 's'}`}
      style={[styles.folderTile, { borderColor: tint }]}
      onPress={onPress}>
      <View style={[styles.folderIcon, { backgroundColor: tint + '22' }]}>
        <IconSymbol name="rectangle.stack.fill" size={26} color={tint} />
      </View>
      <ThemedText type="defaultSemiBold" style={styles.folderLabel} numberOfLines={2}>
        All apps
      </ThemedText>
      <ThemedText style={styles.folderCount}>
        {cardCount} card{cardCount === 1 ? '' : 's'}
      </ThemedText>
    </Pressable>
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
 * sub-categories OR we're showing "All" — both use `useFolderCards`. When
 * it's a string or null, we use the sub-cat-aware query.
 */
function CardsList({
  slug,
  subId,
  viewMode,
  tint,
  onTint,
  onPressCard,
  onStudy,
}: {
  slug: string;
  /** `false` = no sub-cat filter (flat or all-mode). `string | null` = filter active. */
  subId: false | string | null;
  viewMode: 'flat' | 'all' | 'one' | 'uncat';
  tint: string;
  onTint: string;
  onPressCard: (cardId: string) => void;
  onStudy: () => void;
}) {
  const flat = useFolderCards(slug);
  const subFiltered = useSubCategoryCards(slug, subId === false ? null : subId);
  const usingSubFilter = subId !== false;

  const { loading, data, error, refetch } = usingSubFilter ? subFiltered : flat;
  const [refreshing, setRefreshing] = useState(false);

  const label = (() => {
    switch (viewMode) {
      case 'flat':
        return folderLabel(slug);
      case 'all':
        return `${folderLabel(slug)} · All apps`;
      case 'uncat':
        return `${folderLabel(slug)} · Uncategorized`;
      case 'one':
        // For named sub-cats we don't have the name here without an extra
        // fetch; the items in `data` don't carry it. Fall back to a generic
        // header — the user came from the sub-cat tile so they know which one
        // they tapped.
        return folderLabel(slug);
    }
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
          // Leave room for the floating Study button so the last row isn't
          // hidden behind it.
          contentContainerStyle={styles.cardsListPad}
        />
      )}

      {cards.length > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Study cards in ${label}`}
          onPress={onStudy}
          style={[styles.studyBtn, { backgroundColor: tint }]}>
          <IconSymbol name="sparkles" size={18} color={onTint} />
          <ThemedText style={[styles.studyBtnText, { color: onTint }]}>Study</ThemedText>
        </Pressable>
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
  cardsListPad: { paddingBottom: 96 },
  studyBtn: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
  },
  studyBtnText: { fontWeight: '600', fontSize: 16 },
});
