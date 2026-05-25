import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, firebaseReady } from '../firebase';
import { FIRESTORE_COLLECTIONS } from '../firestoreModel';
import { colors, radius, spacing, typography, surfaces, buttons, inputs, pills } from '../theme';
import { AddressSearch } from './MapComponents';

const PRESET_LABELS = ['Home', 'Campus'];
const MAX_ADDRESSES = 5;

function iconForLabel(label) {
  const lower = (label || '').toLowerCase();
  if (lower === 'home') return '🏠';
  if (lower === 'campus') return '🎓';
  if (lower === 'work') return '💼';
  return '📍';
}

function makeId() {
  return `addr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function SavedAddresses() {
  const [addresses, setAddresses] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [labelChoice, setLabelChoice] = useState('Home');
  const [customLabel, setCustomLabel] = useState('');
  const [pendingAddress, setPendingAddress] = useState(null);
  const [searchKey, setSearchKey] = useState(0);

  useEffect(() => {
    async function load() {
      if (!firebaseReady || !db || !auth) {
        setFetching(false);
        return;
      }
      const user = auth.currentUser;
      if (!user) {
        setFetching(false);
        return;
      }
      try {
        const snap = await getDoc(doc(db, FIRESTORE_COLLECTIONS.users, user.uid));
        const data = snap.exists() ? snap.data() : {};
        if (Array.isArray(data.savedAddresses)) {
          setAddresses(data.savedAddresses);
        }
      } catch (err) {
        console.error('Failed to load saved addresses', err);
      } finally {
        setFetching(false);
      }
    }
    load();
  }, []);

  const persist = async (next) => {
    if (!firebaseReady || !db || !auth) {
      setMessage({ text: 'Demo mode: addresses not persisted.', type: 'error' });
      return false;
    }
    const user = auth.currentUser;
    if (!user) {
      setMessage({ text: 'You must be logged in to save addresses.', type: 'error' });
      return false;
    }
    setSaving(true);
    try {
      await setDoc(
        doc(db, FIRESTORE_COLLECTIONS.users, user.uid),
        { savedAddresses: next, updatedAt: serverTimestamp() },
        { merge: true },
      );
      return true;
    } catch (err) {
      console.error('Failed to save addresses', err);
      setMessage({ text: 'Failed to save address: ' + err.message, type: 'error' });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setMessage({ text: '', type: '' });

    if (!pendingAddress) {
      setMessage({ text: 'Please select an address from the search results.', type: 'error' });
      return;
    }

    const finalLabel = (labelChoice === 'Custom' ? customLabel : labelChoice).trim();
    if (finalLabel.length < 2) {
      setMessage({ text: 'Label must be at least 2 characters.', type: 'error' });
      return;
    }

    if (addresses.length >= MAX_ADDRESSES) {
      setMessage({ text: `You can save up to ${MAX_ADDRESSES} addresses.`, type: 'error' });
      return;
    }

    if (addresses.some((a) => a.label.toLowerCase() === finalLabel.toLowerCase())) {
      setMessage({ text: `An address labelled "${finalLabel}" already exists.`, type: 'error' });
      return;
    }

    const next = [
      ...addresses,
      {
        id: makeId(),
        label: finalLabel,
        name: pendingAddress.name,
        lat: pendingAddress.lat,
        lon: pendingAddress.lon,
      },
    ];

    const ok = await persist(next);
    if (ok) {
      setAddresses(next);
      setPendingAddress(null);
      setCustomLabel('');
      setLabelChoice(PRESET_LABELS.find((p) => !next.some((a) => a.label === p)) || 'Custom');
      setSearchKey((k) => k + 1);
      setMessage({ text: `"${finalLabel}" saved.`, type: 'success' });
    }
  };

  const handleDelete = async (id) => {
    setMessage({ text: '', type: '' });
    const next = addresses.filter((a) => a.id !== id);
    const ok = await persist(next);
    if (ok) {
      setAddresses(next);
      setMessage({ text: 'Address removed.', type: 'success' });
    }
  };

  if (fetching) {
    return (
      <div style={{ ...typography.small, color: colors.textSubtle }}>Loading saved addresses…</div>
    );
  }

  const usedPresets = new Set(addresses.map((a) => a.label));
  const presetOptionsAvailable = PRESET_LABELS.filter((p) => !usedPresets.has(p));
  const showLabelChoice = presetOptionsAvailable.length > 0;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm, gap: spacing.sm }}>
        <div>
          <h3 style={{ ...typography.h3, margin: 0 }}>Saved addresses</h3>
          <p style={{ ...typography.small, color: colors.textSubtle, margin: '4px 0 0' }}>
            Add shortcuts for the places you ride to and from most often.
          </p>
        </div>
        <span style={{ ...pills.base, ...pills.muted }}>
          {addresses.length} / {MAX_ADDRESSES}
        </span>
      </div>

      {addresses.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm, marginBottom: spacing.lg }}>
          {addresses.map((a) => (
            <div
              key={a.id}
              style={{
                ...surfaces.innerCard,
                padding: spacing.md,
                display: 'flex',
                alignItems: 'center',
                gap: spacing.md,
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  backgroundColor: colors.surfaceMuted,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.1rem',
                  flexShrink: 0,
                }}
              >
                {iconForLabel(a.label)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...typography.body, fontWeight: 700, marginBottom: 2 }}>{a.label}</div>
                <div
                  style={{
                    ...typography.small,
                    color: colors.textSubtle,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={a.name}
                >
                  {a.name}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(a.id)}
                disabled={saving}
                style={{
                  ...buttons.subtle,
                  width: 'auto',
                  padding: '6px 12px',
                  color: colors.danger,
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {addresses.length < MAX_ADDRESSES && (
        <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
          <div>
            <label style={{ ...inputs.label }}>Label</label>
            {showLabelChoice ? (
              <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
                {presetOptionsAvailable.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setLabelChoice(preset)}
                    style={{
                      ...pills.base,
                      ...(labelChoice === preset ? pills.accent : pills.muted),
                      cursor: 'pointer',
                      border: 'none',
                    }}
                  >
                    {iconForLabel(preset)} {preset}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setLabelChoice('Custom')}
                  style={{
                    ...pills.base,
                    ...(labelChoice === 'Custom' ? pills.accent : pills.muted),
                    cursor: 'pointer',
                    border: 'none',
                  }}
                >
                  ✏️ Custom
                </button>
              </div>
            ) : (
              <div style={{ ...typography.small, color: colors.textSubtle }}>
                Home and Campus are already saved — give this one a custom label.
              </div>
            )}
            {(labelChoice === 'Custom' || !showLabelChoice) && (
              <input
                type="text"
                placeholder="e.g. Work, Gym, Library"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                maxLength={20}
                style={{ ...inputs.field, marginTop: spacing.xs }}
              />
            )}
          </div>

          <AddressSearch
            key={searchKey}
            label="Address"
            placeholder="Search for an address"
            onSelect={setPendingAddress}
          />

          {pendingAddress && (
            <div
              style={{
                ...typography.small,
                color: colors.textSubtle,
                padding: spacing.sm,
                backgroundColor: colors.surfaceMuted,
                borderRadius: radius.md,
              }}
            >
              Selected: <strong style={{ color: colors.text }}>{pendingAddress.name}</strong>
            </div>
          )}

          {message.text && (
            <div
              style={{
                padding: spacing.sm,
                borderRadius: radius.md,
                ...typography.small,
                fontWeight: 600,
                backgroundColor: message.type === 'error' ? colors.dangerSoft : colors.successSoft,
                color: message.type === 'error' ? colors.danger : colors.success,
              }}
            >
              {message.text}
            </div>
          )}

          <button
            type="submit"
            disabled={saving || !pendingAddress}
            style={{
              ...buttons.primary,
              opacity: saving || !pendingAddress ? 0.7 : 1,
              cursor: saving || !pendingAddress ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : 'Save address'}
          </button>
        </form>
      )}
    </div>
  );
}
