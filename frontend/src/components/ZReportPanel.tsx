import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { fetchZReport, exportDatasetUrl } from '../api'
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

export default function ZReportPanel() {
  const session = useStore((state) => state.session)
  const zreport = useStore((state) => state.zreport)
  const setZReport = useStore((state) => state.setZReport)
  const filters = useStore((state) => state.filters)

  const [granularity, setGranularity] = useState<ZGranularity>('monthly')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

        <div className="flex items-center gap-2">
          <a
            href={exportDatasetUrl(session.session_id, 'csv', session.filename)}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            download
          >
            CSV İndir
          </a>
          <a
            href={exportDatasetUrl(session.session_id, 'xlsx', session.filename)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            download
          >
            XLSX İndir
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
    </div>
  )
}
