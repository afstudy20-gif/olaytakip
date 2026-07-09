import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import {
  addColumn,
  addRow,
  deleteColumn,
  deleteRow,
  duplicateColumn,
  duplicateRow,
  insertColumn,
  renameColumn,
  reorderColumns,
  undo,
  redo,
  getTrash,
  restoreTrashRow,
  restoreTrashColumn,
  emptyTrash,
  updateCell,
} from '../api'
import { Plus, Table2, MoreHorizontal, ChevronLeft, ChevronRight, Copy, Trash2, Edit3, Filter, Undo2, Redo2, RotateCcw, ArrowUpDown, ArrowUp, ArrowDown, GripVertical } from 'lucide-react'
import LocationEditor, { isLocationColumn } from './LocationEditor'
import { TURKIYE_ILLER, YURTDISI_LABEL } from '../lib/turkiye_il_ilce'
import { getDefaultIl, setDefaultIl as saveDefaultIl } from '../lib/defaultIl'
import { fmtDate } from '../lib/format'
import type { ColKind } from '../types'

const PAGE_SIZE = 50

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

function compareCellValues(a: unknown, b: unknown, kind?: string): number {
  const aEmpty = a == null || a === ''
  const bEmpty = b == null || b === ''
  if (aEmpty && bEmpty) return 0
  if (aEmpty) return 1
  if (bEmpty) return -1

  if (kind === 'numeric') {
    const an = parseFloat(String(a).replace(/\s/g, '').replace(',', '.'))
    const bn = parseFloat(String(b).replace(/\s/g, '').replace(',', '.'))
    if (!Number.isNaN(an) && !Number.isNaN(bn)) {
      return an - bn
    }
  }
  if (kind === 'date') {
    const ad = new Date(String(a)).getTime()
    const bd = new Date(String(b)).getTime()
    if (!Number.isNaN(ad) && !Number.isNaN(bd)) {
      return ad - bd
    }
  }
  return String(a).localeCompare(String(b), 'tr')
}

function AutocompleteInput({
  value,
  suggestions,
  onChange,
  onBlur,
  onKeyDown,
}: {
  value: string
  suggestions: string[]
  onChange: (value: string) => void
  onBlur: () => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
}) {
  const [open, setOpen] = useState(true)
  const [highlight, setHighlight] = useState(0)
  const query = String(value ?? '').toLowerCase()
  const filtered = useMemo(
    () => suggestions.filter((s) => s.toLowerCase().includes(query)),
    [suggestions, query]
  )

  useEffect(() => {
    setHighlight(0)
    setOpen(true)
  }, [query])

  const select = (suggestion: string) => {
    onChange(suggestion)
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlight((i) => Math.min(filtered.length - 1, i + 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
      setHighlight((i) => Math.max(0, i - 1))
      return
    }
    if (e.key === 'Enter' && open && filtered.length > 0) {
      e.preventDefault()
      select(filtered[highlight])
      return
    }
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    onKeyDown(e)
  }

  return (
    <div className="relative w-full">
      <input
        autoFocus
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onBlur={() => {
          setTimeout(() => setOpen(false), 150)
          onBlur()
        }}
        onKeyDown={handleKeyDown}
        className="w-full rounded border border-blue-400 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {open && filtered.length > 0 && (
        <ul
          className="absolute z-20 mt-1 max-h-48 w-64 overflow-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg"
          onMouseDown={(e) => e.preventDefault()}
        >
          {filtered.map((s, i) => (
            <li
              key={`${s}-${i}`}
              onClick={() => select(s)}
              className={`cursor-pointer px-3 py-1.5 ${
                i === highlight ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-100'
              }`}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function toDateInputValue(value: unknown): string {
  if (!value) return ''
  const d = new Date(String(value))
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().split('T')[0]
}

export default function DataTable() {
  const session = useStore((state) => state.session)
  const setError = useStore((state) => state.setError)
  const undoDepth = useStore((state) => state.undoDepth)
  const redoDepth = useStore((state) => state.redoDepth)
  const trashCounts = useStore((state) => state.trashCounts)
  const [page, setPage] = useState(0)
  const [editing, setEditing] = useState<{ rowIdx: number; col: string; value: string } | null>(null)
  const [addingColumn, setAddingColumn] = useState(false)
  const [newColumnName, setNewColumnName] = useState('')
  const [defaultIl, setDefaultIl] = useState<string>(() => getDefaultIl() ?? '')

  const filters = useStore((state) => state.filters)
  const setFilters = useStore((state) => state.setFilters)
  const [sort, setSort] = useState<{ column: string; direction: 'asc' | 'desc' } | null>(null)
  const [menuCol, setMenuCol] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [inserting, setInserting] = useState<{ col: string; position: 'left' | 'right' } | null>(null)
  const [insertName, setInsertName] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [trashOpen, setTrashOpen] = useState(false)
  const [trash, setTrash] = useState<{ rows: { row_index: number; data: Record<string, unknown>; deleted_at: number }[]; columns: { name: string; deleted_at: number }[] }>({ rows: [], columns: [] })
  const [dragCol, setDragCol] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<{ col: string; side: 'before' | 'after' } | null>(null)
  const [selectedCell, setSelectedCell] = useState<{ rowIdx: number; colName: string } | null>(null)
  const selectedRef = useRef<HTMLTableCellElement | null>(null)

  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setPage(0)
  }, [session?.session_id])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuCol(null)
      }
    }
    if (menuCol) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuCol])

  const filteredRows = useMemo(() => {
    if (!session || session.columns.length === 0) return []
    let rows = session.preview
    if (sort) {
      const col = session.columns.find((c) => c.name === sort.column)
      const direction = sort.direction === 'asc' ? 1 : -1
      rows = [...rows].sort((a, b) => compareCellValues(a[sort.column], b[sort.column], col?.kind) * direction)
    }
    const active = Object.entries(filters).filter(([, v]) => v.trim() !== '')
    if (active.length === 0) return rows
    return rows.filter((row) =>
      active.every(([col, query]) => {
        const raw = row[col]
        const haystack = raw == null ? '' : String(raw).toLowerCase()
        return haystack.includes(query.toLowerCase())
      })
    )
  }, [session?.preview, filters, sort, session?.columns])

  const beginEdit = (rowIdx: number, col: string, value: unknown) => {
    setEditing({ rowIdx, col, value: value == null ? '' : String(value) })
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!session) return
      const target = e.target as HTMLElement | null
      const insideInput = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      )
      if (insideInput) return
      if (e.key === 'Enter') {
        if (selectedCell) {
          const value = session.preview[selectedCell.rowIdx]?.[selectedCell.colName]
          beginEdit(selectedCell.rowIdx, selectedCell.colName, value)
        }
        return
      }
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
      e.preventDefault()
      if (!selectedCell) {
        const first = filteredRows[0]
        if (!first) return
        const rowIdx = session.preview.indexOf(first)
        const colName = session.columns[0]?.name
        if (colName) setSelectedCell({ rowIdx, colName })
        return
      }
      const cols = session.columns.map((c) => c.name)
      const visibleRows = filteredRows.map((row) => session.preview.indexOf(row))
      const colIdx = cols.indexOf(selectedCell.colName)
      const visibleIdx = visibleRows.indexOf(selectedCell.rowIdx)
      let nextVisibleIdx = visibleIdx
      let nextColIdx = colIdx
      if (e.key === 'ArrowUp') nextVisibleIdx = Math.max(0, visibleIdx - 1)
      if (e.key === 'ArrowDown') nextVisibleIdx = Math.min(filteredRows.length - 1, visibleIdx + 1)
      if (e.key === 'ArrowLeft') nextColIdx = Math.max(0, colIdx - 1)
      if (e.key === 'ArrowRight') nextColIdx = Math.min(cols.length - 1, colIdx + 1)
      const nextRowIdx = visibleRows[nextVisibleIdx]
      const nextColName = cols[nextColIdx]
      if (nextRowIdx !== undefined && nextColName) {
        setSelectedCell({ rowIdx: nextRowIdx, colName: nextColName })
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [session, filteredRows, selectedCell, beginEdit])

  useEffect(() => {
    if (!selectedCell || !session) return
    const visibleRows = filteredRows.map((row) => session.preview.indexOf(row))
    const idx = visibleRows.indexOf(selectedCell.rowIdx)
    if (idx !== -1) {
      const newPage = Math.floor(idx / PAGE_SIZE)
      setPage(newPage)
    }
  }, [selectedCell, filteredRows, session])

  useEffect(() => {
    if (!editing && selectedRef.current) {
      selectedRef.current.tabIndex = -1
      selectedRef.current.focus({ preventScroll: true })
      selectedRef.current.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }, [selectedCell, editing])

  if (!session || session.columns.length === 0) {
    return null
  }

  const konuSuggestions = useMemo(() => {
    if (!session.columns.some((c) => c.name === 'konu')) return []
    const values = new Set<string>()
    session.preview.forEach((row) => {
      const raw = row['konu']
      if (raw == null) return
      const s = String(raw).trim()
      if (s) values.add(s)
    })
    return Array.from(values).sort((a, b) => a.localeCompare(b, 'tr'))
  }, [session.preview, session.columns])

  const totalRows = filteredRows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const start = safePage * PAGE_SIZE
  const visibleRows = filteredRows.slice(start, start + PAGE_SIZE)

  const commitEdit = async () => {
    if (!editing || !session) return
    const { rowIdx, col, value } = editing
    const trimmed = String(value).trim()
    if (col === 'tc' && trimmed !== '') {
      const exists = session.preview.some(
        (r, i) => i !== rowIdx && String(r['tc'] ?? '').trim() === trimmed
      )
      if (exists) {
        const ok = window.confirm(
          `Bu TC (${trimmed}) ile kayıtlı başka bir kişi zaten var. Yine de eklemek istiyor musunuz?`
        )
        if (!ok) {
          setEditing(null)
          return
        }
      }
    }
    try {
      await updateCell(session.session_id, rowIdx, col, value)
      useStore.getState().updatePreviewCell(rowIdx, col, value)
    } catch (err) {
      console.error('Cell update failed:', err)
    } finally {
      setEditing(null)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
    }
    if (e.key === 'Escape') {
      setEditing(null)
    }
  }

  const handleDelete = async (rowIdx: number) => {
    if (!session) return
    try {
      const res = await deleteRow(session.session_id, rowIdx)
      useStore.getState().updateSessionData({
        rows: res.rows,
        columns: res.columns.map((c: { name: string; dtype: string; kind: string }) => ({ ...c, kind: c.kind as ColKind })),
        preview: res.preview,
        undo_depth: res.undo_depth,
        redo_depth: res.redo_depth,
        trash_counts: res.trash_counts,
      })
    } catch (err) {
      console.error('Row delete failed:', err)
    }
  }

  const handleDuplicateRow = async (rowIdx: number) => {
    if (!session) return
    try {
      const res = await duplicateRow(session.session_id, rowIdx)
      useStore.getState().updateSessionData({
        rows: res.rows,
        columns: res.columns.map((c: { name: string; dtype: string; kind: string }) => ({ ...c, kind: c.kind as ColKind })),
        preview: res.preview,
        undo_depth: res.undo_depth,
        redo_depth: res.redo_depth,
        trash_counts: res.trash_counts,
      })
      const newTotalRows = res.preview.length
      setPage(Math.max(0, Math.ceil(newTotalRows / PAGE_SIZE) - 1))
    } catch (err) {
      console.error('Row duplicate failed:', err)
    }
  }

  const handleAddRow = async () => {
    if (!session) return
    try {
      const rowData: Record<string, unknown> = {}
      if (defaultIl && session.columns.some((c) => c.name === 'ikamet_il')) {
        rowData['ikamet_il'] = defaultIl
      }
      const res = await addRow(session.session_id, rowData)
      useStore.getState().updateSessionData(res)
      const newTotalRows = res.preview.length
      setPage(Math.max(0, Math.ceil(newTotalRows / PAGE_SIZE) - 1))
    } catch (err) {
      console.error('Row add failed:', err)
    }
  }

  const handleAddColumn = async () => {
    if (!session || !newColumnName.trim()) return
    const name = newColumnName.trim()
    if (session.columns.some((c) => c.name === name)) {
      setError('Bu sütun adı zaten var')
      return
    }
    try {
      const res = await addColumn(session.session_id, name)
      useStore.getState().updateSessionData(res)
      setNewColumnName('')
      setAddingColumn(false)
    } catch (err) {
      console.error('Column add failed:', err)
    }
  }

  const openMenu = (e: React.MouseEvent, col: string) => {
    e.stopPropagation()
    setMenuCol(col)
    setMenuPos({ x: e.clientX, y: e.clientY })
  }

  const closeMenu = () => setMenuCol(null)

  const refreshSession = (res: { columns: { name: string; dtype: string; kind: string }[]; preview: Record<string, unknown>[]; rows: number; undo_depth: number; redo_depth: number; trash_counts: { rows: number; columns: number } }) => {
    useStore.getState().updateSessionData({
      rows: res.rows,
      columns: res.columns.map((c) => ({ ...c, kind: c.kind as ColKind })),
      preview: res.preview,
      undo_depth: res.undo_depth,
      redo_depth: res.redo_depth,
      trash_counts: res.trash_counts,
    })
  }

  const handleInsert = async () => {
    if (!session || !inserting || !insertName.trim()) return
    const name = insertName.trim()
    if (session.columns.some((c) => c.name === name)) {
      setError('Bu sütun adı zaten var')
      return
    }
    try {
      const res = await insertColumn(session.session_id, {
        name,
        reference_column: inserting.col,
        position: inserting.position,
      })
      refreshSession(res)
      setInsertName('')
      setInserting(null)
      closeMenu()
    } catch (err) {
      console.error('Insert column failed:', err)
    }
  }

  const handleDuplicate = async (col: string) => {
    if (!session) return
    try {
      const res = await duplicateColumn(session.session_id, col)
      refreshSession(res)
      closeMenu()
    } catch (err) {
      console.error('Duplicate column failed:', err)
    }
  }

  const handleDeleteColumn = async (col: string) => {
    if (!session) return
    if (!window.confirm(`"${displayColumnName(col)}" sütununu silmek istediğinize emin misiniz?`)) return
    try {
      const res = await deleteColumn(session.session_id, col)
      refreshSession(res)
      closeMenu()
    } catch (err) {
      console.error('Delete column failed:', err)
    }
  }

  const handleRename = async () => {
    if (!session || !renaming || !renameValue.trim()) return
    const newName = renameValue.trim()
    if (session.columns.some((c) => c.name === newName)) {
      setError('Bu sütun adı zaten var')
      return
    }
    try {
      const res = await renameColumn(session.session_id, renaming, newName)
      refreshSession(res)
      setRenaming(null)
      setRenameValue('')
      closeMenu()
    } catch (err) {
      console.error('Rename column failed:', err)
    }
  }

  const handleMove = async (col: string, direction: 'left' | 'right') => {
    if (!session) return
    const cols = session.columns.map((c) => c.name)
    const idx = cols.indexOf(col)
    if (idx < 0) return
    const target = direction === 'left' ? idx - 1 : idx + 1
    if (target < 0 || target >= cols.length) return
    const next = [...cols]
    next.splice(idx, 1)
    next.splice(target, 0, col)
    try {
      const res = await reorderColumns(session.session_id, next)
      refreshSession(res)
      closeMenu()
    } catch (err) {
      console.error('Reorder columns failed:', err)
    }
  }

  const handleDragOverHeader = (e: React.DragEvent<HTMLTableCellElement>, col: string) => {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const side = e.clientX - rect.left < rect.width / 2 ? 'before' : 'after'
    setDragOver({ col, side })
  }

  const handleDropHeader = async (e: React.DragEvent<HTMLTableCellElement>, targetCol: string) => {
    e.preventDefault()
    setDragOver(null)
    const sourceCol = e.dataTransfer.getData('text/plain') || dragCol
    setDragCol(null)
    if (!sourceCol || sourceCol === targetCol || !session) return
    const cols = session.columns.map((c) => c.name)
    const from = cols.indexOf(sourceCol)
    const to = cols.indexOf(targetCol)
    if (from < 0 || to < 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const side = e.clientX - rect.left < rect.width / 2 ? 'before' : 'after'
    const next = [...cols]
    next.splice(from, 1)
    let insertAt = side === 'before' ? to : to + 1
    if (from < to) insertAt -= 1
    next.splice(insertAt, 0, sourceCol)
    try {
      const res = await reorderColumns(session.session_id, next)
      refreshSession(res)
    } catch (err) {
      console.error('Drag reorder failed:', err)
    }
  }

  const toggleSort = (col: string) => {
    setSort((prev) => {
      if (prev?.column === col) {
        if (prev.direction === 'asc') return { column: col, direction: 'desc' }
        return null
      }
      return { column: col, direction: 'asc' }
    })
  }

  const handleUndo = async () => {
    if (!session) return
    try {
      const res = await undo(session.session_id)
      refreshSession(res)
    } catch (err) {
      console.error('Undo failed:', err)
    }
  }

  const handleRedo = async () => {
    if (!session) return
    try {
      const res = await redo(session.session_id)
      refreshSession(res)
    } catch (err) {
      console.error('Redo failed:', err)
    }
  }

  const loadTrash = async () => {
    if (!session) return
    try {
      const data = await getTrash(session.session_id)
      setTrash(data)
    } catch (err) {
      console.error('Load trash failed:', err)
    }
  }

  const handleRestoreRow = async (trashIndex: number) => {
    if (!session) return
    try {
      const res = await restoreTrashRow(session.session_id, trashIndex)
      refreshSession(res)
      await loadTrash()
    } catch (err) {
      console.error('Restore row failed:', err)
    }
  }

  const handleRestoreColumn = async (trashIndex: number) => {
    if (!session) return
    try {
      const res = await restoreTrashColumn(session.session_id, trashIndex)
      refreshSession(res)
      await loadTrash()
    } catch (err) {
      console.error('Restore column failed:', err)
    }
  }

  const handleEmptyTrash = async () => {
    if (!session) return
    if (!window.confirm('Çöp kutusunu tamamen boşaltmak istediğinize emin misiniz?')) return
    try {
      await emptyTrash(session.session_id)
      setTrash({ rows: [], columns: [] })
      useStore.setState({ trashCounts: { rows: 0, columns: 0 } })
    } catch (err) {
      console.error('Empty trash failed:', err)
    }
  }

  const renderCell = (row: Record<string, unknown>, rowIdx: number, col: { name: string; kind: string }) => {
    const isEditing = editing?.rowIdx === rowIdx && editing?.col === col.name
    const cellValue = row[col.name]

    if (isEditing) {
      if (isLocationColumn(col.name)) {
        return (
          <LocationEditor
            value={editing.value}
            column={col.name}
            row={row}
            onSave={async (value) => {
              if (!session) return
              try {
                await updateCell(session.session_id, rowIdx, col.name, value)
                useStore.getState().updatePreviewCell(rowIdx, col.name, value)
              } catch (err) {
                console.error('Cell update failed:', err)
              } finally {
                setEditing(null)
              }
            }}
            onCancel={() => setEditing(null)}
          />
        )
      }
      if (col.kind === 'date') {
        return (
          <input
            autoFocus
            type="date"
            value={toDateInputValue(editing.value)}
            onChange={(e) => setEditing({ ...editing, value: e.target.value })}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            className="w-full rounded border border-blue-400 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        )
      }
      if (col.name === 'konu' && konuSuggestions.length > 0) {
        return (
          <AutocompleteInput
            value={editing.value}
            suggestions={konuSuggestions}
            onChange={(v) => setEditing({ ...editing, value: v })}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
          />
        )
      }

      return (
        <input
          autoFocus
          type="text"
          value={editing.value}
          onChange={(e) => setEditing({ ...editing, value: e.target.value })}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          className="w-full rounded border border-blue-400 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )
    }

    const display = col.kind === 'date' ? fmtDate(cellValue) : cellValue == null ? '' : String(cellValue)
    return <span className="block cursor-pointer truncate">{display}</span>
  }

  const renderHeader = (col: { name: string; kind: string }) => {
    if (renaming === col.name) {
      return (
        <input
          autoFocus
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={handleRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              setRenaming(null)
              setRenameValue('')
            }
          }}
          className="w-32 rounded border border-blue-400 px-1 py-0.5 text-xs"
        />
      )
    }
    const sorted = sort?.column === col.name
    const SortIcon = sorted ? (sort.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
    return (
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 overflow-hidden">
          <GripVertical size={12} className="shrink-0 text-slate-400" />
          <span className="truncate">{displayColumnName(col.name)}</span>
        </div>
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => toggleSort(col.name)}
            className={`rounded p-0.5 ${sorted ? 'text-indigo-600 hover:bg-indigo-50' : 'text-slate-400 hover:bg-slate-200 hover:text-slate-700'}`}
            title={sorted ? (sort.direction === 'asc' ? 'Küçükten büyüğe' : 'Büyükten küçüğe') : 'Sırala'}
            aria-label={`${displayColumnName(col.name)} sütununu sırala`}
          >
            <SortIcon size={13} />
          </button>
          <button
            type="button"
            onClick={(e) => openMenu(e, col.name)}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            aria-label="Sütun menüsü"
          >
            <MoreHorizontal size={14} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3 bg-white p-4">
      <div className="flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAddRow}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus size={16} />
            Yeni Satır Ekle
          </button>
          {addingColumn ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                type="text"
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                onBlur={handleAddColumn}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur()
                  } else if (e.key === 'Escape') {
                    setAddingColumn(false)
                    setNewColumnName('')
                  }
                }}
                placeholder="Sütun adı"
                className="rounded border border-slate-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingColumn(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Table2 size={16} />
              Yeni Sütun Ekle
            </button>
          )}

          {session.columns.some((c) => c.name === 'ikamet_il') && (
            <div className="flex items-center gap-1.5">
              <label htmlFor="default-il" className="text-xs font-medium text-slate-600">
                Varsayılan il:
              </label>
              <select
                id="default-il"
                value={defaultIl}
                onChange={(e) => {
                  const val = e.target.value
                  setDefaultIl(val)
                  saveDefaultIl(val || null)
                }}
                className="rounded border border-slate-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">Seçilmedi</option>
                {TURKIYE_ILLER.map((il) => (
                  <option key={il} value={il}>
                    {il}
                  </option>
                ))}
                <option value={YURTDISI_LABEL}>{YURTDISI_LABEL}</option>
              </select>
            </div>
          )}

          <div className="h-6 w-px bg-slate-300" />

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleUndo}
              disabled={undoDepth === 0}
              className="rounded p-1.5 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              title="Geri al"
              aria-label="Geri al"
            >
              <Undo2 size={16} />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={redoDepth === 0}
              className="rounded p-1.5 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              title="İleri al"
              aria-label="İleri al"
            >
              <Redo2 size={16} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setTrashOpen((v) => !v)
              if (!trashOpen) void loadTrash()
            }}
            className="relative inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Trash2 size={16} />
            Çöp Kutusu
            {(trashCounts.rows + trashCounts.columns) > 0 && (
              <span className="ml-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-100 px-1.5 text-xs font-semibold text-red-700">
                {trashCounts.rows + trashCounts.columns}
              </span>
            )}
          </button>
        </div>
        <span className="text-sm text-slate-500">
          {totalRows} satır · {session?.columns.length ?? 0} sütun
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded border border-slate-200 shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100 text-xs uppercase text-slate-600">
            <tr>
              {session.columns.map((col) => {
                const over = dragOver?.col === col.name
                const sideClass = over ? (dragOver.side === 'before' ? 'border-l-2 border-indigo-500' : 'border-r-2 border-indigo-500') : ''
                return (
                  <th
                    key={col.name}
                    draggable
                    onDragStart={(e) => {
                      setDragCol(col.name)
                      e.dataTransfer.setData('text/plain', col.name)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragOver={(e) => handleDragOverHeader(e, col.name)}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={(e) => handleDropHeader(e, col.name)}
                    className={`min-w-[140px] cursor-move select-none px-2 py-2 font-semibold tracking-wide ${sideClass}`}
                  >
                    {renderHeader(col)}
                  </th>
                )
              })}
              <th className="px-3 py-2 font-semibold tracking-wide">İşlem</th>
            </tr>
            <tr className="bg-slate-50">
              {session.columns.map((col) => (
                <th key={`filter-${col.name}`} className="px-2 py-1.5 font-normal">
                  <div className="flex items-center gap-1">
                    <Filter size={12} className="text-slate-400" />
                    <input
                      type="text"
                      value={filters[col.name] ?? ''}
                      onChange={(e) => {
                        setFilters({ ...filters, [col.name]: e.target.value })
                        setPage(0)
                      }}
                      placeholder="Filtrele"
                      className="w-full rounded border border-slate-300 px-1.5 py-1 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </th>
              ))}
              <th className="px-3 py-1.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {visibleRows.map((row) => {
              const rowIdx = session.preview.findIndex((r) => r === row)
              return (
                <tr key={rowIdx} className="hover:bg-slate-50">
                  {session.columns.map((col) => {
                    const isSelected = selectedCell?.rowIdx === rowIdx && selectedCell?.colName === col.name && !editing
                    return (
                      <td
                        key={`${rowIdx}-${col.name}`}
                        ref={isSelected ? (el) => { selectedRef.current = el } : undefined}
                        className={`relative px-2 py-2 ${isSelected ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-400' : ''}`}
                        onClick={() => {
                          setSelectedCell({ rowIdx, colName: col.name })
                          beginEdit(rowIdx, col.name, row[col.name])
                        }}
                      >
                        {renderCell(row, rowIdx, col)}
                      </td>
                    )
                  })}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDuplicateRow(rowIdx)}
                        className="rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                        title="Satırı kopyala"
                        aria-label={`Satır ${rowIdx + 1} kopyala`}
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(rowIdx)}
                        className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 hover:text-red-700"
                        aria-label={`Satır ${rowIdx + 1} sil`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {totalRows > PAGE_SIZE && (
        <div className="flex shrink-0 items-center justify-between text-sm text-slate-600">
          <span>
            {start + 1}-{Math.min(start + PAGE_SIZE, totalRows)} / {totalRows} satır
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage === 0}
              onClick={() => setPage((p) => p - 1)}
              className="rounded border border-slate-300 bg-white px-3 py-1 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Önceki
            </button>
            <span className="px-2">
              Sayfa {safePage + 1} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border border-slate-300 bg-white px-3 py-1 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Sonraki
            </button>
          </div>
        </div>
      )}

      {trashOpen && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Çöp Kutusu</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleEmptyTrash}
                className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                <Trash2 size={12} /> Boşalt
              </button>
              <button
                type="button"
                onClick={() => setTrashOpen(false)}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                Kapat
              </button>
            </div>
          </div>

          {trash.rows.length === 0 && trash.columns.length === 0 && (
            <p className="text-sm text-slate-500">Çöp kutusu boş.</p>
          )}

          {trash.rows.length > 0 && (
            <div className="mb-3">
              <h4 className="mb-1 text-xs font-medium uppercase text-slate-500">Silinen Satırlar</h4>
              <ul className="space-y-1">
                {trash.rows.map((item, idx) => (
                  <li key={`row-${idx}`} className="flex items-center justify-between rounded border border-slate-100 bg-slate-50 px-2 py-1 text-sm">
                    <span className="truncate text-slate-700">
                      Satır #{item.row_index + 1}
                      {session.columns[0] && item.data[session.columns[0].name] != null && (
                        <span className="ml-2 text-slate-400">· {String(item.data[session.columns[0].name])}</span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRestoreRow(idx)}
                      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                    >
                      <RotateCcw size={12} /> Geri Al
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {trash.columns.length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-medium uppercase text-slate-500">Silinen Sütunlar</h4>
              <ul className="space-y-1">
                {trash.columns.map((item, idx) => (
                  <li key={`col-${idx}`} className="flex items-center justify-between rounded border border-slate-100 bg-slate-50 px-2 py-1 text-sm">
                    <span className="truncate text-slate-700">{displayColumnName(item.name)}</span>
                    <button
                      type="button"
                      onClick={() => handleRestoreColumn(idx)}
                      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                    >
                      <RotateCcw size={12} /> Geri Al
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {menuCol && (
        <div
          ref={menuRef}
          style={{ top: menuPos.y, left: menuPos.x }}
          className="fixed z-50 w-52 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {inserting?.col === menuCol ? (
            <div className="px-2 py-1.5">
              <input
                autoFocus
                type="text"
                value={insertName}
                onChange={(e) => setInsertName(e.target.value)}
                onBlur={handleInsert}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') {
                    setInserting(null)
                    setInsertName('')
                    closeMenu()
                  }
                }}
                placeholder="Yeni sütun adı"
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
              />
            </div>
          ) : (
            <>
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-100"
                onClick={() => {
                  setRenaming(menuCol)
                  setRenameValue(menuCol)
                  closeMenu()
                }}
              >
                <Edit3 size={14} /> Adını değiştir
              </button>
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-100"
                onClick={() => setInserting({ col: menuCol, position: 'left' })}
              >
                <ChevronLeft size={14} /> Sola sütun ekle
              </button>
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-100"
                onClick={() => setInserting({ col: menuCol, position: 'right' })}
              >
                <ChevronRight size={14} /> Sağa sütun ekle
              </button>
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-100"
                onClick={() => handleDuplicate(menuCol)}
              >
                <Copy size={14} /> Kopyala
              </button>
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-100"
                onClick={() => handleMove(menuCol, 'left')}
              >
                <ChevronLeft size={14} /> Sola taşı
              </button>
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-100"
                onClick={() => handleMove(menuCol, 'right')}
              >
                <ChevronRight size={14} /> Sağa taşı
              </button>
              {menuCol !== 'kayit_tarihi' && (
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
                  onClick={() => handleDeleteColumn(menuCol)}
                >
                  <Trash2 size={14} /> Sil
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
