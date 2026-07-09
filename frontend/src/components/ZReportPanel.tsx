import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { fetchZReport, exportDatasetUrl, exportZReportUrl } from '../api'
import type { ZGranularity } from '../api'
import type { ZReportRow } from '../types'

const GRANULARITY_OPTIONS: { value: ZGranularity; label: string }[] = [
  { value: 'daily', label: 'Günlük' },
  { value: 'weekly', label: 'Haftalık' },
  { value: 'monthly', label: 'Aylık' },
  { value: 'quarterly', label: '3 Aylık' },
  { value: 'half_yearly', label: '6 Aylık' },
  { value: 'yearly', label: 'Yıllık' },
]

const Z_REPORT_COLUMNS: { key: keyof ZReportRow; label: string }[] = [
  { key: 'period', label: 'Dönem' },
  { key: 'total', label: 'Toplam' },
  { key: 'unique_people', label: 'Benzersiz Kişi' },
  { key: 'erkek', label: 'Erkek' },
  { key: 'kadin', label: 'Kadın' },
  { key: 'top_konu', label: 'Top Konu' },
  { key: 'top_konu_count', label: 'Top Konu Sayısı' },
  { key: 'top_il', label: 'Top İl' },
  { key: 'top_il_count', label: 'Top İl Sayısı' },
  { key: 'top_ilce', label: 'Top İlçe' },
  { key: 'top_ilce_count', label: 'Top İlçe Sayısı' },
  { key: 'repeated_people', label: 'Tekrar Eden Kişi' },
  { key: 'repeated_visits', label: 'Tekrar Eden Ziyaret' },
]

export default function ZReportPanel() {
  const session = useStore((state) => state.session)
  const zreport = useStore((state) => state.zreport)
  const setZReport = useStore((state) => state.setZReport)
  const filters = useStore((state) => state.filters)

  const [granularity, setGranularity] = useState<ZGranularity>('monthly')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [selectedCols, setSelectedCols] = useState<string[]>(Z_REPORT_COLUMNS.map((c) => c.key))

  useEffect(() => {
    if (!session) return

    let cancelled = false
    setIsLoading(true)
    setError(null)

    fetchZReport(session.session_id, granularity, filters)
      .then((data) => {
        if (!cancelled) setZReport(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Z raporu alınamadı')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [session, granularity, filters, setZReport])

  if (!session) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-slate-500">
        <p>Lütfen önce bir oturum seçin veya dosya yükleyin.</p>
      </div>
    )
  }

  const rows: ZReportRow[] = zreport?.rows ?? []

  const toggleCol = (key: string) => {
    setSelectedCols((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  const downloadZReport = (fmt: 'csv' | 'xlsx') => {
    if (!session) return
    const url = exportZReportUrl(session.session_id, granularity, fmt, selectedCols, filters)
    const a = document.createElement('a')
    a.href = url
    a.download = `zreport_${granularity}.${fmt}`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-700">Dönem:</span>
          <div className="inline-flex flex-wrap gap-1" role="group">
            {GRANULARITY_OPTIONS.map((opt, idx) => {
              const active = granularity === opt.value
              const isFirst = idx === 0
              const isLast = idx === GRANULARITY_OPTIONS.length - 1
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setGranularity(opt.value)}
                  className={`border px-3 py-1.5 text-sm font-medium ${
                    active
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  } ${isFirst ? 'rounded-l-lg' : ''} ${isLast ? 'rounded-r-lg' : ''}`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setExportOpen(true)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Rapor İndir
          </button>
          <a
            href={exportDatasetUrl(session.session_id, 'csv', session.filename)}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            download
          >
            Tüm Veri CSV
          </a>
          <a
            href={exportDatasetUrl(session.session_id, 'xlsx', session.filename)}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            download
          >
            Tüm Veri XLSX
          </a>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
          <p>Z raporu yükleniyor...</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
          <p>Görüntülenecek rapor verisi bulunamadı.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Dönem
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Toplam
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Benzersiz Kişi
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Erkek
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Kadın
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Top Konu
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Top İl
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Top İlçe
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Tekrar Eden Kişi
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {rows.map((row, index) => (
                <tr key={`${row.period}-${index}`} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-900">
                    {row.period}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-700">
                    {row.total}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-700">
                    {row.unique_people}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-700">
                    {row.erkek}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-700">
                    {row.kadin}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {row.top_konu ? `${row.top_konu} (${row.top_konu_count})` : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {row.top_il ? `${row.top_il} (${row.top_il_count})` : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {row.top_ilce ? `${row.top_ilce} (${row.top_ilce_count})` : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-700">
                    {row.repeated_people}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {exportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <h3 className="mb-4 text-base font-semibold text-slate-800">Z Raporu İndir</h3>
            <p className="mb-3 text-sm text-slate-500">İndirmek istediğiniz sütunları seçin:</p>
            <div className="mb-4 max-h-64 space-y-2 overflow-y-auto rounded border border-slate-200 p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={selectedCols.length === Z_REPORT_COLUMNS.length}
                  onChange={(e) =>
                    setSelectedCols(e.target.checked ? Z_REPORT_COLUMNS.map((c) => c.key) : [])
                  }
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Tümünü Seç / Temizle
              </label>
              <div className="h-px bg-slate-100" />
              {Z_REPORT_COLUMNS.map((col) => (
                <label key={col.key} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={selectedCols.includes(col.key)}
                    onChange={() => toggleCol(col.key)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  {col.label}
                </label>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setExportOpen(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={() => downloadZReport('csv')}
                disabled={selectedCols.length === 0}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                CSV İndir
              </button>
              <button
                type="button"
                onClick={() => downloadZReport('xlsx')}
                disabled={selectedCols.length === 0}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                XLSX İndir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
