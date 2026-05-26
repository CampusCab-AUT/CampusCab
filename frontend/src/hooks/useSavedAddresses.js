import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db, firebaseReady } from '../firebase';
import { FIRESTORE_COLLECTIONS } from '../firestoreModel';

export default function useSavedAddresses() {
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseReady || !db || !auth) {
      setLoading(false);
      return undefined;
    }
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return undefined;
    }
    const ref = doc(db, FIRESTORE_COLLECTIONS.users, user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists() ? snap.data() : {};
        setSavedAddresses(Array.isArray(data.savedAddresses) ? data.savedAddresses : []);
        setLoading(false);
      },
      (err) => {
        console.error('useSavedAddresses error', err);
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  return { savedAddresses, loading };
}
