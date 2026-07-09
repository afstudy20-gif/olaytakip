import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { fetchSummary } from '../api'
import { fmtNumber, fmtPercent } from '../lib/format'
import type { ColumnSummary, DistributionItem, HistogramBin } from '../types'

const COLUMN_LABELS: Record<string, string> = {
  kayit_tarihi: 'Kayıt Tarihi',
  adi: 'Adı',
  soyadi: 'Soyadı',
  tc: 'TC',
  dogum_tarihi: 'Doğum Tarihi',
  gelis_tarihi: 'Geliş Tarihi',
  iletisim_gsm: 'İletişim GSM',
  ikamet_il: 'İkamet İl',
  ikamet_ilce: 'İkamet İlçe',
  konu: 'Konu',
  olay_ozeti: 'Olay Özeti',
}

function displayColumnName(name: string) {
  return COLUMN_LABELS[name] ?? name
}

function kindLabel(kind: string) {
  if (kind === 'numeric') return 'Sayısal'
  if (kind === 'date') return 'Tarih'
  if (kind === 'text') return 'Metin'
  return 'Kategorik'
}

export default function OlaySummaryPanel() {
  const session = useStore((s) => s.session)
  const summary = useStore((s) => s.summary)
  const setSummary = useStore((s) => s.setSummary)
  const filters = useStore((s) => s.filters)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return

    let cancelled = false

    const load = async () => {
      setIsLoading(true)
      setLocalError(null)
      try {
        const data = await fetchSummary(session.session_id, filters)
        if (!cancelled) setSummary(data)
      } catch (err) {
        if (!cancelled) {
          setLocalError(err instanceof Error ? err.message : 'Özet yüklenirken hata oluştu')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [session, filters, setSummary])

  if (!session) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
        Lütfen önce bir oturum seçin veya yükleyin.
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500">
        <div className="mr-3 h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
        Özet verileri yükleniyor…
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
        <p className="font-medium">Hata</p>
        <p>{error}</p>
      </div>
    )
  }

  if (!summary) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-600">
        Özet verisi bulunamadı.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard label="Toplam Kayıt" value={fmtNumber(summary.total_records, 0)} />
        <MetricCard label="Benzersiz Kişi" value={fmtNumber(summary.unique_people, 0)} />
        <MetricCard label="Tekrar Eden Kişi" value={fmtNumber(summary.repeated_people, 0)} />
        <MetricCard
          label="Tekrar Oranı"
          value={
            summary.unique_people
              ? fmtPercent((summary.repeated_people / summary.unique_people) * 100, 1)
              : fmtPercent(0, 1)
          }
        />
        <MetricCard
          label="Ortalama Kayıt/Kişi"
          value={
            summary.unique_people
              ? fmtNumber(summary.total_records / summary.unique_people, 1)
              : fmtNumber(0, 1)
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TopListCard title="Cinsiyet" items={summary.cinsiyet} />
        <TopListCard title="Yaş Grubu" items={summary.yas_grubu} />
        {summary.konu && <TopListCard title="Konu" items={summary.konu} />}
        {summary.il && <TopListCard title="İl" items={summary.il} />}
        {summary.ilce && <TopListCard title="İlçe" items={summary.ilce} />}
        {summary.aylik_gelis && summary.aylik_gelis.length > 0 && (
          <TopListCard
            title="Aylık Gelişler"
            items={summary.aylik_gelis.map((r) => ({ value: r.ay, count: r.count, percent: 0 }))}
          />
        )}
      </div>

      {summary.columns && summary.columns.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold text-slate-800">Parametre Özetleri</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {summary.columns.map((col) => (
              <ColumnCard key={col.name} column={col} total={summary.total_records} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-800 sm:text-2xl">{value}</p>
    </div>
  )
}

function TopListCard({ title, items }: { title: string; items: DistributionItem[] }) {
  const top = items.slice(0, 6)
  const max = top.length ? Math.max(...top.map((i) => i.count)) : 1
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">{title}</h3>
      <div className="space-y-2.5">
        {top.map((item) => (
          <div key={item.value}>
            <div className="flex items-center justify-between text-xs">
              <span className="truncate text-slate-700" title={item.value}>
                {item.value}
              </span>
              <span className="ml-2 shrink-0 tabular-nums text-slate-500">
                {fmtNumber(item.count, 0)} {item.percent ? `(${fmtPercent(item.percent, 1)})` : ''}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100">
              <div
                className="h-1.5 rounded-full bg-indigo-500"
                style={{ width: `${Math.max(4, (item.count / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ColumnCard({ column, total }: { column: ColumnSummary; total: number }) {
  const completeness = total ? ((total - column.missing) / total) * 100 : 0
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-slate-800">{displayColumnName(column.name)}</h4>
          <p className="text-xs text-slate-500">{kindLabel(column.kind)} · {fmtNumber(column.count, 0)} kayıt</p>
        </div>
        <span
          className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
            column.kind === 'numeric'
              ? 'bg-emerald-50 text-emerald-700'
              : column.kind === 'date'
                ? 'bg-amber-50 text-amber-700'
                : 'bg-slate-100 text-slate-700'
          }`}
        >
          {column.unique} benzersiz
        </span>
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">Eksiksizlik</span>
          <span className="font-medium text-slate-700">{fmtPercent(completeness, 1)}</span>
        </div>
        <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100">
          <div
            className="h-1.5 rounded-full bg-indigo-500"
            style={{ width: `${Math.max(4, completeness)}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-slate-400">
          {column.missing} eksik · {total - column.missing} dolu
        </p>
      </div>

      {column.kind === 'numeric' && (
        <NumericSummary column={column} />
      )}

      {column.kind === 'date' && (
        <DateSummary column={column} />
      )}

      {(column.kind === 'categorical' || column.kind === 'text') && (
        <CategoricalSummary column={column} />
      )}
    </div>
  )
}

function NumericSummary({ column }: { column: ColumnSummary }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Stat label="Min" value={column.min != null ? fmtNumber(Number(column.min), 2) : '-'} />
        <Stat label="Max" value={column.max != null ? fmtNumber(Number(column.max), 2) : '-'} />
        <Stat label="Ortalama" value={column.mean != null ? fmtNumber(column.mean, 2) : '-'} />
        <Stat label="Medyan" value={column.median != null ? fmtNumber(column.median, 2) : '-'} />
        <Stat label="Std" value={column.std != null ? fmtNumber(column.std, 2) : '-'} />
        <Stat label="Benzersiz" value={fmtNumber(column.unique, 0)} />
      </div>
      {column.histogram && column.histogram.length > 0 && (
        <HistogramBars bins={column.histogram} />
      )}
    </div>
  )
}

function DateSummary({ column }: { column: ColumnSummary }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Stat label="Min" value={column.min != null ? String(column.min).slice(0, 10) : '-'} />
        <Stat label="Max" value={column.max != null ? String(column.max).slice(0, 10) : '-'} />
      </div>
      {column.distribution && column.distribution.length > 0 && (
        <DistributionBars items={column.distribution} />
      )}
    </div>
  )
}

function CategoricalSummary({ column }: { column: ColumnSummary }) {
  if (!column.top_values || column.top_values.length === 0) {
    return <p className="text-xs text-slate-400">Değer yok</p>
  }
  return <DistributionBars items={column.top_values} />
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-slate-50 px-2 py-1">
      <span className="block text-slate-400">{label}</span>
      <span className="font-medium text-slate-700">{value}</span>
    </div>
  )
}

function HistogramBars({ bins }: { bins: HistogramBin[] }) {
  const max = bins.length ? Math.max(...bins.map((b) => b.count)) : 1
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-slate-600">Histogram</p>
      {bins.map((b, i) => (
        <div key={i}>
          <div className="flex items-center justify-between text-xs">
            <span className="truncate text-slate-600" title={b.bin}>{b.bin}</span>
            <span className="ml-2 shrink-0 tabular-nums text-slate-500">{fmtNumber(b.count, 0)}</span>
          </div>
          <div className="mt-0.5 h-1.5 w-full rounded-full bg-slate-100">
            <div
              className="h-1.5 rounded-full bg-emerald-500"
              style={{ width: `${Math.max(3, (b.count / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function DistributionBars({ items }: { items: DistributionItem[] }) {
  const max = items.length ? Math.max(...items.map((i) => i.count)) : 1
  return (
    <div className="space-y-1.5">
      {items.slice(0, 8).map((item) => (
        <div key={item.value}>
          <div className="flex items-center justify-between text-xs">
            <span className="truncate text-slate-700" title={item.value}>
              {item.value}
            </span>
            <span className="ml-2 shrink-0 tabular-nums text-slate-500">
              {fmtNumber(item.count, 0)} {item.percent ? `(${fmtPercent(item.percent, 1)})` : ''}
            </span>
          </div>
          <div className="mt-0.5 h-1.5 w-full rounded-full bg-slate-100">
            <div
              className="h-1.5 rounded-full bg-indigo-500"
              style={{ width: `${Math.max(3, (item.count / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
