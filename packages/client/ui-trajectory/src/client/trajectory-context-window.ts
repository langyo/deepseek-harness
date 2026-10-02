/**
 * Per-request context-window reconstruction from the loaded trajectory surface.
 *
 * The session log never persists the assembled prompt of a provider call
 * (`request/context` carries provider/model metadata on change only), so the
 * model-side view of a request is rebuilt here from the pieces the client
 * already holds: the effective prompt snapshot attached to the RequestView
 * (system prompt + tool catalog + config, inherited from request headers) and
 * the finalized surface nodes committed before the request opened.
 */
import type {
  AssistantBlock, ConversationPromptSnapshot, RequestView,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TrajectorySnapshot } from './trajectory-contract.ts'

/** Composition buckets shown by the context-window bar. */
export type ContextBucket = 'system' | 'tools' | 'user' | 'assistant' | 'toolResults'

/** One content block inside a reconstructed message. */
export interface ContextWindowBlock {
  kind: 'text' | 'thinking' | 'toolCall' | 'image' | 'other'
  text: string
  callId?: string
  toolName?: string
  argsRaw?: string
}

/** One surface message as the model had it in context. */
export interface ContextWindowMessage {
  /** Stable list key. */
  key: string
  role: 'user' | 'assistant' | 'tool'
  /** Surface provenance: human prompt, steering, plugin context, assistant, tool. */
  kind: 'user' | 'steering' | 'context' | 'assistant' | 'tool' | 'compaction'
  /** Source event sequence for cross-record navigation. */
  seq: number
  /** Producer label (plugin, agent, …) when the source records one. */
  source?: string | undefined
  callId?: string | undefined
  toolName?: string | undefined
  blocks: readonly ContextWindowBlock[]
  /** Total characters across blocks. */
  chars: number
}

/** Rebuilt model-side view of one request. */
export interface ContextWindowModel {
  /** Effective system prompt + tool catalog + config for the request, when known. */
  prompt?: ConversationPromptSnapshot
  /** Surface messages committed before the request opened, in model order. */
  messages: readonly ContextWindowMessage[]
  /** Character totals per composition bucket. */
  buckets: Readonly<Record<ContextBucket, number>>
  /** The request this window was rebuilt for, when resolvable. */
  request?: Extract<RequestView, { purpose: 'assistant' }>
  /** Request anchor used as the fold cutoff. */
  cutoffSeq: number
  /** Loaded history omits an earlier prefix; set by the caller from the pager. */
  truncatedPrefix: boolean
  /** A later compaction retired surface detail this request still saw. */
  approximate: boolean
}

/** Request the caller wants reconstructed: an assistant step or a raw cutoff. */
export type ContextWindowTarget =
  | { readonly turn: number; readonly step: number }
  | { readonly cutoffSeq: number }

type SurfaceNode = TrajectorySnapshot['eventNodes'][number]

type AssistantRequestView = Extract<RequestView, { purpose: 'assistant' }>

function inputBlocks(
  content: readonly { type: string; text?: string }[],
): readonly ContextWindowBlock[] {
  return content.map((block): ContextWindowBlock => ({
    kind: block.type === 'text' ? 'text' : block.type === 'image' ? 'image' : 'other',
    text: block.text ?? '',
  }))
}

function assistantBlocks(blocks: readonly AssistantBlock[]): readonly ContextWindowBlock[] {
  return blocks.map((block): ContextWindowBlock => {
    switch (block.kind) {
      case 'text': return { kind: 'text', text: block.text }
      case 'reasoning': return { kind: 'thinking', text: block.text }
      case 'tool-call':
        return {
          kind: 'toolCall',
          text: block.argsRaw,
          callId: block.callId,
          toolName: block.name,
          argsRaw: block.argsRaw,
        }
      case 'image': return { kind: 'image', text: '' }
      case 'other': return { kind: 'other', text: '' }
    }
  })
}

function blockChars(blocks: readonly ContextWindowBlock[]): number {
  // toolCall blocks carry their argsRaw as `text`, so text alone is the total.
  return blocks.reduce((total, block) => total + block.text.length, 0)
}

/**
 * Producer label folded from a message `source` payload.
 * @param source - Raw `source` payload of a surface message node.
 * @returns A display label, or undefined when the payload records none.
 */
export function contextSourceLabel(source: unknown): string | undefined {
  if (source === null || typeof source !== 'object') return undefined
  const record = source as Record<string, unknown>
  const kind = typeof record.kind === 'string' ? record.kind : undefined
  const name = typeof record.plugin === 'string'
    ? record.plugin
    : typeof record.name === 'string'
      ? record.name
      : typeof record.label === 'string'
        ? record.label
        : undefined
  if (kind === undefined) return name
  return name === undefined || name === kind ? kind : `${kind} · ${name}`
}

function foldMessage(node: SurfaceNode): ContextWindowMessage | null {
  switch (node.kind) {
    case 'user':
    case 'steering':
    case 'context': {
      const blocks = inputBlocks(node.content)
      return {
        key: `${node.kind} ${node.seq}`,
        role: 'user',
        kind: node.kind,
        seq: node.seq,
        source: contextSourceLabel(node.source),
        blocks,
        chars: blockChars(blocks),
      }
    }
    case 'assistant': {
      const blocks = assistantBlocks(node.blocks)
      return {
        key: `assistant ${node.seq}`,
        role: 'assistant',
        kind: 'assistant',
        seq: node.seq,
        blocks,
        chars: blockChars(blocks),
      }
    }
    case 'tool-result': {
      const blocks = inputBlocks(node.content)
      return {
        key: `tool ${node.seq}`,
        role: 'tool',
        kind: 'tool',
        seq: node.seq,
        callId: node.callId,
        toolName: node.call?.name,
        blocks,
        chars: blockChars(blocks),
      }
    }
    case 'compaction': {
      // The checkpoint marker stays on the surface: the model reads the
      // summary in place of the retired items.
      if (node.summary === null || node.summary === '') return null
      const blocks: readonly ContextWindowBlock[] = [{ kind: 'text', text: node.summary }]
      return {
        key: `compaction ${node.seq}`,
        role: 'user',
        kind: 'compaction',
        seq: node.seq,
        blocks,
        chars: blockChars(blocks),
      }
    }
    default:
      return null
  }
}

function bucketOf(message: ContextWindowMessage): ContextBucket {
  if (message.role === 'assistant') return 'assistant'
  if (message.role === 'tool') return 'toolResults'
  return 'user'
}

function requestFor(
  requests: readonly RequestView[],
  target: ContextWindowTarget,
): AssistantRequestView | undefined {
  if ('cutoffSeq' in target) return undefined
  return requests.find((request): request is AssistantRequestView =>
    request.purpose === 'assistant'
      && request.turn === target.turn
      && request.step === target.step)
}

function effectivePrompt(
  requests: readonly RequestView[],
  request: AssistantRequestView | undefined,
  cutoffSeq: number,
): ConversationPromptSnapshot | undefined {
  if (request?.prompt !== undefined) return request.prompt
  // Fall back to the nearest earlier request whose header carried a snapshot;
  // ordinary requests inherit the effective header until a later one changes it.
  let inherited: ConversationPromptSnapshot | undefined
  for (const candidate of requests) {
    if (candidate.purpose !== 'assistant') continue
    if (candidate.startSeq > cutoffSeq) break
    if (candidate.prompt !== undefined) inherited = candidate.prompt
  }
  return inherited
}

/**
 * Rebuild the context window of one provider request from the loaded surface.
 * @param snapshot - Complete resident trajectory snapshot (not the paged window).
 * @param target - Assistant turn/step, or a bare cutoff for standalone operations.
 * @returns The model-side composition, with truncation/approximation flags.
 */
export function deriveContextWindow(
  snapshot: Pick<TrajectorySnapshot, 'eventNodes' | 'requests'>,
  target: ContextWindowTarget,
): ContextWindowModel {
  const request = requestFor(snapshot.requests, target)
  /* A record whose step opened outside the resident window has no RequestView;
   * anchor the fold at its assistant node instead of swallowing later history.
   * When neither exists (unreachable from the ledger) the honest window is empty. */
  const fallbackNode = request === undefined && !('cutoffSeq' in target)
    ? snapshot.eventNodes.find(node =>
      node.kind === 'assistant' && node.turn === target.turn && node.step === target.step)
    : undefined
  const cutoffSeq = 'cutoffSeq' in target
    ? target.cutoffSeq
    : request?.startSeq ?? fallbackNode?.seq ?? 0
  const prompt = effectivePrompt(snapshot.requests, request, cutoffSeq)

  const messages: ContextWindowMessage[] = []
  for (const node of snapshot.eventNodes) {
    if (node.seq >= cutoffSeq) break
    const message = foldMessage(node)
    if (message !== null) messages.push(message)
  }

  const buckets: Record<ContextBucket, number> = {
    system: prompt?.system.length ?? 0,
    tools: prompt === undefined ? 0 : JSON.stringify(prompt.tools).length,
    user: 0,
    assistant: 0,
    toolResults: 0,
  }
  for (const message of messages) {
    buckets[bucketOf(message)] += message.chars
  }

  /* Truncation cannot be derived from the first folded node's seq (surface
   * nodes start after harness preamble events); the caller overrides this with
   * the session pager's authoritative has-more flag. */
  const truncatedPrefix = false
  // Only a compaction that LANDED (committed a replacement) retired detail.
  const approximate = snapshot.requests.some(candidate =>
    candidate.purpose === 'compaction'
      && candidate.replacementSeq !== undefined
      && candidate.startSeq > cutoffSeq)

  return {
    ...(prompt === undefined ? {} : { prompt }),
    messages,
    buckets,
    ...(request === undefined ? {} : { request }),
    cutoffSeq,
    truncatedPrefix,
    approximate,
  }
}

/**
 * Serialized raw-request payload behind the 原始记录 JSON tree.
 * @param model - The rebuilt context window.
 * @returns A JSON-shaped object: config, system, tools, and folded messages.
 */
export function contextWindowRawPayload(
  model: ContextWindowModel,
): Record<string, unknown> {
  return {
    ...(model.request?.requestConfig === undefined
      ? {}
      : { config: model.request.requestConfig }),
    ...(model.prompt === undefined
      ? {}
      : { system: model.prompt.system, tools: model.prompt.tools }),
    messages: model.messages.map(message => ({
      role: message.role,
      kind: message.kind,
      seq: message.seq,
      ...(message.source === undefined ? {} : { source: message.source }),
      ...(message.callId === undefined ? {} : { callId: message.callId }),
      ...(message.toolName === undefined ? {} : { name: message.toolName }),
      content: message.blocks.map(block => ({
        type: block.kind,
        ...(block.toolName === undefined ? {} : { name: block.toolName }),
        ...(block.callId === undefined ? {} : { callId: block.callId }),
        text: block.text,
      })),
    })),
  }
}
