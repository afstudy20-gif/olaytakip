export function fmtNumber(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '-'
  return n.toLocaleString('tr-TR', { maximumFractionDigits: digits })
}

export function fmtPercent(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '-'
  return `${n.toLocaleString('tr-TR', { maximumFractionDigits: digits })}%`
}

export function fmtDate(value: unknown): string {
  if (!value) return '-'
  const d = new Date(String(value))
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString('tr-TR')
}
