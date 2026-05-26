/**
 * @fileoverview Component for drivers to create and publish new trips.
 * Integrates map routing, address searching, and Firestore database publishing.
 * Supports one-off trips and weekly recurring trips (e.g. every Mon/Wed for N weeks).
 */


import React, { useEffect, useMemo, useState } from 'react';
import { db, auth, firebaseReady } from './firebase';
import { addDoc, collection, serverTimestamp, writeBatch, doc, getDoc } from 'firebase/firestore';
import { buttons, colors, inputs, pills, radius, shadows, typography } from './theme';
import { FIRESTORE_COLLECTIONS, TRIP_STATUS } from './firestoreModel';
import useIsDesktop from './hooks/useIsDesktop';
import { AddressSearch, RouteMap } from './components/MapComponents';
import useSavedAddresses from './hooks/useSavedAddresses';

const DAYS_OF_WEEK = [
  { idx: 1, short: 'Mon', long: 'Monday' },
  { idx: 2, short: 'Tue', long: 'Tuesday' },
  { idx: 3, short: 'Wed', long: 'Wednesday' },
  { idx: 4, short: 'Thu', long: 'Thursday' },
  { idx: 5, short: 'Fri', long: 'Friday' },
  { idx: 6, short: 'Sat', long: 'Saturday' },
  { idx: 0, short: 'Sun', long: 'Sunday' },
];

/**
 * Given a base ISO `datetime-local` string, generate one Date for each selected
 * weekday across `weeks` calendar weeks, beginning the week of the base date.
 * Only future-or-equal-to-base instances are included.
 * @param {string} baseDateTimeLocal — value from a datetime-local input.
 * @param {number[]} selectedDays — array of weekday indices (0=Sun..6=Sat).
 * @param {number} weeks — number of weeks to schedule.
 * @returns {Date[]} sorted list of occurrence Date objects.
 */
function generateOccurrences(baseDateTimeLocal, selectedDays, weeks) {
  if (!baseDateTimeLocal || !selectedDays?.length || !weeks) return [];
  const base = new Date(baseDateTimeLocal);
  if (Number.isNaN(base.getTime())) return [];

  const hours = base.getHours();
  const minutes = base.getMinutes();

  const weekStart = new Date(base);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const occurrences = [];
  for (let w = 0; w < weeks; w += 1) {
    for (const dayIdx of selectedDays) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + w * 7 + dayIdx);
      d.setHours(hours, minutes, 0, 0);
      if (d.getTime() >= base.getTime()) occurrences.push(d);
    }
  }
  return occurrences.sort((a, b) => a - b);
}

/** Format a Date back to the `datetime-local` ISO-ish string Firestore stores. */
function toLocalIsoString(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function Field({ label, helper, children }) {
  return (
    <div style={{ textAlign: 'left' }}>
      <label style={inputs.label}>{label}</label>
      {children}
      {helper && <p style={inputs.helper}>{helper}</p>}
    </div>
  );
}
/**
 * A customized input field that applies theme-specific focus styling.
 * @param {Object} props - Standard HTML input properties.
 */
function StyledInput(props) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      {...props}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        props.onBlur?.(e);
      }}
      style={{
        ...inputs.field,
        ...(focused ? inputs.fieldFocus : null),
        ...(props.style || {}),
      }}
    />
  );
}
/**
 * A customized select dropdown that applies theme-specific styling and custom chevron icon.
 * @param {Object} props - Standard HTML select properties.
 */
function StyledSelect(props) {
  const [focused, setFocused] = useState(false);
  return (
    <select
      {...props}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        props.onBlur?.(e);
      }}
      style={{
        ...inputs.field,
        ...(focused ? inputs.fieldFocus : null),
        appearance: 'none',
        WebkitAppearance: 'none',
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 20 20' fill='%2364748b'><path d='M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 011.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z'/></svg>\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 14px center',
        paddingRight: '40px',
      }}
    />
  );
}

/**
 * Pill-shaped toggle button for selecting a day of the week.
 */
function DayChip({ day, selected, onToggle }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={() => onToggle(day.idx)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-pressed={selected}
      aria-label={day.long}
      style={{
        cursor: 'pointer',
        borderRadius: radius.pill,
        padding: '10px 4px',
        minWidth: '46px',
        fontSize: '0.78rem',
        fontWeight: 800,
        letterSpacing: '0.04em',
        border: selected
          ? `1.5px solid transparent`
          : `1.5px solid ${colors.border}`,
        background: selected
          ? colors.accentGradient
          : hover
            ? '#ffffff'
            : colors.surfaceMuted,
        color: selected ? '#ffffff' : colors.text,
        boxShadow: selected
          ? '0 8px 18px rgba(15, 118, 110, 0.28)'
          : 'none',
        transform: selected ? 'translateY(-1px)' : 'none',
        transition:
          'background 0.18s ease, color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease',
      }}
    >
      {day.short}
    </button>
  );
}

/**
 * Main CreateTrip component.
 * Allows authenticated drivers to select origin/destination, calculate routes via map integration,
 * and publish either a single trip or a weekly-recurring batch of trips to Firestore.
 */
function CreateTrip() {
  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);
  const [routeGeoJson, setRouteGeoJson] = useState(null);
  const [departureTime, setDepartureTime] = useState('');
  const [seats, setSeats] = useState(3);
  const [estimatedDurationMinutes, setEstimatedDurationMinutes] = useState(30);
  const [message, setMessage] = useState('');
  const [recentTrip, setRecentTrip] = useState(null);
  const [recentBatch, setRecentBatch] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [recurring, setRecurring] = useState(false);
  const [selectedDays, setSelectedDays] = useState([]);
  const [weeks, setWeeks] = useState(2);

  const [driverGender, setDriverGender] = useState(null);
  const [womenOnly, setWomenOnly] = useState(false);

  useEffect(() => {
    if (!firebaseReady || !db || !auth?.currentUser) return;
    const uid = auth.currentUser.uid;
    getDoc(doc(db, FIRESTORE_COLLECTIONS.users, uid))
      .then((snap) => setDriverGender(snap.exists() ? (snap.data().gender || '') : ''))
      .catch(() => setDriverGender(''));
  }, []);

  const isDesktop = useIsDesktop();
  const { savedAddresses } = useSavedAddresses();

  const toggleDay = (idx) =>
    setSelectedDays((prev) =>
      prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx].sort((a, b) => a - b),
    );

  const previewOccurrences = useMemo(
    () => (recurring ? generateOccurrences(departureTime, selectedDays, weeks) : []),
    [recurring, departureTime, selectedDays, weeks],
  );

  /**
   * Validates form inputs and submits the new trip payload(s) to Firestore.
   * For recurring trips, writes one document per occurrence in a single batch.
   * Also handles a "demo mode" fallback if Firebase is not connected locally.
   * @param {Event} e - Form submission event.
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setRecentBatch(null);

    if (seats <= 0) {
      setMessage('Error: You must have at least 1 available seat.');
      return;
    }

    const durationMinutes = parseInt(estimatedDurationMinutes, 10);
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      setMessage('Error: Estimated trip duration must be a positive number of minutes.');
      return;
    }

    if (womenOnly && driverGender !== 'Female') {
      setMessage('Error: Only female drivers can create women-only trips.');
      return;
    }

    const selectedDate = new Date(departureTime);
    const now = new Date();
    if (selectedDate <= now) {
      setMessage('Error: Departure time must be in the future.');
      return;
    }

    if (recurring) {
      if (selectedDays.length === 0) {
        setMessage('Error: Pick at least one day of the week to repeat on.');
        return;
      }
      if (weeks < 1) {
        setMessage('Error: Choose at least 1 week to schedule.');
        return;
      }
      if (previewOccurrences.length === 0) {
        setMessage('Error: No future dates fall on the selected days. Try a later start.');
        return;
      }
    }

    const baseTripData = (departureIso) => ({
      origin: origin.name,
      destination: destination.name,
      originLocation: { lat: origin.lat, lon: origin.lon },
      destinationLocation: { lat: destination.lat, lon: destination.lon },
      routeGeoJson: JSON.stringify(routeGeoJson),
      departureTime: departureIso,
      estimatedDurationMinutes: durationMinutes,
      etaAt: new Date(new Date(departureIso).getTime() + durationMinutes * 60000).toISOString(),
      seats: parseInt(seats, 10),
      availableSeats: parseInt(seats, 10),
      status: TRIP_STATUS.active,
      womenOnly: Boolean(womenOnly),
    });

    setIsSubmitting(true);
    try {
      if (!firebaseReady || !db || !auth) {
        if (recurring) {
          const previews = previewOccurrences.map((d) => ({
            ...baseTripData(toLocalIsoString(d)),
            driverId: 'demo-driver',
            driverEmail: 'demo@autuni.ac.nz',
          }));
          setRecentBatch(previews);
          setMessage(`Demo mode: ${previews.length} recurring trips previewed locally.`);
        } else {
          const tripData = {
            ...baseTripData(departureTime),
            driverId: 'demo-driver',
            driverEmail: 'demo@autuni.ac.nz',
          };
          setRecentTrip(tripData);
          setMessage('Demo mode: Trip preview updated locally.');
        }
        return;
      }

      const user = auth.currentUser;
      if (!user) return;

      if (recurring) {
        const seriesId = `series_${user.uid}_${Date.now()}`;
        const batch = writeBatch(db);
        const tripsCol = collection(db, FIRESTORE_COLLECTIONS.trips);
        const docsToWrite = previewOccurrences.map((d, i) => {
          const ref = doc(tripsCol);
          const data = {
            ...baseTripData(toLocalIsoString(d)),
            driverId: user.uid,
            driverEmail: user.email,
            createdAt: serverTimestamp(),
            recurring: true,
            seriesId,
            seriesIndex: i,
            seriesSize: previewOccurrences.length,
          };
          batch.set(ref, data);
          return data;
        });
        await batch.commit();
        setRecentBatch(docsToWrite);
        setMessage(
          `Success! Published ${docsToWrite.length} recurring trips. They'll appear on your driver dashboard.`,
        );
      } else {
        const tripData = {
          ...baseTripData(departureTime),
          driverId: user.uid,
          driverEmail: user.email,
          createdAt: serverTimestamp(),
        };
        await addDoc(collection(db, FIRESTORE_COLLECTIONS.trips), tripData);
        setRecentTrip(tripData);
        setMessage('Success! Trip published to the feed.');
      }
    } catch (error) {
      setMessage('Error saving trip: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasError = message.startsWith('Error');
  const twoColumns = isDesktop
    ? 'repeat(2, minmax(0, 1fr))'
    : 'repeat(auto-fit, minmax(150px, 1fr))';

  return (
    <div style={{ padding: '22px', textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <span style={{ ...pills.base, ...pills.info }}>
          <span aria-hidden="true">🛣️</span> New trip
        </span>
        {recurring && (
          <span style={{ ...pills.base, ...pills.accent }}>
            <span aria-hidden="true">🔁</span> Weekly
          </span>
        )}
      </div>
      <h2 style={{ ...typography.h2, margin: '10px 0 6px' }}>Publish a trip</h2>
      <p style={{ ...typography.body, margin: '0 0 18px' }}>
        Let passengers find your ride by setting the route, time, and seats.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: twoColumns, gap: '12px' }}>
          <AddressSearch
            label="Origin Address"
            placeholder="e.g. 123 Main St, North Shore"
            onSelect={setOrigin}
            savedAddresses={savedAddresses}
          />
          <AddressSearch
            label="Destination Address"
            placeholder="e.g. AUT City Campus"
            onSelect={setDestination}
            savedAddresses={savedAddresses}
          />
        </div>

        <RouteMap origin={origin} destination={destination} setRouteGeoJson={setRouteGeoJson} />

        <div style={{ display: 'grid', gridTemplateColumns: twoColumns, gap: '12px' }}>
          <Field label="Departure date & time" helper="Must be in the future.">
            <StyledInput
              type="datetime-local"
              value={departureTime}
              onChange={(e) => setDepartureTime(e.target.value)}
              required
            />
          </Field>

          <Field label="Available seats" helper="How many passengers can you take?">
            <StyledInput
              type="number"
              min="1"
              value={seats}
              onChange={(e) => setSeats(e.target.value)}
              required
            />
          </Field>
        </div>

        <Field
          label="Estimated trip duration (minutes)"
          helper="Used to send passengers a safety check-in 10 minutes after the estimated arrival."
        >
          <StyledInput
            type="number"
            min="1"
            value={estimatedDurationMinutes}
            onChange={(e) => setEstimatedDurationMinutes(e.target.value)}
            required
          />
        </Field>

        {/* ─── Recurring trip panel ─────────────────────────────── */}
        <div
          style={{
            borderRadius: radius.lg,
            border: `1.5px solid ${recurring ? 'transparent' : colors.border}`,
            background: recurring
              ? 'linear-gradient(135deg, rgba(15, 118, 110, 0.06), rgba(29, 78, 216, 0.05))'
              : colors.surfaceMuted,
            padding: '16px 18px',
            boxShadow: recurring ? shadows.soft : 'none',
            transition: 'background 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: recurring ? colors.accentGradient : '#ffffff',
                  border: `1px solid ${colors.border}`,
                  fontSize: '1.05rem',
                  color: recurring ? '#ffffff' : colors.textSubtle,
                  transition: 'background 0.2s ease, color 0.2s ease',
                }}
                aria-hidden="true"
              >
                🔁
              </div>
              <div>
                <div style={{ ...typography.h3, marginBottom: 2 }}>Repeat weekly</div>
                <div style={{ ...typography.small, color: colors.textSubtle }}>
                  Auto-publish this trip on the same days each week.
                </div>
              </div>
            </div>

            {/* Toggle switch */}
            <button
              type="button"
              role="switch"
              aria-checked={recurring}
              onClick={() => setRecurring((v) => !v)}
              style={{
                position: 'relative',
                width: 52,
                height: 30,
                borderRadius: radius.pill,
                border: 'none',
                cursor: 'pointer',
                background: recurring ? colors.accentGradient : '#cbd5e1',
                transition: 'background 0.2s ease',
                padding: 0,
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 3,
                  left: recurring ? 25 : 3,
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: '#ffffff',
                  boxShadow: '0 2px 6px rgba(15, 23, 42, 0.2)',
                  transition: 'left 0.2s ease',
                }}
              />
            </button>
          </div>

          {recurring && (
            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={inputs.label}>Days of the week</label>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                  }}
                  role="group"
                  aria-label="Days of the week to repeat on"
                >
                  {DAYS_OF_WEEK.map((day) => (
                    <DayChip
                      key={day.idx}
                      day={day}
                      selected={selectedDays.includes(day.idx)}
                      onToggle={toggleDay}
                    />
                  ))}
                </div>
                <p style={inputs.helper}>Tap each day this trip should run on.</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: twoColumns, gap: '12px' }}>
                <Field
                  label="Number of weeks"
                  helper="How far ahead to publish the series."
                >
                  <StyledSelect
                    value={weeks}
                    onChange={(e) => setWeeks(parseInt(e.target.value, 10))}
                  >
                    {[1, 2, 3, 4, 6, 8, 12].map((w) => (
                      <option key={w} value={w}>
                        {w} week{w === 1 ? '' : 's'}
                      </option>
                    ))}
                  </StyledSelect>
                </Field>
                <Field label="Trips that will be created" helper="Preview of the series total.">
                  <div
                    style={{
                      ...inputs.field,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: '#ffffff',
                    }}
                  >
                    <span style={{ ...typography.h3, color: colors.accent }}>
                      {previewOccurrences.length}
                    </span>
                    <span style={{ ...pills.base, ...pills.accent }}>
                      instance{previewOccurrences.length === 1 ? '' : 's'}
                    </span>
                  </div>
                </Field>
              </div>

              {previewOccurrences.length > 0 && (
                <div
                  style={{
                    border: `1px dashed ${colors.borderStrong}`,
                    borderRadius: radius.md,
                    padding: '12px 14px',
                    background: '#ffffff',
                  }}
                >
                  <div style={{ ...typography.eyebrow, marginBottom: 8 }}>Upcoming dates</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {previewOccurrences.slice(0, 8).map((d) => (
                      <span
                        key={d.toISOString()}
                        style={{
                          ...pills.base,
                          backgroundColor: colors.surfaceMuted,
                          color: colors.text,
                          textTransform: 'none',
                          letterSpacing: 0,
                          fontWeight: 600,
                          fontSize: '0.74rem',
                        }}
                      >
                        {d.toLocaleDateString([], {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                        {' · '}
                        {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    ))}
                    {previewOccurrences.length > 8 && (
                      <span style={{ ...pills.base, ...pills.muted }}>
                        +{previewOccurrences.length - 8} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── Women-only ride panel (female drivers only) ──────── */}
        {driverGender === 'Female' && (
          <div
            style={{
              borderRadius: radius.lg,
              border: `1.5px solid ${womenOnly ? 'transparent' : colors.border}`,
              background: womenOnly
                ? 'linear-gradient(135deg, rgba(217, 70, 239, 0.08), rgba(236, 72, 153, 0.06))'
                : colors.surfaceMuted,
              padding: '16px 18px',
              boxShadow: womenOnly ? shadows.soft : 'none',
              transition: 'background 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: womenOnly
                      ? 'linear-gradient(135deg, #ec4899, #d946ef)'
                      : '#ffffff',
                    border: `1px solid ${colors.border}`,
                    fontSize: '1.05rem',
                    color: womenOnly ? '#ffffff' : colors.textSubtle,
                    transition: 'background 0.2s ease, color 0.2s ease',
                  }}
                  aria-hidden="true"
                >
                  👩
                </div>
                <div>
                  <div style={{ ...typography.h3, marginBottom: 2 }}>Women-only ride</div>
                  <div style={{ ...typography.small, color: colors.textSubtle }}>
                    Hide this trip from male and non-female passengers.
                  </div>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={womenOnly}
                aria-label="Women-only ride"
                onClick={() => setWomenOnly((v) => !v)}
                style={{
                  position: 'relative',
                  width: 52,
                  height: 30,
                  borderRadius: radius.pill,
                  border: 'none',
                  cursor: 'pointer',
                  background: womenOnly
                    ? 'linear-gradient(135deg, #ec4899, #d946ef)'
                    : '#cbd5e1',
                  transition: 'background 0.2s ease',
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 3,
                    left: womenOnly ? 25 : 3,
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: '#ffffff',
                    boxShadow: '0 2px 6px rgba(15, 23, 42, 0.2)',
                    transition: 'left 0.2s ease',
                  }}
                />
              </button>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !origin || !destination || !routeGeoJson}
          style={{
            ...buttons.accent,
            marginTop: '4px',
            opacity: (isSubmitting || !origin || !destination || !routeGeoJson) ? 0.7 : 1,
            cursor: (isSubmitting || !origin || !destination || !routeGeoJson) ? 'not-allowed' : 'pointer',
          }}
        >
          {isSubmitting
            ? 'Publishing…'
            : recurring && previewOccurrences.length > 0
              ? `Publish ${previewOccurrences.length} recurring trips`
              : 'Publish trip'}
        </button>
      </form>

      {message && (
        <p
          style={{
            marginTop: '14px',
            padding: '10px 14px',
            borderRadius: radius.md,
            fontWeight: 600,
            fontSize: '0.88rem',
            color: hasError ? colors.danger : colors.success,
            backgroundColor: hasError ? colors.dangerSoft : colors.successSoft,
          }}
        >
          {message}
        </p>
      )}

      {recentBatch && recentBatch.length > 0 && (
        <div
          style={{
            marginTop: '18px',
            padding: '16px 18px',
            borderRadius: radius.lg,
            background: 'linear-gradient(135deg, rgba(15, 118, 110, 0.08), rgba(29, 78, 216, 0.06))',
            border: `1px solid ${colors.border}`,
            boxShadow: shadows.soft,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ ...typography.eyebrow, color: colors.accent }}>
              Recurring trip series
            </div>
            <span style={{ ...pills.base, ...pills.success }}>
              {recentBatch.length} trips created
            </span>
          </div>
          <div style={{ ...typography.h3, margin: '8px 0 4px' }}>
            {recentBatch[0].origin} → {recentBatch[0].destination}
          </div>
          <div style={{ color: colors.textSubtle, fontSize: '0.86rem', marginBottom: 12 }}>
            Visible on your driver dashboard.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recentBatch.map((t, i) => (
              <div
                key={`${t.departureTime}-${i}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: radius.md,
                  background: '#ffffff',
                  border: `1px solid ${colors.border}`,
                }}
              >
                <div style={{ fontSize: '0.86rem', color: colors.text, fontWeight: 600 }}>
                  {new Date(t.departureTime).toLocaleString([], {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
                <span style={{ ...pills.base, ...pills.accent }}>{t.availableSeats} seats</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {recentTrip && !recentBatch && (
        <div
          style={{
            marginTop: '18px',
            padding: '16px 18px',
            borderRadius: radius.lg,
            background: 'linear-gradient(135deg, rgba(29, 78, 216, 0.08), rgba(15, 118, 110, 0.06))',
            border: `1px solid ${colors.border}`,
            boxShadow: shadows.soft,
          }}
        >
          <div style={{ ...typography.eyebrow, color: colors.info, marginBottom: '8px' }}>
            Live trip feed
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div style={{ ...typography.h3, marginBottom: '4px' }}>
                {recentTrip.origin} → {recentTrip.destination}
              </div>
              <div style={{ color: colors.textSubtle, fontSize: '0.86rem' }}>
                Departs{' '}
                {new Date(recentTrip.departureTime).toLocaleString([], {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
              </div>
            </div>
            <span style={{ ...pills.base, ...pills.success }}>
              {recentTrip.availableSeats} seats
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default CreateTrip;
