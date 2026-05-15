import { eq } from 'drizzle-orm';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  FOLDER_ICONS,
  FOLDER_LABELS,
  FOLDER_SLUGS,
  UNCATEGORIZED_SLUG,
  hasSubCategories,
  normalizeCategory,
  type AnyFolderSlug,
  type FolderSlug,
} from '@/constants/folders';
import { Colors } from '@/constants/theme';
import { db } from '@/db/client';
import { photos, type Photo } from '@/db/schema';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { updatePhotoCategory } from '@/services/photo';

const ALL_SLUGS: AnyFolderSlug[] = [...FOLDER_SLUGS, UNCATEGORIZED_SLUG];

/**
 * Category picker shown after the scan-results screen. The user can confirm
 * Gemini's auto-classification or change it. Reached via `router.replace` so
 * back-navigation skips the (now stale) scan list and returns to capture.
 */
export default function ScanCategoryScreen() {
  const { id, suggestion } = useLocalSearchParams<{ id: string; suggestion?: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const onTint = Colors[colorScheme].background;

  const [photo, setPhoto] = useState<Photo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // What the user currently has selected. Initialized to the photo's current
  // category once it loads; kept in sync only when the photo first arrives.
  const [selected, setSelected] = useState<AnyFolderSlug>(UNCATEGORIZED_SLUG);
  // What Gemini originally picked (for the "Gemini" badge). Same as the
  // photo's category on first load; doesn't change as the user taps around.
  const [geminiPick, setGeminiPick] = useState<AnyFolderSlug>(UNCATEGORIZED_SLUG);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let cancelled = false;
      db.select()
        .from(photos)
        .where(eq(photos.id, id))
        .limit(1)
        .all()
        .then((rows) => {
          if (cancelled) return;
          const p = rows[0] ?? null;
          setPhoto(p);
          const initial: AnyFolderSlug = normalizeCategory(p?.category) ?? UNCATEGORIZED_SLUG;
          setSelected(initial);
          setGeminiPick(initial);
          setLoading(false);
        })
        .catch(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [id]),
  );

  const nextCategoryHasSubCats = hasSubCategories(
    selected === UNCATEGORIZED_SLUG ? null : selected,
  );
  // Only forward Gemini's app-name suggestion when the user kept (or returned
  // to) the category Gemini originally tagged. Otherwise the suggestion is
  // stale — it was for a different scene.
  const suggestionToForward =
    nextCategoryHasSubCats && selected === geminiPick ? (suggestion ?? '') : '';

  const onSave = async () => {
    if (!photo || saving) return;
    const nextCategory: FolderSlug | null =
      selected === UNCATEGORIZED_SLUG ? null : selected;
    const currentCategory = normalizeCategory(photo.category);

    setSaving(true);
    try {
      if (nextCategory !== currentCategory) {
        await updatePhotoCategory(photo.id, nextCategory);
      }
      if (nextCategoryHasSubCats) {
        const qs = suggestionToForward
          ? `?suggestion=${encodeURIComponent(suggestionToForward)}`
          : '';
        router.replace(`/scan-subcategory/${photo.id}${qs}` as never);
      } else {
        router.dismissTo('/(tabs)');
      }
    } catch (e) {
      Alert.alert('Could not save category', e instanceof Error ? e.message : String(e));
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

  const geminiLabel = FOLDER_LABELS[geminiPick];

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="subtitle">Pick a folder</ThemedText>
        <ThemedText style={styles.subtle}>
          {geminiPick === UNCATEGORIZED_SLUG
            ? `Gemini couldn't categorize this photo. Pick a folder if you can.`
            : `Gemini suggested ${geminiLabel}. Tap a different folder to change it.`}
        </ThemedText>
      </View>

      <FlatList
        data={ALL_SLUGS}
        keyExtractor={(slug) => slug}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => (
          <CategoryTile
            slug={item}
            selected={item === selected}
            isGeminiPick={item === geminiPick}
            tint={tint}
            onTint={onTint}
            onPress={() => setSelected(item)}
          />
        )}
      />

      <Pressable
        style={[styles.saveBtn, { backgroundColor: tint }, saving && styles.saveBtnDisabled]}
        onPress={onSave}
        disabled={saving}>
        <ThemedText style={[styles.saveBtnText, { color: onTint }]}>
          {saving ? 'Saving…' : nextCategoryHasSubCats ? 'Next' : 'Save & Finish'}
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

function CategoryTile({
  slug,
  selected,
  isGeminiPick,
  tint,
  onTint,
  onPress,
}: {
  slug: AnyFolderSlug;
  selected: boolean;
  isGeminiPick: boolean;
  tint: string;
  onTint: string;
  onPress: () => void;
}) {
  const icon = FOLDER_ICONS[slug] ?? 'square.stack.fill';
  const label = FOLDER_LABELS[slug];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}${selected ? ', selected' : ''}${isGeminiPick ? ', suggested by Gemini' : ''}`}
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
      <ThemedText type="defaultSemiBold" style={styles.tileLabel} numberOfLines={2}>
        {label}
      </ThemedText>
      {isGeminiPick && (
        <View style={[styles.geminiBadge, { borderColor: tint }]}>
          <ThemedText style={[styles.geminiBadgeText, { color: tint }]}>Gemini</ThemedText>
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
  tileLabel: { fontSize: 15, lineHeight: 20 },
  geminiBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  geminiBadgeText: { fontSize: 11, fontWeight: '700' },
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
