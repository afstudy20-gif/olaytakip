import { useEffect, useRef } from "react";
import { useStore } from "../store";
import * as api from "../api";
import {
  subscribeSessions,
  upsertRecentSession,
} from "../lib/sessionDb";
import { cloudSync } from "../lib/cloudSync";

/**
 * useAutoSession — debounced local autosave + cloud-sync dirty marker.
 *
 * Watches the current Zustand session. When it changes and is non-null,
 * waits 500 ms of quiescence, then:
 *   1. Fetches the server-side JSON snapshot via api.saveSession().
 *   2. Stores it in IndexedDB via upsertRecentSession().
 *   3. Marks cloud sync dirty so Drive gets the new snapshot.
 *
 * Pending snapshots are flushed immediately on unmount or page close.
 */
export function useAutoSession() {
  const session = useStore((s) => s.session);
  const activeTab = useStore((s) => s.activeTab);
  const refreshRecentSessions = useStore((s) => s.refreshRecentSessions);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Promise<void> | null>(null);

  // Subscribe to cross-tab session changes and refresh the recent list.
  useEffect(() => {
    const unsub = subscribeSessions(() => {
      void refreshRecentSessions();
    });
    void refreshRecentSessions();
    return () => {
      unsub();
    };
  }, [refreshRecentSessions]);

  const snapshot = async (targetSession: NonNullable<typeof session>) => {
    try {
      const blob = await api.saveSession(targetSession.session_id);
      const payload = await blob.text();
      await upsertRecentSession({
        serverSessionId: targetSession.session_id,
        name: targetSession.filename,
        payload,
        nRows: targetSession.rows,
        nCols: targetSession.columns.length,
        activeTab,
        source: "auto",
      });
      cloudSync.markDirty();
    } catch (e) {
      console.warn("[useAutoSession] snapshot failed", e);
    }
  };

  const flushNow = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (session) {
      pendingRef.current = snapshot(session).finally(() => {
        pendingRef.current = null;
      });
    }
  };

  // Debounced snapshot on session change.
  useEffect(() => {
    if (!session) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      pendingRef.current = snapshot(session).finally(() => {
        pendingRef.current = null;
      });
    }, 500);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        // Flush immediately rather than dropping the pending snapshot.
        pendingRef.current = snapshot(session).finally(() => {
          pendingRef.current = null;
        });
      }
    };
  }, [session, activeTab]);

  // Flush pending snapshots before the page unloads.
  useEffect(() => {
    const onBeforeUnload = () => {
      flushNow();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [session]);

  // Best-effort wait for any in-flight snapshot on unmount.
  useEffect(() => {
    return () => {
      flushNow();
      if (pendingRef.current) {
        void pendingRef.current.catch(() => {});
      }
    };
  }, []);
}

export default useAutoSession;
