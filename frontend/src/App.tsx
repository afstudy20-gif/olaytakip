import { useStore } from './store'
import useAutoSession from './hooks/useAutoSession'
import UploadZone from './components/UploadZone'
import DataTable from './components/DataTable'
import OlaySummaryPanel from './components/OlaySummaryPanel'
import ZReportPanel from './components/ZReportPanel'
import OlayChartsPanel from './components/OlayChartsPanel'
import SessionsPanel from './components/SessionsPanel'
import CloudSyncBar from './components/CloudSyncBar'

const TABS: { key: import('./types').TabName; label: string }[] = [
  { key: 'data', label: 'Data' },
  { key: 'summary', label: 'Summary' },
  { key: 'zreport', label: 'Z Raporu' },
  { key: 'visuals', label: 'Görsel Özet' },
  { key: 'sessions', label: 'Oturumlar' },
]

function App() {
  useAutoSession()

  const { session, activeTab, setActiveTab, error } = useStore()

  if (!session) {
    return (
      <div className="min-h-screen py-10">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-indigo-700">Olay Takip</h1>
          <p className="mt-2 text-slate-600">Excel'den veri yükleyin ve analiz edin</p>
        </div>
        {error && <p className="text-center text-red-600 mb-4">{error}</p>}
        <UploadZone />
        <div className="max-w-3xl mx-auto mt-10 px-4">
          <SessionsPanel />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-indigo-700">Olay Takip</h1>
          <p className="text-sm text-slate-500">{session.filename} • {session.rows} kayıt</p>
        </div>
        <div className="flex items-center gap-3">
          <CloudSyncBar />
          <button
            type="button"
            onClick={() => useStore.getState().setSession(null)}
            className="text-sm text-slate-600 hover:text-indigo-700"
          >
            Yeni yükle
          </button>
        </div>
      </header>
      <nav className="bg-white border-b border-slate-200 px-6">
        <div className="flex gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={[
                'px-4 py-2 text-sm font-medium border-b-2 transition',
                activeTab === tab.key
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-600 hover:text-indigo-600',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>
      <main className="flex-1 overflow-hidden">
        {error && <p className="p-6 text-red-600">{error}</p>}
        {activeTab === 'data' ? (
          <DataTable />
        ) : (
          <div className="h-full overflow-auto p-6">
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              {activeTab === 'summary' && <OlaySummaryPanel />}
              {activeTab === 'zreport' && <ZReportPanel />}
              {activeTab === 'visuals' && <OlayChartsPanel />}
              {activeTab === 'sessions' && <SessionsPanel />}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
