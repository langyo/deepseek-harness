/**
 * The hero's no-workspace empty state: a quiet marker plus one explicit
 * "new workspace" action, rendered into `conversation.hero.workspace.empty`
 * only while the workspace baseline has SETTLED empty — a pending or failed
 * list says nothing about emptiness (the exact misread a slow network used to
 * produce), so those states render nothing here at all. The button is an
 * add-intent gesture the hero owner routes back into its picker hole; with no
 * composed picking flow the surface has no add affordance, so it hides.
 */
import { Button, IconProjectAddOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkspaceEmptyStateProps } from './contract/slots.ts'
import css from './WorkspaceHeroEmpty.module.css'

/**
 * Render the confirmed-empty marker and its action.
 * @param props - empty-state slot props (owner's add request + occupancy hook + locale seat).
 * @returns the empty-state block, or null while emptiness is unconfirmed or no flow is composed.
 */
export function WorkspaceHeroEmpty({ requestAdd, useWorkspaces, useDirectoryFlow, t }: WorkspaceEmptyStateProps) {
  const snapshot = useWorkspaces(state => state)
  const flowAvailable = useDirectoryFlow(occupied => occupied)
  if (snapshot.phase !== 'ready' || snapshot.items.length > 0 || !flowAvailable) return null
  return (
    <div className={css.root}>
      <span className={css.marker}>{t('empty.noWorkspaces')}</span>
      <Button variant="primary" icon={<IconProjectAddOutline16 size={16} />} onClick={requestAdd}>
        {t('empty.newWorkspace')}
      </Button>
    </div>
  )
}
