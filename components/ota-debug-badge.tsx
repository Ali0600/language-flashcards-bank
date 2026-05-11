import * as Updates from 'expo-updates';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';

export function OtaDebugBadge() {
  const {
    currentlyRunning,
    isUpdateAvailable,
    isUpdatePending,
    isChecking,
    isDownloading,
    lastCheckForUpdateTimeSinceRestart,
    checkError,
    downloadError,
  } = Updates.useUpdates();

  const runningId = currentlyRunning.updateId ?? 'embedded';
  const channel = currentlyRunning.channel ?? '(none)';
  const runtime = currentlyRunning.runtimeVersion ?? '(none)';
  const lastCheck = lastCheckForUpdateTimeSinceRestart
    ? lastCheckForUpdateTimeSinceRestart.toLocaleTimeString()
    : '(not yet)';

  const err = checkError?.message ?? downloadError?.message ?? null;

  return (
    <View style={styles.box}>
      <ThemedText style={styles.label}>OTA debug</ThemedText>
      <ThemedText style={styles.line}>channel: {channel}</ThemedText>
      <ThemedText style={styles.line}>runtime: {runtime}</ThemedText>
      <ThemedText style={styles.line}>running: {String(runningId).slice(0, 8)}</ThemedText>
      <ThemedText style={styles.line}>
        isEnabled: {String(Updates.isEnabled)} · isChecking: {String(isChecking)} · isDownloading:{' '}
        {String(isDownloading)}
      </ThemedText>
      <ThemedText style={styles.line}>
        updateAvailable: {String(isUpdateAvailable)} · updatePending: {String(isUpdatePending)}
      </ThemedText>
      <ThemedText style={styles.line}>lastCheck: {lastCheck}</ThemedText>
      {err && <ThemedText style={styles.err}>error: {err}</ThemedText>}
      <Pressable
        style={styles.btn}
        onPress={async () => {
          try {
            const result = await Updates.checkForUpdateAsync();
            if (result.isAvailable) {
              await Updates.fetchUpdateAsync();
              await Updates.reloadAsync();
            }
          } catch (e) {
            console.error('manual check failed', e);
          }
        }}>
        <ThemedText style={styles.btnText}>Force check + reload now</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    margin: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(150, 150, 150, 0.5)',
    backgroundColor: 'rgba(150, 150, 150, 0.08)',
    gap: 2,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    opacity: 0.6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  line: { fontSize: 11, fontFamily: 'Courier', opacity: 0.85 },
  err: { fontSize: 11, fontFamily: 'Courier', color: '#E74C3C', marginTop: 4 },
  btn: {
    marginTop: 8,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(46, 144, 250, 0.85)',
    alignItems: 'center',
  },
  btnText: { color: 'white', fontSize: 12, fontWeight: '600' },
});
