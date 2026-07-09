import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { useStore } from '../store'
import useAutoSession from './useAutoSession'
import * as api from '../api'
import type { Session } from '../types'

const markDirty = vi.fn()

vi.mock('../lib/cloudSync', () => ({
  cloudSync: { markDirty: (...args: unknown[]) => markDirty(...args) },
}))

vi.mock('../api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../api')>()
  return {
    ...mod,
    saveSession: vi.fn(async () => new Blob(['{"snapshot":true}'])),
  }
})

function TestHarness() {
  useAutoSession()
  return <div data-testid="recent-count">{useStore.getState().recentSessions.length}</div>
}

describe('useAutoSession', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    useStore.getState().setSession(null)
    useStore.setState({ recentSessions: [], dataVersion: 0 })
    vi.mocked(api.saveSession).mockClear()
    markDirty.mockClear()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('autosaves and refreshes recent sessions after debounce', async () => {
    const session: Session = {
      session_id: 'sess-123',
      filename: 'auto.csv',
      rows: 3,
      columns: [{ name: 'a', dtype: 'object', kind: 'text' }],
      preview: [{ a: 'x' }],
    }

    render(<TestHarness />)
    act(() => {
      useStore.getState().setSession(session)
    })

    act(() => {
      vi.advanceTimersByTime(5_100)
    })

    await waitFor(() => {
      expect(useStore.getState().recentSessions.length).toBe(1)
    })
    expect(useStore.getState().recentSessions[0].name).toBe('auto.csv')
    expect(markDirty).toHaveBeenCalled()
  })

  it('autosaves again after in-place data changes', async () => {
    const session: Session = {
      session_id: 'sess-456',
      filename: 'edit.csv',
      rows: 1,
      columns: [{ name: 'a', dtype: 'object', kind: 'text' }],
      preview: [{ a: 'x' }],
    }

    render(<TestHarness />)
    act(() => {
      useStore.getState().setSession(session)
    })
    act(() => {
      vi.advanceTimersByTime(5_100)
    })

    await waitFor(() => {
      expect(api.saveSession).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(markDirty).toHaveBeenCalledTimes(1)
    })

    vi.mocked(api.saveSession).mockResolvedValueOnce(new Blob(['{"snapshot":"edited"}']))
    act(() => {
      useStore.getState().updatePreviewCell(0, 'a', 'y')
    })
    act(() => {
      vi.advanceTimersByTime(5_100)
    })

    await waitFor(() => {
      expect(api.saveSession).toHaveBeenCalledTimes(2)
    })
  })
})
