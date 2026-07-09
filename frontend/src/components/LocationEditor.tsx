import { useEffect, useMemo, useRef, useState } from 'react'
import { TURKIYE_ILLER, ilceleriGetir, YURTDISI_LABEL } from '../lib/turkiye_il_ilce'
import { getDefaultIl } from '../lib/defaultIl'

interface LocationEditorProps {
  value: string
  column: 'ikamet_il' | 'ikamet_ilce'
  row: Record<string, unknown>
  onSave: (value: string) => void
  onCancel: () => void
}

const DIGER_LABEL = 'Diğer (manuel)'

export default function LocationEditor({ value, column, row, onSave, onCancel }: LocationEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const currentIl = String(row['ikamet_il'] ?? '')

  const parsed = useMemo(() => {
    const v = value == null ? '' : String(value)
    if (v.startsWith(`${YURTDISI_LABEL} - `)) {
      return { mode: 'yurtdisi' as const, manual: v.slice(`${YURTDISI_LABEL} - `.length) }
    }
    if (v === YURTDISI_LABEL) {
      return { mode: 'yurtdisi' as const, manual: '' }
    }
    return { mode: 'turkiye' as const, manual: v }
  }, [value])

  const [selectedIl, setSelectedIl] = useState(() => {
    if (column === 'ikamet_il') {
      if (parsed.mode === 'yurtdisi') return YURTDISI_LABEL
      if (TURKIYE_ILLER.includes(parsed.manual)) return parsed.manual
      if (currentIl && TURKIYE_ILLER.includes(currentIl)) return currentIl
      return getDefaultIl() ?? ''
    }
    if (currentIl && TURKIYE_ILLER.includes(currentIl)) return currentIl
    return getDefaultIl() ?? ''
  })

  const [selectedIlce, setSelectedIlce] = useState(() => {
    if (column === 'ikamet_il') return ''
    const ilceler = selectedIl ? ilceleriGetir(selectedIl) : []
    if (parsed.mode === 'yurtdisi') return YURTDISI_LABEL
    if (ilceler.includes(parsed.manual)) return parsed.manual
    if (parsed.manual) return DIGER_LABEL
    return ''
  })

  const [manual, setManual] = useState(() => {
    if (parsed.mode === 'yurtdisi') return parsed.manual
    if (column === 'ikamet_il' && selectedIl && !TURKIYE_ILLER.includes(selectedIl) && selectedIl !== YURTDISI_LABEL) return selectedIl
    if (column === 'ikamet_ilce' && selectedIlce === DIGER_LABEL) return parsed.manual
    return ''
  })

  const ilceler = useMemo(() => (selectedIl ? ilceleriGetir(selectedIl) : []), [selectedIl])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onCancel()
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter') handleSave()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onCancel])

  const handleSave = () => {
    if (column === 'ikamet_il') {
      if (selectedIl === YURTDISI_LABEL) {
        onSave(manual.trim() ? `${YURTDISI_LABEL} - ${manual.trim()}` : YURTDISI_LABEL)
      } else if (selectedIl === DIGER_LABEL) {
        onSave(manual.trim())
      } else {
        onSave(selectedIl)
      }
    } else {
      if (selectedIl === YURTDISI_LABEL) {
        onSave(manual.trim() ? `${YURTDISI_LABEL} - ${manual.trim()}` : YURTDISI_LABEL)
      } else if (selectedIlce === DIGER_LABEL) {
        onSave(manual.trim())
      } else {
        onSave(selectedIlce)
      }
    }
  }

  const isIlceColumn = column === 'ikamet_ilce'

  return (
    <div
      ref={containerRef}
      className="absolute z-50 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="space-y-2">
        {isIlceColumn && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">İl</label>
            <select
              value={selectedIl}
              onChange={(e) => {
                setSelectedIl(e.target.value)
                setSelectedIlce('')
                setManual('')
              }}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">İl seçin</option>
              {TURKIYE_ILLER.map((il) => (
                <option key={il} value={il}>
                  {il}
                </option>
              ))}
              <option value={YURTDISI_LABEL}>{YURTDISI_LABEL}</option>
            </select>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            {isIlceColumn ? 'İlçe' : 'İl'}
          </label>
          <select
            value={isIlceColumn ? selectedIlce : selectedIl}
            onChange={(e) => {
              const val = e.target.value
              if (isIlceColumn) {
                setSelectedIlce(val)
              } else {
                setSelectedIl(val)
              }
              if (val !== DIGER_LABEL && val !== YURTDISI_LABEL) {
                setManual('')
              }
            }}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">{isIlceColumn ? 'İlçe seçin' : 'İl seçin'}</option>
            {isIlceColumn
              ? ilceler.map((ilce) => (
                  <option key={ilce} value={ilce}>
                    {ilce}
                  </option>
                ))
              : TURKIYE_ILLER.map((il) => (
                  <option key={il} value={il}>
                    {il}
                  </option>
                ))}
            <option value={YURTDISI_LABEL}>{YURTDISI_LABEL}</option>
            <option value={DIGER_LABEL}>{DIGER_LABEL}</option>
          </select>
        </div>

        {(selectedIl === YURTDISI_LABEL ||
          selectedIlce === DIGER_LABEL ||
          (!isIlceColumn && selectedIl === DIGER_LABEL)) && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              {selectedIl === YURTDISI_LABEL ? 'Yurtdışı açıklaması' : 'Manuel giriş'}
            </label>
            <input
              autoFocus
              type="text"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder={selectedIl === YURTDISI_LABEL ? 'Örn: Almanya, Berlin' : 'Değer girin'}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            İptal
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-700"
          >
            Kaydet
          </button>
        </div>
      </div>
    </div>
  )
}

export function isLocationColumn(name: string): name is 'ikamet_il' | 'ikamet_ilce' {
  return name === 'ikamet_il' || name === 'ikamet_ilce'
}
