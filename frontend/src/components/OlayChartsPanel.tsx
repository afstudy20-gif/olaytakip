import { useEffect, useMemo, useState } from 'react'
import Plot from 'react-plotly.js'
import type { Data, Layout } from 'plotly.js'
// @ts-expect-error plotly.js/dist/plotly does not ship its own .d.ts but is the same runtime API.
import Plotly from 'plotly.js/dist/plotly'
import JSZip from 'jszip'
import { useStore } from '../store'
import { fetchCharts } from '../api'
import type { ChartData, ChartsData } from '../types'
import { Download, FileArchive } from 'lucide-react'

const CHART_KEYS: (keyof ChartsData)[] = [
  'cinsiyet',
  'yas_grubu',
  'aylik_trend',
  'cinsiyet_yas',
  'konu',
  'konu_cinsiyet',
  'konu_yas',
  'aylik_konu',
  'il',
  'il_yas',
  'ilce',
]

function sanitizeFilename(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\u00C0-\u017F\s_-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    || 'grafik'
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

async function renderPng(chart: ChartData): Promise<string> {
  const layout: Partial<Layout> = {
    ...(chart.layout as Partial<Layout>),
    autosize: false,
    width: 900,
    height: 520,
    margin: { l: 60, r: 30, t: 60, b: 60 },
    title: { text: chart.title, font: { size: 18 } },
  }
  return Plotly.toImage(
    {
      data: chart.data as Data[],
      layout,
    },
    { format: 'png', width: 900, height: 520 }
  )
}

async function downloadSingle(chart: ChartData) {
  const dataUrl = await renderPng(chart)
  const base64 = dataUrl.split(',')[1]
  const byteString = atob(base64)
  const bytes = new Uint8Array(byteString.length)
  for (let i = 0; i < byteString.length; i++) {
    bytes[i] = byteString.charCodeAt(i)
  }
  triggerDownload(new Blob([bytes], { type: 'image/png' }), `${sanitizeFilename(chart.title)}.png`)
}

async function downloadZip(charts: ChartData[]) {
  const zip = new JSZip()
  for (const chart of charts) {
    const dataUrl = await renderPng(chart)
    const base64 = dataUrl.split(',')[1]
    zip.file(`${sanitizeFilename(chart.title)}.png`, base64, { base64: true })
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  triggerDownload(blob, 'grafikler.zip')
}

export default function OlayChartsPanel() {
  const session = useStore((state) => state.session)
  const charts = useStore((state) => state.charts)
  const setCharts = useStore((state) => state.setCharts)
  const filters = useStore((state) => state.filters)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloadingAll, setDownloadingAll] = useState(false)

  useEffect(() => {
    if (!session) return

    let cancelled = false

    setIsLoading(true)
    setError(null)

    fetchCharts(session.session_id, filters)
      .then((data) => {
        if (!cancelled) setCharts(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Grafikler yüklenirken bir hata oluştu')
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [session, filters, setCharts])

  const visibleCharts = useMemo(() => {
    if (!charts) return []
    return CHART_KEYS.map((key) => ({ key, chart: charts[key] })).filter(
      (item): item is { key: keyof ChartsData; chart: ChartData } => !!item.chart
    )
  }, [charts])

  const handleDownloadAll = async () => {
    if (!charts || visibleCharts.length === 0) return
    setDownloadingAll(true)
    try {
      await downloadZip(visibleCharts.map((c) => c.chart))
    } catch (err) {
      console.error('Batch download failed:', err)
    } finally {
      setDownloadingAll(false)
    }
  }

  if (!session) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-800">
        <p>Görselleştirmeleri görmek için lütfen önce bir oturum seçin veya yükleyin.</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500">
        <div className="mr-3 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
        <p>Grafikler yükleniyor...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
        <p className="font-semibold">Grafikler yüklenirken hata oluştu</p>
        <p className="mt-1">{error}</p>
      </div>
    )
  }

  if (!charts || visibleCharts.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-slate-600">
        <p>Henüz grafik verisi bulunmuyor.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Görselleştirmeler</h2>
          <p className="text-xs text-slate-500">Tekli veya birleşik grafikleri indirebilirsiniz.</p>
        </div>
        <button
          type="button"
          onClick={handleDownloadAll}
          disabled={downloadingAll}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <FileArchive size={16} />
          {downloadingAll ? 'Hazırlanıyor...' : 'Tümünü İndir (ZIP)'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {visibleCharts.map(({ key, chart }) => (
          <div
            key={String(key)}
            className="relative flex flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-2 flex items-start justify-between">
              <h3 className="text-center text-lg font-semibold text-slate-800">{chart.title}</h3>
              <button
                type="button"
                onClick={() => downloadSingle(chart)}
                className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                title="Bu grafiği indir"
                aria-label={`${chart.title} grafiğini indir`}
              >
                <Download size={18} />
              </button>
            </div>
            <div className="min-h-[360px] flex-1">
              <Plot
                data={chart.data as Data[]}
                layout={{
                  ...(chart.layout as Partial<Layout>),
                  autosize: true,
                }}
                config={{ responsive: true, displayModeBar: false }}
                style={{ width: '100%', height: '100%', minHeight: '360px' }}
                useResizeHandler
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
