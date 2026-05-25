const { db } = require('../config/firebaseConfig');

// GET /api/admin/audit-logs
const getAuditLogs = async (req, res) => {
  try {
    const {
      page = '1',
      limit = '20',
      action = '',
      search = '',
      startDate = '',
      endDate = '',
      sortDir = 'desc',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const dir = sortDir === 'asc' ? 'asc' : 'desc';

    // Fetch all audit logs ordered by timestamp. We filter in-memory to avoid
    // requiring composite Firestore indexes for every filter combination.
    const snap = await db.collection('auditLogs').orderBy('timestamp', dir).get();
    let logs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Filter by action type
    if (action === 'SUSPEND' || action === 'UNSUSPEND') {
      logs = logs.filter((l) => l.action === action);
    }

    // Filter by date range
    if (startDate) {
      const start = new Date(startDate);
      if (!isNaN(start)) {
        logs = logs.filter((l) => {
          const ts = l.timestamp?.toDate ? l.timestamp.toDate() : new Date(l.timestamp);
          return ts >= start;
        });
      }
    }
    if (endDate) {
      const end = new Date(endDate);
      if (!isNaN(end)) {
        end.setHours(23, 59, 59, 999); // inclusive end-of-day
        logs = logs.filter((l) => {
          const ts = l.timestamp?.toDate ? l.timestamp.toDate() : new Date(l.timestamp);
          return ts <= end;
        });
      }
    }

    // Collect unique user IDs to batch-fetch display names
    const userIds = new Set();
    logs.forEach((l) => {
      if (l.adminId) userIds.add(l.adminId);
      if (l.targetUserId) userIds.add(l.targetUserId);
    });

    const userMap = {};
    const uidArray = [...userIds];
    if (uidArray.length > 0) {
      // Firebase Admin SDK getAll() accepts up to 500 document references
      const BATCH = 500;
      for (let i = 0; i < uidArray.length; i += BATCH) {
        const refs = uidArray.slice(i, i + BATCH).map((uid) => db.collection('users').doc(uid));
        const docs = await db.getAll(...refs);
        docs.forEach((d) => {
          if (d.exists) {
            const data = d.data();
            userMap[d.id] = data.displayName || data.name || data.email || d.id;
          }
        });
      }
    }

    // Enrich each log with display names and a normalized ISO timestamp string
    logs = logs.map((l) => ({
      ...l,
      adminName: userMap[l.adminId] || l.adminId || '—',
      targetUserName: userMap[l.targetUserId] || l.targetUserId || '—',
      timestamp: l.timestamp?.toDate
        ? l.timestamp.toDate().toISOString()
        : (l.timestamp ?? null),
    }));

    // Search by name or ID (applied after enrichment so name search works)
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      logs = logs.filter(
        (l) =>
          (l.adminId || '').toLowerCase().includes(q) ||
          (l.targetUserId || '').toLowerCase().includes(q) ||
          (l.adminName || '').toLowerCase().includes(q) ||
          (l.targetUserName || '').toLowerCase().includes(q),
      );
    }

    const total = logs.length;
    const totalPages = Math.max(1, Math.ceil(total / limitNum));
    const safePage = Math.min(pageNum, totalPages);
    const paginated = logs.slice((safePage - 1) * limitNum, safePage * limitNum);

    res.json({
      logs: paginated,
      total,
      page: safePage,
      limit: limitNum,
      totalPages,
    });
  } catch (err) {
    console.error('getAuditLogs error:', err);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
};

module.exports = { getAuditLogs };
