import axios from 'axios'
import type { Session, SessionData, TrashData, SummaryData, ZReportRow, ZReportDetailRow, ChartsData } from './types'

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const message = err.response?.data?.detail || err.message || 'Bir hata oluştu'
    return Promise.reject(new Error(message))
  }
)

export default api

export async function uploadFile(file: File): Promise<Session> {
  const form = new FormData()
  form.append('file', file)
  const res = await api.post('/upload/', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  return res.data
}

export async function createBlankSession(): Promise<Session> {
  const res = await api.post('/upload/blank')
  return res.data
}

export async function getSession(sessionId: string): Promise<Session> {
  const res = await api.get(`/sessions/${sessionId}`)
  return res.data
}

export async function updateCell(sessionId: string, rowIndex: number, column: string, value: unknown) {
  const res = await api.patch(`/sessions/${sessionId}/cell`, { row_index: rowIndex, column, value })
  return res.data
}

export async function deleteRow(sessionId: string, rowIndex: number) {
  const res = await api.delete(`/sessions/${sessionId}/row/${rowIndex}`)
  return res.data
}

export async function addRow(sessionId: string, data: Record<string, unknown> = {}) {
  const res = await api.post(`/sessions/${sessionId}/row`, { data })
  return res.data
}

export async function addColumn(sessionId: string, name: string, defaultValue?: unknown) {
  const res = await api.post(`/sessions/${sessionId}/column`, { name, default_value: defaultValue })
  return res.data
}

export async function insertColumn(sessionId: string, payload: { name: string; reference_column: string; position: 'left' | 'right'; default_value?: unknown }) {
  const res = await api.post(`/sessions/${sessionId}/column/insert`, payload)
  return res.data
}

export async function deleteColumn(sessionId: string, columnName: string) {
  const res = await api.delete(`/sessions/${sessionId}/column/${encodeURIComponent(columnName)}`)
  return res.data
}

export async function renameColumn(sessionId: string, columnName: string, newName: string) {
  const res = await api.patch(`/sessions/${sessionId}/column/${encodeURIComponent(columnName)}/rename`, { new_name: newName })
  return res.data
}

export async function duplicateColumn(sessionId: string, columnName: string) {
  const res = await api.post(`/sessions/${sessionId}/column/${encodeURIComponent(columnName)}/duplicate`)
  return res.data
}

export async function reorderColumns(sessionId: string, columnOrder: string[]) {
  const res = await api.patch(`/sessions/${sessionId}/columns/order`, { column_order: columnOrder })
  return res.data
}

export async function fetchSummary(sessionId: string, filters?: Record<string, string>): Promise<SummaryData> {
  const params: Record<string, unknown> = { session_id: sessionId }
  if (filters && Object.keys(filters).length > 0) {
    params.filters = JSON.stringify(filters)
  }
  const res = await api.get('/analiz/summary', { params })
  return res.data
}

export type ZGranularity = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'half_yearly' | 'yearly'

export async function fetchZReport(
  sessionId: string,
  granularity: ZGranularity = 'monthly',
  filters?: Record<string, string>
): Promise<{ granularity: string; rows: ZReportRow[] }> {
  const params: Record<string, unknown> = { session_id: sessionId, granularity }
  if (filters && Object.keys(filters).length > 0) {
    params.filters = JSON.stringify(filters)
  }
  const res = await api.get('/analiz/zreport', { params })
  return res.data
}

export async function fetchZReportDetail(
  sessionId: string,
  granularity: ZGranularity = 'monthly',
  filters?: Record<string, string>
): Promise<{ granularity: string; rows: ZReportDetailRow[] }> {
  const params: Record<string, unknown> = { session_id: sessionId, granularity }
  if (filters && Object.keys(filters).length > 0) {
    params.filters = JSON.stringify(filters)
  }
  const res = await api.get('/analiz/zreport/detail', { params })
  return res.data
}

export async function fetchCharts(sessionId: string, filters?: Record<string, string>): Promise<ChartsData> {
  const params: Record<string, unknown> = { session_id: sessionId }
  if (filters && Object.keys(filters).length > 0) {
    params.filters = JSON.stringify(filters)
  }
  const res = await api.get('/analiz/charts', { params })
  return res.data
}

export function exportDatasetUrl(sessionId: string, fmt: 'csv' | 'xlsx', filename: string) {
  return `/api/sessions/${sessionId}/export?fmt=${fmt}&filename=${encodeURIComponent(filename)}`
}

export function exportZReportUrl(
  sessionId: string,
  granularity: string,
  fmt: 'csv' | 'xlsx',
  columns: string[],
  filters?: Record<string, string>,
  detail = false
) {
  const params = new URLSearchParams()
  params.set('fmt', fmt)
  if (detail) {
    params.set('detail', '1')
  }
  if (columns.length > 0) {
    params.set('columns', columns.join(','))
  }
  if (filters && Object.keys(filters).length > 0) {
    params.set('filters', JSON.stringify(filters))
  }
  return `/api/analiz/zreport/export?session_id=${sessionId}&granularity=${granularity}&${params.toString()}`
}

export function saveSessionUrl(sessionId: string) {
  return `/api/sessions/${sessionId}/save_session`
}

export async function saveSession(sessionId: string): Promise<Blob> {
  const res = await api.get(saveSessionUrl(sessionId), { responseType: "blob" })
  return res.data
}

export async function loadSession(file: File): Promise<Session> {
  const form = new FormData()
  form.append('file', file)
  const res = await api.post('/sessions/load_session', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  return res.data
}

export async function renameSession(sessionId: string, filename: string) {
  const res = await api.post(`/sessions/${sessionId}/rename`, { filename })
  return res.data
}

export async function duplicateRow(sessionId: string, rowIndex: number): Promise<SessionData> {
  const res = await api.post(`/sessions/${sessionId}/row/${rowIndex}/duplicate`)
  return res.data
}

export async function undo(sessionId: string): Promise<SessionData> {
  const res = await api.post(`/sessions/${sessionId}/undo`)
  return res.data
}

export async function redo(sessionId: string): Promise<SessionData> {
  const res = await api.post(`/sessions/${sessionId}/redo`)
  return res.data
}

export async function getTrash(sessionId: string): Promise<TrashData> {
  const res = await api.get(`/sessions/${sessionId}/trash`)
  return res.data
}

export async function restoreTrashRow(sessionId: string, trashIndex: number): Promise<SessionData> {
  const res = await api.post(`/sessions/${sessionId}/trash/restore_row`, { trash_index: trashIndex })
  return res.data
}

export async function restoreTrashColumn(sessionId: string, trashIndex: number): Promise<SessionData> {
  const res = await api.post(`/sessions/${sessionId}/trash/restore_column`, { trash_index: trashIndex })
  return res.data
}

export async function emptyTrash(sessionId: string) {
  const res = await api.delete(`/sessions/${sessionId}/trash`)
  return res.data
}
