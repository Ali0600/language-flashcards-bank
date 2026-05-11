import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useMigrations } from 'drizzle-orm/op-sqlite/migrator';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import 'react-native-reanimated';

import { db } from '@/db/client';
import migrations from '@/db/migrations/migrations';
import { seedIfEmpty } from '@/db/seed';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { success, error } = useMigrations(db, migrations);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (success && !seeded) {
      seedIfEmpty()
        .catch((e) => console.error('seed failed', e))
        .finally(() => setSeeded(true));
    }
  }, [success, seeded]);

  useEffect(() => {
    const checkForOTAUpdate = async () => {
      if (__DEV__ || !Updates.isEnabled) return;
      try {
        const result = await Updates.checkForUpdateAsync();
        if (!result.isAvailable) return;
        await Updates.fetchUpdateAsync();
        Alert.alert(
          'Update Ready',
          'A new version of Language Flashcards is ready to install.',
          [
            { text: 'Later', style: 'cancel' },
            {
              text: 'Reload',
              onPress: () => {
                Updates.reloadAsync().catch((err) =>
                  console.error('Reload after update failed:', err),
                );
              },
            },
          ],
        );
      } catch (error) {
        console.error('OTA update check failed:', error);
      }
    };
    checkForOTAUpdate();
  }, []);

  if (error) {
    return (
      <View style={styles.center}>
        <ThemedText type="title">Database error</ThemedText>
        <ThemedText>{error.message}</ThemedText>
      </View>
    );
  }

  if (!success || !seeded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="scan/[id]" options={{ title: 'Scan results' }} />
        <Stack.Screen name="card/[id]" options={{ title: 'Card' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
});
