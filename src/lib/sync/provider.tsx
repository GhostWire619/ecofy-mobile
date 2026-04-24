import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from '@/lib/auth/provider';
import { flushSyncQueueIfOnline, registerBackgroundSyncAsync } from '@/lib/sync/engine';
import { syncRepository } from '@/lib/db/repositories';

type SyncContextValue = {
  isOnline: boolean;
  isSyncing: boolean;
  queuedCount: number;
  conflictCount: number;
  refresh: () => Promise<void>;
  flush: () => Promise<void>;
};

const SyncContext = createContext<SyncContextValue | null>(null);

function isNetworkReachable(state: {
  isConnected: boolean | null;
  isInternetReachable?: boolean | null;
}) {
  return Boolean(state.isConnected && state.isInternetReachable !== false);
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { isAuthenticated, refreshBootstrap } = useAuth();
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);

  const refresh = useCallback(async () => {
    const summary = await syncRepository.getQueueSummary();
    setQueuedCount(summary.queued);
    setConflictCount(summary.conflicts);
  }, []);

  const flush = useCallback(async () => {
    setIsSyncing(true);
    try {
      await flushSyncQueueIfOnline();
      if (isAuthenticated) {
        await refreshBootstrap().catch(() => undefined);
        await queryClient.invalidateQueries();
      }
      await refresh();
    } finally {
      setIsSyncing(false);
    }
  }, [isAuthenticated, queryClient, refresh, refreshBootstrap]);

  useEffect(() => {
    void refresh();
    void registerBackgroundSyncAsync();

    let previousOnline = true;
    void Promise.resolve(NetInfo.fetch())
      .then((state) => {
        const nextOnline = isNetworkReachable(state);
        previousOnline = nextOnline;
        setIsOnline(nextOnline);
        if (nextOnline) {
          void flush();
        }
      })
      .catch(() => undefined);

    const unsubscribe = NetInfo.addEventListener((state) => {
      const nextOnline = isNetworkReachable(state);
      setIsOnline(nextOnline);
      if (nextOnline && !previousOnline) {
        void flush();
      }
      previousOnline = nextOnline;
    });

    const interval = setInterval(() => {
      void refresh();
    }, 5000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [flush, refresh]);

  const value = useMemo<SyncContextValue>(
    () => ({
      isOnline,
      isSyncing,
      queuedCount,
      conflictCount,
      refresh,
      flush,
    }),
    [conflictCount, flush, isOnline, isSyncing, queuedCount, refresh],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used inside SyncProvider');
  }

  return context;
}
