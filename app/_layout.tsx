import { setAudioModeAsync } from 'expo-audio';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useMigrations } from 'drizzle-orm/op-sqlite/migrator';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import 'react-native-reanimated';

import { db } from '@/db/client';
import migrations from '@/db/migrations/migrations';
import { seedIfEmpty } from '@/db/seed';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { DEFAULT_SETTINGS, getSetting, SettingKeys } from '@/services/settings';

SplashScreen.preventAutoHideAsync().catch(() => {});

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
    if (success && seeded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [success, seeded]);

  useEffect(() => {
    if (error) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [error]);

  useEffect(() => {
    if (!success || !seeded) return;
    (async () => {
      const playInSilentMode = await getSetting<boolean>(
        SettingKeys.playInSilentMode,
        DEFAULT_SETTINGS.playInSilentMode,
      );
      await setAudioModeAsync({ playsInSilentMode: playInSilentMode });
    })().catch((e) => console.error('setAudioModeAsync failed', e));
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
    // Splash screen is still up; render nothing.
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="scan/[id]" options={{ title: 'Scan results' }} />
        <Stack.Screen name="card/[id]" options={{ title: 'Card' }} />
        <Stack.Screen name="folder/[slug]" options={{ title: 'Folder' }} />
        <Stack.Screen
          name="photo/[id]"
          options={{ presentation: 'modal', headerShown: true, title: 'Photo' }}
        />
        <Stack.Screen
          name="settings"
          options={{ presentation: 'modal', headerShown: true, title: 'Settings' }}
        />
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
