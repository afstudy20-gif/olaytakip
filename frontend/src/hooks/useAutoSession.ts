import { useEffect, useRef } from "react";
import { useStore } from "../store";
import * as api from "../api";
import {
  subscribeSessions,
  upsertRecentSession,
} from "../lib/sessionDb";
import { cloudSync } from "../lib/cloudSync";

const DEBOUNCE_MS = 5_000;
const PERIODIC_MS = 60_000;

interface SessionSnapshotInput {
  sessionId: string;
  filename: string;
  nRows?: number;
  nCols?: number;
  activeTab?: string;
  source?: "auto" | "manual";
}

function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}:${h >>> 0}`;
}

async function persistSessionPayload(input: SessionSnapshotInput & { payload: string }) {
  await upsertRecentSession({
    serverSessionId: input.sessionId,
    name: input.filename,
    payload: input.payload,
    nRows: input.nRows,
    nCols: input.nCols,
    activeTab: input.activeTab,
    source: input.source ?? "auto",
  });
  cloudSync.markDirty();
}

export async function saveSessionSnapshot(input: SessionSnapshotInput): Promise<void> {
  const blob = await api.saveSession(input.sessionId);
  const payload = await blob.text();
  await persistSessionPayload({ ...input, payload });
}

/**
 * useAutoSession — debounced local autosave + cloud-sync dirty marker.
 *
 * Watches the current Zustand session. When tracked state changes and is non-null,
 * waits 5 s of quiescence, then:
 *   1. Fetches the server-side JSON snapshot via api.saveSession().
 *   2. Stores it in IndexedDB via upsertRecentSession().
 *   3. Marks cloud sync dirty so Drive gets the new snapshot.
 *
 * A periodic 60 s snapshot catches server-side edits that do not flow through
 * local React state. Page close gets one last best-effort flush.
 */
export function useAutoSession() {
  const sessionId = useStore((s) => s.session?.session_id ?? null);
  const filename = useStore((s) => s.session?.filename ?? null);
  const nRows = useStore((s) => s.session?.rows ?? null);
  const nCols = useStore((s) => s.session?.columns.length ?? null);
  const activeTab = useStore((s) => s.activeTab);
  const filters = useStore((s) => s.filters);
  const dataVersion = useStore((s) => s.dataVersion);
  const refreshRecentSessions = useStore((s) => s.refreshRecentSessions);

  const lastSavedHashRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

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

  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;

    const snapshot = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const blob = await api.saveSession(sessionId);
        if (cancelled) return;
        const payload = await blob.text();
        const hash = djb2(`${sessionId}\n${filename ?? ""}\n${activeTab}\n${payload}`);
        if (hash === lastSavedHashRef.current) return;
        lastSavedHashRef.current = hash;
        await persistSessionPayload({
          sessionId,
          filename: filename ?? "Oturum",
          payload,
          nRows: nRows ?? undefined,
          nCols: nCols ?? undefined,
          activeTab,
        });
        await refreshRecentSessions();
      } catch (e) {
        console.warn("[useAutoSession] snapshot failed", e);
      } finally {
        inFlightRef.current = false;
      }
    };

    const debounceTimer = setTimeout(snapshot, DEBOUNCE_MS);
    const interval = setInterval(snapshot, PERIODIC_MS);
    const onBeforeUnload = () => {
      void snapshot();
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      cancelled = true;
      clearTimeout(debounceTimer);
      clearInterval(interval);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [sessionId, filename, nRows, nCols, activeTab, filters, dataVersion, refreshRecentSessions]);
}

export default useAutoSession;
