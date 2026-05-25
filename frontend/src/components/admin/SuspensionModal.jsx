import { useState } from 'react';

const DURATION_OPTIONS = [
  { value: '24 hours', label: '24 Hours', sub: 'Short-term cooldown' },
  { value: '7 days', label: '7 Days', sub: 'Standard suspension' },
  { value: 'Permanent', label: 'Permanent', sub: 'Account disabled' },
];

/**
 * Reusable suspension confirmation modal.
 * Shared between UserModerationPage and UserProfilePage.
 */
export default function SuspensionModal({ userName, onConfirm, onCancel, loading }) {
  const [duration, setDuration] = useState('24 hours');
  const [reason, setReason] = useState('');
  const [focused, setFocused] = useState(false);

  const canConfirm = reason.trim().length > 0 && !loading;

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2000, padding: '20px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <style>{`
        @keyframes modalSlideIn {
          from { opacity: 0; transform: scale(0.95) translateY(-12px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);      }
        }
        @keyframes durationPulse {
          0%   { box-shadow: 0 0 0 0   rgba(220, 38, 38, 0.4); }
          70%  { box-shadow: 0 0 0 6px rgba(220, 38, 38, 0);   }
          100% { box-shadow: 0 0 0 0   rgba(220, 38, 38, 0);   }
        }
      `}</style>

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="suspension-title"
        style={{
          background: '#ffffff',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '480px',
          boxShadow: '0 32px 80px rgba(15, 23, 42, 0.28), 0 0 0 1px rgba(15,23,42,0.06)',
          animation: 'modalSlideIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
          overflow: 'hidden',
        }}
      >
        {/* Header stripe */}
        <div style={{
          background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
          padding: '20px 24px 18px',
          display: 'flex', alignItems: 'center', gap: '14px',
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: '12px',
            background: 'rgba(255,255,255,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="22" height="22" fill="none" stroke="white" strokeWidth="2.2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"/>
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
            </svg>
          </div>
          <div>
            <h2 id="suspension-title" style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'white' }}>
              Suspend Account
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.78)', marginTop: 2 }}>
              Session will be terminated immediately
            </p>
          </div>
        </div>

        <div style={{ padding: '24px' }}>
          {/* Target user */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 14px', borderRadius: '10px',
            background: '#f8fafc', border: '1px solid #e2e8f0',
            marginBottom: '22px',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
              color: 'white', fontWeight: 800, fontSize: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              {(userName || 'U').charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 13, color: '#64748b' }}>Suspending</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{userName}</div>
            </div>
          </div>

          {/* Duration picker */}
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: '10px', letterSpacing: '0.01em' }}>
            Suspension Duration
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '20px' }}>
            {DURATION_OPTIONS.map((opt) => {
              const isSelected = duration === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDuration(opt.value)}
                  style={{
                    padding: '10px 8px', borderRadius: '10px', cursor: 'pointer', textAlign: 'center',
                    border: isSelected ? '2.5px solid #dc2626' : '2px solid #e2e8f0',
                    background: isSelected ? '#fff1f2' : 'white',
                    transition: 'all 0.15s ease',
                    animation: isSelected ? 'durationPulse 0.4s ease-out' : 'none',
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 800, color: isSelected ? '#dc2626' : '#374151' }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: 11, color: isSelected ? '#f87171' : '#94a3b8', marginTop: 2, fontWeight: 500 }}>
                    {opt.sub}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Reason field */}
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: '8px', letterSpacing: '0.01em' }}>
            Reason <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Describe the reason for this suspension. This will be stored in the audit log."
            rows={4}
            style={{
              width: '100%', padding: '12px 14px', borderRadius: '10px',
              border: `1.5px solid ${focused ? '#6c63ff' : reason ? '#e2e8f0' : '#fca5a5'}`,
              fontSize: 14, resize: 'vertical', boxSizing: 'border-box',
              outline: 'none', color: '#0f172a', fontFamily: 'inherit',
              lineHeight: 1.5, transition: 'border-color 0.15s ease',
              background: focused ? 'white' : '#fafafa',
            }}
          />
          {!reason && (
            <p style={{ fontSize: 12, color: '#dc2626', margin: '5px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              A reason is required to confirm.
            </p>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '22px' }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              style={{
                flex: 1, padding: '12px', borderRadius: '10px',
                border: '1.5px solid #e2e8f0', background: 'white',
                cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#64748b',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'white'; }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => canConfirm && onConfirm(duration, reason.trim())}
              disabled={!canConfirm}
              style={{
                flex: 2, padding: '12px', borderRadius: '10px', border: 'none',
                background: canConfirm
                  ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)'
                  : '#fca5a5',
                color: 'white', cursor: canConfirm ? 'pointer' : 'not-allowed',
                fontSize: 14, fontWeight: 800,
                boxShadow: canConfirm ? '0 6px 16px rgba(220, 38, 38, 0.35)' : 'none',
                transition: 'all 0.15s ease',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {loading ? (
                <>
                  <span style={{
                    width: 14, height: 14, borderRadius: '50%',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: 'white',
                    animation: 'spin 0.7s linear infinite',
                    display: 'inline-block',
                  }} />
                  Suspending…
                </>
              ) : (
                <>
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                  </svg>
                  Confirm Suspension
                </>
              )}
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
