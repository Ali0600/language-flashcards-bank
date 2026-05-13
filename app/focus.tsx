import { Image } from 'expo-image';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { containRect } from '@/services/bbox';
import {
  containerSelectionToImageCrop,
  isViableCrop,
  padCropRect,
  type SelectionRect,
} from '@/services/focus-crop';
import { processPhoto } from '@/services/pipeline';

const CROP_PADDING_FRAC = 0.05;
const MIN_CROP_DIMENSION_PX = 80;

/**
 * Modal screen that lets the user draw a rectangle over a just-captured (or
 * just-picked) image to focus the Gemini scan on a region. Cropping is done
 * here with expo-image-manipulator, then the cropped URI is handed off to the
 * standard pipeline. The route is only reached when the
 * `focusRegionBeforeScan` setting is on.
 */
export default function FocusScreen() {
  const router = useRouter();
  const { uri } = useLocalSearchParams<{ uri: string }>();
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;

  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);
  const [lockedRect, setLockedRect] = useState<SelectionRect | null>(null);
  const [processing, setProcessing] = useState(false);

  const imageRect = useMemo(
    () => containRect(containerSize, imageSize),
    [containerSize, imageSize],
  );

  // Ready-to-render rectangle: locked (after release) or in-progress (during drag).
  const displayRect: SelectionRect | null = useMemo(() => {
    if (dragStart && dragCurrent) {
      return normalizeRect(dragStart, dragCurrent);
    }
    return lockedRect;
  }, [dragStart, dragCurrent, lockedRect]);

  // PanResponder must be stable across renders. Store mutable values in a ref
  // so the responder callbacks can read fresh state.
  const stateRef = useRef({ imageRect, processing });
  stateRef.current = { imageRect, processing };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !stateRef.current.processing,
        onMoveShouldSetPanResponder: () => !stateRef.current.processing,
        onPanResponderGrant: (_, gesture) => {
          const rect = stateRef.current.imageRect;
          if (rect.w <= 0 || rect.h <= 0) return;
          const x = clamp(gesture.x0, rect.x, rect.x + rect.w);
          const y = clamp(gesture.y0, rect.y, rect.y + rect.h);
          setLockedRect(null);
          setDragStart({ x, y });
          setDragCurrent({ x, y });
        },
        onPanResponderMove: (_, gesture) => {
          const rect = stateRef.current.imageRect;
          if (rect.w <= 0 || rect.h <= 0) return;
          const x = clamp(gesture.moveX, rect.x, rect.x + rect.w);
          const y = clamp(gesture.moveY, rect.y, rect.y + rect.h);
          setDragCurrent({ x, y });
        },
        onPanResponderRelease: () => {
          setDragStart((start) => {
            setDragCurrent((current) => {
              if (start && current) {
                const norm = normalizeRect(start, current);
                // Ignore taps / micro-drags (treat as "clear selection").
                if (norm.width >= 8 && norm.height >= 8) {
                  setLockedRect(norm);
                } else {
                  setLockedRect(null);
                }
              }
              return null;
            });
            return null;
          });
        },
        onPanResponderTerminate: () => {
          setDragStart(null);
          setDragCurrent(null);
        },
      }),
    [],
  );

  const onContainerLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setContainerSize({ width, height });
  };

  const runPipeline = async (sourceUri: string) => {
    setProcessing(true);
    try {
      const outcome = await processPhoto(sourceUri);
      router.replace(`/scan/${outcome.photoId}`);
    } catch (e) {
      Alert.alert('Could not analyze photo', e instanceof Error ? e.message : String(e));
      setProcessing(false);
    }
  };

  const onScanWhole = () => {
    if (!uri || processing) return;
    runPipeline(uri);
  };

  const onScanSelection = async () => {
    if (!uri || processing || !lockedRect) return;
    if (imageRect.w <= 0 || imageRect.h <= 0 || imageSize.width <= 0 || imageSize.height <= 0) {
      onScanWhole();
      return;
    }

    const cropRaw = containerSelectionToImageCrop(lockedRect, imageRect, imageSize);
    if (!cropRaw) {
      onScanWhole();
      return;
    }
    const cropPadded = padCropRect(cropRaw, CROP_PADDING_FRAC, imageSize);
    if (!isViableCrop(cropPadded, MIN_CROP_DIMENSION_PX)) {
      Alert.alert(
        'Selection too small',
        'Try drawing a larger rectangle, or tap "Scan whole image".',
      );
      return;
    }

    setProcessing(true);
    try {
      const cropped = await manipulateAsync(
        uri,
        [{ crop: cropPadded }],
        { compress: 1, format: SaveFormat.JPEG },
      );
      await runPipeline(cropped.uri);
    } catch (e) {
      Alert.alert('Crop failed', e instanceof Error ? e.message : String(e));
      setProcessing(false);
    }
  };

  if (!uri) {
    return (
      <View style={styles.center}>
        <ThemedText>Missing image.</ThemedText>
        <Pressable onPress={() => router.back()} style={[styles.secondaryBtn, { borderColor: tint }]}>
          <ThemedText style={{ color: tint, fontWeight: '600' }}>Close</ThemedText>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View
        style={styles.imageContainer}
        onLayout={onContainerLayout}
        {...panResponder.panHandlers}>
        <Image
          source={{ uri }}
          style={styles.image}
          contentFit="contain"
          onLoad={(e) => {
            const src = e.source;
            if (src && src.width > 0 && src.height > 0) {
              setImageSize({ width: src.width, height: src.height });
            }
          }}
        />
        {displayRect && (
          <View
            pointerEvents="none"
            style={[
              styles.selectionBox,
              {
                left: displayRect.left,
                top: displayRect.top,
                width: displayRect.width,
                height: displayRect.height,
              },
            ]}
          />
        )}
        {processing && (
          <View style={styles.processingOverlay}>
            <ActivityIndicator size="large" color="white" />
            <ThemedText style={styles.processingText}>Analyzing photo…</ThemedText>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <ThemedText style={styles.hint}>
          {lockedRect
            ? 'Tap "Scan selection" to analyze only this region, or "Scan whole image" to ignore the selection.'
            : 'Drag on the photo to focus on a region. Smaller scans use less Gemini quota and finish faster.'}
        </ThemedText>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scan whole image"
            onPress={onScanWhole}
            disabled={processing}
            style={[
              styles.secondaryBtn,
              { borderColor: tint },
              processing && styles.btnDisabled,
            ]}>
            <ThemedText style={{ color: tint, fontWeight: '600' }}>Scan whole image</ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scan selected region"
            onPress={onScanSelection}
            disabled={processing || !lockedRect}
            style={[
              styles.primaryBtn,
              { backgroundColor: tint },
              (processing || !lockedRect) && styles.btnDisabled,
            ]}>
            <ThemedText style={styles.primaryBtnText}>Scan selection</ThemedText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function normalizeRect(
  a: { x: number; y: number },
  b: { x: number; y: number },
): SelectionRect {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const right = Math.max(a.x, b.x);
  const bottom = Math.max(a.y, b.y);
  return { left, top, width: right - left, height: bottom - top };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  imageContainer: { flex: 1, position: 'relative' },
  image: { ...StyleSheet.absoluteFillObject },
  selectionBox: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#FFEB3B',
    backgroundColor: 'rgba(255, 235, 59, 0.15)',
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  processingText: { color: 'white', fontSize: 16 },
  footer: { padding: 16, gap: 12, backgroundColor: 'black' },
  hint: { color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 12 },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  primaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryBtnText: { color: 'white', fontWeight: '600' },
  btnDisabled: { opacity: 0.4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
});
