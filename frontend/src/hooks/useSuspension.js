import { useState } from 'react';
import { addDoc, collection, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { FIRESTORE_COLLECTIONS } from '../firestoreModel';

/**
 * Encapsulates all suspend/unsuspend business logic and modal state.
 * Reusable across UserModerationPage and UserProfilePage.
 *
 * @param {string} userId - Firestore UID of the target user
 * @param {string} userName - Display name shown in confirmation dialogs
 * @param {{ onSuccess?: (result: { action: string, duration?: string, reason?: string }) => void }} options
 */
export function useSuspension(userId, userName, { onSuccess } = {}) {
  const [showModal, setShowModal] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [unsuspending, setUnsuspending] = useState(false);

  const handleSuspend = async (duration, reason) => {
    setSuspending(true);
    try {
      const adminId = auth.currentUser?.uid;

      await setDoc(
        doc(db, FIRESTORE_COLLECTIONS.users, userId),
        {
          accountStatus: 'Suspended',
          suspensionReason: reason,
          suspensionDuration: duration,
          suspendedAt: new Date().toISOString(),
          suspendedBy: adminId,
        },
        { merge: true }
      );

      await addDoc(collection(db, FIRESTORE_COLLECTIONS.auditLogs), {
        adminId,
        targetUserId: userId,
        action: 'SUSPEND',
        reason,
        duration,
        timestamp: serverTimestamp(),
      });

      setShowModal(false);
      onSuccess?.({ action: 'SUSPEND', duration, reason });
    } catch (err) {
      alert('Failed to suspend user: ' + err.message);
    } finally {
      setSuspending(false);
    }
  };

  const handleUnsuspend = async () => {
    if (!window.confirm(`Reinstate ${userName}'s account? This will restore full access.`)) return;
    setUnsuspending(true);
    try {
      const adminId = auth.currentUser?.uid;

      await updateDoc(doc(db, FIRESTORE_COLLECTIONS.users, userId), {
        accountStatus: 'Active',
        suspensionReason: null,
        suspensionDuration: null,
        suspendedAt: null,
        suspendedBy: null,
      });

      await addDoc(collection(db, FIRESTORE_COLLECTIONS.auditLogs), {
        adminId,
        targetUserId: userId,
        action: 'UNSUSPEND',
        reason: 'Manual reinstatement by admin',
        duration: null,
        timestamp: serverTimestamp(),
      });

      onSuccess?.({ action: 'UNSUSPEND' });
    } catch (err) {
      alert('Failed to unsuspend user: ' + err.message);
    } finally {
      setUnsuspending(false);
    }
  };

  return {
    showModal,
    setShowModal,
    suspending,
    unsuspending,
    handleSuspend,
    handleUnsuspend,
  };
}
