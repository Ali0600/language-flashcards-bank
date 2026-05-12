import { eq } from 'drizzle-orm';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  FOLDER_LABELS,
  FOLDER_SLUGS,
  UNCATEGORIZED_SLUG,
  folderLabel,
  type FolderSlug,
} from '@/constants/folders';
import { db } from '@/db/client';
import { photos, type Photo } from '@/db/schema';
import { updatePhotoCategory } from '@/services/photo';

export default function PhotoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingCategory, setSavingCategory] = useState(false);

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
          if (!cancelled) {
            setPhoto(rows[0] ?? null);
            setLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [id]),
  );

  const openCategoryPicker = () => {
    if (!photo || savingCategory) return;
    const slugs: (FolderSlug | typeof UNCATEGORIZED_SLUG)[] = [...FOLDER_SLUGS, UNCATEGORIZED_SLUG];
    const options = [...slugs.map((s) => FOLDER_LABELS[s]), 'Cancel'];
    const cancelButtonIndex = options.length - 1;

    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Move photo to folder',
        options,
        cancelButtonIndex,
      },
      async (selectedIndex) => {
        if (selectedIndex === cancelButtonIndex) return;
        const choice = slugs[selectedIndex];
        if (!choice) return;
        const nextCategory = choice === UNCATEGORIZED_SLUG ? null : choice;
        if (nextCategory === photo.category) return; // no-op
        setSavingCategory(true);
        try {
          await updatePhotoCategory(photo.id, nextCategory);
          setPhoto({ ...photo, category: nextCategory });
        } catch (err) {
          console.error('updatePhotoCategory failed', err);
        } finally {
          setSavingCategory(false);
        }
      },
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="white" />
      </View>
    );
  }

  if (!photo) {
    return (
      <View style={styles.center}>
        <ThemedText style={styles.errorText}>Photo not found.</ThemedText>
        <Pressable onPress={() => router.back()} style={styles.closeBtn}>
          <ThemedText style={styles.closeText}>Close</ThemedText>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Image
        source={{ uri: photo.imageUri }}
        style={styles.image}
        contentFit="contain"
        transition={150}
      />
      <View style={styles.footer}>
        <ThemedText style={styles.meta}>
          {new Date(photo.takenAt).toLocaleString()}
        </ThemedText>
        <Pressable
          onPress={openCategoryPicker}
          disabled={savingCategory}
          accessibilityRole="button"
          accessibilityLabel="Change folder"
          style={[styles.folderChip, savingCategory && styles.folderChipDisabled]}>
          <IconSymbol name="folder.fill" size={14} color="rgba(255,255,255,0.85)" />
          <ThemedText style={styles.folderChipText}>
            {folderLabel(photo.category)}
          </ThemedText>
          {savingCategory ? (
            <ActivityIndicator size="small" color="rgba(255,255,255,0.85)" />
          ) : (
            <IconSymbol name="chevron.down" size={12} color="rgba(255,255,255,0.65)" />
          )}
        </Pressable>
        {photo.rawOcrText && (
          <ThemedText style={styles.rawText} numberOfLines={3}>
            {photo.rawOcrText}
          </ThemedText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  center: {
    flex: 1,
    backgroundColor: 'black',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  image: { flex: 1, width: '100%' },
  footer: { padding: 20, gap: 10, backgroundColor: 'rgba(0,0,0,0.8)' },
  meta: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  folderChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  folderChipDisabled: { opacity: 0.6 },
  folderChipText: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '500' },
  rawText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontStyle: 'italic' },
  errorText: { color: 'white' },
  closeBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'white',
  },
  closeText: { color: 'white' },
});
