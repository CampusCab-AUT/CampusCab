import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db, auth, firebaseReady } from '../firebase';
import { FIRESTORE_COLLECTIONS, NOTIFICATION_STATUS, RIDE_REQUEST_STATUS } from '../firestoreModel';
import { RouteMap } from '../components/MapComponents';
import { colors, radius, spacing, typography, surfaces, buttons, inputs, pills } from '../theme';
import { formatNZD } from '../utils/currency';

function formatDeparture(departureTime) {
  if (!departureTime) return 'Departure time unavailable';
  return new Date(departureTime).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function TripDetails({ trip, onBack }) {
  const [driver, setDriver] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [error, setError] = useState('');
  const [seatsToBook, setSeatsToBook] = useState(1);

  useEffect(() => {
    if (!firebaseReady || !db) {
      setLoading(false);
      return;
    }

    const fetchDetails = async () => {
      try {
        const driverRef = doc(db, FIRESTORE_COLLECTIONS.users, trip.driverId);
        const driverSnap = await getDoc(driverRef);
        if (driverSnap.exists()) {
          setDriver(driverSnap.data());
        }

        const vehicleRef = doc(db, FIRESTORE_COLLECTIONS.vehicles, trip.driverId);
        const vehicleSnap = await getDoc(vehicleRef);
        if (vehicleSnap.exists()) {
          setVehicle(vehicleSnap.data());
        }
      } catch (err) {
        console.error('Failed to fetch details:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [trip]);

  const handleBookTrip = async () => {
    if (!firebaseReady || !db || !auth) {
      alert('Demo mode: Booking request simulated.');
      onBack();
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      setError('You must be signed in to book a ride.');
      return;
    }

    setBookingLoading(true);
    setError('');

    try {
      const requestsRef = collection(db, FIRESTORE_COLLECTIONS.rideRequests);
      const requestRef = doc(requestsRef);
      const notificationRef = doc(collection(db, FIRESTORE_COLLECTIONS.notifications));
      const passengerName = user.displayName || 'Passenger';
      const passengerEmail = user.email || '';
      const tripOwnerId = trip.driverId || 'unknown_driver';
      const batch = writeBatch(db);

      batch.set(requestRef, {
        tripId: trip.id,
        tripOwnerId,
        passengerId: user.uid,
        passengerName,
        passengerEmail,
        status: RIDE_REQUEST_STATUS.pending,
        createdAt: serverTimestamp(),
        note: `Requested ${seatsToBook} seat(s)`,
        seatsRequested: seatsToBook,
      });
      
      batch.set(notificationRef, {
        type: 'ride_request',
        recipientId: tripOwnerId,
        tripId: trip.id,
        requestId: requestRef.id,
        passengerId: user.uid,
        passengerName,
        passengerEmail,
        seatsRequested: seatsToBook,
        status: NOTIFICATION_STATUS.unread,
        message: `${passengerName} requested ${seatsToBook} seat(s).`,
        createdAt: serverTimestamp(),
      });

      await batch.commit();

      alert('Booking request sent successfully!');
      onBack();
    } catch (err) {
      console.error(err);
      setError(err.message || 'An error occurred while sending the booking request.');
    } finally {
      setBookingLoading(false);
    }
  };

  return (
    <div style={{ padding: spacing.xl, maxWidth: '800px', margin: '0 auto', width: '100%' }}>
      <button 
        onClick={onBack}
        style={{ ...buttons.ghost, marginBottom: spacing.lg, padding: '8px 12px' }}
      >
        ← Back to Search
      </button>

      {error && (
        <div style={{ padding: spacing.md, backgroundColor: colors.dangerSoft, color: colors.danger, borderRadius: radius.md, marginBottom: spacing.lg, fontWeight: 700 }}>
          {error}
        </div>
      )}

      <div style={{ ...surfaces.card, padding: spacing.xl, marginBottom: spacing.lg }}>
        <div style={{ ...typography.small, color: colors.textSubtle, marginBottom: spacing.xs, fontWeight: 600 }}>
          {formatDeparture(trip.departureTime)}
        </div>
        <h2 style={{ ...typography.display, fontSize: '1.8rem', marginBottom: spacing.md }}>
          {trip.origin} <span style={{ color: colors.textSubtle, fontWeight: 400 }}>to</span> {trip.destination}
        </h2>

        {typeof trip.costPerSeat === 'number' && trip.costPerSeat > 0 && (
          <div
            style={{
              ...pills.base,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: '#ffffff',
              marginBottom: spacing.md,
            }}
            aria-label={`Suggested contribution ${formatNZD(trip.costPerSeat)} per seat`}
          >
            <span aria-hidden="true">💰</span> Contribution {formatNZD(trip.costPerSeat)}/seat
          </div>
        )}

        {/* Route Map */}
        <div style={{ marginBottom: spacing.xl }}>
          <RouteMap origin={trip.originLocation} destination={trip.destinationLocation} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.lg, marginBottom: spacing.xl }}>
          {/* Driver Info */}
          <div style={{ ...surfaces.innerCard, padding: spacing.lg }}>
            <h3 style={{ ...typography.h3, marginBottom: spacing.md }}>Driver</h3>
            {loading ? (
              <p>Loading driver...</p>
            ) : driver ? (
              <div>
                <p style={{ margin: '0 0 8px 0', fontWeight: 600 }}>{driver.displayName || trip.driverEmail}</p>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', backgroundColor: colors.warningSoft, color: colors.warning, borderRadius: radius.pill, fontWeight: 700, fontSize: '0.85rem' }}>
                  ★ {driver.averageRating ? driver.averageRating.toFixed(1) : 'New'} ({driver.totalRatings || 0} rides)
                </div>
              </div>
            ) : (
              <p>{trip.driverEmail}</p>
            )}
          </div>

          {/* Vehicle Info */}
          <div style={{ ...surfaces.innerCard, padding: spacing.lg }}>
            <h3 style={{ ...typography.h3, marginBottom: spacing.md }}>Vehicle</h3>
            {loading ? (
              <p>Loading vehicle...</p>
            ) : vehicle ? (
              <div>
                <p style={{ margin: '0 0 4px 0', fontWeight: 600 }}>{vehicle.color} {vehicle.make} {vehicle.model} ({vehicle.year})</p>
                <div style={{ display: 'inline-flex', padding: '4px 8px', backgroundColor: '#e2e8f0', color: '#334155', borderRadius: '4px', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '1px' }}>
                  {vehicle.licensePlate}
                </div>
              </div>
            ) : (
              <p style={{ color: colors.textSubtle }}>Vehicle info unavailable</p>
            )}
          </div>
        </div>

        {/* Booking Section */}
        <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: spacing.xl, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md }}>
          <div>
            <div style={{ ...typography.h3, marginBottom: '4px' }}>Ready to book?</div>
            <div style={{ color: colors.textSubtle }}>{trip.availableSeats} seat(s) left</div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label htmlFor="seats" style={{ ...inputs.label, marginBottom: 0 }}>Seats</label>
              <input
                id="seats"
                type="number"
                min="1"
                max={trip.availableSeats}
                value={seatsToBook}
                onChange={(e) => setSeatsToBook(Number(e.target.value))}
                style={{ ...inputs.field, width: '70px', padding: '8px', textAlign: 'center' }}
              />
            </div>
            <button 
              onClick={handleBookTrip}
              disabled={bookingLoading}
              style={{ ...buttons.primary, opacity: bookingLoading ? 0.7 : 1 }}
            >
              {bookingLoading ? 'Requesting...' : 'Request to Book'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TripDetails;
