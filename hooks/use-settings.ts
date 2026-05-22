import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import {
  DEFAULT_SETTINGS,
  getSetting,
  setSetting,
  SettingKeys,
  type SettingKey,
} from '@/services/settings';

function useBooleanSetting(key: SettingKey, defaultValue: boolean) {
  const [enabled, setEnabledState] = useState<boolean>(defaultValue);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getSetting<boolean>(key, defaultValue)
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
    }, [key, defaultValue]),
  );

  const update = useCallback(
    async (next: boolean) => {
      setEnabledState(next);
      await setSetting(key, next);
    },
    [key],
  );

  return { enabled, loading, setEnabled: update };
}

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
  return useBooleanSetting(SettingKeys.playInSilentMode, DEFAULT_SETTINGS.playInSilentMode);
}

export function useAutoCreateReverseCards() {
  return useBooleanSetting(
    SettingKeys.autoCreateReverseCards,
    DEFAULT_SETTINGS.autoCreateReverseCards,
  );
}

export function useAutoPlayWord() {
  return useBooleanSetting(SettingKeys.autoPlayWord, DEFAULT_SETTINGS.autoPlayWord);
}

export function useShuffleCards() {
  return useBooleanSetting(SettingKeys.shuffleCards, DEFAULT_SETTINGS.shuffleCards);
}

/**
 * How many times the Repeat button cycles the front-back-front aloud before
 * auto-rating Again. Clamped to [1, 10] by the setter — the bell-modal stepper
 * enforces the same range, but the setter clamps defensively in case the value
 * ever lands here from another path.
 */
export function useRepeatCount() {
  const [count, setCountState] = useState<number>(DEFAULT_SETTINGS.repeatCount);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getSetting<number>(SettingKeys.repeatCount, DEFAULT_SETTINGS.repeatCount)
        .then((v) => {
          if (!cancelled) {
            setCountState(clampRepeat(v));
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
    const n = clampRepeat(Math.floor(next));
    setCountState(n);
    await setSetting(SettingKeys.repeatCount, n);
  }, []);

  return { count, loading, setCount: update };
}

function clampRepeat(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.repeatCount;
  return Math.max(1, Math.min(10, n));
}
