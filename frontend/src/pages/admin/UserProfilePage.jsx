import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { FIRESTORE_COLLECTIONS } from '../../firestoreModel';
import { useSuspension } from '../../hooks/useSuspension';
import SuspensionModal from '../../components/admin/SuspensionModal';

async function fetchEnrichedProfile(userId) {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return null;
    const res = await fetch(`/api/admin/users/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getInitials(name, email) {
  const src = name || email || '?';
  return src.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || '?';
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

function fmtDateTime(val) {
  const d = parseDate(val);
  if (!d) return '—';
  return d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function accountAge(val) {
  const d = parseDate(val);
  if (!d) return '—';
  const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  if (days < 30) return `${days} days`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? 's' : ''}`;
  const years = Math.floor(months / 12);
  return `${years} year${years > 1 ? 's' : ''}`;
}

function suspensionCountdown(suspendedAt, duration) {
  if (!suspendedAt || duration === 'Permanent') return null;
  const ms = duration === '24 hours' ? 86_400_000 : duration === '7 days' ? 604_800_000 : 0;
  if (!ms) return null;
  const expiry = new Date(suspendedAt).getTime() + ms;
  const remaining = expiry - Date.now();
  if (remaining <= 0) return 'Expires soon';
  const hrs = Math.floor(remaining / 3_600_000);
  const mins = Math.floor((remaining % 3_600_000) / 60_000);
  return hrs > 24
    ? `${Math.floor(hrs / 24)}d ${hrs % 24}h remaining`
    : `${hrs}h ${mins}m remaining`;
}

// ─── Status badges ────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const ok = status !== 'Suspended';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '5px 12px', borderRadius: '999px', fontSize: 12, fontWeight: 800,
      background: ok ? '#dcfce7' : '#fee2e2',
      color: ok ? '#15803d' : '#991b1b',
      border: `1px solid ${ok ? '#bbf7d0' : '#fecaca'}`,
      letterSpacing: '0.04em',
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%',
        background: ok ? '#10b981' : '#dc2626',
        boxShadow: `0 0 0 2px ${ok ? 'rgba(16,185,129,0.3)' : 'rgba(220,38,38,0.3)'}`,
      }} />
      {ok ? 'Active' : 'Suspended'}
    </span>
  );
}

function RoleBadge({ role }) {
  const isDriver = role === 'driver';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '5px 12px', borderRadius: '999px', fontSize: 12, fontWeight: 800,
      background: isDriver ? '#dcfce7' : '#dbeafe',
      color: isDriver ? '#15803d' : '#1d4ed8',
      border: `1px solid ${isDriver ? '#bbf7d0' : '#bfdbfe'}`,
    }}>
      {isDriver ? '🚗' : '🎒'}
      {isDriver ? 'Driver' : role === 'passenger' ? 'Passenger' : role || 'User'}
    </span>
  );
}

// ─── Report status config ─────────────────────────────────────────────────────

const REPORT_STATUS_OPTIONS = ['New', 'In-Progress', 'Resolved'];
const REPORT_STATUS_STYLES = {
  New:          { background: '#fff3cd', color: '#856404' },
  'In-Progress':{ background: '#cfe2ff', color: '#084298' },
  Resolved:     { background: '#d1e7dd', color: '#0a3622' },
};

// ─── Stat box ─────────────────────────────────────────────────────────────────

function StatBox({ label, value, icon, accent = '#6c63ff' }) {
  return (
    <div style={{
      flex: '1 1 120px', minWidth: 0,
      background: 'white', borderRadius: '14px',
      border: '1px solid #e8eaed',
      padding: '16px', textAlign: 'center',
      boxShadow: '0 2px 6px rgba(15,23,42,0.04)',
    }}>
      <div style={{ fontSize: 24, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

// ─── Tab bar ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview',   label: 'Overview',           icon: '◎' },
  { id: 'reports',    label: 'Reports',             icon: '⚑' },
  { id: 'trips',      label: 'Trips',               icon: '🗺' },
  { id: 'moderation', label: 'Moderation History',  icon: '📋' },
  { id: 'timeline',   label: 'Activity Timeline',   icon: '⏱' },
];

function TabBar({ active, onChange, reportCount }) {
  return (
    <div style={{
      display: 'flex', borderBottom: '2px solid #f0f2f5', gap: 0,
      overflowX: 'auto', scrollbarWidth: 'none',
    }}>
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              padding: '13px 18px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: isActive ? 700 : 500,
              color: isActive ? '#6c63ff' : '#64748b',
              borderBottom: isActive ? '2px solid #6c63ff' : '2px solid transparent',
              marginBottom: '-2px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6,
              transition: 'color 0.12s ease',
            }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = '#0f172a'; }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = '#64748b'; }}
          >
            <span style={{ fontSize: 12 }}>{tab.icon}</span>
            {tab.label}
            {tab.id === 'reports' && reportCount > 0 && (
              <span style={{
                background: '#dc2626', color: 'white', fontSize: 10, fontWeight: 800,
                padding: '1px 6px', borderRadius: '999px', lineHeight: 1.6,
              }}>
                {reportCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ profile, onSuspend, onUnsuspend, suspending, unsuspending }) {
  const isSuspended = profile.accountStatus === 'Suspended';
  const countdown = suspensionCountdown(profile.suspendedAt, profile.suspensionDuration);

  const detailRow = (label, value) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f0f2f5' }}>
      <span style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 13, color: '#0f172a', fontWeight: 600, textAlign: 'right', maxWidth: '55%', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

      {/* Account details */}
      <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e8eaed', padding: '20px' }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="16" height="16" fill="none" stroke="#6c63ff" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
          Account Details
        </h3>
        {detailRow('Email', profile.email || '—')}
        {detailRow('UID', <span style={{ fontFamily: 'monospace', fontSize: 12, background: '#f8fafc', padding: '2px 6px', borderRadius: 4 }}>{profile.id}</span>)}
        {detailRow('Role', <RoleBadge role={profile.role} />)}
        {detailRow('Joined', fmtDate(profile.createdAt))}
        {detailRow('Account Age', accountAge(profile.createdAt))}
      </div>

      {/* Suspension panel */}
      <div style={{
        borderRadius: '14px', border: `1.5px solid ${isSuspended ? '#fecaca' : '#bbf7d0'}`,
        padding: '20px', background: isSuspended ? '#fff5f5' : '#f0fdf4',
      }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: isSuspended ? '#991b1b' : '#15803d', display: 'flex', alignItems: 'center', gap: 8 }}>
          {isSuspended ? (
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
            </svg>
          ) : (
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          )}
          Account Status
        </h3>

        {isSuspended ? (
          <>
            <div style={{ fontSize: 13, marginBottom: 10 }}>
              {detailRow('Duration', profile.suspensionDuration || '—')}
              {countdown && detailRow('Time Remaining', <span style={{ color: '#dc2626', fontWeight: 700 }}>{countdown}</span>)}
              {detailRow('Suspended', fmtDate(profile.suspendedAt))}
            </div>
            {profile.suspensionReason && (
              <div style={{ background: '#fee2e2', borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 13, color: '#7f1d1d' }}>
                <strong>Reason:</strong> {profile.suspensionReason}
              </div>
            )}
            <button
              onClick={onUnsuspend}
              disabled={unsuspending}
              style={{
                width: '100%', padding: '11px', borderRadius: '10px', border: 'none',
                background: unsuspending ? '#d1fae5' : 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                color: 'white', fontWeight: 800, fontSize: 14, cursor: unsuspending ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 12px rgba(5,150,105,0.3)', transition: 'all 0.15s',
              }}
            >
              {unsuspending ? 'Reinstating…' : '✓ Unsuspend Account'}
            </button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: '#166534', margin: '0 0 16px' }}>
              This account is in good standing with no active restrictions.
            </p>
            <button
              onClick={onSuspend}
              style={{
                width: '100%', padding: '11px', borderRadius: '10px', border: 'none',
                background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                color: 'white', fontWeight: 800, fontSize: 14, cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(220,38,38,0.3)', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(220,38,38,0.4)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 4px 12px rgba(220,38,38,0.3)'; }}
            >
              ✕ Suspend Account
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Reports tab ─────────────────────────────────────────────────────────────

function ReportsTab({ reports, onStatusChange, updatingId }) {
  if (reports.length === 0) {
    return (
      <div style={{ padding: '56px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🛡️</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>No reports on file</div>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>This user has not been reported by other members.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {reports.map((report) => (
        <div
          key={report.id}
          style={{
            background: 'white', borderRadius: '12px',
            border: '1px solid #e8eaed',
            padding: '16px 20px',
            boxShadow: '0 1px 4px rgba(15,23,42,0.04)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{
                  padding: '3px 10px', borderRadius: '999px', fontSize: 11, fontWeight: 700,
                  background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0',
                }}>
                  {report.violationType || 'Unknown'}
                </span>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{fmtDateTime(report.createdAt)}</span>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
                {report.reason || 'No additional details provided.'}
              </p>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
                Reported by: <span style={{ fontFamily: 'monospace' }}>{report.reporterId}</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{
                padding: '4px 10px', borderRadius: '999px', fontSize: 12, fontWeight: 700,
                ...REPORT_STATUS_STYLES[report.status] || { background: '#f1f5f9', color: '#64748b' },
              }}>
                {report.status}
              </span>
              <select
                value={report.status}
                disabled={updatingId === report.id}
                onChange={(e) => onStatusChange(report.id, e.target.value)}
                style={{
                  padding: '5px 10px', borderRadius: '8px', border: '1.5px solid #e2e8f0',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', outline: 'none',
                  background: 'white', color: '#374151',
                }}
              >
                {REPORT_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Trips tab ────────────────────────────────────────────────────────────────

function TripsTab({ trips, rideRequests, loading }) {
  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #e2e8f0', borderTopColor: '#6c63ff', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        Loading trips…
      </div>
    );
  }

  const TripCard = ({ trip, type }) => (
    <div style={{
      background: 'white', borderRadius: '12px', border: '1px solid #e8eaed',
      padding: '14px 18px', boxShadow: '0 1px 4px rgba(15,23,42,0.04)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
            {trip.origin || trip.from || '—'} → {trip.destination || trip.to || '—'}
          </div>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            {fmtDateTime(trip.departureTime || trip.createdAt)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            padding: '3px 10px', borderRadius: '999px', fontSize: 11, fontWeight: 700,
            background: type === 'posted' ? '#dcfce7' : '#dbeafe',
            color: type === 'posted' ? '#15803d' : '#1d4ed8',
          }}>
            {type === 'posted' ? 'Posted' : 'Joined'}
          </span>
          <span style={{
            padding: '3px 10px', borderRadius: '999px', fontSize: 11, fontWeight: 700,
            background: '#f1f5f9', color: '#64748b',
          }}>
            {trip.status || 'active'}
          </span>
        </div>
      </div>
    </div>
  );

  const hasAny = trips.length > 0 || rideRequests.length > 0;

  if (!hasAny) {
    return (
      <div style={{ padding: '56px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🗺️</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>No trip history</div>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>This user hasn't posted or joined any trips yet.</div>
      </div>
    );
  }

  return (
    <div>
      {trips.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Posted Trips ({trips.length})
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {trips.map((t) => <TripCard key={t.id} trip={t} type="posted" />)}
          </div>
        </div>
      )}
      {rideRequests.length > 0 && (
        <div>
          <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Joined Trips ({rideRequests.length})
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rideRequests.map((r) => <TripCard key={r.id} trip={r} type="joined" />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Moderation History tab ───────────────────────────────────────────────────

function ModerationHistoryTab({ logs, loading }) {
  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #e2e8f0', borderTopColor: '#6c63ff', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
        Loading history…
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div style={{ padding: '56px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>No moderation actions</div>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>This account has no recorded moderation history.</div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        position: 'absolute', left: 20, top: 0, bottom: 0, width: 2,
        background: 'linear-gradient(180deg, #6c63ff 0%, #e2e8f0 100%)',
        borderRadius: 2,
      }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, paddingLeft: 52 }}>
        {logs.map((log, i) => {
          const isSuspend = log.action === 'SUSPEND';
          return (
            <div
              key={log.id}
              style={{
                position: 'relative',
                paddingBottom: i < logs.length - 1 ? 20 : 0,
              }}
            >
              {/* Timeline dot */}
              <div style={{
                position: 'absolute', left: -40, top: 14,
                width: 18, height: 18, borderRadius: '50%',
                background: isSuspend
                  ? 'linear-gradient(135deg, #dc2626, #b91c1c)'
                  : 'linear-gradient(135deg, #059669, #10b981)',
                border: '3px solid white',
                boxShadow: `0 2px 8px ${isSuspend ? 'rgba(220,38,38,0.4)' : 'rgba(5,150,105,0.4)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="8" height="8" fill="white" viewBox="0 0 24 24">
                  {isSuspend
                    ? <><circle cx="12" cy="12" r="10" fill="none" stroke="white" strokeWidth="2"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" stroke="white" strokeWidth="2"/></>
                    : <polyline points="20 6 9 17 4 12" fill="none" stroke="white" strokeWidth="3"/>}
                </svg>
              </div>

              {/* Log card */}
              <div style={{
                background: 'white', borderRadius: '12px',
                border: `1px solid ${isSuspend ? '#fecaca' : '#bbf7d0'}`,
                padding: '14px 18px',
                boxShadow: '0 1px 4px rgba(15,23,42,0.04)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  <span style={{
                    fontSize: 13, fontWeight: 800,
                    color: isSuspend ? '#991b1b' : '#15803d',
                  }}>
                    {isSuspend ? '✕ Account Suspended' : '✓ Account Reinstated'}
                  </span>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{fmtDateTime(log.timestamp)}</span>
                </div>
                {log.reason && (
                  <p style={{ margin: '0 0 8px', fontSize: 13, color: '#374151' }}>
                    <strong>Reason:</strong> {log.reason}
                  </p>
                )}
                {log.duration && (
                  <p style={{ margin: '0 0 8px', fontSize: 13, color: '#374151' }}>
                    <strong>Duration:</strong> {log.duration}
                  </p>
                )}
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  By admin: <span style={{ fontFamily: 'monospace' }}>{log.adminId}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Activity Timeline tab ────────────────────────────────────────────────────

function ActivityTimelineTab({ reports, auditLogs, trips }) {
  const events = [
    ...reports.map((r) => ({
      id: r.id, type: 'report',
      ts: parseDate(r.createdAt)?.getTime() ?? 0,
      label: `Reported for ${r.violationType || 'unknown reason'}`,
      sub: r.reason || '',
      color: '#f59e0b', icon: '⚑',
    })),
    ...auditLogs.map((l) => ({
      id: l.id, type: 'moderation',
      ts: parseDate(l.timestamp)?.getTime() ?? 0,
      label: l.action === 'SUSPEND' ? 'Account suspended' : 'Account reinstated',
      sub: l.reason || '',
      color: l.action === 'SUSPEND' ? '#dc2626' : '#10b981',
      icon: l.action === 'SUSPEND' ? '✕' : '✓',
    })),
    ...trips.map((t) => ({
      id: t.id, type: 'trip',
      ts: parseDate(t.createdAt)?.getTime() ?? 0,
      label: `Trip posted: ${t.origin || '—'} → ${t.destination || '—'}`,
      sub: '',
      color: '#6c63ff', icon: '🚗',
    })),
  ].sort((a, b) => b.ts - a.ts);

  if (events.length === 0) {
    return (
      <div style={{ padding: '56px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>⏱️</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>No activity yet</div>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>Activity will appear here as the user interacts with the platform.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {events.map((ev) => (
        <div
          key={`${ev.type}-${ev.id}`}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 14,
            padding: '12px 0', borderBottom: '1px solid #f8fafc',
          }}
        >
          <div style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            background: ev.color + '22', border: `1.5px solid ${ev.color}44`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 800, color: ev.color,
          }}>
            {ev.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{ev.label}</div>
            {ev.sub && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{ev.sub}</div>}
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {ev.ts ? fmtDate(new Date(ev.ts)) : '—'}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function UserProfilePage({ userId, onBack }) {
  const [profile, setProfile] = useState(null);
  const [reports, setReports] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [trips, setTrips] = useState([]);
  const [rideRequests, setRideRequests] = useState([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingSecondary, setLoadingSecondary] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [updatingReportId, setUpdatingReportId] = useState(null);

  const displayName = profile?.displayName || profile?.name || profile?.email || 'Unknown User';

  const { showModal, setShowModal, suspending, unsuspending, handleSuspend, handleUnsuspend } =
    useSuspension(userId, displayName, {
      onSuccess: ({ action, duration, reason }) => {
        setProfile((prev) => ({
          ...prev,
          accountStatus: action === 'SUSPEND' ? 'Suspended' : 'Active',
          suspensionReason: action === 'SUSPEND' ? reason : null,
          suspensionDuration: action === 'SUSPEND' ? duration : null,
          suspendedAt: action === 'SUSPEND' ? new Date().toISOString() : null,
        }));
        // Refresh audit logs after action
        getDocs(query(
          collection(db, FIRESTORE_COLLECTIONS.auditLogs),
          where('targetUserId', '==', userId),
          orderBy('timestamp', 'desc')
        ))
          .then((snap) => setAuditLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
          .catch(() => {});
      },
    });

  // Load profile — fall back to backend API to fill in fields missing from Firestore
  // (e.g. admin accounts manually created with only role: "Admin")
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, FIRESTORE_COLLECTIONS.users, userId));
        if (!snap.exists()) {
          setError('User not found.');
          return;
        }
        const firestoreProfile = { id: snap.id, ...snap.data() };
        setProfile(firestoreProfile);

        // If key display fields are missing, enrich from backend (Firebase Admin SDK)
        if (!firestoreProfile.email || !firestoreProfile.createdAt) {
          const enriched = await fetchEnrichedProfile(userId);
          if (enriched) {
            setProfile((prev) => ({
              ...prev,
              email: prev.email || enriched.email || prev.email,
              displayName: prev.displayName || enriched.displayName || prev.displayName,
              createdAt: prev.createdAt || enriched.createdAt,
            }));
          }
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoadingProfile(false);
      }
    })();
  }, [userId]);

  // Load secondary data in parallel
  useEffect(() => {
    const load = async () => {
      const results = await Promise.allSettled([
        // Reports
        getDocs(query(
          collection(db, FIRESTORE_COLLECTIONS.reports),
          where('reportedUserId', '==', userId),
          orderBy('createdAt', 'desc')
        )).catch(() => getDocs(query(
          collection(db, FIRESTORE_COLLECTIONS.reports),
          where('reportedUserId', '==', userId)
        ))),

        // Audit logs
        getDocs(query(
          collection(db, FIRESTORE_COLLECTIONS.auditLogs),
          where('targetUserId', '==', userId),
          orderBy('timestamp', 'desc')
        )).catch(() => getDocs(query(
          collection(db, FIRESTORE_COLLECTIONS.auditLogs),
          where('targetUserId', '==', userId)
        ))),

        // Posted trips (as driver)
        getDocs(query(
          collection(db, FIRESTORE_COLLECTIONS.trips),
          where('driverId', '==', userId)
        )),

        // Joined trips (as passenger via rideRequests)
        getDocs(query(
          collection(db, FIRESTORE_COLLECTIONS.rideRequests),
          where('passengerId', '==', userId)
        )),
      ]);

      if (results[0].status === 'fulfilled') {
        setReports(results[0].value.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
      if (results[1].status === 'fulfilled') {
        setAuditLogs(results[1].value.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
      if (results[2].status === 'fulfilled') {
        setTrips(results[2].value.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
      if (results[3].status === 'fulfilled') {
        setRideRequests(results[3].value.docs.map((d) => ({ id: d.id, ...d.data() })));
      }

      setLoadingSecondary(false);
    };
    load();
  }, [userId]);

  const handleReportStatusChange = async (reportId, newStatus) => {
    const valid = ['New', 'In-Progress', 'Resolved'];
    if (!valid.includes(newStatus)) return;
    setUpdatingReportId(reportId);
    try {
      await updateDoc(doc(db, FIRESTORE_COLLECTIONS.reports, reportId), { status: newStatus });
      setReports((prev) => prev.map((r) => r.id === reportId ? { ...r, status: newStatus } : r));
    } catch (err) {
      alert('Failed to update status: ' + err.message);
    } finally {
      setUpdatingReportId(null);
    }
  };

  const initials = getInitials(profile?.displayName || profile?.name, profile?.email);
  const isSuspended = profile?.accountStatus === 'Suspended';

  // ── Render loading ──
  if (loadingProfile) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid #e2e8f0', borderTopColor: '#6c63ff', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ color: '#64748b' }}>Loading profile…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>⚠️</div>
        <div style={{ color: '#dc2626', fontWeight: 700, marginBottom: 4 }}>{error}</div>
        <button onClick={onBack} style={{ marginTop: 12, padding: '8px 20px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 13 }}>← Back</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '28px 28px 48px', minHeight: '100vh', background: '#f0f2f5' }}>
      {showModal && (
        <SuspensionModal
          userName={displayName}
          onConfirm={handleSuspend}
          onCancel={() => setShowModal(false)}
          loading={suspending}
        />
      )}

      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      {/* Breadcrumb */}
      <div style={{ marginBottom: '6px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#94a3b8' }}>
        <span>Admin</span>
        <span>›</span>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, fontSize: 13, fontWeight: 500 }}>All Users</button>
        <span>›</span>
        <span style={{ color: '#6c63ff', fontWeight: 600 }}>{displayName}</span>
      </div>

      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          marginBottom: '20px', padding: '8px 16px', borderRadius: '10px',
          border: '1.5px solid #e2e8f0', background: 'white', cursor: 'pointer',
          fontSize: 13, fontWeight: 700, color: '#374151',
          boxShadow: '0 1px 3px rgba(15,23,42,0.05)',
          transition: 'all 0.12s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#6c63ff'; e.currentTarget.style.color = '#6c63ff'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#374151'; }}
      >
        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
        </svg>
        Back to All Users
      </button>

      {/* Profile header card */}
      <div style={{
        background: 'white', borderRadius: '20px',
        border: '1px solid #e8eaed',
        boxShadow: '0 4px 20px rgba(15,23,42,0.07)',
        marginBottom: '20px',
        overflow: 'hidden',
        animation: 'fadeIn 0.25s ease-out',
      }}>
        {/* Top stripe */}
        <div style={{
          height: 6,
          background: isSuspended
            ? 'linear-gradient(90deg, #dc2626, #f87171)'
            : 'linear-gradient(90deg, #6c63ff, #0f766e)',
        }} />

        <div style={{ padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
            {/* Avatar */}
            <div style={{
              width: 72, height: 72, borderRadius: '50%', flexShrink: 0,
              background: isSuspended
                ? 'linear-gradient(135deg, #dc2626, #b91c1c)'
                : profile?.role === 'driver'
                  ? 'linear-gradient(135deg, #0f766e, #0d9488)'
                  : 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
              color: 'white', fontWeight: 900, fontSize: 26,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 20px rgba(15,23,42,0.18)',
              border: '3px solid white',
            }}>
              {initials}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{displayName}</h1>
                <RoleBadge role={profile?.role} />
                <StatusBadge status={profile?.accountStatus || 'Active'} />
              </div>
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>{profile?.email || '—'}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>uid: {userId}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Joined {fmtDate(profile?.createdAt)}</div>
            </div>

            {/* Action button */}
            <div style={{ flexShrink: 0 }}>
              {isSuspended ? (
                <button
                  onClick={handleUnsuspend}
                  disabled={unsuspending}
                  style={{
                    padding: '11px 22px', borderRadius: '10px', border: 'none',
                    background: 'linear-gradient(135deg, #059669, #10b981)',
                    color: 'white', fontWeight: 800, fontSize: 14, cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(5,150,105,0.3)',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  {unsuspending ? 'Reinstating…' : '✓ Unsuspend'}
                </button>
              ) : (
                <button
                  onClick={() => setShowModal(true)}
                  style={{
                    padding: '11px 22px', borderRadius: '10px', border: 'none',
                    background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                    color: 'white', fontWeight: 800, fontSize: 14, cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(220,38,38,0.3)',
                    display: 'flex', alignItems: 'center', gap: 8,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(220,38,38,0.4)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 4px 14px rgba(220,38,38,0.3)'; }}
                >
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                  </svg>
                  Suspend Account
                </button>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
            <StatBox label="Trips Posted"      value={trips.length}             icon="🚗" accent="#0f766e" />
            <StatBox label="Trips Joined"      value={rideRequests.length}      icon="🎒" accent="#1d4ed8" />
            <StatBox label="Reports Received"  value={reports.length}           icon="⚑"  accent={reports.length > 0 ? '#dc2626' : '#64748b'} />
            <StatBox label="Account Age"       value={accountAge(profile?.createdAt)} icon="📅" accent="#6c63ff" />
            <StatBox label="Moderation Events" value={auditLogs.length}         icon="📋" accent="#f59e0b" />
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ padding: '0 20px' }}>
          <TabBar active={activeTab} onChange={setActiveTab} reportCount={reports.length} />
        </div>
      </div>

      {/* Tab content */}
      <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
        {activeTab === 'overview' && profile && (
          <OverviewTab
            profile={profile}
            onSuspend={() => setShowModal(true)}
            onUnsuspend={handleUnsuspend}
            suspending={suspending}
            unsuspending={unsuspending}
          />
        )}
        {activeTab === 'reports' && (
          <ReportsTab
            reports={reports}
            onStatusChange={handleReportStatusChange}
            updatingId={updatingReportId}
          />
        )}
        {activeTab === 'trips' && (
          <TripsTab trips={trips} rideRequests={rideRequests} loading={loadingSecondary} />
        )}
        {activeTab === 'moderation' && (
          <ModerationHistoryTab logs={auditLogs} loading={loadingSecondary} />
        )}
        {activeTab === 'timeline' && (
          <ActivityTimelineTab reports={reports} auditLogs={auditLogs} trips={trips} />
        )}
      </div>
    </div>
  );
}
