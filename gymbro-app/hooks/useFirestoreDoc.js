import { doc, getDocFromServer, onSnapshot } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import { db } from '../services/firebase';

/** The returned state always belongs to the current path. */
export function useFirestoreDoc(path) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ key: null, data: null, isLoading: false, isFromCache: false, error: null });
  const retry = useCallback(async () => {
    if (!path) return;
    setAttempt((value) => value + 1);
    await getDocFromServer(doc(db, path));
  }, [path]);

  useEffect(() => {
    if (!path) return undefined;
    let active = true;
    setState((previous) => previous.key === path && !previous.error && !previous.isLoading
      ? previous : { key: path, data: null, isLoading: true, isFromCache: false, error: null });
    const unsubscribe = onSnapshot(doc(db, path), { includeMetadataChanges: true }, (snap) => {
      if (active) setState({ key: path, data: snap.exists() ? { id: snap.id, ...snap.data() } : null,
        isLoading: false, isFromCache: snap.metadata.fromCache,
        error: null });
    }, (error) => {
      if (active) setState({ key: path, data: null, isLoading: false, isFromCache: false, error });
    });
    return () => { active = false; unsubscribe(); };
  }, [path, attempt]);

  if (!path) return { data: null, isLoading: false, isFromCache: false, error: null, retry };
  if (state.key !== path) return { data: null, isLoading: true, isFromCache: false, error: null, retry };
  if (state.isFromCache && !state.data && !state.error) {
    return { ...state, isLoading: false, error: new Error('No cached data available.'), retry };
  }
  return { ...state, retry };
}
