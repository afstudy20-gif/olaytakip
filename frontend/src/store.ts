import { create } from 'zustand'
import type { Session, SessionData, TabName, SummaryData, ZReportRow, ChartsData, RecentSessionMeta } from './types'
import { listRecentSessions, getRecentSession } from './lib/sessionDb'
import * as api from './api'

interface AppState {
  session: Session | null
  activeTab: TabName
  summary: SummaryData | null
  zreport: { granularity: string; rows: ZReportRow[] } | null
  charts: ChartsData | null
  recentSessions: RecentSessionMeta[]
  isLoading: boolean
  error: string | null
  undoDepth: number
  redoDepth: number
  trashCounts: { rows: number; columns: number }
  filters: Record<string, string>
  setSession: (s: Session | null) => void
  setFilters: (f: Record<string, string>) => void
  setActiveTab: (t: TabName) => void
  setSummary: (s: SummaryData | null) => void
  setZReport: (z: { granularity: string; rows: ZReportRow[] } | null) => void
  setCharts: (c: ChartsData | null) => void
  setRecentSessions: (r: RecentSessionMeta[]) => void
  refreshRecentSessions: () => Promise<void>
  loadRecentSession: (id: string) => Promise<void>
  setLoading: (v: boolean) => void
  setError: (e: string | null) => void
  updatePreviewCell: (rowIdx: number, col: string, value: unknown) => void
  removePreviewRow: (rowIdx: number) => void
  addPreviewRow: (row: Record<string, unknown>) => void
  addColumn: (name: string, defaultValue?: unknown) => void
  updateSessionData: (payload: SessionData) => void
}

export const useStore = create<AppState>((set, get) => ({
  session: null,
  activeTab: 'data',
  summary: null,
  zreport: null,
  charts: null,
  recentSessions: [],
  isLoading: false,
  error: null,
  undoDepth: 0,
  redoDepth: 0,
  trashCounts: { rows: 0, columns: 0 },
  filters: {},
  setSession: (s) => {
    // Preserve the current active tab in a local variable. We do not autosave
    // here; useAutoSession handles snapshotting after a debounce.
    const currentTab = get().activeTab
    set({
      session: s,
      summary: null,
      zreport: null,
      charts: null,
      error: null,
      undoDepth: 0,
      redoDepth: 0,
      trashCounts: { rows: 0, columns: 0 },
      filters: {},
    })
    void currentTab
  },
  setActiveTab: (t) => set({ activeTab: t }),
  setSummary: (s) => set({ summary: s }),
  setZReport: (z) => set({ zreport: z }),
  setCharts: (c) => set({ charts: c }),
  setRecentSessions: (r) => set({ recentSessions: r }),
  refreshRecentSessions: async () => {
    try {
      const list = await listRecentSessions()
      set({ recentSessions: list })
    } catch (e) {
      console.warn('[store] refreshRecentSessions failed', e)
    }
  },
  loadRecentSession: async (id) => {
    const rec = await getRecentSession(id)
    if (!rec) {
      set({ error: 'Oturum bulunamadı' })
      return
    }
    const file = new File([rec.payload], rec.name, { type: 'application/json' })
    const session = await api.loadSession(file)
    set({ session, error: null })
    if (rec.activeTab) {
      const tab = rec.activeTab as TabName
      const validTabs: TabName[] = ['data', 'summary', 'zreport', 'visuals', 'sessions']
      if (validTabs.includes(tab)) {
        set({ activeTab: tab })
      }
    }
  },
  setLoading: (v) => set({ isLoading: v }),
  setError: (e) => set({ error: e }),
  updatePreviewCell: (rowIdx, col, value) =>
    set((state) => {
      if (!state.session) return state
      const preview = [...state.session.preview]
      preview[rowIdx] = { ...preview[rowIdx], [col]: value }
      return { session: { ...state.session, preview } }
    }),
  removePreviewRow: (rowIdx) =>
    set((state) => {
      if (!state.session) return state
      const preview = state.session.preview.filter((_, i) => i !== rowIdx)
      return { session: { ...state.session, rows: state.session.rows - 1, preview } }
    }),
  addPreviewRow: (row) =>
    set((state) => {
      if (!state.session) return state
      const preview = [...state.session.preview, row]
      return { session: { ...state.session, rows: state.session.rows + 1, preview } }
    }),
  addColumn: (name, defaultValue) =>
    set((state) => {
      if (!state.session) return state
      if (state.session.columns.some((c) => c.name === name)) return state
      const columns = [...state.session.columns, { name, dtype: 'object', kind: 'text' as const }]
      const preview = state.session.preview.map((row) => ({ ...row, [name]: defaultValue ?? null }))
      return { session: { ...state.session, columns, preview } }
    }),
  updateSessionData: (payload) =>
    set((state) => {
      if (!state.session) return state
      return {
        session: {
          ...state.session,
          columns: payload.columns,
          preview: payload.preview,
          rows: payload.rows,
        },
        undoDepth: payload.undo_depth,
        redoDepth: payload.redo_depth,
        trashCounts: payload.trash_counts,
      }
    }),
  setFilters: (f) => set({ filters: f }),
}))
