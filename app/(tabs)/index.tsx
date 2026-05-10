import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function CaptureScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <IconSymbol name="camera.fill" size={72} color={tint} />
        <ThemedText type="title">Capture</ThemedText>
        <ThemedText style={styles.description}>
          Point your camera at German text — packaging, posters, signs — and the app will extract
          words and turn them into flashcards.
        </ThemedText>
        <ThemedText style={styles.todo}>
          Camera UI coming in Phase 2. For now, browse seeded vocab in the Study and Library tabs.
        </ThemedText>
      </View>
      <Pressable
        accessibilityRole="button"
        style={[styles.shutter, { borderColor: tint }]}
        onPress={() => {}}
        disabled>
        <View style={[styles.shutterInner, { backgroundColor: tint, opacity: 0.3 }]} />
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 48,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  content: {
    alignItems: 'center',
    gap: 16,
    maxWidth: 320,
  },
  description: {
    textAlign: 'center',
    lineHeight: 22,
  },
  todo: {
    textAlign: 'center',
    opacity: 0.6,
    fontStyle: 'italic',
  },
  shutter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
});
