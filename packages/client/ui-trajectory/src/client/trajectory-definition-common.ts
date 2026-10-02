import type { ConversationNodeContext } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {
  TrajectoryContribution, TrajectoryConversationViewNode,
} from './trajectory-contract.ts'

/**
 * Wrap one contribution in the Engine-owned target envelope.
 *
 * @param context - Context that owns the contribution identity.
 * @param anchorSeq - Sequence used to order the contribution.
 * @param data - Trajectory-specific contribution payload.
 * @param options - Visibility override; `hidden` replaces a withdrawal the
 *   Engine would reject, and the snapshot builder drops hidden nodes.
 * @returns The contribution wrapped as a Trajectory view node.
 */
export function trajectoryNode(
  context: ConversationNodeContext,
  anchorSeq: number,
  data: TrajectoryContribution,
  options: { readonly visibility?: 'visible' | 'hidden' } = {},
): TrajectoryConversationViewNode {
  return {
    key: context.key,
    kind: context.kind,
    id: context.id,
    target: 'trajectory',
    anchorSeq,
    location: context.start?.location ?? { kind: 'unresolved' },
    visibility: options.visibility ?? 'visible',
    data,
  }
}
