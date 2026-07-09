import { TURKIYE_ILLER, YURTDISI_LABEL } from './turkiye_il_ilce'

const STORAGE_KEY = 'olaylar_default_ikamet_il'

export function getDefaultIl(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    if (raw === YURTDISI_LABEL || TURKIYE_ILLER.includes(raw)) return raw
    return null
  } catch {
    return null
  }
}

export function setDefaultIl(il: string | null): void {
  try {
    if (!il) {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, il)
    }
  } catch {
    // ignore
  }
}
