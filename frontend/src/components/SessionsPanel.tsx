import { useRef } from "react";
import {
  Clock,
  Database,
  Download,
  FileJson,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { useStore } from "../store";
import * as api from "../api";
import {
  trashSession,
  restoreSession,
  purgeSession,
} from "../lib/sessionDb";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString();
}

export default function SessionsPanel() {
  const {
    recentSessions,
    refreshRecentSessions,
    loadRecentSession,
    setSession,
    setError,
  } = useStore();
  const importRef = useRef<HTMLInputElement>(null);

  const active = recentSessions.filter((s) => !s.deletedAt);
  const trashed = recentSessions.filter((s) => s.deletedAt);

  const handleLoad = async (id: string) => {
    try {
      await loadRecentSession(id);
    } catch (e) {
      console.warn("[SessionsPanel] load failed", e);
      setError(e instanceof Error ? e.message : "Oturum yüklenemedi");
    }
  };

  const handleTrash = async (id: string) => {
    try {
      await trashSession(id);
      await refreshRecentSessions();
    } catch (e) {
      console.warn("[SessionsPanel] trash failed", e);
      setError("Oturum çöpe atılamadı");
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await restoreSession(id);
      await refreshRecentSessions();
    } catch (e) {
      console.warn("[SessionsPanel] restore failed", e);
      setError("Oturum geri yüklenemedi");
    }
  };

  const handlePurge = async (id: string) => {
    if (!window.confirm("Bu oturum kalıcı olarak silinsin mi?")) return;
    try {
      await purgeSession(id);
      await refreshRecentSessions();
    } catch (e) {
      console.warn("[SessionsPanel] purge failed", e);
      setError("Oturum silinemedi");
    }
  };

  const handleImport = async (file: File) => {
    try {
      const session = await api.loadSession(file);
      setSession(session);
    } catch (e) {
      console.warn("[SessionsPanel] import failed", e);
      setError(e instanceof Error ? e.message : "Oturum içe aktarılamadı");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Oturumlar</h2>
        <div className="flex items-center gap-2">
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImport(file);
              if (importRef.current) importRef.current.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => importRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
          >
            <Upload size={14} />
            JSON Yükle
          </button>
          <button
            type="button"
            onClick={() => void refreshRecentSessions()}
            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="Yenile"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      {active.length === 0 && trashed.length === 0 && (
        <div className="text-center py-10 border border-dashed border-slate-300 rounded-xl bg-slate-50">
          <Database size={32} className="mx-auto text-slate-300 mb-2" />
          <p className="text-slate-500">Henüz kaydedilmiş oturum yok.</p>
          <p className="text-sm text-slate-400 mt-1">
            Bir dosya yüklediğinizde otomatik olarak kaydedilecektir.
          </p>
        </div>
      )}

      {active.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-slate-500 mb-3">Son Oturumlar</h3>
          <div className="grid gap-3">
            {active.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:border-indigo-200 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileJson size={16} className="text-indigo-500 shrink-0" />
                    <span className="font-medium text-slate-800 truncate">
                      {s.name}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        s.source === "auto"
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-blue-50 text-blue-600"
                      }`}
                    >
                      {s.source === "auto" ? "otomatik" : "manuel"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Database size={12} />
                      {s.nRows ?? "?"} satır × {s.nCols ?? "?"} kolon
                    </span>
                    <span className="flex items-center gap-1">
                      <Download size={12} />
                      {formatBytes(s.sizeBytes)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {formatTime(s.savedAt)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleLoad(s.id)}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
                  >
                    Yükle
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleTrash(s.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Çöpe taşı"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {trashed.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-slate-500 mb-3">Çöp Kutusu</h3>
          <div className="grid gap-3">
            {trashed.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl opacity-80"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileJson size={16} className="text-slate-400 shrink-0" />
                    <span className="font-medium text-slate-600 truncate line-through">
                      {s.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                    <span>Silindi: {formatTime(s.deletedAt!)}</span>
                    <span>{formatBytes(s.sizeBytes)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleRestore(s.id)}
                    className="px-3 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                  >
                    Geri Yükle
                  </button>
                  <button
                    type="button"
                    onClick={() => void handlePurge(s.id)}
                    className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                  >
                    Kalıcı Sil
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
