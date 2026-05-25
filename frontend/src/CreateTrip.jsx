/**
 * @fileoverview Component for drivers to create and publish new trips.
 * Integrates map routing, address searching, and Firestore database publishing.
 */


import React, { useState } from 'react';
import { db, auth, firebaseReady } from './firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { buttons, colors, inputs, pills, radius, shadows, typography } from './theme';
import { FIRESTORE_COLLECTIONS, TRIP_STATUS } from './firestoreModel';
import useIsDesktop from './hooks/useIsDesktop';
import { AddressSearch, RouteMap } from './components/MapComponents';
import useSavedAddresses from './hooks/useSavedAddresses';

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
 * Main CreateTrip component.
 * Allows authenticated drivers to select origin/destination, calculate routes via map integration,
 * and publish trips to the Firestore database.
 */
function CreateTrip() {
  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);
  const [routeGeoJson, setRouteGeoJson] = useState(null);
  const [departureTime, setDepartureTime] = useState('');
  const [seats, setSeats] = useState(3);
  const [message, setMessage] = useState('');
  const [recentTrip, setRecentTrip] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isDesktop = useIsDesktop();
  const { savedAddresses } = useSavedAddresses();
  /**
   * Validates form inputs and submits the new trip payload to Firestore.
   * Also handles a "demo mode" fallback if Firebase is not connected locally.
   * @param {Event} e - Form submission event.
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');

    if (seats <= 0) {
      setMessage('Error: You must have at least 1 available seat.');
      return;
    }

    const selectedDate = new Date(departureTime);
    const now = new Date();
    if (selectedDate <= now) {
      setMessage('Error: Departure time must be in the future.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (!firebaseReady || !db || !auth) {
        const tripData = {
          driverId: 'demo-driver',
          driverEmail: 'demo@autuni.ac.nz',
          origin: origin.name,
          destination: destination.name,
          originLocation: { lat: origin.lat, lon: origin.lon },
          destinationLocation: { lat: destination.lat, lon: destination.lon },
          routeGeoJson: JSON.stringify(routeGeoJson),
          departureTime,
          seats: parseInt(seats, 10),
          availableSeats: parseInt(seats, 10),
          status: TRIP_STATUS.active,
        };

        setMessage('Demo mode: Trip preview updated locally.');
        setRecentTrip(tripData);
        return;
      }

      const user = auth.currentUser;
      if (!user) return;

      const tripData = {
        driverId: user.uid,
        driverEmail: user.email,
        origin: origin.name,
        destination: destination.name,
        originLocation: { lat: origin.lat, lon: origin.lon },
        destinationLocation: { lat: destination.lat, lon: destination.lon },
        routeGeoJson: JSON.stringify(routeGeoJson),
        departureTime,
        seats: parseInt(seats, 10),
        availableSeats: parseInt(seats, 10),
        status: TRIP_STATUS.active,
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, FIRESTORE_COLLECTIONS.trips), tripData);

      setMessage('Success! Trip published to the feed.');
      setRecentTrip(tripData);
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
          {isSubmitting ? 'Publishing…' : 'Publish trip'}
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

      {recentTrip && (
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
