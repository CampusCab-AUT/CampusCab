import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../../firebase';
import { FIRESTORE_COLLECTIONS } from '../../firestoreModel';

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

function ActionBadge({ action }) {
  const isSuspend = action === 'SUSPEND';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: '999px', fontSize: 12, fontWeight: 700,
      background: isSuspend ? '#fee2e2' : '#dcfce7',
      color: isSuspend ? '#991b1b' : '#15803d',
      border: `1px solid ${isSuspend ? '#fecaca' : '#bbf7d0'}`,
    }}>
      {isSuspend ? '🚫 SUSPEND' : '✅ UNSUSPEND'}
    </span>
  );
}

function SortIcon({ active, dir }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 1, marginLeft: 4, opacity: active ? 1 : 0.35, verticalAlign: 'middle' }}>
      <svg width="8" height="5" viewBox="0 0 8 5" fill={active && dir === 'asc' ? '#6c63ff' : '#94a3b8'}>
        <path d="M4 0L8 5H0L4 0Z"/>
      </svg>
      <svg width="8" height="5" viewBox="0 0 8 5" fill={active && dir === 'desc' ? '#6c63ff' : '#94a3b8'} style={{ transform: 'rotate(180deg)' }}>
        <path d="M4 0L8 5H0L4 0Z"/>
      </svg>
    </span>
  );
}

function SkeletonRow() {
  const pulse = { animation: 'skeletonPulse 1.6s ease-in-out infinite', background: 'linear-gradient(90deg, #f0f2f5 25%, #e8eaed 50%, #f0f2f5 75%)', backgroundSize: '400% 100%', borderRadius: 6 };
  return (
    <tr>
      {[120, 140, 90, 160, 90, 110].map((w, i) => (
        <td key={i} style={{ padding: '14px 16px' }}><div style={{ width: w, height: 14, ...pulse }} /></td>
      ))}
    </tr>
  );
}

const PAGE_SIZE = 20;

export default function AuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [userMap, setUserMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [filterAction, setFilterAction] = useState('All');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortField, setSortField] = useState('timestamp');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);

  const searchTimer = useRef(null);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 280);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  useEffect(() => {
    const load = async () => {
      try {
        const [logsSnap, usersSnap] = await Promise.all([
          getDocs(query(collection(db, FIRESTORE_COLLECTIONS.auditLogs), orderBy('timestamp', 'desc'))),
          getDocs(collection(db, FIRESTORE_COLLECTIONS.users)),
        ]);

        const map = {};
        usersSnap.docs.forEach((d) => {
          const u = d.data();
          map[d.id] = u.displayName || u.name || u.email || d.id;
        });
        setUserMap(map);

        setLogs(logsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase().trim();
    let list = logs.filter((log) => {
      if (filterAction !== 'All' && log.action !== filterAction) return false;
      if (q) {
        const adminName = (userMap[log.adminId] || log.adminId || '').toLowerCase();
        const targetName = (userMap[log.targetUserId] || log.targetUserId || '').toLowerCase();
        const reason = (log.reason || '').toLowerCase();
        if (!adminName.includes(q) && !targetName.includes(q) && !reason.includes(q)) return false;
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
  }, [logs, userMap, filterAction, debouncedSearch, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSort = (field) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('desc'); }
    setPage(1);
  };

  const hasFilters = search || filterAction !== 'All';

  const th = {
    padding: '12px 16px', fontWeight: 700, fontSize: 12,
    color: '#64748b', borderBottom: '2px solid #e8eaed',
    background: '#f8fafc', whiteSpace: 'nowrap',
    letterSpacing: '0.05em', textTransform: 'uppercase',
    userSelect: 'none',
  };

  const displayName = (uid) => {
    if (!uid) return '—';
    const name = userMap[uid];
    if (name && name !== uid) return name;
    return uid.slice(0, 14) + '…';
  };

  return (
    <div style={{ padding: '28px 28px 48px', minHeight: '100vh', background: '#f0f2f5' }}>
      <style>{`
        @keyframes skeletonPulse {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .log-row:hover { background: #f5f3ff !important; }
        .log-row { transition: background 0.12s ease; }
        .filter-select:hover { border-color: #6c63ff; }
        .clear-btn:hover { color: #6c63ff !important; }
      `}</style>

      <div style={{ marginBottom: '6px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#94a3b8' }}>
        <span>Admin</span>
        <span>›</span>
        <span style={{ color: '#6c63ff', fontWeight: 600 }}>Audit Log</span>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
          Moderation Audit Log
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: '#64748b' }}>
          Complete history of all suspend and reinstate actions taken by admins
        </p>
      </div>

      <div style={{
        background: 'white', borderRadius: '16px',
        border: '1px solid #e8eaed',
        boxShadow: '0 4px 16px rgba(15,23,42,0.06)',
        animation: 'fadeIn 0.35s ease-out',
        overflow: 'hidden',
      }}>
        {/* Filter toolbar */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #f0f2f5',
          display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
        }}>
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
            <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}
              width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder="Search by admin, user, or reason…"
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

          <select
            className="filter-select"
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

          {hasFilters && (
            <button
              className="clear-btn"
              onClick={() => { setSearch(''); setFilterAction('All'); setPage(1); }}
              style={{ fontSize: 13, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: '4px 8px', transition: 'color 0.12s' }}
            >
              ✕ Clear
            </button>
          )}

          <div style={{ marginLeft: 'auto', fontSize: 13, color: '#94a3b8', fontWeight: 500, whiteSpace: 'nowrap' }}>
            {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
          </div>
        </div>

        {/* Table */}
        {error ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: '#dc2626' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>⚠️</div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Failed to load audit log</div>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>{error}</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  <th style={{ ...th, cursor: 'pointer' }} onClick={() => handleSort('timestamp')}>
                    Timestamp <SortIcon active={sortField === 'timestamp'} dir={sortDir} />
                  </th>
                  <th style={th}>Admin</th>
                  <th style={th}>Target User</th>
                  <th style={{ ...th, cursor: 'pointer' }} onClick={() => handleSort('action')}>
                    Action <SortIcon active={sortField === 'action'} dir={sortDir} />
                  </th>
                  <th style={th}>Reason</th>
                  <th style={th}>Duration</th>
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
                            <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
                              {hasFilters ? 'No entries match your filters' : 'No audit log entries yet'}
                            </div>
                            <div style={{ fontSize: 13, color: '#94a3b8' }}>
                              {hasFilters
                                ? 'Try adjusting your search or clearing the filters.'
                                : 'Suspension and reinstatement actions will appear here.'}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                    : paginated.map((log) => (
                      <tr key={log.id} className="log-row" style={{ background: 'white' }}>
                        <td style={{ padding: '13px 16px', color: '#475569', fontSize: 13, whiteSpace: 'nowrap' }}>
                          {fmtDateTime(log.timestamp)}
                        </td>
                        <td style={{ padding: '13px 16px' }}>
                          <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>
                            {displayName(log.adminId)}
                          </div>
                          <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', marginTop: 2 }}>
                            {log.adminId?.slice(0, 14)}…
                          </div>
                        </td>
                        <td style={{ padding: '13px 16px' }}>
                          <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>
                            {displayName(log.targetUserId)}
                          </div>
                          <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', marginTop: 2 }}>
                            {log.targetUserId?.slice(0, 14)}…
                          </div>
                        </td>
                        <td style={{ padding: '13px 16px' }}>
                          <ActionBadge action={log.action} />
                        </td>
                        <td style={{ padding: '13px 16px', color: '#475569', fontSize: 13, maxWidth: 240 }}>
                          <span style={{
                            display: '-webkit-box', WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical', overflow: 'hidden',
                          }}>
                            {log.reason || '—'}
                          </span>
                        </td>
                        <td style={{ padding: '13px 16px', color: '#475569', fontSize: 13, whiteSpace: 'nowrap' }}>
                          {log.duration || '—'}
                        </td>
                      </tr>
                    ))
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
              Page {page} of {totalPages} · {filtered.length} results
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  padding: '7px 14px', borderRadius: '8px', fontSize: 13, fontWeight: 600,
                  border: '1.5px solid #e2e8f0', background: 'white', cursor: page === 1 ? 'not-allowed' : 'pointer',
                  color: page === 1 ? '#cbd5e1' : '#374151',
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
                      color: p === page ? 'white' : '#374151', cursor: 'pointer',
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
                  border: '1.5px solid #e2e8f0', background: 'white', cursor: page === totalPages ? 'not-allowed' : 'pointer',
                  color: page === totalPages ? '#cbd5e1' : '#374151',
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
