import React, { useState } from 'react';
import { RouteMap } from './MapComponents';
import { colors, radius, typography, surfaces, buttons, spacing, shadows } from '../theme';
import { TRIP_STATUS } from '../firestoreModel';

export default function ActiveTripManager({ trip, approvedRequests, onUpdateTripStatus, onBack }) {
  const [boardingStatus, setBoardingStatus] = useState({});

  if (!trip) return null;

  const currentStatus = trip.status || TRIP_STATUS.active;
  const isNotStarted = currentStatus === TRIP_STATUS.active || currentStatus === TRIP_STATUS.full;
  const isInProgress = currentStatus === TRIP_STATUS.inProgress;
  const isCompleted = currentStatus === TRIP_STATUS.completed;

  // Build geocoding objects for RouteMap
  const originObject = trip.originLocation 
    ? { lat: parseFloat(trip.originLocation.lat), lon: parseFloat(trip.originLocation.lon), display_name: trip.origin }
    : null;
  const destinationObject = trip.destinationLocation 
    ? { lat: parseFloat(trip.destinationLocation.lat), lon: parseFloat(trip.destinationLocation.lon), display_name: trip.destination }
    : null;

  const handleToggleBoarding = (requestId) => {
    setBoardingStatus((prev) => ({
      ...prev,
      [requestId]: !prev[requestId],
    }));
  };

  // Accessible status settings
  let statusText = 'Scheduled';
  let statusColor = colors.info;
  let statusBg = colors.infoSoft;
  let pulseAnimation = false;

  if (isInProgress) {
    statusText = 'Trip in Progress';
    statusColor = colors.success;
    statusBg = colors.successSoft;
    pulseAnimation = true;
  } else if (isCompleted) {
    statusText = 'Completed';
    statusColor = colors.textMuted;
    statusBg = 'rgba(148, 163, 184, 0.16)';
  }

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {/* Back button & title */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
        <button 
          type="button" 
          onClick={onBack}
          style={{
            ...buttons.ghost,
            padding: '8px 16px',
            fontSize: '0.86rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          ← Back to Dashboard
        </button>
        <span style={{
          padding: '6px 12px',
          borderRadius: radius.pill,
          backgroundColor: statusBg,
          color: statusColor,
          fontWeight: 800,
          fontSize: '0.78rem',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          boxShadow: shadows.soft
        }}>
          {pulseAnimation && (
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: colors.success,
              display: 'inline-block',
              animation: 'pulse 1.5s infinite ease-in-out'
            }} />
          )}
          {statusText}
        </span>
        <style>{`
          @keyframes pulse {
            0% { transform: scale(0.85); opacity: 0.5; }
            50% { transform: scale(1.2); opacity: 1; }
            100% { transform: scale(0.85); opacity: 0.5; }
          }
        `}</style>
      </div>

      {/* Main active trip details card */}
      <div style={{ ...surfaces.card, padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ textAlign: 'left' }}>
          <div style={{ ...typography.eyebrow, color: colors.accent, marginBottom: '4px' }}>Active Carpool</div>
          <h2 style={{ ...typography.display, fontSize: '1.4rem', margin: 0, lineHeight: 1.25 }}>
            {trip.origin} → {trip.destination}
          </h2>
          <p style={{ ...typography.small, margin: '6px 0 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🕒 Departs:</span>
            <span style={{ fontWeight: 600, color: colors.text }}>
              {trip.departureTime ? new Date(trip.departureTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Flexible'}
            </span>
          </p>
        </div>

        {/* Minimal live navigation map */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ ...typography.eyebrow, fontSize: '0.64rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Live route navigation</span>
            {isInProgress && <span style={{ color: colors.success, fontWeight: 700 }}>● Tracking Live GPS</span>}
          </div>
          {originObject && destinationObject ? (
            <RouteMap origin={originObject} destination={destinationObject} />
          ) : (
            <div style={{
              height: '200px',
              backgroundColor: '#e2e8f0',
              borderRadius: radius.md,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: colors.textSubtle,
              ...typography.small
            }}>
              Map unavailable (Missing location coordinates)
            </div>
          )}
        </div>
      </div>

      {/* Large highly accessible control buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <button
          type="button"
          onClick={() => onUpdateTripStatus(TRIP_STATUS.inProgress)}
          disabled={!isNotStarted}
          style={{
            ...buttons.primary,
            padding: '20px 24px',
            fontSize: '1.15rem',
            fontWeight: 800,
            borderRadius: radius.lg,
            border: isNotStarted ? `2px solid ${colors.accent}` : 'none',
            opacity: isNotStarted ? 1 : 0.45,
            cursor: isNotStarted ? 'pointer' : 'not-allowed',
            transform: isNotStarted ? 'scale(1)' : 'none',
            boxShadow: isNotStarted ? '0 12px 28px rgba(15, 118, 110, 0.32)' : 'none',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px'
          }}
        >
          <span style={{ fontSize: '1.4rem' }}>🚀</span>
          <span>Start Trip</span>
        </button>

        <button
          type="button"
          onClick={() => onUpdateTripStatus(TRIP_STATUS.completed)}
          disabled={!isInProgress}
          style={{
            ...buttons.primary,
            background: isInProgress ? 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)' : '#cbd5e1',
            color: isInProgress ? '#ffffff' : '#94a3b8',
            border: isInProgress ? `2px solid #b91c1c` : 'none',
            padding: '20px 24px',
            fontSize: '1.15rem',
            fontWeight: 800,
            borderRadius: radius.lg,
            opacity: isInProgress ? 1 : 0.45,
            cursor: isInProgress ? 'pointer' : 'not-allowed',
            boxShadow: isInProgress ? '0 12px 28px rgba(220, 38, 38, 0.28)' : 'none',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            // Simple pulse effect for high highlight visibility when trip in progress
            animation: isInProgress ? 'pulse-border 2s infinite' : 'none'
          }}
        >
          <span style={{ fontSize: '1.4rem' }}>🏁</span>
          <span>End Trip</span>
        </button>
        <style>{`
          @keyframes pulse-border {
            0% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.5); }
            70% { box-shadow: 0 0 0 10px rgba(220, 38, 38, 0); }
            100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0); }
          }
        `}</style>
      </div>

      {/* Passenger boarding & details section */}
      <div style={{ ...surfaces.innerCard, padding: '18px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div>
          <h3 style={{ ...typography.h3, margin: '0 0 4px', display: 'flex', justifyBetween: 'space-between', width: '100%' }}>
            👥 Passenger Boarding Manifest
          </h3>
          <p style={{ ...typography.small, margin: 0 }}>
            Ensure all students are safely boarded before starting the ride.
          </p>
        </div>

        {approvedRequests.length === 0 ? (
          <div style={{
            padding: '20px',
            backgroundColor: colors.surfaceMuted,
            borderRadius: radius.md,
            textAlign: 'center',
            color: colors.textSubtle,
            border: `1px dashed ${colors.borderStrong}`,
            ...typography.body
          }}>
            No approved passengers for this ride yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {approvedRequests.map((request) => {
              const isBoarded = boardingStatus[request.id] || false;
              return (
                <div
                  key={request.id}
                  onClick={() => handleToggleBoarding(request.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 16px',
                    borderRadius: radius.md,
                    backgroundColor: isBoarded ? colors.successSoft : colors.surfaceSolid,
                    border: `1.5px solid ${isBoarded ? colors.success : colors.border}`,
                    cursor: 'pointer',
                    userSelect: 'none',
                    transition: 'all 0.15s ease',
                    boxShadow: isBoarded ? shadows.soft : 'none'
                  }}
                >
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', minWidth: 0 }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      backgroundColor: isBoarded ? colors.success : colors.accentSoft,
                      color: isBoarded ? '#ffffff' : colors.accent,
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.95rem',
                      flexShrink: 0,
                    }}>
                      {(request.passengerName || request.passengerEmail || 'P').slice(0, 1).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ ...typography.h3, fontSize: '0.92rem', margin: 0, color: colors.text }}>
                        {request.passengerName || request.passengerEmail}
                      </div>
                      <div style={{ color: colors.textSubtle, fontSize: '0.78rem', marginTop: '2px' }}>
                        Pickup: {trip.origin} • Seats: {request.seatsRequested || 1}
                      </div>
                    </div>
                  </div>

                  {/* Accessible extra large checkbox tap-target */}
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    border: `2px solid ${isBoarded ? colors.success : colors.borderStrong}`,
                    backgroundColor: isBoarded ? colors.success : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    flexShrink: 0,
                    transition: 'all 0.15s ease'
                  }}>
                    {isBoarded ? '✓' : ''}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
