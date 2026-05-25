const { db } = require('../config/firebaseConfig');

/**
 * GET /api/admin/audit-logs
 *
 * Query params:
 *   page        {number}  default 1
 *   limit       {number}  default 20, max 100
 *   action      {string}  SUSPEND | UNSUSPEND
 *   search      {string}  matches adminId or targetUserId (prefix)
 *   dateFrom    {string}  ISO date string  e.g. "2025-01-01"
 *   dateTo      {string}  ISO date string  e.g. "2025-12-31"
 *   sortDir     {string}  asc | desc  (on timestamp, default desc)
 */
const getAuditLogs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const { action, search, dateFrom, dateTo, sortDir: sortDirParam } = req.query;

    const sortDir = sortDirParam === 'asc' ? 'asc' : 'desc';

    let ref = db.collection('auditLogs').orderBy('timestamp', sortDir);

    // Server-side filter by action type
    if (action === 'SUSPEND' || action === 'UNSUSPEND') {
      ref = ref.where('action', '==', action);
    }

    // Date range filter
    if (dateFrom) {
      const from = new Date(dateFrom);
      if (!isNaN(from)) ref = ref.where('timestamp', '>=', from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setDate(to.getDate() + 1); // inclusive end of day
      if (!isNaN(to)) ref = ref.where('timestamp', '<', to);
    }

    const snap = await ref.get();
    let docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Sanitize + apply search filter (client-side on backend result set)
    if (search) {
      const q = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').toLowerCase();
      docs = docs.filter((log) =>
        (log.adminId || '').toLowerCase().includes(q) ||
        (log.targetUserId || '').toLowerCase().includes(q),
      );
    }

    const total = docs.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const offset = (page - 1) * limit;
    const paginated = docs.slice(offset, offset + limit);

    // Serialize Firestore Timestamps to ISO strings
    const entries = paginated.map((log) => {
      const ts = log.timestamp;
      return {
        ...log,
        timestamp: ts?.toDate ? ts.toDate().toISOString() : ts,
      };
    });

    res.json({
      data: entries,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (err) {
    console.error('getAuditLogs error:', err);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
};

module.exports = { getAuditLogs };
