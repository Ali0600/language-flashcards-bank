import { eq } from 'drizzle-orm';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { photos, type Photo } from '@/db/schema';

export default function PhotoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [loading, setLoading] = useState(true);

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
  footer: { padding: 20, gap: 8, backgroundColor: 'rgba(0,0,0,0.8)' },
  meta: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
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
