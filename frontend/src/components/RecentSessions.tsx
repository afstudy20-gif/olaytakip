import { useEffect, useState } from 'react'
import { Clock, Database, FileJson, RotateCcw, Trash2, Sparkles } from 'lucide-react'
import { useStore } from '../store'
import { subscribeSessions, trashSession, type RecentSessionMeta } from '../lib/sessionDb'

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fmtAgo(epochMs: number): string {
  const diff = Date.now() - epochMs
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'az önce'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} dk önce`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} sa önce`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day} gün önce`
  return new Date(epochMs).toLocaleDateString('tr-TR')
}

const TAB_LABELS: Record<string, string> = {
  data: 'Data',
  summary: 'Summary',
  zreport: 'Z Raporu',
  visuals: 'Visuals',
  sessions: 'Oturumlar',
}

export default function RecentSessions() {
  const { recentSessions, refreshRecentSessions, loadRecentSession, setError } = useStore()
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let mounted = true
    const unsub = subscribeSessions(() => {
      if (mounted) void refreshRecentSessions()
    })
    void refreshRecentSessions().finally(() => {
      if (mounted) setLoaded(true)
    })
    return () => {
      mounted = false
      unsub()
    }
  }, [refreshRecentSessions])

  const active = recentSessions.filter((s) => !s.deletedAt)

  const handleRestore = async (id: string) => {
    try {
      await loadRecentSession(id)
    } catch (e) {
      console.warn('[RecentSessions] restore failed', e)
      setError(e instanceof Error ? e.message : 'Oturum yüklenemedi')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await trashSession(id)
      await refreshRecentSessions()
    } catch (e) {
      console.warn('[RecentSessions] delete failed', e)
      setError('Oturum silinemedi')
    }
  }

  if (!loaded) return null

  if (active.length === 0) {
    return (
      <div className="w-full max-w-2xl rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
        <Database size={28} className="mx-auto mb-2 text-slate-300" />
        <p className="text-sm text-slate-600">Henüz kaydedilmiş oturum yok.</p>
        <p className="text-xs text-slate-400 mt-1">
          Bir dosya yüklediğinizde veya boş oturumda veri girdiğinizde otomatik olarak burada listelenecektir.
        </p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-2xl space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Clock size={14} className="text-indigo-500" />
        <h3 className="text-xs font-semibold text-slate-700">Son Çalışmalar</h3>
        <span className="text-[10px] text-slate-400">
          (tarayıcınızda otomatik saklanır)
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {active.map((it: RecentSessionMeta) => (
          <div
            key={it.id}
            className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <FileJson size={14} className="text-indigo-500 shrink-0" />
                <span className="text-xs font-semibold text-slate-800 truncate" title={it.name}>
                  {it.name}
                </span>
              </div>
              {it.source === 'auto' && (
                <span
                  className="text-[8px] uppercase tracking-wide bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-bold shrink-0"
                  title="Otomatik kayıt"
                >
                  <Sparkles size={9} className="inline mr-0.5" />
                  Auto
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-[10px] text-slate-500 mb-2">
              {it.nRows != null && it.nCols != null && (
                <span className="flex items-center gap-0.5">
                  <Database size={10} />
                  {it.nRows.toLocaleString('tr-TR')} × {it.nCols}
                </span>
              )}
              <span>·</span>
              <span>{fmtBytes(it.sizeBytes)}</span>
              <span>·</span>
              <span title={new Date(it.savedAt).toLocaleString('tr-TR')}>{fmtAgo(it.savedAt)}</span>
            </div>

            {it.activeTab && (
              <p className="text-[10px] text-slate-400 mb-2.5">
                Kaldığı yer:{' '}
                <span className="font-semibold text-slate-600">
                  {TAB_LABELS[it.activeTab] ?? it.activeTab}
                </span>
              </p>
            )}

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleRestore(it.id)}
                className="flex-1 flex items-center justify-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
              >
                <RotateCcw size={11} />
                Devam et
              </button>
              <button
                type="button"
                onClick={() => handleDelete(it.id)}
                className="text-slate-400 hover:text-red-600 hover:bg-red-50 px-2 py-1.5 rounded-lg transition-colors"
                title="Çöp kutusuna taşı"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
