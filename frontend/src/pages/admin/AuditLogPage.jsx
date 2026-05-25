import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../../firebase';
import { FIRESTORE_COLLECTIONS } from '../../firestoreModel';

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseDate(val) {
  if (!val) return null;
  if (val?.toDate) return val.toDate();
  if (typeof val === 'string' || typeof val === 'number') return new Date(val);
  return null;
}

function fmtDateTime(val) {
  const d = parseDate(val);
  if (!d) return '—';
  return d.toLocaleString([], {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtDateOnly(d) {
  if (!d) return '';
  return d.toISOString().slice(0, 10);
}

function truncateId(id) {
  if (!id) return '—';
  return id.length > 14 ? id.slice(0, 14) + '…' : id;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SkeletonRow() {
  const pulse = {
    animation: 'auditSkeletonPulse 1.6s ease-in-out infinite',
    background: 'linear-gradient(90deg, #f0f2f5 25%, #e8eaed 50%, #f0f2f5 75%)',
    backgroundSize: '400% 100%',
    borderRadius: 6,
  };
  return (
    <tr>
      {[130, 130, 80, 160, 100, 110].map((w, i) => (
        <td key={i} style={{ padding: '14px 16px' }}>
          <div style={{ width: w, height: 14, ...pulse }} />
        </td>
      ))}
    </tr>
  );
}

function ActionBadge({ action }) {
  const isSuspend = action === 'SUSPEND';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 800,
      letterSpacing: '0.06em', textTransform: 'uppercase',
      background: isSuspend ? '#fee2e2' : '#dcfce7',
      color: isSuspend ? '#991b1b' : '#15803d',
      border: `1px solid ${isSuspend ? '#fecaca' : '#bbf7d0'}`,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: isSuspend ? '#dc2626' : '#10b981',
        display: 'inline-block',
      }} />
      {action || '—'}
    </span>
  );
}

function SortIcon({ active, dir }) {
  return (
    <span style={{
      display: 'inline-flex', flexDirection: 'column', gap: 1,
      marginLeft: 4, opacity: active ? 1 : 0.35, verticalAlign: 'middle',
    }}>
      <svg width="8" height="5" viewBox="0 0 8 5" fill={active && dir === 'asc' ? '#6c63ff' : '#94a3b8'}>
        <path d="M4 0L8 5H0L4 0Z" />
      </svg>
      <svg width="8" height="5" viewBox="0 0 8 5" fill={active && dir === 'desc' ? '#6c63ff' : '#94a3b8'} style={{ transform: 'rotate(180deg)' }}>
        <path d="M4 0L8 5H0L4 0Z" />
      </svg>
    </span>
  );
}

const PAGE_SIZE = 20;

// ─── Main component ──────────────────────────────────────────────────────────

export default function AuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [userMap, setUserMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterAction, setFilterAction] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Sort
  const [sortField, setSortField] = useState('timestamp');
  const [sortDir, setSortDir] = useState('desc');

  // Pagination
  const [page, setPage] = useState(1);

  const searchTimer = useRef(null);

  // Debounce search
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 280);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  // Load audit logs + user map in parallel
  useEffect(() => {
    const load = async () => {
      try {
        const [logsSnap, usersSnap] = await Promise.all([
          getDocs(query(
            collection(db, FIRESTORE_COLLECTIONS.auditLogs),
            orderBy('timestamp', 'desc'),
          )),
          getDocs(collection(db, FIRESTORE_COLLECTIONS.users)),
        ]);

        const map = {};
        usersSnap.docs.forEach((d) => {
          const data = d.data();
          map[d.id] = data.displayName || data.name || data.email || d.id;
        });
        setUserMap(map);

        const entries = logsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setLogs(entries);
      } catch (err) {
        console.error('[AuditLog] load error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Filter + sort
  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase().trim();

    let list = logs.filter((log) => {
      if (filterAction !== 'All' && log.action !== filterAction) return false;

      if (dateFrom) {
        const d = parseDate(log.timestamp);
        if (!d || d < new Date(dateFrom)) return false;
      }
      if (dateTo) {
        const d = parseDate(log.timestamp);
        // include the full dateTo day
        const end = new Date(dateTo);
        end.setDate(end.getDate() + 1);
        if (!d || d >= end) return false;
      }

      if (q) {
        const adminName = (userMap[log.adminId] || '').toLowerCase();
        const adminId = (log.adminId || '').toLowerCase();
        const targetName = (userMap[log.targetUserId] || '').toLowerCase();
        const targetId = (log.targetUserId || '').toLowerCase();
        if (
          !adminName.includes(q) &&
          !adminId.includes(q) &&
          !targetName.includes(q) &&
          !targetId.includes(q)
        ) return false;
      }

      return true;
    });

    list = [...list].sort((a, b) => {
      if (sortField === 'timestamp') {
        const ta = parseDate(a.timestamp)?.getTime() ?? 0;
        const tb = parseDate(b.timestamp)?.getTime() ?? 0;
        return sortDir === 'asc' ? ta - tb : tb - ta;
      }
      if (sortField === 'action') {
        return sortDir === 'asc'
          ? (a.action || '').localeCompare(b.action || '')
          : (b.action || '').localeCompare(a.action || '');
      }
      return 0;
    });

    return list;
  }, [logs, userMap, debouncedSearch, filterAction, dateFrom, dateTo, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'timestamp' ? 'desc' : 'asc');
    }
    setPage(1);
  };

  const hasFilters = search || filterAction !== 'All' || dateFrom || dateTo;

  const clearFilters = () => {
    setSearch('');
    setFilterAction('All');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const th = {
    padding: '12px 16px', fontWeight: 700, fontSize: 12,
    color: '#64748b', borderBottom: '2px solid #e8eaed',
    background: '#f8fafc', whiteSpace: 'nowrap',
    letterSpacing: '0.05em', textTransform: 'uppercase',
    userSelect: 'none',
  };
  const thClickable = { ...th, cursor: 'pointer' };

  return (
    <div style={{ padding: '28px 28px 48px', minHeight: '100vh', background: '#f0f2f5' }}>
      <style>{`
        @keyframes auditSkeletonPulse {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes auditFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .audit-row:hover { background: #f5f3ff !important; }
        .audit-row { transition: background 0.12s ease; }
        .audit-filter-select:hover { border-color: #6c63ff; }
        .audit-clear-btn:hover { color: #6c63ff !important; }
      `}</style>

      {/* Breadcrumb + header */}
      <div style={{ marginBottom: '6px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#94a3b8' }}>
        <span>Admin</span>
        <span>›</span>
        <span style={{ color: '#6c63ff', fontWeight: 600 }}>Audit Log</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
            Audit Log
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: '#64748b' }}>
            Full history of all admin moderation actions — suspensions and reinstatements
          </p>
        </div>
        {!loading && !error && (
          <div style={{
            padding: '8px 16px', borderRadius: 10, background: 'white',
            border: '1px solid #e8eaed', fontSize: 13, color: '#64748b', fontWeight: 600,
          }}>
            {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
          </div>
        )}
      </div>

      {/* Table card */}
      <div style={{
        background: 'white', borderRadius: '16px',
        border: '1px solid #e8eaed',
        boxShadow: '0 4px 16px rgba(15,23,42,0.06)',
        animation: 'auditFadeIn 0.35s ease-out',
        overflow: 'hidden',
      }}>

        {/* Filter toolbar */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #f0f2f5',
          display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
        }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
            <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}
              width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search by admin or user name/ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '9px 12px 9px 38px', borderRadius: '10px',
                border: '1.5px solid #e2e8f0', outline: 'none',
                fontSize: 13, color: '#0f172a', background: '#f8fafc',
                fontFamily: 'inherit', transition: 'border-color 0.15s ease',
              }}
              onFocus={e => { e.target.style.borderColor = '#6c63ff'; e.target.style.background = 'white'; }}
              onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; }}
            />
          </div>

          {/* Action type filter */}
          <select
            className="audit-filter-select"
            value={filterAction}
            onChange={(e) => { setFilterAction(e.target.value); setPage(1); }}
            style={{
              padding: '9px 12px', borderRadius: '10px', fontSize: 13, fontWeight: 600,
              border: '1.5px solid #e2e8f0', background: 'white', color: '#374151',
              cursor: 'pointer', outline: 'none', transition: 'border-color 0.15s',
            }}
          >
            <option value="All">All Actions</option>
            <option value="SUSPEND">Suspend</option>
            <option value="UNSUSPEND">Unsuspend</option>
          </select>

          {/* Date from */}
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            title="From date"
            style={{
              padding: '9px 12px', borderRadius: '10px', fontSize: 13,
              border: '1.5px solid #e2e8f0', background: 'white', color: '#374151',
              cursor: 'pointer', outline: 'none', transition: 'border-color 0.15s',
              fontFamily: 'inherit',
            }}
            onFocus={e => { e.target.style.borderColor = '#6c63ff'; }}
            onBlur={e => { e.target.style.borderColor = '#e2e8f0'; }}
          />

          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>→</span>

          {/* Date to */}
          <input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            title="To date"
            style={{
              padding: '9px 12px', borderRadius: '10px', fontSize: 13,
              border: '1.5px solid #e2e8f0', background: 'white', color: '#374151',
              cursor: 'pointer', outline: 'none', transition: 'border-color 0.15s',
              fontFamily: 'inherit',
            }}
            onFocus={e => { e.target.style.borderColor = '#6c63ff'; }}
            onBlur={e => { e.target.style.borderColor = '#e2e8f0'; }}
          />

          {hasFilters && (
            <button
              className="audit-clear-btn"
              onClick={clearFilters}
              style={{ fontSize: 13, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: '4px 8px', transition: 'color 0.12s' }}
            >
              ✕ Clear
            </button>
          )}
        </div>

        {/* Table */}
        {error ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: '#dc2626' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>⚠️</div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Failed to load audit logs</div>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>{error}</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  <th style={th}>Admin</th>
                  <th style={th}>Target User</th>
                  <th style={thClickable} onClick={() => handleSort('action')}>
                    Action <SortIcon active={sortField === 'action'} dir={sortDir} />
                  </th>
                  <th style={th}>Reason</th>
                  <th style={th}>Duration</th>
                  <th style={thClickable} onClick={() => handleSort('timestamp')}>
                    Timestamp <SortIcon active={sortField === 'timestamp'} dir={sortDir} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                  : paginated.length === 0
                    ? (
                      <tr>
                        <td colSpan={6}>
                          <div style={{ padding: '56px 24px', textAlign: 'center' }}>
                            <div style={{ fontSize: 48, marginBottom: 12 }}>
                              {hasFilters ? '🔍' : '📋'}
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
                              {hasFilters ? 'No entries match your filters' : 'No audit log entries yet'}
                            </div>
                            <div style={{ fontSize: 13, color: '#94a3b8', maxWidth: 380, margin: '0 auto' }}>
                              {hasFilters
                                ? 'Try adjusting your search or clearing the filters.'
                                : 'Audit log entries will appear here automatically when admins suspend or reinstate users.'}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                    : paginated.map((log) => {
                      const adminName = userMap[log.adminId] || null;
                      const targetName = userMap[log.targetUserId] || null;
                      return (
                        <tr
                          key={log.id}
                          className="audit-row"
                          style={{ background: 'white', borderBottom: '1px solid #f8fafc' }}
                        >
                          {/* Admin */}
                          <td style={{ padding: '13px 16px' }}>
                            {adminName && (
                              <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>{adminName}</div>
                            )}
                            <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', marginTop: adminName ? 2 : 0 }}>
                              {truncateId(log.adminId)}
                            </div>
                          </td>

                          {/* Target user */}
                          <td style={{ padding: '13px 16px' }}>
                            {targetName && (
                              <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>{targetName}</div>
                            )}
                            <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', marginTop: targetName ? 2 : 0 }}>
                              {truncateId(log.targetUserId)}
                            </div>
                          </td>

                          {/* Action */}
                          <td style={{ padding: '13px 16px' }}>
                            <ActionBadge action={log.action} />
                          </td>

                          {/* Reason */}
                          <td style={{ padding: '13px 16px', color: '#475569', fontSize: 13, maxWidth: 220 }}>
                            <div style={{
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              maxWidth: 200,
                            }} title={log.reason || '—'}>
                              {log.reason || <span style={{ color: '#cbd5e1' }}>—</span>}
                            </div>
                          </td>

                          {/* Duration */}
                          <td style={{ padding: '13px 16px' }}>
                            {log.duration
                              ? (
                                <span style={{
                                  display: 'inline-block', padding: '3px 9px', borderRadius: 999,
                                  background: '#f1f5f9', color: '#475569',
                                  fontSize: 12, fontWeight: 600,
                                }}>
                                  {log.duration}
                                </span>
                              )
                              : <span style={{ color: '#cbd5e1', fontSize: 13 }}>—</span>
                            }
                          </td>

                          {/* Timestamp */}
                          <td style={{ padding: '13px 16px', color: '#64748b', fontSize: 13, whiteSpace: 'nowrap' }}>
                            {fmtDateTime(log.timestamp)}
                          </td>
                        </tr>
                      );
                    })
                }
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && !error && totalPages > 1 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 20px', borderTop: '1px solid #f0f2f5',
            flexWrap: 'wrap', gap: 10,
          }}>
            <span style={{ fontSize: 13, color: '#64748b' }}>
              Page {page} of {totalPages} · {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  padding: '7px 14px', borderRadius: '8px', fontSize: 13, fontWeight: 600,
                  border: '1.5px solid #e2e8f0', background: 'white',
                  cursor: page === 1 ? 'not-allowed' : 'pointer',
                  color: page === 1 ? '#cbd5e1' : '#374151', transition: 'all 0.12s',
                }}
              >
                ← Previous
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let p;
                if (totalPages <= 5) p = i + 1;
                else if (page <= 3) p = i + 1;
                else if (page >= totalPages - 2) p = totalPages - 4 + i;
                else p = page - 2 + i;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    style={{
                      width: 34, height: 34, borderRadius: '8px', fontSize: 13, fontWeight: 700,
                      border: p === page ? 'none' : '1.5px solid #e2e8f0',
                      background: p === page ? '#6c63ff' : 'white',
                      color: p === page ? 'white' : '#374151',
                      cursor: 'pointer', transition: 'all 0.12s',
                    }}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{
                  padding: '7px 14px', borderRadius: '8px', fontSize: 13, fontWeight: 600,
                  border: '1.5px solid #e2e8f0', background: 'white',
                  cursor: page === totalPages ? 'not-allowed' : 'pointer',
                  color: page === totalPages ? '#cbd5e1' : '#374151', transition: 'all 0.12s',
                }}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
