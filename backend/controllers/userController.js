const { db, auth } = require('../config/firebaseConfig');

// GET /api/admin/users/:userId
const getUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const [userDoc, authUser] = await Promise.allSettled([
      db.collection('users').doc(userId).get(),
      auth.getUser(userId),
    ]);

    if (userDoc.status === 'rejected' || !userDoc.value.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const firestoreData = { id: userDoc.value.id, ...userDoc.value.data() };

    // Merge Firebase Auth fields when Firestore document is missing them
    // (e.g. manually-created admin accounts)
    if (authUser.status === 'fulfilled') {
      const a = authUser.value;
      if (!firestoreData.email && a.email) firestoreData.email = a.email;
      if (!firestoreData.displayName && !firestoreData.name && a.displayName) {
        firestoreData.displayName = a.displayName;
      }
      if (!firestoreData.createdAt && a.metadata?.creationTime) {
        firestoreData.createdAt = a.metadata.creationTime;
      }
    }

    res.json(firestoreData);
  } catch (err) {
    console.error('getUserProfile error:', err);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
};

// PATCH /api/admin/users/:userId/suspend
const suspendUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason, duration } = req.body;

    if (!reason || !duration) {
      return res.status(400).json({ error: 'reason and duration are required' });
    }

    await db.collection('users').doc(userId).update({
      accountStatus: 'Suspended',
      suspensionReason: reason,
      suspensionDuration: duration,
      suspendedAt: new Date().toISOString(),
      suspendedBy: req.adminId,
    });

    // Revoke all existing sessions for the suspended user
    await auth.revokeRefreshTokens(userId);

    // Write audit log
    await db.collection('auditLogs').add({
      adminId: req.adminId,
      targetUserId: userId,
      action: 'SUSPEND',
      reason,
      duration,
      timestamp: new Date(),
    });

    res.json({ success: true });
  } catch (err) {
    console.error('suspendUser error:', err);
    res.status(500).json({ error: 'Failed to suspend user' });
  }
};

// PATCH /api/admin/users/:userId/unsuspend
const unsuspendUser = async (req, res) => {
  try {
    const { userId } = req.params;

    await db.collection('users').doc(userId).update({
      accountStatus: 'Active',
      suspensionReason: null,
      suspensionDuration: null,
      suspendedAt: null,
      suspendedBy: null,
    });

    // Write audit log
    await db.collection('auditLogs').add({
      adminId: req.adminId,
      targetUserId: userId,
      action: 'UNSUSPEND',
      reason: 'Manual reinstatement by admin',
      duration: null,
      timestamp: new Date(),
    });

    res.json({ success: true });
  } catch (err) {
    console.error('unsuspendUser error:', err);
    res.status(500).json({ error: 'Failed to unsuspend user' });
  }
};

module.exports = { getUserProfile, suspendUser, unsuspendUser };
