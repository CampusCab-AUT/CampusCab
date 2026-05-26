import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { FIRESTORE_COLLECTIONS } from '../../firestoreModel';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getInitials(name, email) {
  const src = name || email || '?';
  return src.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || '?';
}

function avatarColor(role) {
  if (role === 'driver') return { bg: 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)', shadow: 'rgba(15,118,110,0.35)' };
  if (role === 'passenger') return { bg: 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)', shadow: 'rgba(29,78,216,0.35)' };
  return { bg: 'linear-gradient(135deg, #64748b 0%, #94a3b8 100%)', shadow: 'rgba(100,116,139,0.35)' };
}

function parseDate(val) {
  if (!val) return null;
  if (val?.toDate) return val.toDate();
  if (typeof val === 'string' || typeof val === 'number') return new Date(val);
  return null;
}

function fmtDate(val) {
  const d = parseDate(val);
  if (!d) return '—';
  return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

function isWithinDays(val, days) {
  const d = parseDate(val);
  if (!d) return false;
  return Date.now() - d.getTime() < days * 24 * 60 * 60 * 1000;
}

function exportCsv(users) {
  const headers = ['UID', 'Display Name', 'Email', 'Role', 'Status', 'Joined'];
  const rows = users.map((u) => [
    u.id,
    u.displayName || u.name || '',
    u.email || '',
    u.role || '',
    u.accountStatus || 'Active',
    fmtDate(u.createdAt),
  ]);
  const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `campuscab-users-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ icon, label, value, gradient, delta }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'white',
        borderRadius: '16px',
        padding: '20px',
        border: '1px solid #e8eaed',
        boxShadow: hovered
          ? '0 12px 32px rgba(15,23,42,0.12)'
          : '0 2px 8px rgba(15,23,42,0.05)',
        transition: 'box-shadow 0.2s ease, transform 0.2s ease',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        minWidth: 0,
      }}
    >
      <div style={{
        width: 52, height: 52, borderRadius: '14px', flexShrink: 0,
        background: gradient,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 6px 16px ${gradient.includes('0f766e') ? 'rgba(15,118,110,0.3)' : gradient.includes('1d4ed8') ? 'rgba(29,78,216,0.3)' : gradient.includes('7c3aed') ? 'rgba(124,58,237,0.3)' : gradient.includes('dc2626') ? 'rgba(220,38,38,0.3)' : 'rgba(15,118,110,0.3)'}`,
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4, fontWeight: 500 }}>{label}</div>
        {delta != null && (
          <div style={{ fontSize: 11, color: '#10b981', marginTop: 2, fontWeight: 700 }}>
            +{delta} this week
          </div>
        )}
      </div>
    </div>
  );
}

const ICON_USERS = (
  <svg width="24" height="24" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);
const ICON_DRIVER = (
  <svg width="24" height="24" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
    <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/>
    <line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
  </svg>
);
const ICON_PASSENGER = (
  <svg width="24" height="24" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);
const ICON_SUSPENDED = (
  <svg width="24" height="24" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
  </svg>
);
const ICON_NEW = (
  <svg width="24" height="24" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
  </svg>
);

function SkeletonRow() {
  const pulse = { animation: 'skeletonPulse 1.6s ease-in-out infinite', background: 'linear-gradient(90deg, #f0f2f5 25%, #e8eaed 50%, #f0f2f5 75%)', backgroundSize: '400% 100%', borderRadius: 6 };
  return (
    <tr>
      <td style={{ padding: '14px 16px' }}><div style={{ width: 38, height: 38, borderRadius: '50%', ...pulse }} /></td>
      <td style={{ padding: '14px 16px' }}><div style={{ width: 130, height: 14, ...pulse }} /></td>
      <td style={{ padding: '14px 16px' }}><div style={{ width: 160, height: 14, ...pulse }} /></td>
      <td style={{ padding: '14px 16px' }}><div style={{ width: 90, height: 14, ...pulse }} /></td>
      <td style={{ padding: '14px 16px' }}><div style={{ width: 70, height: 22, borderRadius: 20, ...pulse }} /></td>
      <td style={{ padding: '14px 16px' }}><div style={{ width: 70, height: 22, borderRadius: 20, ...pulse }} /></td>
      <td style={{ padding: '14px 16px' }}><div style={{ width: 100, height: 14, ...pulse }} /></td>
      <td style={{ padding: '14px 16px' }}><div style={{ width: 70, height: 32, borderRadius: 8, ...pulse }} /></td>
    </tr>
  );
}

function RoleBadge({ role }) {
  const isDriver = role === 'driver';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: '999px', fontSize: 12, fontWeight: 700,
      background: isDriver ? '#dcfce7' : '#dbeafe',
      color: isDriver ? '#15803d' : '#1d4ed8',
      border: `1px solid ${isDriver ? '#bbf7d0' : '#bfdbfe'}`,
    }}>
      <span style={{ fontSize: 10 }}>{isDriver ? '🚗' : '🎒'}</span>
      {isDriver ? 'Driver' : role === 'passenger' ? 'Passenger' : role || 'User'}
    </span>
  );
}

function StatusBadge({ status }) {
  const isSuspended = status === 'Suspended';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '4px 10px', borderRadius: '999px', fontSize: 12, fontWeight: 700,
      background: isSuspended ? '#fee2e2' : '#dcfce7',
      color: isSuspended ? '#991b1b' : '#15803d',
      border: `1px solid ${isSuspended ? '#fecaca' : '#bbf7d0'}`,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: isSuspended ? '#dc2626' : '#10b981',
        display: 'inline-block',
        boxShadow: `0 0 0 2px ${isSuspended ? 'rgba(220,38,38,0.25)' : 'rgba(16,185,129,0.25)'}`,
      }} />
      {isSuspended ? 'Suspended' : 'Active'}
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

const PAGE_SIZE = 20;

// ─── Main component ──────────────────────────────────────────────────────────

export default function AllUsersPage({ onSelectUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterRole, setFilterRole] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');

  // Sort
  const [sortField, setSortField] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');

  // Pagination
  const [page, setPage] = useState(1);

  const searchTimer = useRef(null);

  // Debounce search input
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 280);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  // Load all users — no orderBy so docs without createdAt aren't silently excluded.
  // Client-side sorting handles ordering.
  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDocs(collection(db, FIRESTORE_COLLECTIONS.users));
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        console.log(`[AllUsers] loaded ${docs.length} user(s) from Firestore`);
        setUsers(docs);
        if (docs.length === 0) {
          console.warn(
            '[AllUsers] 0 users returned. Two possible causes:\n' +
            '  1. The users Firestore collection is genuinely empty.\n' +
            '  2. Your admin account does not have role="Admin" in its users/{uid} document.\n' +
            '     Fix: open Firebase Console → Firestore → users → your UID → add field role: "Admin"'
          );
        }
      } catch (err) {
        console.error('[AllUsers] Firestore error:', err.message);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Stats
  const stats = useMemo(() => {
    const drivers = users.filter((u) => u.role === 'driver').length;
    const passengers = users.filter((u) => u.role !== 'driver').length;
    const suspended = users.filter((u) => u.accountStatus === 'Suspended').length;
    const newThisWeek = users.filter((u) => isWithinDays(u.createdAt, 7)).length;
    return { total: users.length, drivers, passengers, suspended, newThisWeek };
  }, [users]);

  // Filter + sort
  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase().trim();
    let list = users.filter((u) => {
      if (filterRole !== 'All') {
        if (filterRole === 'Driver' && u.role !== 'driver') return false;
        if (filterRole === 'Passenger' && u.role === 'driver') return false;
      }
      if (filterStatus !== 'All') {
        const st = u.accountStatus || 'Active';
        if (filterStatus === 'Active' && st !== 'Active') return false;
        if (filterStatus === 'Suspended' && st !== 'Suspended') return false;
      }
      if (q) {
        const name = (u.displayName || u.name || '').toLowerCase();
        const email = (u.email || '').toLowerCase();
        const uid = (u.id || '').toLowerCase();
        if (!name.includes(q) && !email.includes(q) && !uid.includes(q)) return false;
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      let va, vb;
      if (sortField === 'name') {
        va = (a.displayName || a.name || a.email || '').toLowerCase();
        vb = (b.displayName || b.name || b.email || '').toLowerCase();
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      if (sortField === 'createdAt') {
        va = parseDate(a.createdAt)?.getTime() ?? 0;
        vb = parseDate(b.createdAt)?.getTime() ?? 0;
      } else if (sortField === 'status') {
        va = a.accountStatus || 'Active';
        vb = b.accountStatus || 'Active';
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      } else {
        va = 0; vb = 0;
      }
      return sortDir === 'asc' ? va - vb : vb - va;
    });

    return list;
  }, [users, debouncedSearch, filterRole, filterStatus, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
    setPage(1);
  };

  const hasFilters = search || filterRole !== 'All' || filterStatus !== 'All';

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
        @keyframes skeletonPulse {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .user-row:hover { background: #f5f3ff !important; }
        .user-row { transition: background 0.12s ease; }
        .filter-select:hover { border-color: #6c63ff; }
        .action-btn:hover { background: #6c63ff !important; color: white !important; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(108,99,255,0.3) !important; }
        .clear-btn:hover { color: #6c63ff !important; }
      `}</style>

      {/* Page header */}
      <div style={{ marginBottom: '6px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#94a3b8' }}>
        <span>Admin</span>
        <span>›</span>
        <span style={{ color: '#6c63ff', fontWeight: 600 }}>All Users</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
            User Management
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: '#64748b' }}>
            View, search, and moderate all registered CampusCab users
          </p>
        </div>
        <button
          onClick={() => exportCsv(filtered)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 18px', borderRadius: '10px',
            border: '1.5px solid #e2e8f0', background: 'white',
            fontSize: 13, fontWeight: 700, color: '#374151', cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#6c63ff'; e.currentTarget.style.color = '#6c63ff'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#374151'; }}
        >
          <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export CSV
        </button>
      </div>

      {/* Stats cards */}
      <div style={{
        display: 'grid', gap: '16px', marginBottom: '24px',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        animation: 'fadeIn 0.3s ease-out',
      }}>
        <StatCard icon={ICON_USERS}     label="Total Users"        value={stats.total}       gradient="linear-gradient(135deg, #6c63ff 0%, #5046e5 100%)" />
        <StatCard icon={ICON_DRIVER}    label="Drivers"            value={stats.drivers}     gradient="linear-gradient(135deg, #0f766e 0%, #0d9488 100%)" />
        <StatCard icon={ICON_PASSENGER} label="Passengers"         value={stats.passengers}  gradient="linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)" />
        <StatCard icon={ICON_SUSPENDED} label="Suspended"          value={stats.suspended}   gradient="linear-gradient(135deg, #dc2626 0%, #ef4444 100%)" />
        <StatCard icon={ICON_NEW}       label="New This Week"      value={stats.newThisWeek} gradient="linear-gradient(135deg, #059669 0%, #10b981 100%)" delta={stats.newThisWeek} />
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
            <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}
              width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder="Search by name, email or UID…"
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

          {/* Role filter */}
          <select
            className="filter-select"
            value={filterRole}
            onChange={(e) => { setFilterRole(e.target.value); setPage(1); }}
            style={{
              padding: '9px 12px', borderRadius: '10px', fontSize: 13, fontWeight: 600,
              border: '1.5px solid #e2e8f0', background: 'white', color: '#374151',
              cursor: 'pointer', outline: 'none', transition: 'border-color 0.15s',
            }}
          >
            <option value="All">All Roles</option>
            <option value="Driver">Drivers</option>
            <option value="Passenger">Passengers</option>
          </select>

          {/* Status filter */}
          <select
            className="filter-select"
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
            style={{
              padding: '9px 12px', borderRadius: '10px', fontSize: 13, fontWeight: 600,
              border: '1.5px solid #e2e8f0', background: 'white', color: '#374151',
              cursor: 'pointer', outline: 'none', transition: 'border-color 0.15s',
            }}
          >
            <option value="All">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Suspended">Suspended</option>
          </select>

          {hasFilters && (
            <button
              className="clear-btn"
              onClick={() => { setSearch(''); setFilterRole('All'); setFilterStatus('All'); setPage(1); }}
              style={{ fontSize: 13, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: '4px 8px', transition: 'color 0.12s' }}
            >
              ✕ Clear
            </button>
          )}

          <div style={{ marginLeft: 'auto', fontSize: 13, color: '#94a3b8', fontWeight: 500, whiteSpace: 'nowrap' }}>
            {filtered.length} {filtered.length === 1 ? 'user' : 'users'}
          </div>
        </div>

        {/* Table */}
        {error ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: '#dc2626' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>⚠️</div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Failed to load users</div>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>{error}</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  <th style={th}>Avatar</th>
                  <th style={thClickable} onClick={() => handleSort('name')}>
                    Name <SortIcon active={sortField === 'name'} dir={sortDir} />
                  </th>
                  <th style={th}>Email</th>
                  <th style={th}>Role</th>
                  <th style={thClickable} onClick={() => handleSort('status')}>
                    Status <SortIcon active={sortField === 'status'} dir={sortDir} />
                  </th>
                  <th style={thClickable} onClick={() => handleSort('createdAt')}>
                    Joined <SortIcon active={sortField === 'createdAt'} dir={sortDir} />
                  </th>
                  <th style={{ ...th, textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                  : paginated.length === 0
                    ? (
                      <tr>
                        <td colSpan={7}>
                          <div style={{ padding: '56px 24px', textAlign: 'center' }}>
                            <div style={{ fontSize: 48, marginBottom: 12 }}>
                              {hasFilters ? '🔍' : '👤'}
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
                              {hasFilters ? 'No users match your filters' : 'No users found'}
                            </div>
                            <div style={{ fontSize: 13, color: '#94a3b8', maxWidth: 420, margin: '0 auto' }}>
                              {hasFilters
                                ? 'Try adjusting your search or clearing the filters.'
                                : 'Either no users have registered yet, or your admin account is missing role="Admin" in Firestore. Check the browser console for details.'}
                            </div>
                            {!hasFilters && (
                              <div style={{
                                marginTop: 16, padding: '12px 16px', borderRadius: 10,
                                background: '#fffbeb', border: '1px solid #fde68a',
                                fontSize: 12, color: '#92400e', maxWidth: 460, margin: '14px auto 0',
                                textAlign: 'left', lineHeight: 1.6,
                              }}>
                                <strong>If you expect to see users:</strong> open the Firebase Console → Firestore → <code>users</code> collection → find your UID → add field <code>role: "Admin"</code> (string). Then refresh this page.
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                    : paginated.map((user) => {
                      const isSuspended = user.accountStatus === 'Suspended';
                      const displayName = user.displayName || user.name || user.email || 'Unknown';
                      const initials = getInitials(user.displayName || user.name, user.email);
                      const { bg, shadow } = avatarColor(user.role);
                      return (
                        <tr
                          key={user.id}
                          className="user-row"
                          onClick={() => onSelectUser(user.id, displayName)}
                          style={{
                            cursor: 'pointer',
                            background: isSuspended ? '#fff5f5' : 'white',
                            borderLeft: isSuspended ? '3px solid #fca5a5' : '3px solid transparent',
                          }}
                        >
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{
                              width: 38, height: 38, borderRadius: '50%',
                              background: bg, color: 'white',
                              fontWeight: 800, fontSize: 14,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              boxShadow: `0 3px 8px ${shadow}`,
                              flexShrink: 0,
                            }}>
                              {initials}
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{displayName}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', marginTop: 2 }}>
                              {user.id.slice(0, 16)}…
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', color: '#475569', fontSize: 13 }}>
                            {user.email || '—'}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <RoleBadge role={user.role} />
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <StatusBadge status={user.accountStatus || 'Active'} />
                          </td>
                          <td style={{ padding: '12px 16px', color: '#64748b', fontSize: 13, whiteSpace: 'nowrap' }}>
                            {fmtDate(user.createdAt)}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <button
                              className="action-btn"
                              onClick={(e) => { e.stopPropagation(); onSelectUser(user.id, displayName); }}
                              style={{
                                padding: '7px 14px', borderRadius: '8px', fontSize: 12, fontWeight: 700,
                                border: '1.5px solid #e2e8f0', background: 'white', cursor: 'pointer',
                                color: '#374151', transition: 'all 0.15s ease', whiteSpace: 'nowrap',
                              }}
                            >
                              View Profile →
                            </button>
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
              Page {page} of {totalPages} · {filtered.length} results
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  padding: '7px 14px', borderRadius: '8px', fontSize: 13, fontWeight: 600,
                  border: '1.5px solid #e2e8f0', background: 'white', cursor: page === 1 ? 'not-allowed' : 'pointer',
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
                  border: '1.5px solid #e2e8f0', background: 'white', cursor: page === totalPages ? 'not-allowed' : 'pointer',
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
