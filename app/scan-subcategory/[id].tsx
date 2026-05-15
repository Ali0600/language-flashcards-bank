import { eq } from 'drizzle-orm';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { folderLabel } from '@/constants/folders';
import { Colors } from '@/constants/theme';
import { db } from '@/db/client';
import { photos, type Photo, type SubCategory } from '@/db/schema';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  createSubCategory,
  getSubCategoriesFor,
  setPhotoSubCategory,
} from '@/services/subcategory';

/**
 * Third (and final) step of the capture wizard: pick a sub-category for the
 * just-captured photo. Reached only for parent categories listed in
 * FOLDERS_WITH_SUBCATEGORIES (today: `screenshots`).
 *
 * The grid shows:
 *   1. A "Create new: <suggestion>" tile when Gemini named an app that has no
 *      existing sub-cat — tapping creates the row on save.
 *   2. One tile per existing sub-category, alphabetical.
 *   3. A "Skip" tile that leaves the photo without a sub-category (it lives
 *      under the parent's "Uncategorized within Screenshots" bucket).
 *
 * Reached via router.replace from scan-category, so back-navigation skips the
 * (now-stale) category screen and returns to wherever launched capture.
 */
export default function ScanSubCategoryScreen() {
  const { id, suggestion } = useLocalSearchParams<{ id: string; suggestion?: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const onTint = Colors[colorScheme].background;

  const [photo, setPhoto] = useState<Photo | null>(null);
  const [existing, setExisting] = useState<SubCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Selection state. Special sentinels:
  //   '__skip__' — explicit "no sub-category" choice
  //   '__new__'  — the "Create new: <suggestion>" tile
  // Otherwise: an existing SubCategory.id.
  const SKIP = '__skip__';
  const NEW = '__new__';
  const [selected, setSelected] = useState<string>(SKIP);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let cancelled = false;
      (async () => {
        try {
          const photoRows = await db
            .select()
            .from(photos)
            .where(eq(photos.id, id))
            .limit(1)
            .all();
          const p = photoRows[0] ?? null;
          // Parent slug == photo.category at this point. We trust the
          // category column rather than carrying it as another query param
          // so a re-entered screen always reflects DB truth.
          const parentSlug = p?.category ?? null;
          const subs = parentSlug ? await getSubCategoriesFor(parentSlug) : [];
          if (cancelled) return;
          setPhoto(p);
          setExisting(subs);
          // Pre-select what's already on the photo, else the Gemini suggestion
          // tile if there is one, else Skip.
          if (p?.subCategoryId) {
            setSelected(p.subCategoryId);
          } else if (suggestion && suggestion.trim().length > 0) {
            setSelected(NEW);
          } else {
            setSelected(SKIP);
          }
          setLoading(false);
        } catch {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [id, suggestion]),
  );

  const trimmedSuggestion = (suggestion ?? '').trim();
  const suggestionMatchesExisting = existing.some(
    (s) => s.name.toLowerCase() === trimmedSuggestion.toLowerCase(),
  );
  const showCreateTile = trimmedSuggestion.length > 0 && !suggestionMatchesExisting;

  // Tile list order: Create-new (if shown) → existing sub-cats → Skip.
  type Tile =
    | { kind: 'new'; id: string; name: string }
    | { kind: 'existing'; id: string; subCategory: SubCategory }
    | { kind: 'skip'; id: string };
  const tiles: Tile[] = [];
  if (showCreateTile) tiles.push({ kind: 'new', id: NEW, name: trimmedSuggestion });
  for (const s of existing) tiles.push({ kind: 'existing', id: s.id, subCategory: s });
  tiles.push({ kind: 'skip', id: SKIP });

  const onSave = async () => {
    if (!photo || saving) return;
    setSaving(true);
    try {
      let subIdToSet: string | null = null;
      if (selected === SKIP) {
        subIdToSet = null;
      } else if (selected === NEW) {
        if (!photo.category) {
          // Defensive — shouldn't happen because the user got here via
          // scan-category, which writes the category before forwarding.
          throw new Error('Photo has no parent category yet.');
        }
        subIdToSet = await createSubCategory(photo.category, trimmedSuggestion);
      } else {
        subIdToSet = selected;
      }
      // No-op fast path: skip the DB write when nothing changed.
      if (subIdToSet !== (photo.subCategoryId ?? null)) {
        await setPhotoSubCategory(photo.id, subIdToSet);
      }
      router.dismissTo('/(tabs)');
    } catch (e) {
      Alert.alert(
        'Could not save sub-category',
        e instanceof Error ? e.message : String(e),
      );
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
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

  const parentLabel = folderLabel(photo.category);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="subtitle">Pick an app</ThemedText>
        <ThemedText style={styles.subtle}>
          {showCreateTile
            ? `Gemini thinks this is from ${trimmedSuggestion}. Tap to confirm, pick a different ${parentLabel.toLowerCase()} app, or Skip.`
            : existing.length > 0
              ? `Pick which ${parentLabel.toLowerCase()} app this is, or Skip.`
              : `No apps saved yet. Skip for now — you can categorize later.`}
        </ThemedText>
      </View>

      <FlatList
        data={tiles}
        keyExtractor={(t) => t.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => (
          <SubCategoryTile
            tile={item}
            selected={item.id === selected}
            tint={tint}
            onTint={onTint}
            onPress={() => setSelected(item.id)}
          />
        )}
      />

      <Pressable
        style={[styles.saveBtn, { backgroundColor: tint }, saving && styles.saveBtnDisabled]}
        onPress={onSave}
        disabled={saving}>
        <ThemedText style={[styles.saveBtnText, { color: onTint }]}>
          {saving ? 'Saving…' : 'Save & Finish'}
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

function SubCategoryTile({
  tile,
  selected,
  tint,
  onTint,
  onPress,
}: {
  tile:
    | { kind: 'new'; id: string; name: string }
    | { kind: 'existing'; id: string; subCategory: SubCategory }
    | { kind: 'skip'; id: string };
  selected: boolean;
  tint: string;
  onTint: string;
  onPress: () => void;
}) {
  const label =
    tile.kind === 'new'
      ? tile.name
      : tile.kind === 'existing'
        ? tile.subCategory.name
        : 'Skip';
  const icon = tile.kind === 'skip' ? 'xmark.circle.fill' : 'square.stack.fill';
  const labelHint =
    tile.kind === 'new' ? 'Create new' : tile.kind === 'skip' ? 'No app tag' : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}${selected ? ', selected' : ''}${tile.kind === 'new' ? ', will be created' : ''}`}
      onPress={onPress}
      style={[
        styles.tile,
        { borderColor: tint, borderWidth: selected ? 2.5 : 1 },
        selected && { backgroundColor: tint + '14' },
      ]}>
      <View
        style={[
          styles.tileIcon,
          { backgroundColor: selected ? tint : tint + '22' },
        ]}>
        <IconSymbol name={icon} size={26} color={selected ? onTint : tint} />
      </View>
      <View style={styles.tileTextWrap}>
        {labelHint && <ThemedText style={styles.tileHint}>{labelHint}</ThemedText>}
        <ThemedText type="defaultSemiBold" style={styles.tileLabel} numberOfLines={2}>
          {label}
        </ThemedText>
      </View>
      {tile.kind === 'new' && (
        <View style={[styles.newBadge, { borderColor: tint }]}>
          <ThemedText style={[styles.newBadgeText, { color: tint }]}>NEW</ThemedText>
        </View>
      )}
      {selected && (
        <View style={[styles.checkBadge, { backgroundColor: tint }]}>
          <IconSymbol name="checkmark.circle.fill" size={20} color={onTint} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, gap: 6 },
  subtle: { opacity: 0.65, fontSize: 14, lineHeight: 20 },
  grid: { paddingHorizontal: 16, paddingBottom: 100, gap: 12 },
  row: { gap: 12 },
  tile: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    minHeight: 140,
    gap: 8,
    justifyContent: 'space-between',
    position: 'relative',
  },
  tileIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTextWrap: { gap: 2 },
  tileHint: { fontSize: 11, opacity: 0.55, textTransform: 'uppercase', letterSpacing: 0.4 },
  tileLabel: { fontSize: 15, lineHeight: 20 },
  newBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  newBadgeText: { fontSize: 11, fontWeight: '700' },
  checkBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtn: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { fontWeight: '600', fontSize: 16 },
});
