/** Context-window inspector: composition bar, prompt, catalog, messages, raw JSON. */

import { useMemo, useState, type ReactNode } from 'react'
import {
  IconChevronRightOutline14, JsonTree, type JsonTreeLabels,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConversationPromptSnapshot } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TrajectoryKey, TrajectoryTranslate } from './locales.ts'
import {
  contextWindowRawPayload,
  type ContextBucket,
  type ContextWindowBlock,
  type ContextWindowMessage,
  type ContextWindowModel,
} from './trajectory-context-window.ts'
import css from './TrajectoryContextWindow.module.css'

const MESSAGE_PREVIEW_COUNT = 80
const BUCKETS: readonly ContextBucket[] = ['system', 'tools', 'user', 'assistant', 'toolResults']

const BUCKET_LABEL_KEY: Record<ContextBucket, TrajectoryKey> = {
  system: 'context.bucket.system',
  tools: 'context.bucket.tools',
  user: 'context.bucket.user',
  assistant: 'context.bucket.assistant',
  toolResults: 'context.bucket.toolResults',
}

const ROLE_LABEL_KEY: Record<ContextWindowMessage['kind'], TrajectoryKey> = {
  user: 'context.role.user',
  steering: 'context.role.steering',
  context: 'context.role.context',
  assistant: 'context.role.assistant',
  tool: 'context.role.tool',
  compaction: 'context.role.compaction',
}

function formatChars(chars: number, t: TrajectoryTranslate): string {
  return t('unit.chars', {
    value: String(Math.round(chars)).replace(/\B(?=(\d{3})+(?!\d))/g, ','),
  })
}

function CompositionBar({ model, t }: { model: ContextWindowModel; t: TrajectoryTranslate }) {
  const total = BUCKETS.reduce((sum, bucket) => sum + model.buckets[bucket], 0)
  if (total === 0) return null
  return (
    <div className={css.composition} data-testid="context-composition">
      <div className={css.compositionBar} role="img" aria-label={t('context.compositionAria')}>
        {BUCKETS.map((bucket) => {
          const chars = model.buckets[bucket]
          if (chars === 0) return null
          return (
            <span
              key={bucket}
              className={css.compositionSegment}
              data-bucket={bucket}
              style={{ width: `${(chars / total) * 100}%` }}
              title={`${t(BUCKET_LABEL_KEY[bucket])} · ${formatChars(chars, t)}`}
            />
          )
        })}
      </div>
      <ul className={css.compositionLegend}>
        {BUCKETS.map((bucket) => {
          const chars = model.buckets[bucket]
          if (chars === 0) return null
          return (
            <li key={bucket} className={css.compositionLegendItem} data-bucket={bucket}>
              <span className={css.compositionSwatch} data-bucket={bucket} aria-hidden="true" />
              <span className={css.compositionLegendLabel}>{t(BUCKET_LABEL_KEY[bucket])}</span>
              <span className={css.compositionLegendValue}>{formatChars(chars, t)}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function BlockText({ block, t }: { block: ContextWindowBlock; t: TrajectoryTranslate }) {
  switch (block.kind) {
    case 'thinking':
      return (
        <div className={css.block} data-block="thinking">
          <div className={css.blockLabel}>{t('context.block.thinking')}</div>
          <pre className={css.blockText}>{block.text}</pre>
        </div>
      )
    case 'toolCall':
      return (
        <div className={css.block} data-block="toolCall">
          <div className={css.blockLabel}>
            {t('context.block.toolCall')}
            {block.toolName === undefined ? '' : ` · ${block.toolName}`}
          </div>
          <pre className={css.blockText}>{block.argsRaw ?? block.text}</pre>
        </div>
      )
    case 'image':
      return <div className={css.blockLabel}>{t('context.block.image')}</div>
    case 'other':
      return <div className={css.blockLabel}>{t('context.block.other')}</div>
    default:
      return (
        <div className={css.block} data-block="text">
          <pre className={css.blockText}>{block.text}</pre>
        </div>
      )
  }
}

function MessageItem({
  message,
  t,
}: {
  message: ContextWindowMessage
  t: TrajectoryTranslate
}) {
  const [open, setOpen] = useState(false)
  return (
    <details
      className={css.message}
      data-role={message.role}
      data-kind={message.kind}
      open={open}
      onToggle={(event) => { setOpen(event.currentTarget.open) }}
    >
      <summary className={css.messageSummary}>
        <IconChevronRightOutline14 className={css.messageChevron} size={12} />
        <span className={css.messageRole} data-role={message.role}>
          {t(ROLE_LABEL_KEY[message.kind])}
        </span>
        <span className={css.messageSeq}>#{message.seq}</span>
        {message.source === undefined
          ? null
          : <span className={css.messageSource}>{message.source}</span>}
        {message.toolName === undefined
          ? null
          : <span className={css.messageTool}>{message.toolName}</span>}
        <span className={css.messageChars}>{formatChars(message.chars, t)}</span>
      </summary>
      {open && (
        <div className={css.messageBlocks}>
          {message.blocks.map((block, index) => <BlockText key={index} block={block} t={t} />)}
        </div>
      )}
    </details>
  )
}

function Section({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string
  count?: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <details
      className={css.section}
      open={open}
      onToggle={(event) => { setOpen(event.currentTarget.open) }}
    >
      <summary className={css.sectionSummary}>
        <IconChevronRightOutline14 className={css.messageChevron} size={12} />
        <span className={css.sectionTitle}>{title}</span>
        {count === undefined ? null : <span className={css.sectionCount}>{count}</span>}
      </summary>
      {open && <div className={css.sectionBody}>{children}</div>}
    </details>
  )
}

function ToolList({
  tools,
  jsonLabels,
  t,
}: {
  tools: ConversationPromptSnapshot['tools']
  jsonLabels: JsonTreeLabels
  t: TrajectoryTranslate
}) {
  return (
    <div className={css.toolList}>
      {tools.map((tool, index) => (
        <details className={css.toolItem} key={`${tool.name}:${index}`}>
          <summary className={css.toolSummary}>
            <IconChevronRightOutline14 className={css.messageChevron} size={12} />
            <span className={css.toolName}>{tool.name}</span>
            <span className={css.toolDescription}>{tool.description}</span>
          </summary>
          <JsonTree
            data={tool.parameters}
            label={t('record.namedParametersJson', { name: tool.name })}
            labels={jsonLabels}
            className={css.toolTree}
          />
        </details>
      ))}
    </div>
  )
}

/**
 * Rebuilt model-side view of one provider request: what the context window
 * consisted of, sectioned like the reference raw-record inspectors.
 */
export function TrajectoryContextWindow({
  model,
  jsonLabels,
  hasOlderRecords = false,
  loadingAll = false,
  onLoadAll,
  t,
}: {
  model: ContextWindowModel
  jsonLabels: JsonTreeLabels
  /** Whether earlier unloaded history exists (drives the truncation hint). */
  hasOlderRecords?: boolean
  /** Whether a load-all jump is currently paging. */
  loadingAll?: boolean
  onLoadAll?: (() => void) | undefined
  t: TrajectoryTranslate
}) {
  const [showAllMessages, setShowAllMessages] = useState(false)
  const rawPayload = useMemo(() => contextWindowRawPayload(model), [model])
  // The tail of the window is what the request mostly attended to; the
  // preview keeps the LATEST entries and offers the prefix on demand.
  const visibleMessages = showAllMessages
    ? model.messages
    : model.messages.slice(-MESSAGE_PREVIEW_COUNT)
  const hiddenCount = model.messages.length - visibleMessages.length

  return (
    <div className={css.root} data-testid="context-window">
      {model.truncatedPrefix && (
        <p className={css.notice} data-notice="truncated">
          {t('context.truncated')}
          {hasOlderRecords && onLoadAll !== undefined && (
            <button
              type="button"
              className={css.noticeAction}
              disabled={loadingAll}
              onClick={onLoadAll}
            >
              {loadingAll ? t('history.loadingAll') : t('history.loadAll')}
            </button>
          )}
        </p>
      )}
      {model.approximate && (
        <p className={css.notice} data-notice="approximate">{t('context.approximate')}</p>
      )}
      <CompositionBar model={model} t={t} />
      {model.prompt !== undefined && model.prompt.system !== '' && (
        <Section
          title={t('context.systemPrompt')}
          count={formatChars(model.buckets.system, t)}
        >
          <pre className={css.systemPrompt}>{model.prompt.system}</pre>
        </Section>
      )}
      {model.prompt !== undefined && model.prompt.tools.length > 0 && (
        <Section
          title={t('context.tools', { count: model.prompt.tools.length })}
          count={formatChars(model.buckets.tools, t)}
        >
          <ToolList tools={model.prompt.tools} jsonLabels={jsonLabels} t={t} />
        </Section>
      )}
      <Section
        title={t('context.messages', { count: model.messages.length })}
        count={formatChars(
          model.buckets.user + model.buckets.assistant + model.buckets.toolResults,
          t,
        )}
        defaultOpen
      >
        {model.messages.length === 0
          ? <p className={css.empty}>{t('context.empty')}</p>
          : (
            <div className={css.messageList}>
              {hiddenCount > 0 && (
                <button
                  type="button"
                  className={css.showAll}
                  onClick={() => { setShowAllMessages(true) }}
                >
                  {t('context.showAll', { count: model.messages.length })}
                </button>
              )}
              {visibleMessages.map(message => (
                <MessageItem key={message.key} message={message} t={t} />
              ))}
            </div>
          )}
      </Section>
      <Section title={t('context.raw')}>
        <JsonTree
          data={rawPayload}
          label={t('context.rawRequestJson')}
          labels={jsonLabels}
          className={css.rawTree}
        />
      </Section>
    </div>
  )
}
