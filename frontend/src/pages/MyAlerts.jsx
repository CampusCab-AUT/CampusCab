import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db, firebaseReady } from '../firebase';
import { FIRESTORE_COLLECTIONS, ROUTE_ALERT_STATUS } from '../firestoreModel';
import { formatAlertScope } from '../utils/routeAlerts';
import {
  colors,
  radius,
  spacing,
  typography,
  surfaces,
  buttons,
  pills,
} from '../theme';

const PULSE_STYLES = `
@keyframes alert-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(15, 118, 110, 0.55); }
  70%  { box-shadow: 0 0 0 10px rgba(15, 118, 110, 0); }
  100% { box-shadow: 0 0 0 0 rgba(15, 118, 110, 0); }
}
@keyframes alert-row-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;

function PulseDot({ active }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        backgroundColor: active ? colors.accent : colors.textSubtle,
        animation: active ? 'alert-pulse 1.8s ease-out infinite' : 'none',
      }}
    />
  );
}

function shortDestination(name) {
  if (!name) return 'Campus';
  return name.split(',')[0];
}

function formatLastMatched(ts) {
  if (!ts) return 'No matches yet';
  const date = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
  if (Number.isNaN(date.getTime())) return 'No matches yet';
  return `Last match ${date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`;
}

export default function MyAlerts({ onGoToSearch }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!firebaseReady || !db || !auth?.currentUser) {
      setLoading(false);
      return undefined;
    }
    const q = query(
      collection(db, FIRESTORE_COLLECTIONS.routeAlerts),
      where('passengerId', '==', auth.currentUser.uid),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        rows.sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() || 0;
          const bTime = b.createdAt?.toMillis?.() || 0;
          return bTime - aTime;
        });
        setAlerts(rows);
        setLoading(false);
      },
      (err) => {
        // eslint-disable-next-line no-console
        console.error(err);
        setError(err.message || 'Could not load your alerts.');
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  const activeCount = useMemo(
    () => alerts.filter((a) => a.status === ROUTE_ALERT_STATUS.active).length,
    [alerts],
  );

  const handleDelete = async (id) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await deleteDoc(doc(db, FIRESTORE_COLLECTIONS.routeAlerts, id));
    } catch (err) {
      setError(err.message || 'Could not delete that alert.');
    } finally {
      setBusyId('');
    }
  };

  const handleToggle = async (alert) => {
    if (busyId) return;
    setBusyId(alert.id);
    try {
      await updateDoc(doc(db, FIRESTORE_COLLECTIONS.routeAlerts, alert.id), {
        status:
          alert.status === ROUTE_ALERT_STATUS.active
            ? ROUTE_ALERT_STATUS.paused
            : ROUTE_ALERT_STATUS.active,
      });
    } catch (err) {
      setError(err.message || 'Could not update that alert.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <style>{PULSE_STYLES}</style>

      {/* Hero band */}
      <div
        style={{
          background: colors.accentGradient,
          color: '#ffffff',
          borderRadius: radius.xl,
          padding: spacing.xl,
          marginBottom: spacing.xl,
          display: 'flex',
          alignItems: 'center',
          gap: spacing.lg,
          flexWrap: 'wrap',
          boxShadow: '0 18px 40px rgba(15, 118, 110, 0.24)',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            backgroundColor: 'rgba(255,255,255,0.18)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.8rem',
            backdropFilter: 'blur(6px)',
          }}
        >
          🔔
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2
            style={{ ...typography.display, color: '#ffffff', fontSize: '1.45rem', margin: 0 }}
          >
            My Route Alerts
          </h2>
          <p
            style={{
              ...typography.body,
              color: 'rgba(255,255,255,0.86)',
              margin: `${spacing.xs} 0 0`,
            }}
          >
            {activeCount > 0
              ? `${activeCount} active — we'll ping you the moment a driver posts a match.`
              : 'No active alerts yet. Turn one on from any empty search.'}
          </p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            padding: spacing.md,
            borderRadius: radius.md,
            backgroundColor: colors.dangerSoft,
            color: colors.danger,
            ...typography.small,
            fontWeight: 700,
            marginBottom: spacing.md,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div
          style={{
            ...surfaces.innerCard,
            padding: spacing.xl,
            textAlign: 'center',
            ...typography.small,
            color: colors.textSubtle,
          }}
        >
          Loading your alerts…
        </div>
      ) : alerts.length === 0 ? (
        <div
          style={{
            ...surfaces.innerCard,
            padding: spacing.xl,
            textAlign: 'center',
            borderStyle: 'dashed',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: spacing.md,
          }}
        >
          <div style={{ fontSize: '2rem' }} aria-hidden="true">
            🌱
          </div>
          <div>
            <h3 style={{ ...typography.h2, margin: 0 }}>No alerts yet</h3>
            <p style={{ ...typography.body, marginTop: spacing.xs, marginBottom: 0 }}>
              Search for a route — if nothing comes up, tap <strong>Notify me</strong>.
            </p>
          </div>
          {onGoToSearch && (
            <button
              type="button"
              onClick={onGoToSearch}
              style={{ ...buttons.accent, width: 'auto', minWidth: 200 }}
            >
              Find a ride
            </button>
          )}
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: spacing.md }}>
          {alerts.map((alert) => {
            const isActive = alert.status === ROUTE_ALERT_STATUS.active;
            const busy = busyId === alert.id;
            return (
              <li
                key={alert.id}
                style={{
                  ...surfaces.innerCard,
                  padding: spacing.lg,
                  animation: 'alert-row-in 0.2s ease-out',
                  display: 'grid',
                  gap: spacing.sm,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: spacing.sm,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ ...typography.eyebrow, marginBottom: 2 }}>
                      {formatAlertScope(alert)}
                    </div>
                    <div style={{ ...typography.h3 }}>
                      {alert.origin || 'Anywhere'}{' '}
                      <span style={{ color: colors.textSubtle }}>→</span>{' '}
                      {shortDestination(alert.destination)}
                    </div>
                    <div
                      style={{
                        ...typography.small,
                        marginTop: 4,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <PulseDot active={isActive} />
                      <span
                        style={{
                          fontWeight: 700,
                          color: isActive ? colors.accent : colors.textSubtle,
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          fontSize: '0.7rem',
                        }}
                      >
                        {isActive ? 'Active' : alert.status}
                      </span>
                      <span style={{ color: colors.textSubtle }}>
                        • {formatLastMatched(alert.lastMatchedAt)}
                      </span>
                      {alert.notificationsSent > 0 && (
                        <span
                          style={{
                            ...pills.base,
                            ...pills.success,
                            padding: '3px 8px',
                            fontSize: '0.62rem',
                          }}
                        >
                          {alert.notificationsSent} pings
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleToggle(alert)}
                      disabled={busy}
                      style={{
                        ...buttons.subtle,
                        opacity: busy ? 0.6 : 1,
                        cursor: busy ? 'wait' : 'pointer',
                      }}
                    >
                      {isActive ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(alert.id)}
                      disabled={busy}
                      aria-label="Delete alert"
                      style={{
                        ...buttons.danger,
                        opacity: busy ? 0.6 : 1,
                        cursor: busy ? 'wait' : 'pointer',
                      }}
                    >
                      🗑 Delete
                    </button>
                  </div>
                </div>
                {alert.womenOnlyOk && (
                  <div>
                    <span
                      style={{
                        ...pills.base,
                        background: 'linear-gradient(135deg, #ec4899, #d946ef)',
                        color: '#ffffff',
                      }}
                    >
                      👩 Women-only OK
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
