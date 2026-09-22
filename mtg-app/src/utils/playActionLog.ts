import { applyMatchAction } from './playTable';
import type { MatchActionRecord, MatchState } from '../types/play';

/** Replay journal actions onto a snapshot. Skips the first `actionSeq` entries. */
export function replayMatchActions(
  snapshot: MatchState,
  actions: Array<Pick<MatchActionRecord, 'actionId' | 'action'>>,
): { state: MatchState; appliedIds: Set<string> } {
  const appliedIds = new Set<string>();
  const seq = Math.max(0, Math.floor(snapshot.actionSeq ?? 0));
  let state: MatchState = { ...snapshot, actionSeq: seq };
  for (let i = 0; i < actions.length; i += 1) {
    const entry = actions[i];
    appliedIds.add(entry.actionId);
    if (i < seq) continue;
    state = applyMatchAction(state, entry.action);
  }
  return { state, appliedIds };
}
