/** True on phones/tablets: no hover, coarse pointer. */
export function isCoarsePointer(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;
}
