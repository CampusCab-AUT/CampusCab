import React, { useState, useEffect, useRef } from 'react';
import { doc, onSnapshot, updateDoc, collection, query, where, getDoc } from 'firebase/firestore';
import { db, firebaseReady } from '../firebase';
import { FIRESTORE_COLLECTIONS, TRIP_STATUS, RIDE_REQUEST_STATUS } from '../firestoreModel';
import { RouteMap, LiveRouteMap } from './MapComponents';
import * as turf from '@turf/turf';

export default function DriverTripView({ tripId, onBackToDashboard }) {
  const [tripState, setTripState] = useState('not_started'); // 'not_started' | 'in_progress' | 'completed'
  const [tripData, setTripData] = useState(null);
  const [approvedPassengers, setApprovedPassengers] = useState([]);
  const [driverLocation, setDriverLocation] = useState(null);

  const isDemo = !firebaseReady || !tripId || tripId === 'demo';

  const lastSyncTimeRef = useRef(0);
  const lastSyncLocRef = useRef(null);

  // Sync driver location to Firestore when in progress
  useEffect(() => {
    if (isDemo || tripState !== 'in_progress' || !tripId || !driverLocation) return;

    const now = Date.now();
    const timeElapsed = now - lastSyncTimeRef.current;
    
    let shouldSync = false;
    if (!lastSyncLocRef.current) {
      shouldSync = true;
    } else {
      const dist = turf.distance(
        turf.point([lastSyncLocRef.current.lon, lastSyncLocRef.current.lat]),
        turf.point([driverLocation.lon, driverLocation.lat]),
        { units: 'meters' }
      );
      // Sync if moved more than 10 meters, or if 10 seconds elapsed and moved at least 2 meters
      if (dist > 10 || (timeElapsed > 10000 && dist > 2)) {
        shouldSync = true;
      }
    }

    // Rate-limit sync to once every 5 seconds minimum
    if (shouldSync && timeElapsed >= 5000) {
      lastSyncTimeRef.current = now;
      lastSyncLocRef.current = driverLocation;

      const tripRef = doc(db, FIRESTORE_COLLECTIONS.trips, tripId);
      updateDoc(tripRef, {
        driverLocation: driverLocation,
        locationUpdatedAt: new Date().toISOString()
      }).catch(err => {
        console.error("Error updating driver location in Firestore:", err);
      });
    }
  }, [driverLocation, tripState, tripId, isDemo]);

  // Geolocation tracking
  useEffect(() => {
    if (!navigator.geolocation) return;

    const handleSuccess = (position) => {
      setDriverLocation({
        lat: position.coords.latitude,
        lon: position.coords.longitude,
      });
    };

    const handleError = (error) => {
      console.error('Error getting driver geolocation:', error);
    };

    // Get initial position
    navigator.geolocation.getCurrentPosition(handleSuccess, handleError);

    // Watch position
    const watchId = navigator.geolocation.watchPosition(handleSuccess, handleError, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 5000,
    });

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Listen to trip status
  useEffect(() => {
    if (isDemo) return;

    const tripRef = doc(db, FIRESTORE_COLLECTIONS.trips, tripId);
    const unsubscribe = onSnapshot(tripRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setTripData(data);
        const status = data.status;
        if (status === 'in_progress') {
          setTripState('in_progress');
        } else if (status === 'completed') {
          setTripState('completed');
        } else {
          setTripState('not_started');
        }
      }
    });

    return () => unsubscribe();
  }, [tripId, isDemo]);

  // Listen to approved passengers
  useEffect(() => {
    if (isDemo) return;

    const q = query(
      collection(db, FIRESTORE_COLLECTIONS.rideRequests),
      where('tripId', '==', tripId),
      where('status', '==', RIDE_REQUEST_STATUS.approved)
    );

    const unsubscribe = onSnapshot(q, async (querySnapshot) => {
      const requests = [];
      for (const d of querySnapshot.docs) {
        const reqData = d.data();
        const passengerId = reqData.passengerId;
        let profile = { displayName: 'Passenger', role: 'Student', rating: '5.0' };
        if (passengerId) {
          try {
            const userDoc = await getDoc(doc(db, FIRESTORE_COLLECTIONS.users, passengerId));
            if (userDoc.exists()) {
              const uData = userDoc.data();
              profile = {
                displayName: uData.displayName || uData.name || 'Passenger',
                role: uData.role || 'Student',
                rating: uData.rating || '5.0',
              };
            }
          } catch (e) {
            console.error('Error fetching passenger profile:', e);
          }
        }
        requests.push({
          id: d.id,
          ...reqData,
          passengerName: profile.displayName,
          passengerRole: profile.role,
          passengerRating: profile.rating,
        });
      }
      setApprovedPassengers(requests);
    });

    return () => unsubscribe();
  }, [tripId, isDemo]);

  const handleStartTrip = async () => {
    if (isDemo) {
      if (tripState === 'not_started') {
        setTripState('in_progress');
      }
      return;
    }

    try {
      const tripRef = doc(db, FIRESTORE_COLLECTIONS.trips, tripId);
      await updateDoc(tripRef, {
        status: 'in_progress',
        startedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.error('Error starting trip in Firestore:', e);
    }
  };

  const handleEndTrip = async () => {
    if (isDemo) {
      if (tripState === 'in_progress') {
        setTripState('completed');
      }
      return;
    }

    try {
      const tripRef = doc(db, FIRESTORE_COLLECTIONS.trips, tripId);
      await updateDoc(tripRef, {
        status: 'completed',
        endedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.error('Error ending trip in Firestore:', e);
    }
  };

  const handleResetDemo = () => {
    if (isDemo) {
      setTripState('not_started');
    }
  };

  // Construct active passenger data
  let activePassenger = null;
  if (isDemo) {
    activePassenger = {
      name: 'Jamie Chen',
      avatarInitials: 'JC',
      rating: '4.9',
      role: 'Undergrad Student',
      pickup: 'AUT City Campus (WG Building)',
      dropoff: 'AUT North Shore Campus (AL Block)',
      seats: 2,
      fareShare: '$8.50',
      eta: '18 mins',
      distance: '12.4 km'
    };
  } else if (approvedPassengers.length > 0) {
    const pickupLoc = tripData?.origin || 'Pickup Point';
    const dropoffLoc = tripData?.destination || 'Drop-off Point';
    const totalSeats = approvedPassengers.reduce((sum, r) => sum + (r.seatsRequested || 1), 0);
    
    if (approvedPassengers.length === 1) {
      const p = approvedPassengers[0];
      activePassenger = {
        name: p.passengerName,
        avatarInitials: p.passengerName.split(' ').map(n => n[0]).join('').toUpperCase() || 'P',
        rating: p.passengerRating,
        role: p.passengerRole,
        pickup: p.passengerAddress || pickupLoc,
        dropoff: dropoffLoc,
        seats: totalSeats,
        fareShare: 'Free',
        eta: '18 mins',
        distance: '12.4 km'
      };
    } else {
      activePassenger = {
        name: `${approvedPassengers.length} Passengers`,
        avatarInitials: '👥',
        rating: '5.0',
        role: 'Carpool Group',
        pickup: pickupLoc,
        dropoff: dropoffLoc,
        seats: totalSeats,
        fareShare: 'Free',
        eta: '18 mins',
        distance: '12.4 km'
      };
    }
  } else {
    activePassenger = {
      name: 'No Approved Passengers',
      avatarInitials: 'NP',
      rating: 'N/A',
      role: 'Waiting for approved riders',
      pickup: tripData?.origin || 'Pickup Point',
      dropoff: tripData?.destination || 'Drop-off Point',
      seats: 0,
      fareShare: '$0.00',
      eta: '-',
      distance: '-'
    };
  }

  const cityCampus = { lat: -36.8532, lon: 174.7666 };
  const northCampus = { lat: -36.8016, lon: 174.7497 };

  const originLoc = isDemo 
    ? cityCampus 
    : (tripData?.originLocation || cityCampus);

  const destLoc = isDemo 
    ? northCampus 
    : (tripData?.destinationLocation || northCampus);

  // Determine actual route coordinates dynamically
  let routeOrigin = driverLocation || originLoc;
  let routeDestination = destLoc;

  if (tripState === 'not_started') {
    let pickupCoords = null;
    if (!isDemo && approvedPassengers.length > 0) {
      const pWithCoords = approvedPassengers.find(p => p.passengerLatitude && p.passengerLongitude);
      if (pWithCoords) {
        pickupCoords = { lat: pWithCoords.passengerLatitude, lon: pWithCoords.passengerLongitude };
      }
    }
    routeDestination = pickupCoords || originLoc;
  } else {
    routeDestination = destLoc;
  }

  return (
    <div className="relative w-full max-w-md mx-auto h-[844px] bg-slate-950 text-white rounded-[40px] shadow-2xl overflow-hidden border-8 border-slate-900 flex flex-col font-sans select-none">
      
      {/* Status Bar Mockup */}
      <div className="absolute top-0 inset-x-0 h-10 px-6 flex justify-between items-center text-xs text-slate-400 font-semibold z-30 bg-slate-950/60 backdrop-blur-md">
        <span>18:42</span>
        <div className="flex items-center gap-1.5">
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4.35 19.4c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l1.9-1.9C9.17 19.64 10.53 20 12 20c4.97 0 9-4.03 9-9s-4.03-9-9-9zm0 15c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z"/>
          </svg>
          <span>5G</span>
          <div className="w-5 h-2.5 border border-slate-400 rounded-sm p-0.5 flex items-center">
            <div className="h-full w-full bg-slate-400 rounded-2xs"></div>
          </div>
        </div>
      </div>

      {/* Screen Header */}
      <div className="absolute top-10 inset-x-0 px-6 py-4 flex items-center justify-between z-30 bg-gradient-to-b from-slate-950/90 to-transparent">
        <button 
          onClick={onBackToDashboard}
          className="w-10 h-10 rounded-full bg-slate-900/80 backdrop-blur-md border border-slate-800 flex items-center justify-center text-slate-300 hover:text-white transition-all hover:scale-105 active:scale-95"
          aria-label="Go back"
        >
          <svg className="w-5 h-5 stroke-current fill-none stroke-2" viewBox="0 0 24 24">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Live Trip Status Tag */}
        <div className="flex items-center gap-2">
          {tripState === 'not_started' && (
            <span className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1.5 animate-pulse">
              <span className="h-2 w-2 rounded-full bg-amber-500"></span>
              Ready to Start
            </span>
          )}
          {tripState === 'in_progress' && (
            <span className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
              Trip in Progress
            </span>
          )}
          {tripState === 'completed' && (
            <span className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-indigo-500"></span>
              Trip Completed
            </span>
          )}
        </div>
      </div>

      {/* Map Section */}
      <div className="relative w-full h-[460px] bg-slate-900 flex-shrink-0 z-10 overflow-hidden">
        {tripState === 'in_progress' ? (
          <LiveRouteMap
            origin={originLoc}
            destination={destLoc}
            currentLocation={driverLocation}
            height="100%"
            style={{ border: 'none', borderRadius: 0 }}
          />
        ) : (
          <RouteMap 
            origin={routeOrigin} 
            destination={routeDestination} 
            height="100%" 
            style={{ border: 'none', borderRadius: 0 }}
          />
        )}

        {/* Minimal Directions overlay */}
        <div className="absolute top-24 left-6 right-6 p-4 bg-slate-950/85 backdrop-blur-lg rounded-2xl border border-slate-800 shadow-lg flex items-center gap-4 transition-all duration-300 z-[1000]">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
            <svg className="w-5 h-5 stroke-current fill-none stroke-2" viewBox="0 0 24 24">
              <path d="M9 11l3-3 3 3m-3-3v8" />
            </svg>
          </div>
          <div>
            <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
              {tripState === 'not_started' && 'Pickup Destination'}
              {tripState === 'in_progress' && 'Navigation Active'}
              {tripState === 'completed' && 'Trip Completed'}
            </div>
            <div className="text-sm font-bold text-slate-100">
              {tripState === 'not_started' && `Head to ${activePassenger.name}'s pickup location`}
              {tripState === 'in_progress' && `Heading to drop-off: ${activePassenger.dropoff}`}
              {tripState === 'completed' && 'Thank you for driving!'}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Sheet - Glassmorphism Container */}
      <div className="relative flex-1 bg-gradient-to-b from-slate-900/95 to-slate-950/98 backdrop-blur-xl border-t border-slate-800 z-20 flex flex-col justify-between px-6 pb-8 pt-5 rounded-t-[32px] -mt-6 shadow-2xl">
        
        {/* Pull Indicator Bar */}
        <div className="w-12 h-1 bg-slate-700 rounded-full mx-auto mb-4 flex-shrink-0" />

        {tripState !== 'completed' ? (
          <>
            {/* Trip Info Layer */}
            <div className="space-y-4">
              {/* Passenger Card */}
              <div className="flex items-center justify-between p-3.5 bg-slate-800/40 rounded-2xl border border-slate-800/80">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center text-white font-black text-sm shadow-md border border-slate-700/50">
                    {activePassenger.avatarInitials}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-100 flex items-center gap-1.5 font-sans">
                      {activePassenger.name}
                      {activePassenger.rating !== 'N/A' && (
                        <span className="text-xs bg-slate-900 px-2 py-0.5 rounded text-teal-400 font-semibold border border-teal-500/20">
                          {activePassenger.rating} ★
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-400">{activePassenger.role}</p>
                  </div>
                </div>
                
                <div className="text-right font-sans">
                  <span className="text-xs bg-teal-500/10 text-teal-400 font-bold px-2.5 py-1 rounded-full border border-teal-500/20">
                    {activePassenger.seats} Seats Booked
                  </span>
                  <div className="text-xs text-slate-400 mt-1 font-semibold">Share: {activePassenger.fareShare}</div>
                </div>
              </div>

              {/* Waypoints timeline */}
              <div className="relative pl-7 space-y-4">
                {/* Visual timeline line */}
                <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-blue-500 to-emerald-500" />

                {/* Pickup node */}
                <div className="relative">
                  <div className="absolute -left-[20px] top-1.5 w-2 h-2 rounded-full bg-blue-500 ring-4 ring-blue-500/20" />
                  <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Pickup Point</div>
                  <div className="text-sm font-bold text-slate-200 truncate">{activePassenger.pickup}</div>
                </div>

                {/* Dropoff node */}
                <div className="relative">
                  <div className="absolute -left-[20px] top-1.5 w-2 h-2 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
                  <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Drop-off Destination</div>
                  <div className="text-sm font-bold text-slate-200 truncate">{activePassenger.dropoff}</div>
                </div>
              </div>
            </div>

            {/* Trip Action Buttons Container */}
            <div className="mt-5 space-y-3">
              <div className="grid grid-cols-2 gap-4">
                {/* Start Trip Button */}
                <button
                  onClick={handleStartTrip}
                  disabled={tripState !== 'not_started'}
                  className={`w-full py-4 rounded-2xl font-bold text-base transition-all duration-300 flex flex-col items-center justify-center gap-1 shadow-lg
                    ${tripState === 'not_started' 
                      ? 'bg-gradient-to-r from-teal-500 to-blue-600 text-white shadow-teal-500/20 hover:scale-[1.02] hover:brightness-110 active:scale-[0.98]' 
                      : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                    }`}
                >
                  <span className="text-lg">▶</span>
                  <span>Start Trip</span>
                </button>

                {/* End Trip Button */}
                <button
                  onClick={handleEndTrip}
                  disabled={tripState !== 'in_progress'}
                  className={`w-full py-4 rounded-2xl font-bold text-base transition-all duration-300 flex flex-col items-center justify-center gap-1 shadow-lg
                    ${tripState === 'in_progress' 
                      ? 'bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-red-500/20 hover:scale-[1.02] hover:brightness-110 active:scale-[0.98] animate-[pulse_1.5s_infinite]' 
                      : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                    }`}
                >
                  <span className="text-lg">■</span>
                  <span>End Trip</span>
                </button>
              </div>

              {/* Trip Metadata Footer */}
              <div className="flex justify-between items-center text-xs text-slate-500 font-semibold px-1 mt-2">
                <span>Distance: {activePassenger.distance}</span>
                <span>Est. Time: {activePassenger.eta}</span>
              </div>
            </div>
          </>
        ) : (
          /* Completed Trip Summary State */
          <div className="flex-1 flex flex-col justify-between py-2">
            <div className="text-center space-y-4">
              {/* Big Success Icon */}
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto animate-bounce shadow-md">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <div>
                <h2 className="text-xl font-extrabold text-slate-100">Trip Completed!</h2>
                <p className="text-xs text-slate-400 mt-1">Excellent driving. The passenger was safely dropped off.</p>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-2 bg-slate-800/40 border border-slate-800 p-4 rounded-2xl">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Earned</div>
                  <div className="text-base font-bold text-teal-400 mt-0.5">{activePassenger.fareShare}</div>
                </div>
                <div className="border-x border-slate-700/50">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Distance</div>
                  <div className="text-base font-bold text-slate-200 mt-0.5">{activePassenger.distance}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Duration</div>
                  <div className="text-base font-bold text-slate-200 mt-0.5">16 mins</div>
                </div>
              </div>

              {/* Rating Teaser */}
              <div className="text-center p-3 bg-slate-800/20 rounded-xl border border-slate-800/50 text-xs text-slate-400">
                You will be able to rate <span className="text-slate-200 font-bold">{activePassenger.name}</span> in the passenger moderation panel.
              </div>
            </div>

            <div className="space-y-3 mt-6">
              <button
                onClick={onBackToDashboard}
                className="w-full py-3.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-sm transition-all hover:scale-[1.01] active:scale-[0.99] shadow-md"
              >
                Back to Dashboard
              </button>

              {isDemo && (
                <button
                  onClick={handleResetDemo}
                  className="w-full py-2 bg-slate-950 text-slate-500 hover:text-slate-400 text-xs font-semibold rounded-lg hover:underline transition-all"
                >
                  Restart Demo Trip
                </button>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
