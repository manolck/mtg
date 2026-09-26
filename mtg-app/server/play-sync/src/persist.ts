const PB_URL = (process.env.PB_URL || process.env.POCKETBASE_URL || '').replace(/\/$/, '');

export function getPbUrl(): string {
  if (!PB_URL) {
    throw new Error('PB_URL (or POCKETBASE_URL) is required for play-sync');
  }
  return PB_URL;
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: token,
    'Content-Type': 'application/json',
  };
}

export interface AuthUser {
  id: string;
  token: string;
}

/** Validate a PocketBase user JWT via auth-refresh. */
export async function verifyUserToken(token: string): Promise<AuthUser> {
  const res = await fetch(`${getPbUrl()}/api/collections/users/auth-refresh`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  if (!res.ok) {
    throw new Error(`auth_failed:${res.status}`);
  }
  const body = (await res.json()) as { token?: string; record?: { id?: string } };
  const id = body.record?.id;
  if (!id || typeof id !== 'string') {
    throw new Error('auth_failed:no_user');
  }
  return { id, token: body.token || token };
}

function relationIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'id' in item) return String((item as { id: string }).id);
        return '';
      })
      .filter(Boolean);
  }
  if (typeof value === 'string' && value) return [value];
  if (value && typeof value === 'object' && 'id' in value) return [String((value as { id: string }).id)];
  return [];
}

export interface MatchInfo {
  id: string;
  playerIds: string[];
  actionSeq: number;
}

export async function fetchMatch(matchId: string, token: string): Promise<MatchInfo> {
  const res = await fetch(`${getPbUrl()}/api/collections/play_matches/records/${encodeURIComponent(matchId)}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    throw new Error(`match_not_found:${res.status}`);
  }
  const record = (await res.json()) as {
    id: string;
    playerIds?: unknown;
    state?: { actionSeq?: number };
  };
  const actionSeq =
    typeof record.state?.actionSeq === 'number' && Number.isFinite(record.state.actionSeq)
      ? Math.max(0, Math.floor(record.state.actionSeq))
      : 0;
  return {
    id: record.id,
    playerIds: relationIds(record.playerIds),
    actionSeq,
  };
}

export async function countMatchActions(matchId: string, token: string): Promise<number> {
  const filter = encodeURIComponent(`matchId="${matchId.replace(/"/g, '\\"')}"`);
  const res = await fetch(
    `${getPbUrl()}/api/collections/play_match_actions/records?page=1&perPage=1&filter=${filter}`,
    { headers: authHeaders(token) },
  );
  if (!res.ok) {
    throw new Error(`actions_list_failed:${res.status}`);
  }
  const body = (await res.json()) as { totalItems?: number };
  return typeof body.totalItems === 'number' ? body.totalItems : 0;
}

export async function persistMatchAction(input: {
  matchId: string;
  actionId: string;
  userId: string;
  action: unknown;
  token: string;
}): Promise<void> {
  const res = await fetch(`${getPbUrl()}/api/collections/play_match_actions/records`, {
    method: 'POST',
    headers: authHeaders(input.token),
    body: JSON.stringify({
      matchId: input.matchId,
      actionId: input.actionId,
      userId: input.userId,
      action: input.action,
    }),
  });
  if (res.ok) return;
  // Duplicate actionId (unique index) — treat as success for idempotence.
  if (res.status === 400) {
    const text = await res.text().catch(() => '');
    if (/unique|actionId|duplicate/i.test(text) || text.includes('validation')) return;
    // PocketBase often returns 400 for unique constraint; accept all 400 on create.
    return;
  }
  const text = await res.text().catch(() => '');
  throw new Error(`persist_failed:${res.status}:${text.slice(0, 200)}`);
}
