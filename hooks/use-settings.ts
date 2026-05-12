import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { DEFAULT_SETTINGS, getSetting, setSetting, SettingKeys } from '@/services/settings';

export function useDailyNewCardLimit() {
  const [limit, setLimitState] = useState<number>(DEFAULT_SETTINGS.dailyNewCardLimit);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getSetting<number>(SettingKeys.dailyNewCardLimit, DEFAULT_SETTINGS.dailyNewCardLimit)
        .then((v) => {
          if (!cancelled) {
            setLimitState(v);
            setLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const update = useCallback(async (next: number) => {
    const n = Math.max(0, Math.floor(next));
    setLimitState(n);
    await setSetting(SettingKeys.dailyNewCardLimit, n);
  }, []);

  return { limit, loading, setLimit: update };
}

export function usePlayInSilentMode() {
  const [enabled, setEnabledState] = useState<boolean>(DEFAULT_SETTINGS.playInSilentMode);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getSetting<boolean>(SettingKeys.playInSilentMode, DEFAULT_SETTINGS.playInSilentMode)
        .then((v) => {
          if (!cancelled) {
            setEnabledState(v);
            setLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const update = useCallback(async (next: boolean) => {
    setEnabledState(next);
    await setSetting(SettingKeys.playInSilentMode, next);
  }, []);

  return { enabled, loading, setEnabled: update };
}
