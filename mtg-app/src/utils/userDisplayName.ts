/** Visible name for a user. Never returns an email address. */
export function userDisplayName(
  ...sources: Array<
    | { pseudonym?: string | null; displayName?: string | null }
    | string
    | null
    | undefined
  >
): string {
  for (const source of sources) {
    if (source == null || source === '') continue;
    if (typeof source === 'string') {
      const trimmed = source.trim();
      if (trimmed && !trimmed.includes('@')) return trimmed;
      continue;
    }
    const name = (source.pseudonym || source.displayName || '').trim();
    if (name && !name.includes('@')) return name;
  }
  return 'Utilisateur';
}
