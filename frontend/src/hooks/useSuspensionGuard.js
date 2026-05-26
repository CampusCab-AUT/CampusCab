import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db, firebaseReady } from '../firebase';
import { FIRESTORE_COLLECTIONS } from '../firestoreModel';

/**
 * Listens in real-time to the current user's Firestore document.
 * If accountStatus changes to 'Suspended' while the user is logged in,
 * it immediately signs them out and returns the suspension details so the
 * UI can show the "Your account has been suspended" message (AccTest 3).
 *
 * @param {string|null} uid - Firebase Auth UID of the currently logged-in user.
 * @returns {{ suspensionInfo: {reason: string, duration: string}|null, dismiss: Function }}
 */
export default function useSuspensionGuard(uid) {
  const [suspensionInfo, setSuspensionInfo] = useState(null);

  useEffect(() => {
    if (!uid || !firebaseReady) return;

    const unsubscribe = onSnapshot(
      doc(db, FIRESTORE_COLLECTIONS.users, uid),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        if (data.accountStatus === 'Suspended') {
          setSuspensionInfo({
            reason: data.suspensionReason || 'Policy violation',
            duration: data.suspensionDuration || 'Permanent',
          });
          signOut(auth).catch(() => {});
        }
      }
    );

    return unsubscribe;
  }, [uid]);

  const dismiss = () => setSuspensionInfo(null);

  return { suspensionInfo, dismiss };
}
