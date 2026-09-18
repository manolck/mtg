import { useEffect, useMemo, useState } from 'react';
import { fetchLocalizedTableFaces, type LocalizedTableFace } from '../utils/localizedTableFaces';

export function useLocalizedTableFaces(ids: string[], enabled: boolean): Map<string, LocalizedTableFace> {
  const key = useMemo(() => [...new Set(ids.filter(Boolean))].sort().join('|'), [ids]);
  const [faces, setFaces] = useState<Map<string, LocalizedTableFace>>(() => new Map());

  useEffect(() => {
    if (!enabled || !key) {
      setFaces(new Map());
      return;
    }
    let cancelled = false;
    void fetchLocalizedTableFaces(key.split('|')).then((result) => {
      if (cancelled) return;
      setFaces(new Map(Object.entries(result)));
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, key]);

  return faces;
}
