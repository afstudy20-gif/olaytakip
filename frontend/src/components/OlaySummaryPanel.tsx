import { useEffect, useState } from 'react'
import JSZip from 'jszip'
import { Download, FileArchive } from 'lucide-react'
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

function sanitizeFilename(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\u00C0-\u017F\s_-]/g, '')
      .trim()
      .replace(/\s+/g, '_') || 'grafik'
  )
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

interface ChartItem {
  label: string
  value: number
}

interface ChartSpec {
  title: string
  items: ChartItem[]
  color: string
}

function drawBarChart(canvas: HTMLCanvasElement, title: string, items: ChartItem[], color: string) {
  const width = 800
  const padding = 28
  const titleHeight = 46
  const rowHeight = 34
  const labelWidth = 240
  const valueWidth = 90
  const gap = 20
  const barMaxWidth = width - padding * 2 - labelWidth - valueWidth - gap
  const max = items.length ? Math.max(...items.map((i) => i.value)) : 1

  canvas.width = width
  canvas.height = titleHeight + items.length * rowHeight + padding * 2

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, canvas.height)

  ctx.fillStyle = '#111827'
  ctx.font = 'bold 20px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  ctx.fillText(title, padding, padding + 24)

  items.forEach((item, idx) => {
    const y = padding + titleHeight + idx * rowHeight
    const label = item.label.length > 32 ? item.label.slice(0, 29) + '...' : item.label

    ctx.fillStyle = '#374151'
    ctx.font = '14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(label, padding, y + 22)

    const barW = (item.value / max) * barMaxWidth
    ctx.fillStyle = color
    ctx.fillRect(padding + labelWidth, y + 6, Math.max(2, barW), 16)

    ctx.fillStyle = '#6b7280'
    ctx.fillText(fmtNumber(item.value, 0), padding + labelWidth + barMaxWidth + gap, y + 22)
  })
}

function downloadChartPng(spec: ChartSpec) {
  const canvas = document.createElement('canvas')
  drawBarChart(canvas, spec.title, spec.items, spec.color)
  canvas.toBlob((blob) => {
    if (blob) {
      triggerDownload(blob, `${sanitizeFilename(spec.title)}.png`)
    }
  }, 'image/png')
}

function distributionToChart(title: string, items: DistributionItem[], color: string): ChartSpec {
  return {
    title,
    color,
    items: items.slice(0, 8).map((i) => ({ label: i.value, value: i.count })),
  }
}

function columnToChart(column: ColumnSummary): ChartSpec | null {
  if (column.kind === 'numeric' && column.histogram && column.histogram.length > 0) {
    return {
      title: `${displayColumnName(column.name)} - Histogram`,
      color: '#10b981',
      items: column.histogram.map((b: HistogramBin) => ({ label: b.bin, value: b.count })),
    }
  }
  if (column.kind === 'date' && column.distribution && column.distribution.length > 0) {
    return distributionToChart(`${displayColumnName(column.name)} - Aylık Dağılım`, column.distribution, '#f59e0b')
  }
  if ((column.kind === 'categorical' || column.kind === 'text') && column.top_values && column.top_values.length > 0) {
    return distributionToChart(`${displayColumnName(column.name)} - Sık Değerler`, column.top_values, '#6366f1')
  }
  return null
}

async function downloadAllCharts(specs: ChartSpec[]) {
  if (specs.length === 0) return
  const zip = new JSZip()
  for (const spec of specs) {
    const canvas = document.createElement('canvas')
    drawBarChart(canvas, spec.title, spec.items, spec.color)
    const dataUrl = canvas.toDataURL('image/png')
    const base64 = dataUrl.split(',')[1]
    zip.file(`${sanitizeFilename(spec.title)}.png`, base64, { base64: true })
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  triggerDownload(blob, 'ozet_grafikler.zip')
}

export default function OlaySummaryPanel() {
  const session = useStore((s) => s.session)
  const summary = useStore((s) => s.summary)
  const setSummary = useStore((s) => s.setSummary)
  const filters = useStore((s) => s.filters)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setLocalError] = useState<string | null>(null)
  const [downloadingAll, setDownloadingAll] = useState(false)

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

  const allChartSpecs: ChartSpec[] = [
    ...(summary.cinsiyet?.length ? [distributionToChart('Cinsiyet', summary.cinsiyet, '#6366f1')] : []),
    ...(summary.yas_grubu?.length ? [distributionToChart('Yaş Grubu', summary.yas_grubu, '#6366f1')] : []),
    ...(summary.konu?.length ? [distributionToChart('Konu', summary.konu, '#6366f1')] : []),
    ...(summary.il?.length ? [distributionToChart('İl', summary.il, '#6366f1')] : []),
    ...(summary.ilce?.length ? [distributionToChart('İlçe', summary.ilce, '#6366f1')] : []),
    ...(summary.aylik_gelis?.length
      ? [
          distributionToChart(
            'Aylık Gelişler',
            summary.aylik_gelis.map((r) => ({ value: r.ay, count: r.count, percent: 0 })),
            '#6366f1'
          ),
        ]
      : []),
    ...(summary.columns?.map(columnToChart).filter(Boolean) as ChartSpec[]),
  ]

  const handleDownloadAll = async () => {
    setDownloadingAll(true)
    try {
      await downloadAllCharts(allChartSpecs)
    } catch (err) {
      console.error('Batch summary download failed:', err)
    } finally {
      setDownloadingAll(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-800">Özet</h2>
        {allChartSpecs.length > 0 && (
          <button
            type="button"
            onClick={handleDownloadAll}
            disabled={downloadingAll}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FileArchive size={16} />
            {downloadingAll ? 'Hazırlanıyor...' : 'Tüm Grafikleri İndir (ZIP)'}
          </button>
        )}
      </div>

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
        {summary.cinsiyet?.length > 0 && (
          <TopListCard
            title="Cinsiyet"
            items={summary.cinsiyet}
            onDownload={() => downloadChartPng(distributionToChart('Cinsiyet', summary.cinsiyet, '#6366f1'))}
          />
        )}
        {summary.yas_grubu?.length > 0 && (
          <TopListCard
            title="Yaş Grubu"
            items={summary.yas_grubu}
            onDownload={() => downloadChartPng(distributionToChart('Yaş Grubu', summary.yas_grubu, '#6366f1'))}
          />
        )}
        {summary.konu && summary.konu.length > 0 && (
          <TopListCard
            title="Konu"
            items={summary.konu}
            onDownload={() => downloadChartPng(distributionToChart('Konu', summary.konu!, '#6366f1'))}
          />
        )}
        {summary.il && summary.il.length > 0 && (
          <TopListCard
            title="İl"
            items={summary.il}
            onDownload={() => downloadChartPng(distributionToChart('İl', summary.il!, '#6366f1'))}
          />
        )}
        {summary.ilce && summary.ilce.length > 0 && (
          <TopListCard
            title="İlçe"
            items={summary.ilce}
            onDownload={() => downloadChartPng(distributionToChart('İlçe', summary.ilce!, '#6366f1'))}
          />
        )}
        {summary.aylik_gelis && summary.aylik_gelis.length > 0 && (
          <TopListCard
            title="Aylık Gelişler"
            items={summary.aylik_gelis.map((r) => ({ value: r.ay, count: r.count, percent: 0 }))}
            onDownload={() =>
              downloadChartPng(
                distributionToChart(
                  'Aylık Gelişler',
                  summary.aylik_gelis!.map((r) => ({ value: r.ay, count: r.count, percent: 0 })),
                  '#6366f1'
                )
              )
            }
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

function TopListCard({
  title,
  items,
  onDownload,
}: {
  title: string
  items: DistributionItem[]
  onDownload?: () => void
}) {
  const top = items.slice(0, 6)
  const max = top.length ? Math.max(...top.map((i) => i.count)) : 1
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        {onDownload && (
          <button
            type="button"
            onClick={onDownload}
            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            title="Bu grafiği indir"
            aria-label={`${title} grafiğini indir`}
          >
            <Download size={16} />
          </button>
        )}
      </div>
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
  const chart = columnToChart(column)

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-slate-800">{displayColumnName(column.name)}</h4>
          <p className="text-xs text-slate-500">
            {kindLabel(column.kind)} · {fmtNumber(column.count, 0)} kayıt
          </p>
        </div>
        <div className="flex items-center gap-1">
          {chart && (
            <button
              type="button"
              onClick={() => downloadChartPng(chart)}
              className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              title="Bu grafiği indir"
              aria-label={`${displayColumnName(column.name)} grafiğini indir`}
            >
              <Download size={16} />
            </button>
          )}
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

      {column.kind === 'numeric' && <NumericSummary column={column} />}
      {column.kind === 'date' && <DateSummary column={column} />}
      {(column.kind === 'categorical' || column.kind === 'text') && <CategoricalSummary column={column} />}
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
      {column.histogram && column.histogram.length > 0 && <HistogramBars bins={column.histogram} />}
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
      {column.distribution && column.distribution.length > 0 && <DistributionBars items={column.distribution} />}
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
            <span className="truncate text-slate-600" title={b.bin}>
              {b.bin}
            </span>
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
