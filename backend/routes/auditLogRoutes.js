const express = require('express');
const router = express.Router();
const verifyAdmin = require('../middleware/verifyAdmin');
const { getAuditLogs } = require('../controllers/auditLogController');

// GET /api/admin/audit-logs
router.get('/', verifyAdmin, getAuditLogs);

module.exports = router;
