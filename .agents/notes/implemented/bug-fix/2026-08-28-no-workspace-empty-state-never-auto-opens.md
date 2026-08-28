# Agent Note: The confirmed no-workspace state and the flow opening discipline

Status: implemented

English | [中文](2026-08-28-no-workspace-empty-state-never-auto-opens.zh.md)

## Problem

Two failures shared one root. First, the [one-route rule](../simplification/2026-07-31-one-route-to-add-a-workspace.md) made any picker open over an empty settled list consume straight into the directory flow — and the no-workspace composer is itself that picker's trigger (a stray Enter, Space, or click on the inert card opens it). On a flaky network, where the workspace baseline arrives late or momentarily reads empty, users saw the "add workspace" dialog pop apparently by itself, several times, exactly when the connection was worst. Second, the no-workspace presentation was a placeholder chip plus an inert composer: no marker saying what is missing, no direct action, no room to breathe.

## Decision

**Detection never opens anything.** The `addIsTheOnlyEntry` auto-raise is removed from `WorkspacePickFlow`. A pick gesture always shows the menu — with nothing listed, the menu carries its single add row — so an empty, late, or network-emptied list can no longer raise the picking interaction. The [one-route note](../simplification/2026-07-31-one-route-to-add-a-workspace.md) keeps its single-route rule; its "the anchor gesture *is* the action" clause is superseded by this one.

**Only an explicit add gesture raises the flow directly.** The owner contract (`EmptyWorkspaceOwnerProps`) gains `intent: 'pick' | 'add'`. The chip, the composer trigger, and every menu selection are `pick`; the labeled add affordances — the hero empty state's button, the add-only sidebar header (`addOnly` implies add intent) — are `add`, and an add-intent open request is consumed straight into the flow with the same `flowBusy` gate as before.

**The one reopen path is a stale draft.** `WorkspacePickFlow` persists its open request per surface (`workspace.addFlow.hero` / `workspace.addFlow.sidebar` under the dialog-draft prefix): a refresh or browser crash that tore down an open flow remounts it open, and every deliberate end (pick, cancel, error dismissal) clears the request. This is the only automatic open left in the flow, and it keys on "an interaction was torn down", never on "the list looks empty".

**Emptiness is claimed only on a settled baseline.** The hero's new `conversation.hero.workspace.empty` hole (filled by `WorkspaceHeroEmpty` from ui-workspace) and the sidebar body's empty block render their 暂无工作区 / "No workspaces yet" marker plus one add action only while `phase === 'ready'` and no Workspace exists; a pending or failed list proves nothing and renders nothing — the hero shows its ordinary chrome, the sidebar keeps its no-session marker. Both empty states hide their action entirely while no picking flow is composed (the dead-button rule; the marker stays in the sidebar body).

**Room to breathe.** The hero empty state centers marker and primary button with clearance above and below inside the composer stack; the sidebar block pads its marker and outline action similarly.

## Testing

`workspace-picker.client.spec.tsx` pins the one-row add menu over an empty settled list (choose its row to raise the flow), the direct raise for `intent="add"`, the stale-draft reopen, and the draft cleared after adoption. `workspace-hero-empty.client.spec.tsx` pins the settled-empty render, the pending/listed/unoccupied null branches, and the late occupancy flip. `workspace-browser.client.spec.tsx` pins the sidebar marker with its add action in both grouping modes and the no-session marker surviving an unsettled baseline. `skeleton.client.spec.tsx` pins the hero routing: chip → `pick`, empty-state `requestAdd` → `add`.

## Alternatives considered

**Keep the direct-raise for the anchor gesture (menu ⇔ a choice exists).** Rejected: the rule's premise was that a one-row menu is a wasted click, but the wasted click is not the failure mode — the uninvited dialog is. A user directive fixes the invariant absolutely: no automatic raise off detected emptiness, ever, with the stale-form reopen as the single exception. The empty state's labeled button restores the one-click add path that the rule was protecting, without detection anywhere in it.

**Reopen the flow for first-run users (an empty list means a new user).** Rejected: a first run is indistinguishable from a network-emptied list at the moment of decision, which is precisely the misread this change removes. The empty state's button is one unambiguous click away.

**Hide the hero chip while no Workspace exists.** Rejected: the workspace row also seats the agent-preset chip, and the chip remains the pick path over whatever list exists later.

**Gate the no-session marker on the sessions baseline too.** Deferred: the sessions list carries its own phase and marker semantics; nothing in the reported failure involved it.

## Consequences

- The hero chip's `aria-haspopup="menu"` announcement is truthful again in every state: a pick gesture always produces a menu.
- Adding via the chip over an empty list costs one more click than before; the empty state's button is the one-click path, and it exists exactly when the list is confirmed empty.
- An unoccupied directory-flow hole leaves the hero empty state showing only its marker and the sidebar body without its action — the same no-dead-affordance posture as every other add surface.
- The stale-form reopen also applies to the native-chooser occupant: a crash while the OS dialog was up re-prompts once on next load. Accepted: it is the same "continue where you were" contract.
