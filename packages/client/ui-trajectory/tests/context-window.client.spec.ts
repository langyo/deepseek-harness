import { describe, expect, it } from 'vitest'
import type {
  AssistantMessageNode, CompactionSummaryNode, ContextMessageNode, RequestView,
  ToolResultNode, UserMessageNode,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TrajectorySnapshot } from '../src/client/trajectory-contract.ts'
import {
  contextSourceLabel, contextWindowRawPayload, deriveContextWindow,
} from '../src/client/trajectory-context-window.ts'

const PROMPT = {
  config: { provider: 'p', model: 'm' },
  system: 'You are helpful.',
  tools: [{
    name: 'bash',
    description: 'Run a command',
    parameters: { type: 'object', properties: { command: { type: 'string' } } },
  }],
}

function userNode(seq: number, text: string): UserMessageNode {
  return { kind: 'user', seq, time: seq, content: [{ type: 'text', text }], source: undefined }
}

function contextNode(seq: number, text: string, source: unknown): ContextMessageNode {
  return {
    kind: 'context', seq, time: seq,
    content: [{ type: 'text', text }], source,
    provenance: { role: 'inject', label: 'plugin' },
    form: null,
  }
}

function assistantNode(seq: number, turn: number, step: number): AssistantMessageNode {
  return {
    kind: 'assistant', seq, time: seq, turn, step,
    blocks: [
      { kind: 'reasoning', text: 'think' },
      { kind: 'text', text: 'answer' },
      { kind: 'tool-call', callId: `c${seq}`, name: 'bash', argsRaw: '{"command":"ls"}' },
    ],
  }
}

function toolResultNode(seq: number): ToolResultNode {
  return {
    kind: 'tool-result', callId: `c${seq - 1}`, seq, time: seq,
    call: { name: 'bash', argsRaw: '{"command":"ls"}' },
    callTime: seq - 1,
    content: [{ type: 'text', text: 'file-a' }],
    isError: false,
    subCalls: [],
  }
}

function compactionNode(seq: number, summary: string | null): CompactionSummaryNode {
  return {
    kind: 'compaction', seq, time: seq, summary,
    summaryEventSeq: summary === null ? null : seq - 1,
    shadowedItemCount: summary === null ? null : 3,
    shadowedTokenCount: summary === null ? null : 1000,
  }
}

function assistantRequest(
  startSeq: number,
  turn: number,
  step: number,
  withPrompt = true,
): Extract<RequestView, { purpose: 'assistant' }> {
  return {
    purpose: 'assistant', startSeq, turn, step,
    startedAt: startSeq, completedAt: startSeq + 1, status: 'complete',
    ...(withPrompt ? { prompt: PROMPT } : {}),
  }
}

function compactionRequest(startSeq: number, landed = true): RequestView {
  return {
    purpose: 'compaction', startSeq, turn: null, step: 0,
    startedAt: startSeq, completedAt: landed ? startSeq + 1 : null,
    status: landed ? 'complete' : 'running',
    // Only a landed compaction (committed replacement) retires surface detail.
    ...(landed ? { replacementSeq: startSeq + 1 } : {}),
  }
}

function snapshot(
  eventNodes: TrajectorySnapshot['eventNodes'],
  requests: readonly RequestView[],
): Pick<TrajectorySnapshot, 'eventNodes' | 'requests'> {
  return { eventNodes, requests }
}

describe('deriveContextWindow', () => {
  it('folds surface nodes before the request cutoff in model order', () => {
    const model = deriveContextWindow(
      snapshot(
        [
          userNode(0, 'hello'),
          contextNode(1, 'plugin note', { kind: 'plugin', plugin: 'todo' }),
          assistantNode(2, 1, 1),
          toolResultNode(3),
          userNode(9, 'late'),
        ],
        [assistantRequest(5, 1, 2)],
      ),
      { turn: 1, step: 2 },
    )
    expect(model.cutoffSeq).toBe(5)
    expect(model.messages.map(message => message.kind)).toEqual(['user', 'context', 'assistant', 'tool'])
    expect(model.messages[0]?.role).toBe('user')
    expect(model.messages[1]?.source).toBe('plugin · todo')
    expect(model.messages[2]?.role).toBe('assistant')
    expect(model.messages[3]?.role).toBe('tool')
    expect(model.buckets.user).toBe('hello'.length + 'plugin note'.length)
    expect(model.buckets.assistant).toBe('think'.length + 'answer'.length + '{"command":"ls"}'.length)
    expect(model.buckets.toolResults).toBe(6)
    expect(model.buckets.system).toBe('You are helpful.'.length)
    expect(model.buckets.tools).toBeGreaterThan(0)
    expect(model.truncatedPrefix).toBe(false)
    expect(model.approximate).toBe(false)
  })

  it('resolves the request and inherits the prompt from the nearest earlier header', () => {
    const requests: RequestView[] = [
      assistantRequest(1, 1, 1),
      assistantRequest(10, 2, 1, false),
      assistantRequest(20, 3, 1, false),
    ]
    const model = deriveContextWindow(
      snapshot([userNode(1, 'hi')], requests),
      { turn: 3, step: 1 },
    )
    expect(model.request?.turn).toBe(3)
    expect(model.prompt).toEqual(PROMPT)
    expect(model.cutoffSeq).toBe(20)
  })

  it('keeps compaction summaries in place and skips empty ones', () => {
    const model = deriveContextWindow(
      snapshot(
        [userNode(1, 'hi'), compactionNode(2, 'earlier summary'), compactionNode(3, null)],
        [assistantRequest(5, 2, 1)],
      ),
      { turn: 2, step: 1 },
    )
    expect(model.messages.map(message => message.kind)).toEqual(['user', 'compaction'])
    expect(model.messages[1]?.blocks[0]?.text).toBe('earlier summary')
  })

  it('reports no truncation by default (the caller injects the pager flag)', () => {
    const model = deriveContextWindow(
      snapshot([userNode(400, 'hi')], [assistantRequest(500, 5, 1)]),
      { turn: 5, step: 1 },
    )
    expect(model.truncatedPrefix).toBe(false)
  })

  it('marks the window approximate when a later compaction completed', () => {
    const model = deriveContextWindow(
      snapshot([userNode(1, 'hi')], [assistantRequest(5, 1, 1), compactionRequest(20)]),
      { turn: 1, step: 1 },
    )
    expect(model.approximate).toBe(true)
    const fresh = deriveContextWindow(
      snapshot([userNode(1, 'hi')], [assistantRequest(5, 1, 1), compactionRequest(20, false)]),
      { turn: 1, step: 1 },
    )
    expect(fresh.approximate).toBe(false)
  })

  it('anchors the fold at the assistant node when the step has no request view', () => {
    const model = deriveContextWindow(
      snapshot(
        [
          userNode(0, 'early'),
          assistantNode(2, 1, 1),
          toolResultNode(3),
          userNode(4, 'between'),
          assistantNode(5, 1, 2),
          userNode(9, 'later'),
        ],
        [],
      ),
      { turn: 1, step: 2 },
    )
    expect(model.request).toBeUndefined()
    expect(model.cutoffSeq).toBe(5)
    expect(model.messages.map(message => message.seq)).toEqual([0, 2, 3, 4])
  })

  it('does not mark approximate for failed or interrupted compactions', () => {
    const failed: RequestView = {
      purpose: 'compaction', startSeq: 20, turn: null, step: 0,
      startedAt: 20, completedAt: 21, status: 'error', error: 'boom',
    }
    const model = deriveContextWindow(
      snapshot([userNode(0, 'hi')], [assistantRequest(5, 1, 1), failed]),
      { turn: 1, step: 1 },
    )
    expect(model.approximate).toBe(false)
  })

  it('supports a bare cutoff target without a request', () => {
    const model = deriveContextWindow(
      snapshot([userNode(1, 'hi'), userNode(2, 'there')], []),
      { cutoffSeq: 2 },
    )
    expect(model.request).toBeUndefined()
    expect(model.messages).toHaveLength(1)
    expect(model.prompt).toBeUndefined()
  })

  it('serializes the raw payload with config, prompt, and folded messages', () => {
    const model = deriveContextWindow(
      snapshot([userNode(1, 'hi'), toolResultNode(2)], [assistantRequest(5, 1, 1)]),
      { turn: 1, step: 1 },
    )
    const raw = contextWindowRawPayload(model)
    expect(raw.system).toBe('You are helpful.')
    expect(Array.isArray(raw.tools)).toBe(true)
    const messages = raw.messages as { role: string; content: { type: string }[] }[]
    expect(messages.map(message => message.role)).toEqual(['user', 'tool'])
    expect(messages[1]?.content[0]?.type).toBe('text')
  })
})

describe('contextSourceLabel', () => {
  it('folds plugin sources and plain kinds', () => {
    expect(contextSourceLabel(undefined)).toBeUndefined()
    expect(contextSourceLabel({ kind: 'plugin', plugin: 'todo' })).toBe('plugin · todo')
    expect(contextSourceLabel({ kind: 'agent-message' })).toBe('agent-message')
    expect(contextSourceLabel({ name: 'hook' })).toBe('hook')
  })
})
