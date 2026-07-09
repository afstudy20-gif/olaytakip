import { describe, it, expect } from 'vitest'
import { useStore } from './store'

describe('useStore', () => {
  it('starts with no session and defaults to data tab', () => {
    const state = useStore.getState()
    expect(state.session).toBeNull()
    expect(state.activeTab).toBe('data')
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
  })

  it('sets session and resets analysis state', () => {
    const session = {
      session_id: 'test-123',
      filename: 'test.xlsx',
      rows: 5,
      columns: [],
      preview: [],
    }
    useStore.getState().setSession(session)
    const state = useStore.getState()
    expect(state.session).toEqual(session)
    expect(state.summary).toBeNull()
    expect(state.zreport).toBeNull()
    expect(state.charts).toBeNull()
    expect(state.error).toBeNull()
    // cleanup
    useStore.getState().setSession(null)
  })

  it('updates a preview cell in place', () => {
    useStore.getState().setSession({
      session_id: 'test-123',
      filename: 'test.xlsx',
      rows: 2,
      columns: [{ name: 'adi', dtype: 'object', kind: 'text' as const }],
      preview: [{ adi: 'Ali' }, { adi: 'Ayşe' }],
    })
    useStore.getState().updatePreviewCell(1, 'adi', 'Fatma')
    expect(useStore.getState().session?.preview[1].adi).toBe('Fatma')
    // cleanup
    useStore.getState().setSession(null)
  })
})
