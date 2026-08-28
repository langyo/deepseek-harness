/**
 * The browse picking occupant (package-internal; the `./client` surface
 * exposes only the Loader exports). Same-package tests exercise it directly
 * through this module.
 */
import { createElement, useCallback } from 'react'
import type { ReactElement } from 'react'
import type { DirectoryListing } from '@deepseek-ai/dsh-client-runtime/client'
import type { Translate } from '@deepseek-ai/dsh-client-locale/client'
import { clearDialogDraft, readDialogDraft, writeDialogDraft } from '@deepseek-ai/dsh-client-ui-primitives'
// Type-only: the owner contract of the directory-flow holes.
import type { DirectoryFlowOwnerProps } from '@deepseek-ai/dsh-client-ui-workspace/client'
import { DirectoryBrowser, type DirectoryBrowserDraft } from './DirectoryBrowser.tsx'

/** Injected face: the browse wire calls and copy the dialog drives (bound in apply's closure). */
export interface BrowseFlowInjected {
  /** List one directory level (absent path = the Host home directory); the signal aborts a superseded scan on the wire. */
  listDirectory: (path?: string, signal?: AbortSignal) => Promise<DirectoryListing>
  /** Create one child directory under an existing parent. */
  createDirectory: (path: string, name: string) => Promise<string>
  /** Localized dialog copy (this package's namespace). */
  t: Translate
}

/**
 * Draft key for the browse dialog's mid-interaction state. One key serves
 * both flow surfaces (hero picker, sidebar): the dialog is the same task
 * wherever it was raised, and only one picking interaction runs at a time,
 * so continuation may cross surfaces. Cleared only by a confirmed pick — a
 * cancelled dialog keeps its place for the next deliberate raise.
 */
const BROWSE_DRAFT_KEY = 'workspace.addFlow.browse'

/**
 * Flow occupant: adapts the hole's owner conversation onto the browser
 * dialog — a confirmed directory is the picked path, dismissal is the
 * cancellation. Browse failures (unreadable targets, create conflicts) stay
 * inside the dialog's own alert surfaces, so the owner's `onError` arm is
 * never driven by this occupant. The dialog's mid-interaction state
 * (listed level, open path editor, new-folder form) persists through this
 * seam: restored at each open, written through on every change, cleared by
 * the confirmed pick — so a refresh or browser crash mid-form loses nothing.
 * @param props - owner conversation plus the injected browse face.
 * @returns the dialog element (renders nothing while closed).
 */
export function BrowseDirectoryFlow(props: DirectoryFlowOwnerProps & BrowseFlowInjected): ReactElement {
  const onDraftChange = useCallback((draft: DirectoryBrowserDraft): void => {
    writeDialogDraft(BROWSE_DRAFT_KEY, draft)
  }, [])
  const readDraft = useCallback(
    (): DirectoryBrowserDraft | undefined => readDialogDraft<DirectoryBrowserDraft | undefined>(BROWSE_DRAFT_KEY, undefined),
    [],
  )
  const onOpen = useCallback((path: string): void => {
    clearDialogDraft(BROWSE_DRAFT_KEY)
    props.onPicked(path)
  }, [props.onPicked])
  return createElement(DirectoryBrowser, {
    open: props.open,
    busy: props.busy,
    listDirectory: props.listDirectory,
    createDirectory: props.createDirectory,
    t: props.t,
    restoreDraft: readDraft,
    onDraftChange,
    onOpen,
    onClose: props.onCancel,
  })
}
