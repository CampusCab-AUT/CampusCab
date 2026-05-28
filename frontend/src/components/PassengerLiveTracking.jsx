import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db, firebaseReady } from '../firebase';
import { FIRESTORE_COLLECTIONS } from '../firestoreModel';
import { LiveRouteMap } from './MapComponents';

export default function PassengerLiveTracking({ ride, trip, onBack, onOpenChat }) {
  const [vehicle, setVehicle] = useState(null);
  const [driverProfile, setDriverProfile] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);

  // Fetch driver vehicle details
  useEffect(() => {
    if (!firebaseReady || !trip?.driverId) return;

    const fetchVehicle = async () => {
      try {
        const vehicleRef = doc(db, FIRESTORE_COLLECTIONS.vehicles, trip.driverId);
        const vehicleSnap = await getDoc(vehicleRef);
        if (vehicleSnap.exists()) {
          setVehicle(vehicleSnap.data());
        }
      } catch (err) {
        console.error("Error fetching vehicle details:", err);
      }
    };

    fetchVehicle();
  }, [trip?.driverId]);

  // Fetch driver profile (rating, role)
  useEffect(() => {
    if (!firebaseReady || !trip?.driverId) return;

    const fetchDriverProfile = async () => {
      try {
        const userRef = doc(db, FIRESTORE_COLLECTIONS.users, trip.driverId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          setDriverProfile(userSnap.data());
        }
      } catch (err) {
        console.error("Error fetching driver profile:", err);
      }
    };

    fetchDriverProfile();
  }, [trip?.driverId]);

  // Format ETA duration
  const getEtaText = () => {
    if (!routeInfo) return 'Calculating...';
    const mins = Math.round(routeInfo.duration / 60);
    if (mins <= 0) return 'Arrived / Arriving';
    return `${mins} min${mins > 1 ? 's' : ''}`;
  };

  // Format distance
  const getDistanceText = () => {
    if (!routeInfo) return '--';
    const km = (routeInfo.distance / 1000).toFixed(1);
    return `${km} km`;
  };

  const isTripInProgress = trip?.status === 'in_progress';
  const hasDriverLocation = !!trip?.driverLocation;

  // Pickup location for destination
  const pickupLocation = {
    lat: parseFloat(ride.passengerLatitude),
    lon: parseFloat(ride.passengerLongitude)
  };

  return (
    <div className="relative w-full max-w-md mx-auto h-[844px] bg-slate-950 text-white rounded-[40px] shadow-2xl overflow-hidden border-8 border-slate-900 flex flex-col font-sans select-none">
      
      {/* Status Bar Mockup */}
      <div className="absolute top-0 inset-x-0 h-10 px-6 flex justify-between items-center text-xs text-slate-400 font-semibold z-30 bg-slate-950/60 backdrop-blur-md">
        <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
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
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-slate-900/80 backdrop-blur-md border border-slate-800 flex items-center justify-center text-slate-300 hover:text-white transition-all hover:scale-105 active:scale-95"
          aria-label="Go back"
        >
          <svg className="w-5 h-5 stroke-current fill-none stroke-2" viewBox="0 0 24 24">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Live Trip Status Tag */}
        <div className="flex items-center gap-2">
          {isTripInProgress ? (
            <span className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
              On the Way
            </span>
          ) : (
            <span className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
              Driver Preparing
            </span>
          )}
        </div>
      </div>

      {/* Map Section */}
      <div className="relative w-full h-[480px] bg-slate-900 flex-shrink-0 z-10 overflow-hidden">
        <LiveRouteMap
          origin={trip?.originLocation}
          destination={pickupLocation}
          currentLocation={trip?.driverLocation}
          onRouteUpdate={setRouteInfo}
          height="100%"
          style={{ border: 'none', borderRadius: 0 }}
        />

        {/* Floating ETA glassmorphism Card */}
        <div className="absolute top-24 left-6 right-6 p-4 bg-slate-950/80 backdrop-blur-lg rounded-2xl border border-slate-800/80 shadow-2xl flex items-center justify-between transition-all duration-300 z-[1000]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
              <svg className="w-5 h-5 stroke-current fill-none stroke-2" viewBox="0 0 24 24">
                <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <div className="text-2xs text-slate-400 font-bold uppercase tracking-wider">
                {!isTripInProgress ? "Scheduled Pickup Route" : "Estimated Time to Pickup"}
              </div>
              <div className="text-lg font-extrabold text-slate-100">
                {getEtaText()}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xs text-slate-400 font-bold uppercase tracking-wider">Distance</div>
            <div className="text-lg font-extrabold text-teal-400">{getDistanceText()}</div>
          </div>
        </div>

        {/* Location Connection Status Warning */}
        {!hasDriverLocation && (
          <div className="absolute bottom-6 left-6 right-6 py-2 px-4 bg-amber-500/90 backdrop-blur-md rounded-xl text-center text-xs font-bold text-slate-950 shadow-lg z-[1000] animate-bounce">
            ⚠️ Waiting for driver's live location stream...
          </div>
        )}
      </div>

      {/* Bottom Sheet - Glassmorphism Container */}
      <div className="relative flex-1 bg-gradient-to-b from-slate-900/95 to-slate-950/98 backdrop-blur-xl border-t border-slate-800 z-20 flex flex-col justify-between px-6 pb-8 pt-5 rounded-t-[32px] -mt-6 shadow-2xl">
        {/* Pull Indicator Bar */}
        <div className="w-12 h-1 bg-slate-700 rounded-full mx-auto mb-4 flex-shrink-0" />

        <div className="flex-1 flex flex-col justify-between">
          <div className="space-y-4">
            
            {/* Driver Profile Summary */}
            <div className="flex items-center justify-between p-3.5 bg-slate-800/40 rounded-2xl border border-slate-800/80">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center text-white font-black text-sm shadow-md border border-slate-700/50">
                  {trip?.driverName ? trip.driverName.split(' ').map(n => n[0]).join('').toUpperCase() : 'D'}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                    {trip?.driverName || 'Your Driver'}
                    {driverProfile?.rating && (
                      <span className="text-xs bg-slate-900 px-2 py-0.5 rounded text-teal-400 font-semibold border border-teal-500/20">
                        {driverProfile.rating} ★
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-400">{driverProfile?.role || 'AUT Driver'}</p>
                </div>
              </div>
              
              <button
                onClick={onOpenChat}
                className="px-4 py-2 rounded-xl bg-blue-600/90 hover:bg-blue-600 text-white font-bold text-xs shadow-md border border-blue-500/30 flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95"
              >
                <svg className="w-4 h-4 fill-none stroke-current stroke-2" viewBox="0 0 24 24">
                  <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Chat
              </button>
            </div>

            {/* Vehicle Profile Details Card */}
            <div className="p-4 bg-slate-800/30 border border-slate-800/50 rounded-2xl">
              <div className="text-2xs text-slate-400 font-bold uppercase tracking-wider mb-2">Driver's Vehicle</div>
              {vehicle ? (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-extrabold text-slate-200">
                      {vehicle.color || ''} {vehicle.make || 'Vehicle'} {vehicle.model || ''}
                    </div>
                    {vehicle.year && (
                      <div className="text-xs text-slate-400 mt-0.5">{vehicle.year} Model</div>
                    )}
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1 text-center">
                    <div className="text-[10px] text-slate-500 font-bold uppercase leading-none mb-0.5">NZ Plate</div>
                    <div className="text-xs font-black text-amber-400 tracking-wider uppercase leading-none">{vehicle.licensePlate || 'N/A'}</div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic">Vehicle details loading / unavailable</div>
              )}
            </div>

            {/* Trip Pickup / Destination Timeline */}
            <div className="relative pl-7 space-y-3.5">
              <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-blue-500 to-emerald-500" />
              
              <div className="relative">
                <div className="absolute -left-[20px] top-1 w-2 h-2 rounded-full bg-blue-500 ring-4 ring-blue-500/20" />
                <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Your Pickup Point</div>
                <div className="text-xs font-bold text-slate-200 truncate">{ride.passengerAddress || 'Selected Address'}</div>
              </div>

              <div className="relative">
                <div className="absolute -left-[20px] top-1 w-2 h-2 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
                <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Final Destination</div>
                <div className="text-xs font-bold text-slate-200 truncate">{trip?.destination || 'Destination'}</div>
              </div>
            </div>

          </div>

          {/* Action Buttons */}
          <div className="mt-6">
            <button
              onClick={onBack}
              className="w-full py-3.5 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-bold text-sm transition-all hover:scale-[1.01] active:scale-[0.99] border border-slate-700/50 shadow-md"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
