import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db, firebaseReady, auth } from '../firebase';
import {
  FIRESTORE_COLLECTIONS,
  NOTIFICATION_STATUS,
  TRIP_STATUS,
  RIDE_REQUEST_STATUS,
} from '../firestoreModel';
import { colors, radius, spacing, typography, surfaces, buttons, inputs, pills, shadows } from '../theme';
import { AddressSearch, AUT_CAMPUSES } from '../components/MapComponents';
import useSavedAddresses from '../hooks/useSavedAddresses';
import * as turf from '@turf/turf';
import { filterTripsByTimeOfDay } from '../utils/timeFilters';
import { formatNZD } from '../utils/currency';

function isSameDepartureDate(departureTime, selectedDate) {
  return Boolean(departureTime && selectedDate && departureTime.startsWith(selectedDate));
}

function hasAvailableSeats(trip) {
  return Number(trip.availableSeats) > 0;
}

function formatDeparture(departureTime) {
  if (!departureTime) return 'Departure time unavailable';
  return new Date(departureTime).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

const SearchTrips = ({ onTripSelect }) => {
  const [campus, setCampus] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [passengerLocation, setPassengerLocation] = useState(null);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [timeFilter, setTimeFilter] = useState('All');
  const [currentUserGender, setCurrentUserGender] = useState(null);
  const { savedAddresses } = useSavedAddresses();

  useEffect(() => {
    if (!firebaseReady || !db || !auth?.currentUser) return;
    const uid = auth.currentUser.uid;
    getDoc(doc(db, FIRESTORE_COLLECTIONS.users, uid))
      .then((snap) => setCurrentUserGender(snap.exists() ? (snap.data().gender || '') : ''))
      .catch(() => setCurrentUserGender(''));
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    setError('');
    setHasSearched(true);
    setLoading(true);

    try {
      if (!firebaseReady || !db) {
        setTrips([]);
        setError('Demo mode: Firebase is not configured, so hosted trip search is unavailable.');
        return;
      }

      const tripsRef = collection(db, FIRESTORE_COLLECTIONS.trips);
      const q = query(
        tripsRef,
        where('destination', '==', campus),
        where('status', '==', TRIP_STATUS.active)
      );

      const querySnapshot = await getDocs(q);
      const results = [];
      const selectedDateTime = new Date(`${date}T${time}`);
      
      let passengerPt = null;
      if (passengerLocation) {
        passengerPt = turf.point([passengerLocation.lon, passengerLocation.lat]);
      }
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.womenOnly && currentUserGender !== 'Female') return;
        if (isSameDepartureDate(data.departureTime, date) && hasAvailableSeats(data)) {
          const tripDateTime = new Date(data.departureTime);
          const now = new Date();
          if (tripDateTime >= selectedDateTime && tripDateTime > now) {
            
            // Check 10km radius if the trip has a routeGeoJson and passenger provided a location
            let distanceKm = null;
            let withinRange = true;

            if (data.routeGeoJson && passengerPt) {
              const parsedGeoJson = typeof data.routeGeoJson === 'string' ? JSON.parse(data.routeGeoJson) : data.routeGeoJson;
              const routeLine = turf.lineString(parsedGeoJson.coordinates);
              distanceKm = turf.pointToLineDistance(passengerPt, routeLine, { units: 'kilometers' });
              
              if (distanceKm > 10) {
                withinRange = false;
              }
            }
            
            if (withinRange) {
              results.push({ id: doc.id, distanceKm, ...data });
            }
          }
        }
      });

      // Sort by closest time first
      results.sort((a, b) => new Date(a.departureTime) - new Date(b.departureTime));

      setTrips(results);
    } catch (err) {
      console.error(err);
      setError(err.message || 'An error occurred while searching for trips.');
    } finally {
      setLoading(false);
    }
  };

  const filteredTrips = filterTripsByTimeOfDay(trips, timeFilter);

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: spacing.xl }}>
      <div style={{ textAlign: 'center', marginBottom: spacing.xl }}>
        <h2 style={{ ...typography.display, marginBottom: spacing.xs }}>Where to?</h2>
        <p style={{ ...typography.body }}>Find available rides from your campus</p>
      </div>
      
      <form onSubmit={handleSearch} style={{ ...surfaces.card, padding: spacing.xl, marginBottom: spacing.xxl }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg, marginBottom: spacing.xl }}>
          <AddressSearch
            label="Your Pickup Location"
            placeholder="e.g. 123 Main St"
            onSelect={setPassengerLocation}
            savedAddresses={savedAddresses}
          />
          
          <div>
            <label htmlFor="campus" style={{ ...inputs.label }}>Destination Campus</label>
            <select 
              id="campus" 
              value={campus} 
              onChange={(e) => setCampus(e.target.value)} 
              required
              style={{ ...inputs.field, cursor: 'pointer' }}
            >
              <option value="">Select a Campus</option>
              <option value={AUT_CAMPUSES[0].display_name}>City Campus</option>
              <option value={AUT_CAMPUSES[2].display_name}>South Campus</option>
              <option value={AUT_CAMPUSES[1].display_name}>North Campus</option>
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.lg }}>
            <div>
              <label htmlFor="date" style={{ ...inputs.label }}>Departure Date</label>
              <input 
                type="date" 
                id="date" 
                value={date} 
                onChange={(e) => setDate(e.target.value)} 
                required
                style={{ ...inputs.field }}
              />
            </div>
            <div>
              <label htmlFor="time" style={{ ...inputs.label }}>Earliest Time</label>
              <input 
                type="time" 
                id="time" 
                value={time} 
                onChange={(e) => setTime(e.target.value)} 
                required
                style={{ ...inputs.field }}
              />
            </div>
          </div>
        </div>

        <button 
          type="submit" 
          disabled={loading || !campus || !date || !time || !passengerLocation}
          style={{ 
            ...buttons.primary, 
            opacity: (loading || !campus || !date || !time || !passengerLocation) ? 0.7 : 1,
            cursor: (loading || !campus || !date || !time || !passengerLocation) ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Searching...' : 'Search Rides'}
        </button>
      </form>

      {/* Results Section */}
      <div>
        {error && (
          <div style={{ padding: spacing.md, backgroundColor: colors.dangerSoft, color: colors.danger, borderRadius: radius.md, marginBottom: spacing.lg, ...typography.small, fontWeight: 700 }}>
            {error}
          </div>
        )}
        
        {loading && (
          <div style={{ textAlign: 'center', padding: spacing.xl, color: colors.textSubtle }}>
            <p style={{ ...typography.body, fontWeight: 600 }}>Looking for rides...</p>
          </div>
        )}
        
        {!loading && hasSearched && trips.length === 0 && !error && (
          <div style={{ textAlign: 'center', padding: spacing.xl, ...surfaces.innerCard, backgroundColor: 'transparent', borderStyle: 'dashed' }}>
            <p style={{ ...typography.body, color: colors.textSubtle }}>No rides available for this time.</p>
          </div>
        )}
        
        {!loading && hasSearched && trips.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm, flexWrap: 'wrap', gap: spacing.sm }}>
              <h3 style={{ ...typography.h2, margin: 0 }}>Available Rides</h3>
              <div style={{ display: 'flex', gap: spacing.xs }}>
                {['All', 'Morning', 'Afternoon', 'Evening'].map(f => (
                  <button
                    key={f}
                    onClick={() => setTimeFilter(f)}
                    style={{
                      ...pills.base,
                      backgroundColor: timeFilter === f ? colors.primary : colors.surfaceMuted,
                      color: timeFilter === f ? 'white' : colors.text,
                      cursor: 'pointer',
                      border: timeFilter === f ? 'none' : surfaces.innerCard.border,
                      fontWeight: timeFilter === f ? 600 : 400,
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            
            {filteredTrips.length === 0 ? (
              <div style={{ textAlign: 'center', padding: spacing.lg, color: colors.textSubtle, ...surfaces.innerCard }}>
                No rides found for the "{timeFilter}" time filter.
              </div>
            ) : (
              filteredTrips.map((trip) => {
                return (
                  <div 
                    key={trip.id} 
                    onClick={() => {
                      if (onTripSelect) onTripSelect(trip);
                    }}
                    style={{ 
                      ...surfaces.innerCard,
                      padding: spacing.lg,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease-in-out',
                      border: surfaces.innerCard.border,
                      backgroundColor: colors.surfaceMuted,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = colors.surfaceSolid;
                      e.currentTarget.style.boxShadow = shadows.soft;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = colors.surfaceMuted;
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ ...typography.small, color: colors.textSubtle, marginBottom: '4px', fontWeight: 600 }}>
                          {formatDeparture(trip.departureTime)}
                        </div>
                        <div style={{ ...typography.h3, marginBottom: spacing.xs }}>
                          {trip.origin} <span style={{ color: colors.textSubtle }}>→</span> {trip.destination}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.xs }}>
                          {trip.womenOnly && (
                            <div
                              style={{
                                ...pills.base,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                background: 'linear-gradient(135deg, #ec4899, #d946ef)',
                                color: '#ffffff',
                              }}
                            >
                              <span aria-hidden="true">👩</span> Women-only
                            </div>
                          )}
                          {typeof trip.costPerSeat === 'number' && trip.costPerSeat > 0 && (
                            <div
                              style={{
                                ...pills.base,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                background: 'linear-gradient(135deg, #10b981, #059669)',
                                color: '#ffffff',
                              }}
                              aria-label={`Suggested contribution ${formatNZD(trip.costPerSeat)} per seat`}
                            >
                              <span aria-hidden="true">💰</span> {formatNZD(trip.costPerSeat)}/seat
                            </div>
                          )}
                        </div>
                        {trip.distanceKm !== null && (
                          <div style={{ ...typography.small, color: colors.textSubtle, marginTop: '4px' }}>
                            <strong>Proximity:</strong> Approx. {trip.distanceKm.toFixed(1)} km from your pickup location
                          </div>
                        )}
                      </div>
                      <div style={{ ...pills.base, ...pills.accent }}>
                        {trip.availableSeats} seat{trip.availableSeats > 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchTrips;
