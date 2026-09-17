import { useEffect, useMemo, useState } from 'react';
import { fetchDfcBacks, type DfcBack } from '../utils/dfcFaces';

export function useDfcFaces(ids: string[]): Map<string, DfcBack> {
  const key = useMemo(() => [...new Set(ids.filter(Boolean))].sort().join('|'), [ids]);
  const [faces, setFaces] = useState<Map<string, DfcBack>>(() => new Map());

  useEffect(() => {
    if (!key) {
      setFaces(new Map());
      return;
    }
    let cancelled = false;
    void fetchDfcBacks(key.split('|')).then((result) => {
      if (cancelled) return;
      setFaces(new Map(Object.entries(result)));
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return faces;
}
