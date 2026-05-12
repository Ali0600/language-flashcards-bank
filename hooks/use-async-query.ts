import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

export type AsyncQueryResult<T> = {
  loading: boolean;
  data: T;
  error: Error | null;
  refetch: () => Promise<void>;
};

export function useAsyncQuery<T>(
  initial: T,
  query: () => Promise<T>,
  deps: ReadonlyArray<unknown> = [],
): AsyncQueryResult<T> {
  const [state, setState] = useState<{ loading: boolean; data: T; error: Error | null }>({
    loading: true,
    data: initial,
    error: null,
  });
  const [version, setVersion] = useState(0);
  const pendingResolveRef = useRef<(() => void) | null>(null);
  const queryRef = useRef(query);
  queryRef.current = query;

  const refetch = useCallback((): Promise<void> => {
    return new Promise<void>((resolve) => {
      pendingResolveRef.current = resolve;
      setVersion((v) => v + 1);
    });
  }, []);

  useFocusEffect(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const data = await queryRef.current();
          if (!cancelled) setState({ loading: false, data, error: null });
        } catch (e) {
          if (!cancelled) {
            setState((s) => ({ ...s, loading: false, error: e as Error }));
          }
        } finally {
          if (!cancelled && pendingResolveRef.current) {
            pendingResolveRef.current();
            pendingResolveRef.current = null;
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [version, ...deps]),
  );

  return { ...state, refetch };
}
