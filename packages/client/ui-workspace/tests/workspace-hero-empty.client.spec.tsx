// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { WorkspaceListState, WorkspaceView } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { zh } from '../src/client/locales.ts'
import { WorkspaceHeroEmpty } from '../src/client/WorkspaceHeroEmpty.tsx'

afterEach(cleanup)

const t = makeTranslate(zh, commonZh)

const workspace = (id: string): WorkspaceView => ({
  workspaceId: id as never, path: `/projects/${id}`, title: id, sessionIds: [],
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
})
const listState = (items: readonly WorkspaceView[], phase: WorkspaceListState['phase']): WorkspaceListState => ({
  items, archivedSessionIds: [], state: 'idle', phase, error: null, baselinesReady: true,
  recentWorkspaceId: items[0]?.workspaceId,
})

/** Occupancy source bound like the renderer would; flip() drives registration changes. */
function occupancySource(initial: boolean) {
  let occupied = initial
  const listeners = new Set<() => void>()
  const useDirectoryFlow = bindSnapshotSelector({
    getSnapshot: () => occupied,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  })
  return {
    useDirectoryFlow,
    flip: (next: boolean) => {
      occupied = next
      for (const listener of [...listeners]) listener()
    },
  }
}

function mount(items: readonly WorkspaceView[], phase: WorkspaceListState['phase'] = 'ready', occupied = true) {
  const requestAdd = vi.fn()
  // useSyncExternalStore requires a cached snapshot: build it once.
  const snapshot = listState(items, phase)
  const useWorkspaces = bindSnapshotSelector({
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
  })
  const occupancy = occupancySource(occupied)
  const view = render(
    <WorkspaceHeroEmpty
      requestAdd={requestAdd}
      useSessions={(() => {}) as never}
      useWorkspaces={useWorkspaces as never}
      useDirectoryFlow={occupancy.useDirectoryFlow}
      t={t}
    />,
  )
  return { view, requestAdd, occupancy }
}

describe('WorkspaceHeroEmpty', () => {
  it('renders the marker and forwards the add gesture once the baseline settled empty', () => {
    const b = mount([])
    expect(screen.getByText('暂无工作区')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '新建工作区' }))
    expect(b.requestAdd).toHaveBeenCalledTimes(1)
  })

  it('renders nothing while the baseline is unsettled', () => {
    mount([], 'pending')
    expect(screen.queryByText('暂无工作区')).toBeNull()
  })

  it('renders nothing while any Workspace is listed', () => {
    mount([workspace('alpha')])
    expect(screen.queryByText('暂无工作区')).toBeNull()
  })

  it('renders nothing while no picking flow is composed', () => {
    mount([], 'ready', false)
    expect(screen.queryByText('暂无工作区')).toBeNull()
  })

  it('appears when a flow package activates after the first paint', () => {
    const b = mount([], 'ready', false)
    expect(screen.queryByText('暂无工作区')).toBeNull()
    act(() => { b.occupancy.flip(true) })
    expect(screen.getByText('暂无工作区')).toBeTruthy()
  })
})
