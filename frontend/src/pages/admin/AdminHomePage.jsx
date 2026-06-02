import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../../firebase';
import { FIRESTORE_COLLECTIONS } from '../../firestoreModel';

function parseDate(val) {
  if (!val) return null;
  if (val?.toDate) return val.toDate();
  if (typeof val === 'string' || typeof val === 'number') return new Date(val);
  return null;
}

function timeAgo(val) {
  const d = parseDate(val);
  if (!d) return '—';
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return 'Just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function withinDays(val, days) {
  const d = parseDate(val);
  if (!d) return false;
  return Date.now() - d.getTime() < days * 86400000;
}

// ─── Metric card ──────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, icon, gradient, shadowColor, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'white', borderRadius: '18px', padding: '22px',
        border: '1px solid #e8eaed',
        boxShadow: hovered ? `0 12px 32px ${shadowColor}` : '0 2px 8px rgba(15,23,42,0.05)',
        transition: 'box-shadow 0.2s, transform 0.2s',
        transform: hovered && onClick ? 'translateY(-2px)' : 'translateY(0)',
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex', alignItems: 'center', gap: 18, minWidth: 0,
      }}
    >
      <div style={{
        width: 56, height: 56, borderRadius: '16px', flexShrink: 0,
        background: gradient,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 6px 16px ${shadowColor}`,
        fontSize: 24,
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4, fontWeight: 600 }}>{label}</div>
        {sub != null && (
          <div style={{ fontSize: 11, marginTop: 3, fontWeight: 700, color: typeof sub === 'string' && sub.startsWith('+') ? '#10b981' : '#94a3b8' }}>
            {sub}
          </div>
        )}
      </div>
      {onClick && (
        <div style={{ marginLeft: 'auto', color: '#cbd5e1', fontSize: 18, flexShrink: 0, transition: 'color 0.15s', ...(hovered ? { color: '#6c63ff' } : {}) }}>›</div>
      )}
    </div>
  );
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  const pulse = {
    animation: 'skeletonPulse 1.6s ease-in-out infinite',
    background: 'linear-gradient(90deg, #f0f2f5 25%, #e8eaed 50%, #f0f2f5 75%)',
    backgroundSize: '400% 100%', borderRadius: 8,
  };
  return (
    <div style={{ background: 'white', borderRadius: '18px', padding: '22px', border: '1px solid #e8eaed', display: 'flex', alignItems: 'center', gap: 18 }}>
      <div style={{ width: 56, height: 56, borderRadius: '16px', flexShrink: 0, ...pulse }} />
      <div>
        <div style={{ width: 60, height: 28, ...pulse }} />
        <div style={{ width: 110, height: 13, marginTop: 8, ...pulse }} />
      </div>
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, action, onAction }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{title}</h2>
      {action && (
        <button
          onClick={onAction}
          style={{ fontSize: 13, color: '#6c63ff', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
        >
          {action} →
        </button>
      )}
    </div>
  );
}

// ─── Activity feed ────────────────────────────────────────────────────────────

const ACTION_CONFIG = {
  SUSPEND:   { icon: '🚫', color: '#dc2626', bg: '#fee2e2', label: 'Suspended' },
  UNSUSPEND: { icon: '✅', color: '#15803d', bg: '#dcfce7', label: 'Reinstated' },
};

function ActivityFeed({ logs, userMap, loading }) {
  if (loading) {
    const pulse = { animation: 'skeletonPulse 1.6s ease-in-out infinite', background: 'linear-gradient(90deg, #f0f2f5 25%, #e8eaed 50%, #f0f2f5 75%)', backgroundSize: '400% 100%', borderRadius: 6 };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #f0f2f5' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, ...pulse }} />
            <div style={{ flex: 1 }}>
              <div style={{ width: '60%', height: 13, ...pulse }} />
              <div style={{ width: '35%', height: 11, marginTop: 6, ...pulse }} />
            </div>
            <div style={{ width: 50, height: 11, ...pulse }} />
          </div>
        ))}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
        No moderation activity yet.
      </div>
    );
  }

  const getName = (uid) => {
    if (!uid) return 'Unknown';
    const n = userMap[uid];
    return n && n !== uid ? n : uid.slice(0, 10) + '…';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {logs.map((log, idx) => {
        const cfg = ACTION_CONFIG[log.action] || { icon: '•', color: '#64748b', bg: '#f8fafc', label: log.action };
        return (
          <div key={log.id} style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '13px 0',
            borderBottom: idx < logs.length - 1 ? '1px solid #f0f2f5' : 'none',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16,
            }}>
              {cfg.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <span style={{ color: cfg.color, fontWeight: 800 }}>{cfg.label}</span>
                {' '}{getName(log.targetUserId)}
                <span style={{ color: '#94a3b8', fontWeight: 500 }}> by {getName(log.adminId)}</span>
              </div>
              {log.reason && (
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {log.reason}
                </div>
              )}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, flexShrink: 0 }}>
              {timeAgo(log.timestamp)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Open reports list ────────────────────────────────────────────────────────

const STATUS_STYLE = {
  New:           { bg: '#fff3cd', color: '#856404' },
  'In-Progress': { bg: '#cfe2ff', color: '#084298' },
  Resolved:      { bg: '#d1e7dd', color: '#0a3622' },
};

function OpenReportsList({ reports, userMap, loading, onNavigate }) {
  if (loading) {
    const pulse = { animation: 'skeletonPulse 1.6s ease-in-out infinite', background: 'linear-gradient(90deg, #f0f2f5 25%, #e8eaed 50%, #f0f2f5 75%)', backgroundSize: '400% 100%', borderRadius: 6 };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ padding: '12px 14px', borderRadius: 12, background: '#f8fafc', display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ flex: 1, height: 13, ...pulse }} />
            <div style={{ width: 60, height: 22, borderRadius: 20, ...pulse }} />
          </div>
        ))}
      </div>
    );
  }

  const open = reports.filter((r) => r.status !== 'Resolved').slice(0, 5);

  if (open.length === 0) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
        No open reports. All clear!
      </div>
    );
  }

  const getName = (uid) => {
    if (!uid) return 'Unknown';
    const n = userMap[uid];
    return n && n !== uid ? n : uid.slice(0, 10) + '…';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {open.map((r) => {
        const st = STATUS_STYLE[r.status] || STATUS_STYLE.New;
        return (
          <div
            key={r.id}
            onClick={() => onNavigate('reported-users')}
            style={{
              padding: '12px 14px', borderRadius: '12px', background: '#f8fafc',
              border: '1px solid #f0f2f5', cursor: 'pointer', display: 'flex',
              alignItems: 'center', gap: 12, transition: 'background 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#f5f3ff'; e.currentTarget.style.borderColor = '#e0deff'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#f0f2f5'; }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {getName(r.reportedUserId)}
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {r.reason || 'No reason given'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ ...st, padding: '3px 9px', borderRadius: '999px', fontSize: 11, fontWeight: 700 }}>{r.status}</span>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>{timeAgo(r.createdAt)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminHomePage({ onNavigate }) {
  const [users, setUsers]       = useState([]);
  const [reports, setReports]   = useState([]);
  const [trips, setTrips]       = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [usersSnap, reportsSnap, tripsSnap, logsSnap] = await Promise.all([
          getDocs(collection(db, FIRESTORE_COLLECTIONS.users)),
          getDocs(collection(db, FIRESTORE_COLLECTIONS.reports)),
          getDocs(collection(db, FIRESTORE_COLLECTIONS.trips)),
          getDocs(query(collection(db, FIRESTORE_COLLECTIONS.auditLogs), orderBy('timestamp', 'desc'))),
        ]);
        setUsers(usersSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setReports(reportsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setTrips(tripsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setAuditLogs(logsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('[AdminHome] load error:', err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const userMap = useMemo(() => {
    const m = {};
    users.forEach((u) => { m[u.id] = u.displayName || u.name || u.email || u.id; });
    return m;
  }, [users]);

  const metrics = useMemo(() => {
    const totalUsers       = users.length;
    const newUsersWeek     = users.filter((u) => withinDays(u.createdAt, 7)).length;
    const suspended        = users.filter((u) => u.accountStatus === 'Suspended').length;
    const suspendedWeek    = auditLogs.filter((l) => l.action === 'SUSPEND' && withinDays(l.timestamp, 7)).length;
    const flagged          = users.filter((u) => u.flaggedForLateCancellations === true).length;
    const totalReports     = reports.length;
    const openReports      = reports.filter((r) => r.status !== 'Resolved').length;
    const newReports       = reports.filter((r) => r.status === 'New').length;
    const activeTrips      = trips.filter((t) => t.status === 'active' || t.status === 'full').length;
    return { totalUsers, newUsersWeek, suspended, suspendedWeek, flagged, totalReports, openReports, newReports, activeTrips };
  }, [users, reports, trips, auditLogs]);

  const recentLogs = auditLogs.slice(0, 8);

  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div style={{ padding: '28px 28px 48px', minHeight: '100vh', background: '#f0f2f5' }}>
      <style>{`
        @keyframes skeletonPulse {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: '28px', animation: 'fadeIn 0.3s ease-out' }}>
        <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>Admin › Overview</div>
        <h1 style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>
          {greeting}, Admin
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: '#64748b' }}>
          Here's what's happening on the platform today.
        </p>
      </div>

      {/* Alert strip — only if there are flagged or open issues */}
      {!loading && (metrics.newReports > 0 || metrics.flagged > 0) && (
        <div style={{
          marginBottom: 24, padding: '14px 18px', borderRadius: '14px',
          background: '#fff7ed', border: '1.5px solid #fed7aa',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          animation: 'fadeIn 0.35s ease-out',
        }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div style={{ fontSize: 13, color: '#92400e', flex: 1 }}>
            {[
              metrics.newReports > 0 && `${metrics.newReports} new report${metrics.newReports > 1 ? 's' : ''} need attention`,
              metrics.flagged > 0 && `${metrics.flagged} passenger${metrics.flagged > 1 ? 's' : ''} flagged for repeated late cancellations`,
            ].filter(Boolean).join(' · ')}
          </div>
          <button
            onClick={() => onNavigate('reported-users')}
            style={{
              padding: '6px 14px', borderRadius: '8px', fontSize: 12, fontWeight: 700,
              background: '#92400e', color: 'white', border: 'none', cursor: 'pointer',
            }}
          >
            Review
          </button>
        </div>
      )}

      {/* Metric cards — top row: users */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Users</div>
        <div style={{
          display: 'grid', gap: 16, animation: 'fadeIn 0.3s ease-out',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        }}>
          {loading ? (
            [1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)
          ) : (
            <>
              <MetricCard
                label="Total Users" value={metrics.totalUsers}
                sub={metrics.newUsersWeek > 0 ? `+${metrics.newUsersWeek} this week` : 'No new users this week'}
                icon="👥" gradient="linear-gradient(135deg, #6c63ff, #5046e5)" shadowColor="rgba(108,99,255,0.2)"
                onClick={() => onNavigate('all-users')}
              />
              <MetricCard
                label="Active Suspensions" value={metrics.suspended}
                sub={metrics.suspendedWeek > 0 ? `+${metrics.suspendedWeek} this week` : 'None this week'}
                icon="🚫" gradient="linear-gradient(135deg, #dc2626, #b91c1c)" shadowColor="rgba(220,38,38,0.2)"
                onClick={() => onNavigate('all-users')}
              />
              <MetricCard
                label="Flagged Passengers" value={metrics.flagged}
                sub={metrics.flagged > 0 ? 'Late-cancellation flags' : 'No flags raised'}
                icon="🚩" gradient={metrics.flagged > 0 ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #64748b, #475569)'} shadowColor="rgba(245,158,11,0.2)"
                onClick={() => onNavigate('all-users')}
              />
              <MetricCard
                label="Active Trips" value={metrics.activeTrips}
                icon="🗺" gradient="linear-gradient(135deg, #0f766e, #0d9488)" shadowColor="rgba(15,118,110,0.2)"
                onClick={() => onNavigate('trip-reports')}
              />
            </>
          )}
        </div>
      </div>

      {/* Metric cards — second row: reports */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12, marginTop: 20 }}>Reports</div>
        <div style={{
          display: 'grid', gap: 16, animation: 'fadeIn 0.35s ease-out',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        }}>
          {loading ? (
            [1, 2, 3].map((i) => <SkeletonCard key={i} />)
          ) : (
            <>
              <MetricCard
                label="Total Reports" value={metrics.totalReports}
                icon="📋" gradient="linear-gradient(135deg, #1d4ed8, #3b82f6)" shadowColor="rgba(29,78,216,0.2)"
                onClick={() => onNavigate('reported-users')}
              />
              <MetricCard
                label="Open Reports" value={metrics.openReports}
                sub={metrics.openReports > 0 ? 'Require attention' : 'All resolved'}
                icon="⚑" gradient={metrics.openReports > 0 ? 'linear-gradient(135deg, #dc2626, #ef4444)' : 'linear-gradient(135deg, #059669, #10b981)'} shadowColor="rgba(220,38,38,0.2)"
                onClick={() => onNavigate('reported-users')}
              />
              <MetricCard
                label="New Reports" value={metrics.newReports}
                sub={metrics.newReports > 0 ? 'Unreviewed' : 'None pending'}
                icon="🆕" gradient={metrics.newReports > 0 ? 'linear-gradient(135deg, #7c3aed, #8b5cf6)' : 'linear-gradient(135deg, #64748b, #475569)'} shadowColor="rgba(124,58,237,0.2)"
                onClick={() => onNavigate('reported-users')}
              />
            </>
          )}
        </div>
      </div>

      {/* Bottom two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, animation: 'fadeIn 0.4s ease-out' }}>

        {/* Recent moderation activity */}
        <div style={{
          background: 'white', borderRadius: '18px', border: '1px solid #e8eaed',
          padding: '22px', boxShadow: '0 2px 8px rgba(15,23,42,0.05)',
        }}>
          <SectionHeader title="Recent Moderation Activity" action="View All" onAction={() => onNavigate('audit-log')} />
          <ActivityFeed logs={recentLogs} userMap={userMap} loading={loading} />
        </div>

        {/* Open reports */}
        <div style={{
          background: 'white', borderRadius: '18px', border: '1px solid #e8eaed',
          padding: '22px', boxShadow: '0 2px 8px rgba(15,23,42,0.05)',
        }}>
          <SectionHeader title="Open Reports" action="Manage" onAction={() => onNavigate('reported-users')} />
          <OpenReportsList reports={reports} userMap={userMap} loading={loading} onNavigate={onNavigate} />
        </div>

      </div>
    </div>
  );
}
