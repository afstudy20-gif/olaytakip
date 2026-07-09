import { useCallback, useEffect, useState } from 'react'
import { Upload } from 'lucide-react'
import { uploadFile, createBlankSession } from '../api'
import { useStore } from '../store'
import RecentSessions from './RecentSessions'
import CloudSyncStrip from './CloudSyncStrip'
import { saveSessionSnapshot } from '../hooks/useAutoSession'

export default function UploadZone() {
  const [drag, setDrag] = useState(false)
  const { setSession, setLoading, setError, refreshRecentSessions } = useStore()

  // Refresh the recent-sessions list whenever the landing page is shown.
  useEffect(() => {
    void refreshRecentSessions()
  }, [refreshRecentSessions])

  const handleFile = async (file: File) => {
    setLoading(true)
    setError(null)
    try {
      const session = await uploadFile(file)
      setSession(session)
      void saveSessionSnapshot({
        sessionId: session.session_id,
        filename: session.filename,
        nRows: session.rows,
        nCols: session.columns.length,
        activeTab: 'data',
      })
        .then(refreshRecentSessions)
        .catch((e) => console.warn('[UploadZone] initial snapshot failed', e))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yükleme başarısız')
    } finally {
      setLoading(false)
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDrag(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [])

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const onBlank = async () => {
    setLoading(true)
    setError(null)
    try {
      const session = await createBlankSession()
      setSession(session)
      void saveSessionSnapshot({
        sessionId: session.session_id,
        filename: session.filename,
        nRows: session.rows,
        nCols: session.columns.length,
        activeTab: 'data',
      })
        .then(refreshRecentSessions)
        .catch((e) => console.warn('[UploadZone] initial snapshot failed', e))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Oturum oluşturulamadı')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto mt-12 p-6 flex flex-col items-center gap-6">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={[
          'w-full border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition',
          drag ? 'border-indigo-600 bg-indigo-50' : 'border-slate-300 bg-white',
        ].join(' ')}
      >
        <label className="block cursor-pointer">
          <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onChange} />
          <Upload size={32} className="mx-auto text-indigo-500 mb-3" />
          <p className="text-slate-700 font-medium">Excel veya CSV dosyasını sürükleyin ya da seçin</p>
          <p className="text-sm text-slate-500 mt-2">.csv, .xlsx, .xls</p>
        </label>
      </div>

      <button
        type="button"
        onClick={onBlank}
        className="text-sm text-indigo-600 hover:underline"
      >
        Boş oturumla başla
      </button>

      <RecentSessions />
      <CloudSyncStrip />
    </div>
  )
}
