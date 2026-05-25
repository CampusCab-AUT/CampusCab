import { useCallback, useEffect, useRef, useState } from 'react';
import { auth } from '../../firebase';

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDateTime(val) {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d)) return '—';
  return d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

// ─── Sub-components ──────────────────────────────────────────────────────────

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
      <span style={{ fontSize: 10 }}>{isSuspend ? '🚫' : '✅'}</span>
      {isSuspend ? 'Suspend' : 'Unsuspend'}
    </span>
  );
}

function SkeletonRow() {
  const pulse = {
    animation: 'skeletonPulse 1.6s ease-in-out infinite',
    background: 'linear-gradient(90deg, #f0f2f5 25%, #e8eaed 50%, #f0f2f5 75%)',
    backgroundSize: '400% 100%',
    borderRadius: 6,
  };
  return (
    <tr>
      <td style={{ padding: '14px 16px' }}>
        <div style={{ width: 120, height: 14, ...pulse }} />
        <div style={{ width: 90, height: 10, ...pulse, marginTop: 5 }} />
      </td>
      <td style={{ padding: '14px 16px' }}>
        <div style={{ width: 120, height: 14, ...pulse }} />
        <div style={{ width: 90, height: 10, ...pulse, marginTop: 5 }} />
      </td>
      <td style={{ padding: '14px 16px' }}>
        <div style={{ width: 80, height: 22, borderRadius: 20, ...pulse }} />
      </td>
      <td style={{ padding: '14px 16px' }}>
        <div style={{ width: 160, height: 14, ...pulse }} />
      </td>
      <td style={{ padding: '14px 16px' }}>
        <div style={{ width: 70, height: 14, ...pulse }} />
      </td>
      <td style={{ padding: '14px 16px' }}>
        <div style={{ width: 130, height: 14, ...pulse }} />
      </td>
    </tr>
  );
}

function SortIcon({ dir }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 1, marginLeft: 4, verticalAlign: 'middle' }}>
      <svg width="8" height="5" viewBox="0 0 8 5" fill={dir === 'asc' ? '#6c63ff' : '#94a3b8'}>
        <path d="M4 0L8 5H0L4 0Z" />
      </svg>
      <svg width="8" height="5" viewBox="0 0 8 5" fill={dir === 'desc' ? '#6c63ff' : '#94a3b8'} style={{ transform: 'rotate(180deg)' }}>
        <path d="M4 0L8 5H0L4 0Z" />
      </svg>
    </span>
  );
}

const PAGE_SIZE = 20;

// ─── Main component ──────────────────────────────────────────────────────────

export default function AuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterAction, setFilterAction] = useState('All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Sort (timestamp only)
  const [sortDir, setSortDir] = useState('desc');

  // Server-driven pagination metadata
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const searchTimer = useRef(null);

  // Debounce search input (280 ms — same as AllUsersPage)
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 280);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Not authenticated');

      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        sortDir,
      });
      if (filterAction !== 'All') params.set('action', filterAction);
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const res = await fetch(`/api/admin/audit-logs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setLogs(data.logs);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      console.error('[AuditLog] fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, sortDir, filterAction, debouncedSearch, startDate, endDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const toggleSort = () => {
    setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    setPage(1);
  };

  const hasFilters = search || filterAction !== 'All' || startDate || endDate;

  const clearFilters = () => {
    setSearch('');
    setFilterAction('All');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const inputStyle = {
    padding: '9px 12px', borderRadius: '10px', fontSize: 13,
    border: '1.5px solid #e2e8f0', background: 'white', color: '#374151',
    cursor: 'pointer', outline: 'none', fontFamily: 'inherit',
    transition: 'border-color 0.15s',
  };

  const th = {
    padding: '12px 16px', fontWeight: 700, fontSize: 12,
    color: '#64748b', borderBottom: '2px solid #e8eaed',
    background: '#f8fafc', whiteSpace: 'nowrap',
    letterSpacing: '0.05em', textTransform: 'uppercase',
    userSelect: 'none',
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
        .date-input:focus { border-color: #6c63ff; }
      `}</style>

      {/* Breadcrumb */}
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
            Complete history of admin moderation actions — suspensions and reinstatements
          </p>
        </div>
        {!loading && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: '10px',
            background: 'white', border: '1px solid #e2e8f0',
            fontSize: 13, color: '#64748b', fontWeight: 600,
            boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
          }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            {total} {total === 1 ? 'entry' : 'entries'}
          </div>
        )}
      </div>

      {/* Table card */}
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
          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
            <svg
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }}
              width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
            >
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search by admin or user name / ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '9px 12px 9px 38px', borderRadius: '10px',
                border: '1.5px solid #e2e8f0', outline: 'none',
                fontSize: 13, color: '#0f172a', background: '#f8fafc',
                fontFamily: 'inherit', transition: 'border-color 0.15s ease',
              }}
              onFocus={(e) => { e.target.style.borderColor = '#6c63ff'; e.target.style.background = 'white'; }}
              onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; }}
            />
          </div>

          {/* Action filter */}
          <select
            className="filter-select"
            value={filterAction}
            onChange={(e) => { setFilterAction(e.target.value); setPage(1); }}
            style={{ ...inputStyle, fontWeight: 600 }}
          >
            <option value="All">All Actions</option>
            <option value="SUSPEND">Suspend</option>
            <option value="UNSUSPEND">Unsuspend</option>
          </select>

          {/* Date range */}
          <input
            type="date"
            className="date-input"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
            style={inputStyle}
            title="From date"
          />
          <input
            type="date"
            className="date-input"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
            style={inputStyle}
            title="To date"
          />

          {hasFilters && (
            <button
              className="clear-btn"
              onClick={clearFilters}
              style={{ fontSize: 13, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: '4px 8px', transition: 'color 0.12s' }}
            >
              ✕ Clear
            </button>
          )}
        </div>

        {/* Table */}
        {error ? (
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>⚠️</div>
            <div style={{ fontWeight: 700, marginBottom: 4, color: '#dc2626' }}>Failed to load audit logs</div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>{error}</div>
            <button
              onClick={fetchLogs}
              style={{
                padding: '8px 18px', borderRadius: '8px',
                border: '1.5px solid #e2e8f0', background: 'white',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#374151',
              }}
            >
              Retry
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  <th style={th}>Admin</th>
                  <th style={th}>Target User</th>
                  <th style={th}>Action</th>
                  <th style={th}>Reason</th>
                  <th style={th}>Duration</th>
                  <th
                    style={{ ...th, cursor: 'pointer' }}
                    onClick={toggleSort}
                    title="Click to toggle sort direction"
                  >
                    Timestamp <SortIcon dir={sortDir} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                  : logs.length === 0
                    ? (
                      <tr>
                        <td colSpan={6}>
                          <div style={{ padding: '56px 24px', textAlign: 'center' }}>
                            <div style={{ fontSize: 48, marginBottom: 12 }}>
                              {hasFilters ? '🔍' : '📋'}
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
                              {hasFilters ? 'No logs match your filters' : 'No audit logs yet'}
                            </div>
                            <div style={{ fontSize: 13, color: '#94a3b8', maxWidth: 400, margin: '0 auto' }}>
                              {hasFilters
                                ? 'Try adjusting your search or clearing the filters.'
                                : 'Audit log entries are created automatically whenever a user is suspended or reinstated.'}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                    : logs.map((log) => (
                      <tr
                        key={log.id}
                        className="log-row"
                        style={{ background: 'white', borderBottom: '1px solid #f0f2f5' }}
                      >
                        {/* Admin */}
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>{log.adminName}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', marginTop: 2 }}>
                            {(log.adminId || '').slice(0, 16)}…
                          </div>
                        </td>

                        {/* Target User */}
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>{log.targetUserName}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', marginTop: 2 }}>
                            {(log.targetUserId || '').slice(0, 16)}…
                          </div>
                        </td>

                        {/* Action */}
                        <td style={{ padding: '12px 16px' }}>
                          <ActionBadge action={log.action} />
                        </td>

                        {/* Reason */}
                        <td style={{ padding: '12px 16px', color: '#475569', fontSize: 13 }}>
                          <div
                            style={{ maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                            title={log.reason || '—'}
                          >
                            {log.reason || '—'}
                          </div>
                        </td>

                        {/* Duration */}
                        <td style={{ padding: '12px 16px', color: '#475569', fontSize: 13, whiteSpace: 'nowrap' }}>
                          {log.duration || '—'}
                        </td>

                        {/* Timestamp */}
                        <td style={{ padding: '12px 16px', color: '#64748b', fontSize: 13, whiteSpace: 'nowrap' }}>
                          {fmtDateTime(log.timestamp)}
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
              Page {page} of {totalPages} · {total} {total === 1 ? 'result' : 'results'}
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
                      color: p === page ? 'white' : '#374151', cursor: 'pointer',
                      transition: 'all 0.12s',
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
