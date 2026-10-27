import { collection, getDocsFromServer, onSnapshot, query } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '../services/firebase';

/** key must identify all query constraints, so old query data is never reused. */
export function useFirestoreCollection(path, constraints = [], key = '') {
  const identity = path ? JSON.stringify([path, key]) : null;
  const constraintsRef = useRef(constraints);
  useEffect(() => { constraintsRef.current = constraints; });
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ key: null, data: [], isLoading: false, isFromCache: false, error: null });
  const retry = useCallback(async () => {
    if (!path) return;
    setAttempt((value) => value + 1);
    await getDocsFromServer(query(collection(db, path), ...constraintsRef.current));
  }, [path, key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!path) return undefined;
    let active = true;
    setState((previous) => previous.key === identity && !previous.error && !previous.isLoading
      ? previous : { key: identity, data: [], isLoading: true, isFromCache: false, error: null });
    const unsubscribe = onSnapshot(query(collection(db, path), ...constraintsRef.current),
      { includeMetadataChanges: true }, (snap) => {
        if (active) setState({ key: identity, data: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
          isLoading: false, isFromCache: snap.metadata.fromCache,
          error: null });
      }, (error) => {
        if (active) setState({ key: identity, data: [], isLoading: false, isFromCache: false, error });
      });
    return () => { active = false; unsubscribe(); };
  }, [path, identity, attempt]);

  if (!path) return { data: [], isLoading: false, isFromCache: false, error: null, retry };
  if (state.key !== identity) return { data: [], isLoading: true, isFromCache: false, error: null, retry };
  if (state.isFromCache && state.data.length === 0 && !state.error) {
    return { ...state, isLoading: false, error: new Error('No cached data available.'), retry };
  }
  return { ...state, retry };
}
