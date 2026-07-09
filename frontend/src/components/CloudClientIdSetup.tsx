import { useEffect, useRef, useState } from 'react'
import { getClientId } from '../lib/cloudConfig'
import { cloudSync } from '../lib/cloudSync'

interface CloudClientIdSetupProps {
  onDone?: () => void
  variant?: 'bar' | 'strip'
}

export default function CloudClientIdSetup({ onDone, variant = 'bar' }: CloudClientIdSetupProps) {
  const [value, setValue] = useState(() => getClientId())
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSave = async () => {
    const trimmed = value.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      await cloudSync.setClientId(trimmed)
      onDone?.()
    } catch (e) {
      console.warn('[cloud] setClientId failed', e)
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    setValue('')
    await cloudSync.setClientId(null)
    onDone?.()
  }

  if (variant === 'strip') {
    return (
      <div className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-xs font-semibold text-amber-800">
          Google Drive bağlantısı için kendi OAuth Client ID'nizi ekleyin
        </p>
        <p className="text-[10px] text-amber-600 mt-0.5">
          Client ID'niz yalnızca bu tarayıcıda saklanır. console.cloud.google.com → Credentials → OAuth client ID (Web).
        </p>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            placeholder="1234567890-abc.apps.googleusercontent.com"
            className="flex-1 min-w-[220px] rounded border border-amber-300 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !value.trim()}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
          {getClientId() && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
            >
              Temizle
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-xl border border-amber-200 bg-white p-3 shadow-xl">
      <p className="text-xs font-semibold text-amber-800">
        Google Drive Client ID
      </p>
      <p className="text-[10px] text-slate-500 mt-0.5">
        Client ID'nizi girin. Yalnızca bu tarayıcıda saklanır.
      </p>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        placeholder="1234567890-abc.apps.googleusercontent.com"
        className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        {getClientId() && (
          <button
            type="button"
            onClick={handleClear}
            className="text-[11px] font-medium text-slate-500 hover:text-red-600"
          >
            Temizle
          </button>
        )}
        <button
          type="button"
          onClick={() => onDone?.()}
          className="text-[11px] font-medium text-slate-500 hover:text-slate-700"
        >
          İptal
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !value.trim()}
          className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? '…' : 'Kaydet'}
        </button>
      </div>
      <p className="mt-2 text-[9px] text-slate-400">
        console.cloud.google.com → Credentials → OAuth client ID (Web uygulaması)
      </p>
    </div>
  )
}
