import { eq } from 'drizzle-orm';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

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
import { useSightingsForPhoto } from '@/hooks/use-cards';
import { bboxToScreen, containRect, parseBBox } from '@/services/bbox';
import { updatePhotoCategory } from '@/services/photo';

export default function PhotoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingCategory, setSavingCategory] = useState(false);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [boxesVisible, setBoxesVisible] = useState(true);
  const { data: sightings } = useSightingsForPhoto(id);

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

  const overlays = useMemo(() => {
    const rect = containRect(containerSize, imageSize);
    if (rect.w <= 0 || rect.h <= 0) return [];
    return sightings
      .map((s) => {
        const bbox = parseBBox(s.bbox);
        if (!bbox) return null;
        const screen = bboxToScreen(bbox, rect);
        return {
          sightingId: s.sightingId,
          cardId: s.cardId,
          lemma: s.lemma,
          ...screen,
        };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null);
  }, [sightings, containerSize, imageSize]);

  const onImageContainerLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setContainerSize({ width, height });
  };

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

  const hasOverlays = overlays.length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.imageContainer} onLayout={onImageContainerLayout}>
        <Image
          source={{ uri: photo.imageUri }}
          style={styles.image}
          contentFit="contain"
          transition={150}
          onLoad={(e) => {
            const src = e.source;
            if (src && src.width > 0 && src.height > 0) {
              setImageSize({ width: src.width, height: src.height });
            }
          }}
        />
        {boxesVisible &&
          overlays.map((box) => (
            <Pressable
              key={box.sightingId}
              accessibilityRole="button"
              accessibilityLabel={`Open card for ${box.lemma}`}
              onPress={() => router.push(`/card/${box.cardId}`)}
              style={[
                styles.bboxBox,
                { left: box.left, top: box.top, width: box.width, height: box.height },
              ]}>
              <View style={styles.bboxLabel}>
                <ThemedText style={styles.bboxLabelText} numberOfLines={1}>
                  {box.lemma}
                </ThemedText>
              </View>
            </Pressable>
          ))}
        {hasOverlays && (
          <Pressable
            onPress={() => setBoxesVisible((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={boxesVisible ? 'Hide bounding boxes' : 'Show bounding boxes'}
            style={styles.bboxToggle}>
            <ThemedText style={styles.bboxToggleText}>
              {boxesVisible ? 'Hide boxes' : 'Show boxes'}
            </ThemedText>
          </Pressable>
        )}
      </View>
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
  imageContainer: { flex: 1, width: '100%' },
  image: { flex: 1, width: '100%' },
  bboxBox: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 235, 59, 0.95)',
    borderRadius: 4,
    backgroundColor: 'rgba(255, 235, 59, 0.12)',
  },
  bboxLabel: {
    position: 'absolute',
    top: -18,
    left: -1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    maxWidth: 160,
  },
  bboxLabelText: { color: '#FFEB3B', fontSize: 11, fontWeight: '600' },
  bboxToggle: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  bboxToggleText: { color: 'white', fontSize: 12, fontWeight: '600' },
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
