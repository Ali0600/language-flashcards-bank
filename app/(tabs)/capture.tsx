import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function CaptureScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  // `busy` is only held during the brief async window between taking/picking a
  // photo and pushing the Focus route. Pipeline processing happens on the
  // Focus screen.
  const [busy, setBusy] = useState(false);

  const openFocus = (uri: string) => {
    router.push(`/focus?uri=${encodeURIComponent(uri)}` as never);
  };

  const onShutter = async () => {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        skipProcessing: false,
      });
      if (photo?.uri) openFocus(photo.uri);
    } catch (e) {
      Alert.alert('Capture failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onPick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
      });
      const uri = result.canceled ? null : result.assets[0]?.uri;
      if (uri) openFocus(uri);
    } finally {
      setBusy(false);
    }
  };

  if (!permission) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (!permission.granted) {
    return (
      <ThemedView style={styles.center}>
        <IconSymbol name="camera.fill" size={56} color={tint} />
        <ThemedText type="title">Camera access needed</ThemedText>
        <ThemedText style={styles.permissionBody}>
          Allow camera access so we can extract German vocabulary from photos.
        </ThemedText>
        <Pressable
          style={[styles.primaryBtn, { backgroundColor: tint }]}
          onPress={requestPermission}>
          <ThemedText style={styles.primaryBtnText}>Grant access</ThemedText>
        </Pressable>
        <Pressable style={styles.linkBtn} onPress={onPick}>
          <ThemedText>Pick from photo library instead</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back" active={!busy} />
      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          style={styles.libraryBtn}
          onPress={onPick}
          disabled={busy}>
          <IconSymbol name="photo.fill" size={28} color="white" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={[styles.shutter, busy && styles.shutterDisabled]}
          onPress={onShutter}
          disabled={busy}>
          <View style={styles.shutterInner} />
        </Pressable>
        <View style={styles.controlsSpacer} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  camera: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  permissionBody: { textAlign: 'center', maxWidth: 320, opacity: 0.7, lineHeight: 22 },
  primaryBtn: { paddingVertical: 12, paddingHorizontal: 28, borderRadius: 999, marginTop: 8 },
  primaryBtnText: { color: 'white', fontWeight: '600' },
  linkBtn: { marginTop: 12, padding: 8 },
  controls: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 24,
  },
  libraryBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlsSpacer: { width: 56, height: 56 },
  shutter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterDisabled: { opacity: 0.5 },
  shutterInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: 'white',
  },
});
