import { useLocalSearchParams } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function ScanResultsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <ThemedView style={{ flex: 1, padding: 24, gap: 12 }}>
      <ThemedText type="title">Scan results</ThemedText>
      <ThemedText>Photo {id}</ThemedText>
      <ThemedText style={{ opacity: 0.6 }}>
        This screen will list extracted words after Phase 2 wires up the camera and pipeline.
      </ThemedText>
    </ThemedView>
  );
}
