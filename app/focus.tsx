import { Image } from 'expo-image';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import type { BBox } from '@/lib/types';
import { containRect } from '@/services/bbox';
import {
  containerSelectionToNormalizedRegion,
  type SelectionRect,
} from '@/services/focus-crop';
import { processPhoto } from '@/services/pipeline';

// Reject vanishingly small regions in normalized space (0–1000). A 50-point
// minimum corresponds to ~5% of the image's smaller dimension — about the
// size of a single small word on a 1600px image.
const MIN_REGION_DIMENSION = 50;

/**
 * Modal screen shown after every camera capture / library pick. The user can
 * drag a rectangle over the image to focus the scan on one region. We do NOT
 * crop the file — instead we send the full image to Gemini along with a
 * normalized region hint in the prompt, so word extraction stays focused while
 * scene classification + raw text capture still see the whole photo.
 */
// Fixed palette — this screen is always black (image-overlay UI), so it must
// not derive colors from the system light/dark theme. In dark mode the theme
// tint is `#fff`, which paired with white button text produces an invisible
// white-on-white glitch.
const SELECTION_YELLOW = '#FFEB3B';
const SCAN_BTN_TEXT_DARK = '#000';

export default function FocusScreen() {
  const router = useRouter();
  const { uri } = useLocalSearchParams<{ uri: string }>();
  const insets = useSafeAreaInsets();

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

  // PanResponder must be stable across renders. Store mutable values in refs
  // so the responder callbacks can read fresh state without re-creating the
  // responder. `gestureState.{x0,y0,moveX,moveY}` are *page* coordinates
  // (relative to the screen) — we need coordinates local to the image
  // container, so we read `event.nativeEvent.locationX/locationY` instead,
  // which is local to the responder view.
  const stateRef = useRef({ imageRect, processing });
  stateRef.current = { imageRect, processing };
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragCurrentRef = useRef<{ x: number; y: number } | null>(null);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !stateRef.current.processing,
        onMoveShouldSetPanResponder: () => !stateRef.current.processing,
        onPanResponderGrant: (event) => {
          const rect = stateRef.current.imageRect;
          if (rect.w <= 0 || rect.h <= 0) return;
          const { locationX, locationY } = event.nativeEvent;
          if (!Number.isFinite(locationX) || !Number.isFinite(locationY)) return;
          const x = clamp(locationX, rect.x, rect.x + rect.w);
          const y = clamp(locationY, rect.y, rect.y + rect.h);
          dragStartRef.current = { x, y };
          dragCurrentRef.current = { x, y };
          setLockedRect(null);
          setDragStart({ x, y });
          setDragCurrent({ x, y });
        },
        onPanResponderMove: (event) => {
          const rect = stateRef.current.imageRect;
          if (rect.w <= 0 || rect.h <= 0) return;
          const { locationX, locationY } = event.nativeEvent;
          if (!Number.isFinite(locationX) || !Number.isFinite(locationY)) return;
          const x = clamp(locationX, rect.x, rect.x + rect.w);
          const y = clamp(locationY, rect.y, rect.y + rect.h);
          dragCurrentRef.current = { x, y };
          setDragCurrent({ x, y });
        },
        onPanResponderRelease: () => {
          const start = dragStartRef.current;
          const current = dragCurrentRef.current;
          if (start && current) {
            const norm = normalizeRect(start, current);
            // Ignore taps / micro-drags (treat as "clear selection").
            if (norm.width >= 8 && norm.height >= 8) {
              setLockedRect(norm);
            } else {
              setLockedRect(null);
            }
          }
          dragStartRef.current = null;
          dragCurrentRef.current = null;
          setDragStart(null);
          setDragCurrent(null);
        },
        onPanResponderTerminate: () => {
          dragStartRef.current = null;
          dragCurrentRef.current = null;
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

  const runPipelineWithRegion = async (region: BBox | null) => {
    if (!uri) return;
    setProcessing(true);
    try {
      const outcome = await processPhoto(uri, { focusRegion: region });
      router.replace(`/scan/${outcome.photoId}`);
    } catch (e) {
      Alert.alert('Could not analyze photo', e instanceof Error ? e.message : String(e));
      setProcessing(false);
    }
  };

  const onScanWhole = () => {
    if (!uri || processing) return;
    runPipelineWithRegion(null);
  };

  const onScanSelection = () => {
    if (!uri || processing || !lockedRect) return;
    if (imageRect.w <= 0 || imageRect.h <= 0) {
      onScanWhole();
      return;
    }

    const region = containerSelectionToNormalizedRegion(lockedRect, imageRect);
    if (!region) {
      onScanWhole();
      return;
    }
    const [ymin, xmin, ymax, xmax] = region;
    if (ymax - ymin < MIN_REGION_DIMENSION || xmax - xmin < MIN_REGION_DIMENSION) {
      Alert.alert(
        'Selection too small',
        'Try drawing a larger rectangle, or tap "Scan whole image".',
      );
      return;
    }

    runPipelineWithRegion(region);
  };

  if (!uri) {
    return (
      <View style={styles.center}>
        <ThemedText style={styles.errorText}>Missing image.</ThemedText>
        <Pressable onPress={() => router.back()} style={styles.secondaryBtn}>
          <ThemedText style={styles.secondaryBtnText}>Close</ThemedText>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          disabled={processing}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          style={styles.topBarBtn}
          hitSlop={12}>
          <ThemedText style={[styles.topBarBtnText, processing && styles.btnDisabled]}>
            Cancel
          </ThemedText>
        </Pressable>
        <ThemedText style={styles.topBarTitle}>Focus region</ThemedText>
        <View style={styles.topBarBtn} />
      </View>
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
            style={[styles.secondaryBtn, processing && styles.btnDisabled]}>
            <ThemedText style={styles.secondaryBtnText}>Scan whole image</ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scan selected region"
            onPress={onScanSelection}
            disabled={processing || !lockedRect}
            style={[styles.primaryBtn, (processing || !lockedRect) && styles.btnDisabled]}>
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'black',
  },
  topBarBtn: { minWidth: 60 },
  topBarBtnText: { color: 'white', fontSize: 16, fontWeight: '500' },
  topBarTitle: { color: 'white', fontSize: 17, fontWeight: '600' },
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
  footer: { padding: 16, paddingBottom: 32, gap: 12, backgroundColor: 'black' },
  hint: { color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 12 },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
  },
  secondaryBtnText: { color: 'white', fontWeight: '600' },
  primaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: SELECTION_YELLOW,
    alignItems: 'center',
  },
  primaryBtnText: { color: SCAN_BTN_TEXT_DARK, fontWeight: '600' },
  btnDisabled: { opacity: 0.4 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: 'black',
  },
  errorText: { color: 'white' },
});
