# Agent Note: Dialog draft persistence across refresh and crash

Status: implemented

English | [中文](2026-08-28-dialog-draft-persistence.zh.md)

## Problem

A page refresh or browser crash destroyed every half-filled non-temporary dialog in the web client: the workspace/session rename drafts, the Select Workspace Directory dialog's walked-to level, its open path editor, and its open new-folder form all lived in component state alone. The composer draft already survives reloads through the runtime store's persistence, so the loss was concentrated exactly where a user had committed the most unprompted input — a dialog they chose to open. On flaky networks, where refreshes are involuntary, the two failures compound: the connection drops mid-form, the reload loses the form.

## Decision

**One shared primitive in ui-primitives.** `readDialogDraft` / `writeDialogDraft` / `clearDialogDraft` store one whole JSON value per key under the `dsh.draft.` prefix — the same `dsh.` namespace discipline as every other persisted client cell. Storage failures (quota, private mode) disable persistence without breaking the dialog, mirroring the snapshot store's posture; a corrupt entry is removed and reads as absent.

**The lifecycle rule, not the medium, provides "temporary".** A surface writes its restorable state through on every change while live; a deliberate end — successful commit or explicit cancel — clears the key; an abrupt teardown (refresh, crash) leaves the last write standing, and the next mount restores it. Nothing expires and nothing is versioned: keys are cheap, small, and self-limiting because every deliberate end removes them.

**The workspace flow is the flagship adoption.** `WorkspacePickFlow` persists its open request per surface; paired with the [opening-discipline change](../bug-fix/2026-08-28-no-workspace-empty-state-never-auto-opens.md), that stale request is the only automatic open left anywhere in the flow. The browse occupant (`BrowseDirectoryFlow`) persists the dialog's mid-interaction state — listed level, open path editor text, hidden toggle, open new-folder draft — through a `restoreDraft`/`onDraftChange` seam on `DirectoryBrowser`, under one key shared by both flow surfaces (the dialog is the same task wherever raised, and only one picking interaction runs at a time). A confirmed pick clears the draft; a dismissed dialog keeps its place for the next deliberate raise. Rename dialogs persist their draft per target (Workspace id / Session id) and restore it the next time the same target is renamed; they do not auto-reopen — the target is one visible row away, and reopening a modal for a row the user may no longer be looking at trades a rare keystroke loss for a frequent intrusion.

**Classification decides rollout, surface by surface.** A full inventory of the web client's modal surfaces sorts into three classes:

- *Form-like (adopt the mechanism next)*: the settings models provider editor (`ProviderEditor.tsx` — model-catalog drafts; its API-key field is **excluded from persistence: secrets never go to localStorage**), the question panel's answer composer (`QuestionComposer.tsx` — the question itself is host-durable, the typed answers are not), the agent-preset copy dialog, the message-feedback note, the goal-objective editor, and staged plugin-card forms.
- *Navigation-like (persist position, not "open")*: the model fetch-candidates picker, trajectory search/timeline state, and workspace search — restoring the level or query is enough; no auto-reopen.
- *Ephemeral (never persist)*: delete/confirm dialogs, approval and plan-review panels (their waits are host-durable), the lightbox, menus, and toasts.

## Testing

`dialog-draft.client.spec.ts` pins the round trip, the corrupt-entry removal, and every no-localStorage and failing-storage branch. `client-flow.client.spec.tsx` pins the browse seam end to end: write-through while open, clear on the confirmed pick, and a stale draft seeding the restored level. `directory-browser.client.spec.tsx` pins the open-edge restoration (level, hidden toggle, new-folder form) and the reported draft's shape, including the pre-listing report that omits `path`. `workspace-picker.client.spec.tsx` and `workspace-browser.client.spec.tsx` pin the flow-open request and the rename drafts.

## Alternatives considered

**A persisted runtime store per dialog (`defineStore` with `persist`).** Rejected: a store brings shared identity, multi-instance, and actions machinery that dialog-local state does not have; the primitive is three functions and a prefix, and the store remains the right tool for state that outlives a dialog.

**`sessionStorage` as the medium.** Rejected: it survives a refresh but not a browser crash, and crash recovery is half the requirement. "Temporary" comes from the clear-on-deliberate-end lifecycle, not from the storage medium; residue exists only after the abrupt teardown the mechanism exists for.

**Persisting every dialog's open flag automatically.** Rejected: reopening confirmations and read-only dialogs after a reload is noise; only surfaces whose interaction state is worth resuming reopen, and each adopts that deliberately.

**Persisting error text alongside drafts.** Rejected: diagnostics are transient; restoring a stale error next to a restored draft would misreport the current attempt.

**A structured per-dialog schema with versioning.** Rejected for now: every adopted surface stores a small literal object whose absent members mean defaults, so an unknown older shape degrades to those defaults harmlessly. Introduce versioning when a draft grows enough that silent defaulting would lose real work.

## Consequences

- Refresh or crash mid-form now resumes: the add-workspace dialog reopens where it stood, and a reopened rename carries the typed name.
- A deliberately cancelled browse dialog remembers its place — continuation by design, distinct from reopening; the next raise starts where the last one left off.
- localStorage gains small `dsh.draft.*` cells whose lifetime is bounded by deliberate ends; the worst residue is one dialog's worth of state after a crash, which is exactly the state the user wants back.
- The secrets exclusion is a standing rule for every future adoption: credential and token fields never pass through this mechanism, whatever their dialog class.
