import { describe, it, expect, vi } from 'vitest'
import {
  upsertRecentSession,
  listRecentSessions,
  subscribeSessions,
  trashSession,
  restoreSession,
  purgeSession,
} from './sessionDb'

describe('sessionDb notifications', () => {
  it('notifies subscribers after upsert', async () => {
    const listener = vi.fn()
    const unsub = subscribeSessions(listener)
    try {
      await upsertRecentSession({
        serverSessionId: 'srv-1',
        name: 'test.csv',
        payload: '{"rows":1}',
        nRows: 1,
        nCols: 2,
        source: 'auto',
      })
      expect(listener).toHaveBeenCalled()
      const list = await listRecentSessions()
      expect(list.length).toBeGreaterThan(0)
      expect(list[0].name).toBe('test.csv')
    } finally {
      unsub()
    }
  })

  it('notifies subscribers on trash/restore/purge', async () => {
    const meta = await upsertRecentSession({
      serverSessionId: 'srv-2',
      name: 'trash.csv',
      payload: '{"rows":1}',
      source: 'auto',
    })
    const listener = vi.fn()
    const unsub = subscribeSessions(listener)
    try {
      listener.mockClear()
      await trashSession(meta.id)
      expect(listener).toHaveBeenCalled()

      listener.mockClear()
      await restoreSession(meta.id)
      expect(listener).toHaveBeenCalled()

      listener.mockClear()
      await purgeSession(meta.id)
      expect(listener).toHaveBeenCalled()
    } finally {
      unsub()
    }
  })
})
