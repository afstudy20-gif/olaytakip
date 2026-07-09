import { useEffect, useState } from 'react'
import { Cloud, CloudDownload, LogOut, RefreshCw } from 'lucide-react'
import { cloudSync, type CloudStatusInfo } from '../lib/cloudSync'
import CloudClientIdSetup from './CloudClientIdSetup'

export default function CloudSyncStrip() {
  const [cloud, setCloud] = useState<CloudStatusInfo>(cloudSync.getStatus())
  const [busy, setBusy] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)

  useEffect(() => {
    const unsub = cloudSync.subscribe(setCloud)
    return unsub
  }, [])

  const onConnect = () => {
    if (cloud.status === 'setupNeeded') {
      setSetupOpen(true)
      return
    }
    void cloudSync.signIn().catch((e) => console.warn('[cloud] signIn', e))
  }

  const onSync = async () => {
    setBusy(true)
    try {
      await cloudSync.syncNow(true)
    } catch (e) {
      console.warn('[cloud] sync', e)
    } finally {
      setBusy(false)
    }
  }

  const onDisconnect = () => {
    if (window.confirm('Google Drive bağlantısı kesilsin mi? Yerel oturum kayıtlarınız silinmez.')) {
      void cloudSync.signOut()
    }
  }

  if (setupOpen) {
    return (
      <div className="w-full max-w-2xl">
        <CloudClientIdSetup variant="strip" onDone={() => setSetupOpen(false)} />
      </div>
    )
  }

  return (
    <div className="w-full max-w-2xl rounded-xl border border-sky-200 bg-sky-50/60 px-4 py-3 flex items-center gap-3 flex-wrap">
      <Cloud size={18} className="text-sky-500 shrink-0" />
      <div className="flex-1 min-w-0">
        {cloud.signedIn ? (
          <>
            <p className="text-xs font-semibold text-sky-800 truncate">
              Google Drive bağlı
              {cloud.user?.email && (
                <span className="font-normal text-sky-600"> · {cloud.user.email}</span>
              )}
            </p>
            <p className="text-[10px] text-sky-500">
              {cloud.status === 'syncing'
                ? 'Senkronize ediliyor…'
                : cloud.status === 'error'
                  ? `Hata: ${cloud.message || 'senkronizasyon başarısız'}`
                  : cloud.lastSync
                    ? `Son senkronizasyon: ${new Date(cloud.lastSync).toLocaleString('tr-TR')}`
                    : 'Henüz senkronize edilmedi'}
            </p>
          </>
        ) : (
          <>
            <p className="text-xs font-semibold text-sky-800">
              Google Drive ile cihazlar arası taşıyın &amp; yedekleyin
            </p>
            <p className="text-[10px] text-sky-500">
              Oturumlarınız kendi gizli Drive klasörünüze yedeklenir.
            </p>
          </>
        )}
      </div>
      {cloud.signedIn ? (
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onSync}
            disabled={busy}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 bg-white border border-sky-200 hover:bg-sky-100 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={busy ? 'animate-spin' : ''} />
            {busy ? '…' : 'Senkronize et'}
          </button>
          <button
            type="button"
            onClick={onDisconnect}
            className="inline-flex items-center text-[11px] font-semibold text-sky-600 hover:text-red-600 bg-white border border-sky-200 hover:border-red-200 hover:bg-red-50 rounded-lg px-2 py-1.5 transition-colors"
          >
            <LogOut size={12} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onConnect}
          className={`inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-lg px-3 py-1.5 transition-colors shrink-0 ${
            cloud.status === 'setupNeeded'
              ? 'text-amber-700 bg-amber-50 border border-amber-300 hover:bg-amber-100'
              : 'text-white bg-sky-600 hover:bg-sky-700'
          }`}
        >
          <CloudDownload size={13} />
          Drive Bağla
        </button>
      )}
    </div>
  )
}
