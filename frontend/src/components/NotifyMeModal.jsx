import React, { useEffect, useRef, useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, firebaseReady, auth } from '../firebase';
import { FIRESTORE_COLLECTIONS, ROUTE_ALERT_SCOPE } from '../firestoreModel';
import { colors, radius, spacing, typography, buttons, pills } from '../theme';
import { buildAlertFromSearch, formatAlertScope } from '../utils/routeAlerts';
import { registerBrowserPushToken } from '../utils/pushNotifications';

const KEYFRAMES = `
@keyframes notifyme-bell-shake {
  0%   { transform: rotate(0deg); }
  20%  { transform: rotate(-18deg); }
  40%  { transform: rotate(14deg); }
  60%  { transform: rotate(-8deg); }
  80%  { transform: rotate(4deg); }
  100% { transform: rotate(0deg); }
}
@keyframes notifyme-pop {
  0%   { transform: scale(0.4); opacity: 0; }
  60%  { transform: scale(1.08); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes notifyme-fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;

const SCOPE_OPTIONS = [
  { value: ROUTE_ALERT_SCOPE.date, label: 'Just this date', sub: 'One-shot ping' },
  { value: ROUTE_ALERT_SCOPE.week, label: 'This week', sub: '7-day window' },
  { value: ROUTE_ALERT_SCOPE.ongoing, label: 'Ongoing', sub: 'Until I delete it' },
];

function SegmentedControl({ value, onChange }) {
  return (
    <div
      role="radiogroup"
      aria-label="Alert duration"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '6px',
        padding: '6px',
        backgroundColor: 'rgba(15, 23, 42, 0.05)',
        borderRadius: radius.lg,
      }}
    >
      {SCOPE_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            style={{
              border: 'none',
              cursor: 'pointer',
              padding: '12px 8px',
              borderRadius: radius.md,
              background: active ? colors.accentGradient : 'transparent',
              color: active ? '#ffffff' : colors.text,
              fontWeight: 800,
              fontSize: '0.85rem',
              boxShadow: active ? '0 8px 18px rgba(15, 118, 110, 0.28)' : 'none',
              transition: 'background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '2px',
            }}
          >
            <span>{opt.label}</span>
            <span
              style={{
                fontSize: '0.65rem',
                fontWeight: 600,
                opacity: 0.85,
                letterSpacing: '0.02em',
              }}
            >
              {opt.sub}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const NotifyMeModal = ({ open, onClose, prefill, onSaved }) => {
  const [scope, setScope] = useState(ROUTE_ALERT_SCOPE.date);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const closeBtnRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setScope(ROUTE_ALERT_SCOPE.date);
      setSaving(false);
      setError('');
      setDone(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (e.key === 'Escape' && !saving) onClose?.();
    };
    window.addEventListener('keydown', handler);
    closeBtnRef.current?.focus();
    return () => window.removeEventListener('keydown', handler);
  }, [open, saving, onClose]);

  if (!open) return null;

  const friendlyCampus = (prefill?.campus || '').split(',')[0] || 'this campus';
  const previewAlert = {
    scope,
    startDate: prefill?.date,
    endDate:
      scope === ROUTE_ALERT_SCOPE.ongoing
        ? null
        : scope === ROUTE_ALERT_SCOPE.week
        ? null // computed in helper
        : prefill?.date,
  };

  const handleSave = async (e) => {
    e?.preventDefault?.();
    if (saving) return;
    setError('');
    if (!firebaseReady || !db || !auth?.currentUser) {
      setError('Sign in required to save a route alert.');
      return;
    }
    if (!prefill?.campus || !prefill?.date) {
      setError('Pick a destination and date in your search first.');
      return;
    }
    setSaving(true);
    try {
      const user = auth.currentUser;
      const payload = buildAlertFromSearch({
        passengerId: user.uid,
        passengerEmail: user.email || null,
        passengerGender: prefill.passengerGender,
        campus: prefill.campus,
        date: prefill.date,
        time: prefill.time,
        passengerLocation: prefill.passengerLocation,
        pickupLabel: prefill.pickupLabel,
        scope,
      });
      const ref = await addDoc(collection(db, FIRESTORE_COLLECTIONS.routeAlerts), {
        ...payload,
        createdAt: serverTimestamp(),
      });
      // Make sure this passenger has a push token registered. Don't fail the
      // alert save if the user denies permission — they can still review the
      // alert in My Alerts and we'll fall back to the in-app notification doc.
      try {
        await registerBrowserPushToken(user, 'passenger');
      } catch (pushErr) {
        // eslint-disable-next-line no-console
        console.warn('Push token registration skipped:', pushErr?.message);
      }
      setDone(true);
      onSaved?.({ id: ref.id, ...payload });
      setTimeout(() => onClose?.(), 1100);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      setError(err?.message || 'Could not save your alert. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="notifyme-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose?.();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.lg,
        animation: 'notifyme-fade-in 0.18s ease-out',
      }}
    >
      <style>{KEYFRAMES}</style>
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          backgroundColor: colors.surfaceSolid,
          borderRadius: radius.xl,
          overflow: 'hidden',
          boxShadow: '0 30px 60px rgba(15, 23, 42, 0.28)',
          animation: 'notifyme-fade-in 0.22s ease-out',
        }}
      >
        {/* Gradient header */}
        <div
          style={{
            background: colors.accentGradient,
            padding: `${spacing.xl} ${spacing.xl}`,
            color: '#ffffff',
            position: 'relative',
          }}
        >
          <button
            ref={closeBtnRef}
            type="button"
            aria-label="Close"
            onClick={() => !saving && onClose?.()}
            style={{
              position: 'absolute',
              top: spacing.md,
              right: spacing.md,
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: 'none',
              backgroundColor: 'rgba(255,255,255,0.18)',
              color: '#ffffff',
              fontSize: '1.1rem',
              cursor: 'pointer',
              backdropFilter: 'blur(6px)',
            }}
          >
            ×
          </button>
          <div
            aria-hidden="true"
            style={{
              fontSize: '2.2rem',
              display: 'inline-block',
              transformOrigin: '50% 10%',
              animation: 'notifyme-bell-shake 0.8s ease-in-out 1',
              marginBottom: spacing.xs,
            }}
          >
            🔔
          </div>
          <h2
            id="notifyme-title"
            style={{ ...typography.display, color: '#ffffff', margin: 0, fontSize: '1.45rem' }}
          >
            Notify me about this route
          </h2>
          <p
            style={{
              ...typography.body,
              color: 'rgba(255,255,255,0.86)',
              margin: `${spacing.xs} 0 0 0`,
            }}
          >
            We'll ping you the moment a matching trip is posted.
          </p>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} style={{ padding: spacing.xl }}>
          {done ? (
            <div style={{ textAlign: 'center', padding: `${spacing.lg} 0` }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  background: colors.accentGradient,
                  color: '#ffffff',
                  fontSize: '2rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto',
                  animation: 'notifyme-pop 0.4s ease-out',
                  boxShadow: '0 14px 28px rgba(15, 118, 110, 0.32)',
                }}
              >
                ✓
              </div>
              <h3 style={{ ...typography.h2, marginTop: spacing.md }}>You're all set</h3>
              <p style={{ ...typography.body, marginTop: spacing.xs }}>
                We'll send a push the second a driver posts this route.
              </p>
            </div>
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: spacing.sm,
                  padding: spacing.md,
                  backgroundColor: colors.surfaceMuted,
                  borderRadius: radius.lg,
                  marginBottom: spacing.lg,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ ...typography.eyebrow, marginBottom: '2px' }}>Route</div>
                  <div style={{ ...typography.h3 }}>
                    {prefill?.pickupLabel || 'Your pickup'}{' '}
                    <span style={{ color: colors.textSubtle }}>→</span> {friendlyCampus}
                  </div>
                </div>
                <span style={{ ...pills.base, ...pills.accent }}>
                  {prefill?.time ? `from ${prefill.time}` : 'Any time'}
                </span>
              </div>

              <div style={{ marginBottom: spacing.md }}>
                <div style={{ ...typography.eyebrow, marginBottom: spacing.sm }}>How long</div>
                <SegmentedControl value={scope} onChange={setScope} />
              </div>

              <div
                style={{
                  padding: spacing.md,
                  borderRadius: radius.md,
                  border: `1px dashed ${colors.border}`,
                  marginBottom: spacing.lg,
                  ...typography.small,
                  color: colors.textMuted,
                }}
              >
                <strong style={{ color: colors.text }}>Summary —</strong>{' '}
                We'll ping you for trips to <strong>{friendlyCampus}</strong>{' '}
                <strong>{formatAlertScope(previewAlert).toLowerCase()}</strong>.
              </div>

              {error && (
                <div
                  role="alert"
                  style={{
                    padding: spacing.sm,
                    backgroundColor: colors.dangerSoft,
                    color: colors.danger,
                    borderRadius: radius.md,
                    marginBottom: spacing.md,
                    ...typography.small,
                    fontWeight: 700,
                  }}
                >
                  {error}
                </div>
              )}

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1.4fr',
                  gap: spacing.sm,
                }}
              >
                <button
                  type="button"
                  onClick={() => !saving && onClose?.()}
                  style={{ ...buttons.ghost, width: '100%' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    ...buttons.accent,
                    opacity: saving ? 0.7 : 1,
                    cursor: saving ? 'wait' : 'pointer',
                  }}
                >
                  {saving ? 'Saving…' : 'Turn on alerts'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
};

export default NotifyMeModal;
