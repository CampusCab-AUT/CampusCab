import React, { useEffect, useMemo, useState } from 'react';
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db, firebaseReady, vapidKey } from '../firebase';
import {
  FIRESTORE_COLLECTIONS,
  NOTIFICATION_STATUS,
  RIDE_REQUEST_STATUS,
  TRIP_STATUS,
} from '../firestoreModel';
import useIsDesktop from '../hooks/useIsDesktop';
import { buttons, colors, pills, radius, shadows, typography } from '../theme';
import { registerBrowserPushToken } from '../utils/pushNotifications';
import ReportUserModal from '../components/ReportUserModal';

function getTripTimeValue(trip) {
  const date = trip.createdAt?.toDate?.() || new Date(trip.createdAt || trip.departureTime || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function getInitials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || '').join('') || '?';
}

function PassengerAvatar({ src, name, size = 36 }) {
  const dim = `${size}px`;
  if (src) {
    return (
      <img
        src={src}
        alt={name || 'Passenger avatar'}
        style={{
          width: dim,
          height: dim,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
          border: '1px solid rgba(0,0,0,0.08)',
        }}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      style={{
        width: dim,
        height: dim,
        borderRadius: '50%',
        backgroundColor: 'rgba(29, 78, 216, 0.12)',
        color: '#1d4ed8',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: `${Math.max(12, Math.floor(size * 0.4))}px`,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {getInitials(name)}
    </div>
  );
}

function TripPassengersModal({ trip, approvedRequests, passengerProfiles, onClose }) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const remainingSeats = Number.isFinite(trip.availableSeats) ? trip.availableSeats : trip.seats;
  const totalSeats = trip.seats ?? 0;
  const isFull = (trip.status || '').toLowerCase() === TRIP_STATUS.full || remainingSeats === 0;

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        zIndex: 80,
        opacity: entered ? 1 : 0,
        transition: 'opacity 180ms ease',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="trip-passengers-title"
        onClick={(event) => event.stopPropagation()}
        style={{
          backgroundColor: '#fff',
          borderRadius: '22px',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 40px 100px -20px rgba(15, 23, 42, 0.55), 0 8px 24px -8px rgba(15, 23, 42, 0.25)',
          transform: entered ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.97)',
          opacity: entered ? 1 : 0,
          transition: 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1), opacity 220ms ease',
        }}
      >
        <div
          style={{
            position: 'relative',
            padding: '26px 26px 22px',
            background: colors.accentGradient,
            color: '#fff',
            overflow: 'hidden',
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: '-60px',
              right: '-40px',
              width: '220px',
              height: '220px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 70%)',
              pointerEvents: 'none',
            }}
          />
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              bottom: '-80px',
              left: '-50px',
              width: '200px',
              height: '200px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 70%)',
              pointerEvents: 'none',
            }}
          />

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              width: '34px',
              height: '34px',
              borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.25)',
              background: 'rgba(255,255,255,0.14)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '17px',
              fontWeight: 700,
              lineHeight: 1,
              backdropFilter: 'blur(4px)',
              transition: 'background-color 0.15s ease',
              zIndex: 2,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.28)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.14)';
            }}
          >
            ✕
          </button>

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.7rem',
                fontWeight: 800,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                padding: '5px 10px',
                borderRadius: radius.pill,
                background: 'rgba(255,255,255,0.18)',
                color: '#fff',
                marginBottom: '14px',
              }}
            >
              <span aria-hidden="true">●</span> Trip details
            </div>
            <h2
              id="trip-passengers-title"
              style={{
                margin: 0,
                fontSize: '1.4rem',
                fontWeight: 900,
                lineHeight: 1.25,
                color: '#fff',
                letterSpacing: '-0.01em',
              }}
            >
              {trip.origin || 'Unknown origin'}
              <span style={{ opacity: 0.7, margin: '0 8px' }} aria-hidden="true">→</span>
              {trip.destination || 'Unknown destination'}
            </h2>
            <div
              style={{
                marginTop: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.88rem',
                opacity: 0.92,
                fontWeight: 600,
              }}
            >
              <span aria-hidden="true">🗓</span>
              <span>{formatTripDeparture(trip.departureTime)}</span>
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: '10px',
            padding: '18px 22px 4px',
          }}
        >
          {[
            { label: 'Seats left', value: remainingSeats ?? '—' },
            { label: 'Total seats', value: totalSeats || '—' },
            { label: 'Status', value: isFull ? 'Full' : trip.status || TRIP_STATUS.active },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                padding: '12px 14px',
                borderRadius: radius.md,
                backgroundColor: colors.surfaceMuted,
                border: `1px solid ${colors.border}`,
              }}
            >
              <div
                style={{
                  fontSize: '0.66rem',
                  fontWeight: 800,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: colors.textSubtle,
                  marginBottom: '4px',
                }}
              >
                {stat.label}
              </div>
              <div
                style={{
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  color: colors.text,
                  textTransform: stat.label === 'Status' ? 'capitalize' : 'none',
                }}
              >
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            padding: '14px 22px 22px',
            overflowY: 'auto',
            minHeight: 0,
            flex: 1,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: '0.95rem',
                fontWeight: 800,
                color: colors.text,
                letterSpacing: '-0.005em',
              }}
            >
              Approved passengers
            </h3>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                padding: '4px 10px',
                borderRadius: radius.pill,
                background: 'rgba(21, 128, 61, 0.12)',
                color: colors.success,
                border: '1px solid rgba(21, 128, 61, 0.22)',
              }}
            >
              {approvedRequests.length}
            </span>
          </div>

          {approvedRequests.length === 0 ? (
            <div
              style={{
                padding: '40px 20px',
                borderRadius: radius.lg,
                border: `1.5px dashed ${colors.borderStrong}`,
                backgroundColor: colors.surfaceMuted,
                textAlign: 'center',
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  width: '56px',
                  height: '56px',
                  margin: '0 auto 12px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, rgba(29, 78, 216, 0.12), rgba(15, 118, 110, 0.12))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                }}
              >
                👥
              </div>
              <div style={{ fontWeight: 800, color: colors.text, marginBottom: '4px' }}>
                No passengers yet
              </div>
              <div style={{ fontSize: '0.86rem', color: colors.textSubtle }}>
                Approved passengers will appear here once you accept their requests.
              </div>
            </div>
          ) : (
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              {approvedRequests.map((request) => {
                const profile = passengerProfiles[request.passengerId] || {};
                const name =
                  profile.displayName ||
                  request.passengerName ||
                  request.passengerEmail ||
                  'Passenger';
                return (
                  <li
                    key={request.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      padding: '12px 14px',
                      borderRadius: radius.lg,
                      backgroundColor: colors.surfaceSolid,
                      border: `1px solid ${colors.border}`,
                      transition: 'background-color 0.15s ease, border-color 0.15s ease, transform 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = colors.surfaceMuted;
                      e.currentTarget.style.borderColor = 'rgba(29, 78, 216, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = colors.surfaceSolid;
                      e.currentTarget.style.borderColor = colors.border;
                    }}
                  >
                    <div
                      style={{
                        position: 'relative',
                        padding: '2px',
                        borderRadius: '50%',
                        background: colors.accentGradient,
                        flexShrink: 0,
                      }}
                    >
                      <div style={{ background: '#fff', borderRadius: '50%', padding: '2px' }}>
                        <PassengerAvatar src={profile.avatarUrl} name={name} size={44} />
                      </div>
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          margin: 0,
                          fontWeight: 800,
                          fontSize: '0.95rem',
                          color: colors.text,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {name}
                      </div>
                      {request.passengerEmail ? (
                        <div
                          style={{
                            margin: '2px 0 0',
                            fontSize: '0.8rem',
                            color: colors.textSubtle,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {request.passengerEmail}
                        </div>
                      ) : null}
                    </div>
                    {request.seatsRequested ? (
                      <span
                        style={{
                          flexShrink: 0,
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          padding: '5px 9px',
                          borderRadius: radius.pill,
                          background: 'rgba(29, 78, 216, 0.08)',
                          color: colors.info,
                          border: '1px solid rgba(29, 78, 216, 0.18)',
                        }}
                      >
                        {request.seatsRequested} seat{request.seatsRequested > 1 ? 's' : ''}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div
          style={{
            padding: '14px 22px 18px',
            borderTop: `1px solid ${colors.border}`,
            backgroundColor: colors.surfaceMuted,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%',
              border: 'none',
              borderRadius: radius.pill,
              padding: '12px 18px',
              fontSize: '0.92rem',
              fontWeight: 800,
              cursor: 'pointer',
              background: colors.accentGradient,
              color: '#fff',
              boxShadow: '0 8px 22px -6px rgba(15, 118, 110, 0.45)',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 12px 28px -6px rgba(15, 118, 110, 0.55)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = '';
              e.currentTarget.style.boxShadow = '0 8px 22px -6px rgba(15, 118, 110, 0.45)';
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function formatTripDeparture(departureTime) {
  if (!departureTime) return 'Departure not set';

  const date = new Date(departureTime);
  if (Number.isNaN(date.getTime())) return departureTime;

  return date.toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function DriverDashboard({ onOpenLiveTrip }) {
  const [trips, setTrips] = useState([]);
  const [requests, setRequests] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [message, setMessage] = useState('');
  const [busyRequestId, setBusyRequestId] = useState('');
  const [busyTripId, setBusyTripId] = useState('');
  const [tripToCancel, setTripToCancel] = useState(null);
  const [reportTarget, setReportTarget] = useState(null);
  const [reportedPassengerIds, setReportedPassengerIds] = useState([]);
  const [passengerProfiles, setPassengerProfiles] = useState({});
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [footageFormState, setFootageFormState] = useState({});
  const [pushStatus, setPushStatus] = useState('idle');
  const [pushMessage, setPushMessage] = useState('');
  const isDesktop = useIsDesktop();

  useEffect(() => {
    if (!firebaseReady || !auth || !db) {
      setTrips([
        {
          id: 'demo-trip-1',
          origin: 'North Shore',
          destination: 'City Campus',
          departureTime: new Date(Date.now() + 1000 * 60 * 60 * 3).toISOString(),
          availableSeats: 2,
          seats: 2,
          status: TRIP_STATUS.active,
        },
      ]);
      setRequests([
        {
          id: 'demo-request-1',
          tripId: 'demo-trip-1',
          passengerName: 'Jamie Chen',
          passengerEmail: 'jamie.chen@autuni.ac.nz',
          note: 'I can meet near the main gate.',
          status: RIDE_REQUEST_STATUS.pending,
        },
        {
          id: 'demo-request-2',
          tripId: 'demo-trip-1',
          passengerName: 'Taylor Singh',
          passengerEmail: 'taylor.singh@autuni.ac.nz',
          note: 'Happy to chip in for parking.',
          status: RIDE_REQUEST_STATUS.approved,
        },
      ]);
      setNotifications([
        {
          id: 'demo-notification-1',
          type: 'ride_request',
          passengerName: 'Jamie Chen',
          seatsRequested: 1,
          status: NOTIFICATION_STATUS.unread,
          message: 'Jamie Chen requested 1 seat.',
        },
      ]);
      return undefined;
    }

    const user = auth.currentUser;
    if (!user) return undefined;

    const tripsQuery = query(
      collection(db, FIRESTORE_COLLECTIONS.trips),
      where('driverId', '==', user.uid),
    );
    const requestsQuery = query(
      collection(db, FIRESTORE_COLLECTIONS.rideRequests),
      where('tripOwnerId', '==', user.uid),
    );
    const notificationsQuery = query(
      collection(db, FIRESTORE_COLLECTIONS.notifications),
      where('recipientId', '==', user.uid),
      where('status', '==', NOTIFICATION_STATUS.unread),
    );

    const unsubscribeTrips = onSnapshot(tripsQuery, (snapshot) => {
      const tripDocs = snapshot.docs.map((tripDoc) => ({ id: tripDoc.id, ...tripDoc.data() }));
      setTrips(tripDocs);
    });

    const unsubscribeRequests = onSnapshot(requestsQuery, (snapshot) => {
      const requestDocs = snapshot.docs.map((requestDoc) => ({
        id: requestDoc.id,
        ...requestDoc.data(),
      }));
      setRequests(requestDocs);
    });

    const unsubscribeNotifications = onSnapshot(notificationsQuery, (snapshot) => {
      const notificationDocs = snapshot.docs.map((notificationDoc) => ({
        id: notificationDoc.id,
        ...notificationDoc.data(),
      }));
      setNotifications(notificationDocs);
    });

    return () => {
      unsubscribeTrips();
      unsubscribeRequests();
      unsubscribeNotifications();
    };
  }, []);

  useEffect(() => {
    if (!firebaseReady || !auth || !db) {
      setPushStatus('unavailable');
      setPushMessage('Push notifications need Firebase to be configured.');
      return;
    }

    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setPushStatus('unavailable');
      setPushMessage('This browser does not support push notifications.');
      return;
    }

    if (!vapidKey) {
      setPushStatus('unavailable');
      setPushMessage('Missing VITE_FIREBASE_VAPID_KEY. Add the Firebase Web Push certificate key first.');
      return;
    }

    if (Notification.permission === 'denied') {
      setPushStatus('denied');
      setPushMessage('Browser notifications are blocked. Update browser permissions to enable them.');
      return;
    }

    if (Notification.permission === 'granted') {
      setPushStatus('idle');
      setPushMessage('Push permission is allowed. Refresh this browser registration.');
      return;
    }

    setPushStatus('idle');
    setPushMessage('Enable browser alerts for new passenger ride requests.');
  }, []);

  const tripsById = useMemo(
    () =>
      trips.reduce((accumulator, trip) => {
        accumulator[trip.id] = trip;
        return accumulator;
      }, {}),
    [trips],
  );

  const driverTrips = useMemo(
    () =>
      trips
        .filter((trip) => {
          const status = (trip.status || TRIP_STATUS.active).toLowerCase();
          return (
            status === TRIP_STATUS.active ||
            status === TRIP_STATUS.full ||
            status === 'in_progress'
          );
        })
        .sort((a, b) => getTripTimeValue(b) - getTripTimeValue(a)),
    [trips],
  );

  const pendingRequests = useMemo(
    () =>
      requests
        .filter((request) => (request.status || '').toLowerCase() === RIDE_REQUEST_STATUS.pending)
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)),
    [requests],
  );

  const approvedRequests = useMemo(
    () => requests.filter((request) => (request.status || '').toLowerCase() === RIDE_REQUEST_STATUS.approved),
    [requests],
  );

  const approvedByTripId = useMemo(() => {
    const map = {};
    for (const request of approvedRequests) {
      if (!request.tripId) continue;
      if (!map[request.tripId]) map[request.tripId] = [];
      map[request.tripId].push(request);
    }
    return map;
  }, [approvedRequests]);

  useEffect(() => {
    if (!firebaseReady || !db) return undefined;
    const missingIds = Array.from(
      new Set(
        approvedRequests
          .map((request) => request.passengerId)
          .filter((id) => id && !(id in passengerProfiles)),
      ),
    );
    if (missingIds.length === 0) return undefined;

    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        missingIds.map(async (passengerId) => {
          try {
            const snap = await getDoc(doc(db, FIRESTORE_COLLECTIONS.users, passengerId));
            const data = snap.exists() ? snap.data() : {};
            return [passengerId, { displayName: data.displayName || '', avatarUrl: data.avatarUrl || '' }];
          } catch {
            return [passengerId, { displayName: '', avatarUrl: '' }];
          }
        }),
      );
      if (cancelled) return;
      setPassengerProfiles((prev) => {
        const next = { ...prev };
        for (const [id, profile] of entries) next[id] = profile;
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [approvedRequests, passengerProfiles]);

  const unreadNotifications = useMemo(
    () =>
      notifications
        .filter((notification) => (notification.status || '').toLowerCase() === NOTIFICATION_STATUS.unread)
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)),
    [notifications],
  );

  const handleDismissNotification = async (notificationId) => {
    if (!firebaseReady || !auth || !db) {
      setNotifications((currentNotifications) =>
        currentNotifications.map((notification) =>
          notification.id === notificationId
            ? { ...notification, status: NOTIFICATION_STATUS.read }
            : notification,
        ),
      );
      return;
    }

    try {
      await updateDoc(doc(db, FIRESTORE_COLLECTIONS.notifications, notificationId), {
        status: NOTIFICATION_STATUS.read,
        readAt: new Date().toISOString(),
      });
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }
  };

  function updateFootageForm(notifId, updates) {
    setFootageFormState(prev => ({ ...prev, [notifId]: { ...prev[notifId], ...updates } }));
  }

  const handleSubmitFootage = async (notification) => {
    const form = footageFormState[notification.id] || {};
    if (!form.description?.trim() && !form.link?.trim()) {
      updateFootageForm(notification.id, { error: 'Please describe the footage or provide a link.' });
      return;
    }
    updateFootageForm(notification.id, { submitting: true, error: '' });
    try {
      const user = auth?.currentUser;
      if (notification.relatedReportId && db) {
        await updateDoc(doc(db, FIRESTORE_COLLECTIONS.reports, notification.relatedReportId), {
          dashcamResponse: {
            description: form.description?.trim() || '',
            link: form.link?.trim() || '',
            submittedBy: user?.email || user?.uid || 'User',
            submittedAt: new Date().toISOString(),
          },
          activityLog: arrayUnion({
            time: new Date().toISOString(),
            action: 'Dashcam footage response submitted by reported user.',
            by: user?.email || user?.uid || 'User',
            type: 'note',
          }),
        });
      }
      await handleDismissNotification(notification.id);
      updateFootageForm(notification.id, { open: false, submitting: false });
    } catch (err) {
      updateFootageForm(notification.id, { submitting: false, error: err.message || 'Submission failed. Try again.' });
    }
  };

  const handleEnablePush = async () => {
    if (!firebaseReady || !auth || !db) {
      setPushStatus('unavailable');
      setPushMessage('Push notifications need Firebase to be configured.');
      return;
    }

    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setPushStatus('unavailable');
      setPushMessage('This browser does not support push notifications.');
      return;
    }

    if (Notification.permission === 'denied') {
      setPushStatus('denied');
      setPushMessage('Browser notifications are blocked. Update browser permissions to enable them.');
      return;
    }

    if (!vapidKey) {
      setPushStatus('unavailable');
      setPushMessage('Missing VITE_FIREBASE_VAPID_KEY. Add the Firebase Web Push certificate key first.');
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      setPushStatus('unavailable');
      setPushMessage('Sign in as a driver before enabling push notifications.');
      return;
    }

    setPushStatus('working');
    setPushMessage('Requesting browser permission...');

    try {
      const permission =
        Notification.permission === 'granted'
          ? Notification.permission
          : await Notification.requestPermission();

      if (permission !== 'granted') {
        setPushStatus(permission === 'denied' ? 'denied' : 'idle');
        setPushMessage(
          permission === 'denied'
            ? 'Browser notifications are blocked. Update browser permissions to enable them.'
            : 'Push notifications were not enabled.',
        );
        return;
      }

      await registerBrowserPushToken(user, 'driver');

      setPushStatus('ready');
      setPushMessage('Push notifications are enabled for this browser.');
    } catch (error) {
      setPushStatus('unavailable');
      setPushMessage(error.message || 'Push notifications could not be enabled.');
    }
  };

  const handleApprove = async (requestId) => {
    const request = requests.find((item) => item.id === requestId);
    if (!request) {
      setMessage('Error: Request could not be found.');
      return;
    }

    if (!firebaseReady || !auth || !db) {
      setRequests((currentRequests) =>
        currentRequests.map((item) =>
          item.id === requestId
            ? { ...item, status: RIDE_REQUEST_STATUS.approved, decidedAt: new Date().toISOString() }
            : item,
        ),
      );
      const requestedSeats = request.seatsRequested || 1;
      setTrips((currentTrips) =>
        currentTrips.map((trip) =>
          trip.id === request.tripId
            ? {
                ...trip,
                availableSeats: Math.max(0, (trip.availableSeats ?? trip.seats ?? 0) - requestedSeats),
                status:
                  (trip.availableSeats ?? trip.seats ?? 0) - requestedSeats <= 0 ? TRIP_STATUS.full : trip.status,
              }
            : trip,
        ),
      );
      setMessage('Demo mode: Passenger approved and seat count updated.');
      return;
    }

    setBusyRequestId(requestId);
    setMessage('');

    try {
      await runTransaction(db, async (transaction) => {
        const requestRef = doc(db, FIRESTORE_COLLECTIONS.rideRequests, requestId);
        const tripRef = doc(db, FIRESTORE_COLLECTIONS.trips, request.tripId);

        const [requestSnap, tripSnap] = await Promise.all([
          transaction.get(requestRef),
          transaction.get(tripRef),
        ]);

        if (!requestSnap.exists()) throw new Error('Request not found.');
        if (!tripSnap.exists()) throw new Error('Trip not found.');

        const latestRequest = requestSnap.data();
        const tripData = tripSnap.data();
        const currentStatus = (latestRequest.status || '').toLowerCase();

        if (currentStatus !== RIDE_REQUEST_STATUS.pending) {
          throw new Error('This request has already been processed.');
        }

        const currentSeats = Number.isFinite(tripData.availableSeats)
          ? tripData.availableSeats
          : tripData.seats;

        const requestedSeats = latestRequest.seatsRequested || 1;

        if (!Number.isFinite(currentSeats) || currentSeats < requestedSeats) {
          throw new Error(`Not enough seats available. (Requested: ${requestedSeats}, Available: ${currentSeats})`);
        }

        const nextSeats = currentSeats - requestedSeats;

        transaction.update(requestRef, {
          status: RIDE_REQUEST_STATUS.approved,
          decidedAt: new Date().toISOString(),
        });
        transaction.update(tripRef, {
          availableSeats: nextSeats,
          status: nextSeats === 0 ? TRIP_STATUS.full : tripData.status || TRIP_STATUS.active,
        });
      });

      setMessage('Passenger approved and seat count updated.');
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setBusyRequestId('');
    }
  };

  const handleDecline = async (requestId) => {
    const request = requests.find((item) => item.id === requestId);
    if (!request) {
      setMessage('Error: Request could not be found.');
      return;
    }

    if (!firebaseReady || !auth || !db) {
      setRequests((currentRequests) =>
        currentRequests.map((item) =>
          item.id === requestId
            ? { ...item, status: RIDE_REQUEST_STATUS.declined, decidedAt: new Date().toISOString() }
            : item,
        ),
      );
      setMessage('Demo mode: Passenger request declined and passenger notified.');
      return;
    }

    setBusyRequestId(requestId);
    setMessage('');

    try {
      await runTransaction(db, async (transaction) => {
        const requestRef = doc(db, FIRESTORE_COLLECTIONS.rideRequests, requestId);
        const notificationRef = doc(collection(db, FIRESTORE_COLLECTIONS.notifications));
        const requestSnap = await transaction.get(requestRef);
        if (!requestSnap.exists()) throw new Error('Request not found.');

        const latestRequest = requestSnap.data();
        const currentStatus = (latestRequest.status || '').toLowerCase();
        const driverId = auth.currentUser?.uid;

        if (latestRequest.tripOwnerId !== driverId) {
          throw new Error('Only the trip driver can decline this request.');
        }

        if (currentStatus !== RIDE_REQUEST_STATUS.pending) {
          throw new Error('This request has already been processed.');
        }

        transaction.update(requestRef, {
          status: RIDE_REQUEST_STATUS.declined,
          decidedAt: new Date().toISOString(),
        });
        transaction.set(notificationRef, {
          type: 'ride_request_declined',
          recipientId: latestRequest.passengerId,
          tripId: latestRequest.tripId,
          requestId,
          driverId,
          passengerId: latestRequest.passengerId,
          status: NOTIFICATION_STATUS.unread,
          message: 'Your ride request was declined by the driver.',
          createdAt: serverTimestamp(),
        });
      });

      setMessage('Passenger request declined and passenger notified.');
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setBusyRequestId('');
    }
  };

  const handleCancelTrip = async () => {
    if (!tripToCancel) return;

    if (!firebaseReady || !auth || !db) {
      setTrips((currentTrips) =>
        currentTrips.map((trip) =>
          trip.id === tripToCancel.id
            ? {
                ...trip,
                status: TRIP_STATUS.cancelled,
                cancelledAt: new Date().toISOString(),
                cancelledBy: 'demo-driver',
              }
            : trip,
        ),
      );
      setRequests((currentRequests) =>
        currentRequests.map((request) =>
          request.tripId === tripToCancel.id &&
          (request.status || '').toLowerCase() !== RIDE_REQUEST_STATUS.cancelled
            ? {
                ...request,
                status: RIDE_REQUEST_STATUS.cancelled,
                cancelledAt: new Date().toISOString(),
                cancellationSource: 'trip_cancelled',
              }
            : request,
        ),
      );
      setTripToCancel(null);
      setMessage('Demo mode: Trip cancelled and passengers marked for notification.');
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      setMessage('Error: Sign in as the driver before cancelling this trip.');
      return;
    }

    setBusyTripId(tripToCancel.id);
    setMessage('');

    try {
      await runTransaction(db, async (transaction) => {
        const tripRef = doc(db, FIRESTORE_COLLECTIONS.trips, tripToCancel.id);
        const tripSnap = await transaction.get(tripRef);

        if (!tripSnap.exists()) throw new Error('Trip not found.');

        const latestTrip = tripSnap.data();
        const currentStatus = (latestTrip.status || TRIP_STATUS.active).toLowerCase();

        if (latestTrip.driverId !== user.uid) {
          throw new Error('Only the trip driver can cancel this trip.');
        }

        if (currentStatus === TRIP_STATUS.cancelled) {
          throw new Error('This trip has already been cancelled.');
        }

        if (currentStatus !== TRIP_STATUS.active && currentStatus !== TRIP_STATUS.full) {
          throw new Error('Only scheduled trips can be cancelled.');
        }

        // Identify all ride requests associated with the trip being cancelled
        const tripRequests = requests.filter(
          (r) => r.tripId === tripToCancel.id && r.status !== RIDE_REQUEST_STATUS.cancelled,
        );

        transaction.update(tripRef, {
          status: TRIP_STATUS.cancelled,
          cancelledAt: serverTimestamp(),
          cancelledBy: user.uid,
        });

        // Update each associated ride request and create notifications
        tripRequests.forEach((request) => {
          const requestRef = doc(db, FIRESTORE_COLLECTIONS.rideRequests, request.id);
          const notificationRef = doc(collection(db, FIRESTORE_COLLECTIONS.notifications));

          transaction.update(requestRef, {
            status: RIDE_REQUEST_STATUS.cancelled,
            cancelledAt: serverTimestamp(),
            cancellationSource: 'driver_cancelled_trip',
          });

          transaction.set(notificationRef, {
            type: 'trip_cancelled',
            recipientId: request.passengerId,
            tripId: tripToCancel.id,
            requestId: request.id,
            driverId: user.uid,
            status: NOTIFICATION_STATUS.unread,
            message: `The trip from ${tripToCancel.origin} to ${tripToCancel.destination} has been cancelled by the driver.`,
            createdAt: serverTimestamp(),
          });
        });
      });

      setTripToCancel(null);
      setMessage('Trip cancelled. Passengers have been notified.');
    } catch (error) {
      setMessage(`Error: ${error.message || 'Unable to cancel this trip.'}`);
    } finally {
      setBusyTripId('');
    }
  };

  const hasError = message.startsWith('Error');
  const pushButtonLabel =
    pushStatus === 'working'
      ? 'Enabling...'
      : pushStatus === 'ready'
        ? 'Enabled'
        : 'Notification' in window && Notification.permission === 'granted'
          ? 'Refresh token'
          : 'Enable push';

  return (
    <div style={{ padding: '22px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '14px',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          marginBottom: '12px',
        }}
      >
        <div style={{ flex: 1, minWidth: '200px', textAlign: 'left' }}>
          <span style={{ ...pills.base, ...pills.accent }}>
            <span aria-hidden="true">📥</span> Inbox
          </span>
          <h2 style={{ ...typography.h2, margin: '10px 0 4px' }}>Passenger requests</h2>
          <p style={{ ...typography.body, margin: 0 }}>
            Review pending riders. Approvals auto-deduct a seat.
          </p>
          {!firebaseReady && (
            <p style={{ marginTop: '6px', color: '#92400e', fontWeight: 700, fontSize: '0.8rem' }}>
              Demo mode: showing local sample requests.
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <StatPill
            label="Pending"
            value={pendingRequests.length}
            tone={pendingRequests.length ? 'warning' : 'success'}
          />
          <StatPill
            label="Alerts"
            value={unreadNotifications.length}
            tone={unreadNotifications.length ? 'warning' : 'muted'}
          />
          <StatPill label="Approved" value={approvedRequests.length} tone="info" />
          <StatPill label="Trips" value={driverTrips.length} tone="muted" />
        </div>
      </div>

      {unreadNotifications.length > 0 && (
        <div
          style={{
            display: 'grid',
            gap: '8px',
            marginTop: '14px',
            marginBottom: '4px',
          }}
        >
          {unreadNotifications.map((notification) => {
            const ff = footageFormState[notification.id] || {};
            const isFootageRequest = notification.type === 'admin_request';
            return (
              <div key={notification.id} role="status" style={{ borderRadius: radius.md, border: '1px solid rgba(217,119,6,0.24)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 14px', backgroundColor: colors.warningSoft, color: colors.warning, fontWeight: 700 }}>
                  <span>
                    {notification.message || `${notification.passengerName || 'A passenger'} requested ${notification.seatsRequested || 1} seat(s).`}
                  </span>
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    {isFootageRequest && (
                      <button
                        type="button"
                        onClick={() => updateFootageForm(notification.id, { open: !ff.open })}
                        style={{ ...buttons.ghost, padding: '7px 12px', minHeight: 'auto', background: colors.warning, color: '#fff', borderColor: colors.warning, fontSize: '13px' }}
                      >
                        {ff.open ? 'Cancel' : 'Submit Footage'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDismissNotification(notification.id)}
                      style={{ ...buttons.ghost, padding: '7px 10px', minHeight: 'auto', color: colors.warning, borderColor: 'rgba(217,119,6,0.28)', flexShrink: 0 }}
                    >
                      Mark read
                    </button>
                  </div>
                </div>
                {isFootageRequest && ff.open && (
                  <div style={{ background: '#fff', padding: '14px', borderTop: '1px solid rgba(217,119,6,0.24)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <p style={{ margin: 0, fontSize: '13px', color: '#555' }}>Describe what the footage shows, or share a link (Google Drive, Dropbox, etc.).</p>
                    <textarea
                      placeholder="Describe what happened and what the footage shows…"
                      value={ff.description || ''}
                      onChange={e => updateFootageForm(notification.id, { description: e.target.value })}
                      rows={3}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid rgba(217,119,6,0.3)', borderRadius: '6px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', outline: 'none' }}
                    />
                    <input
                      type="url"
                      placeholder="Footage link (optional) — e.g. https://drive.google.com/…"
                      value={ff.link || ''}
                      onChange={e => updateFootageForm(notification.id, { link: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid rgba(217,119,6,0.3)', borderRadius: '6px', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }}
                    />
                    {ff.error && <p style={{ margin: 0, color: '#dc2626', fontSize: '12px' }}>{ff.error}</p>}
                    <button
                      type="button"
                      onClick={() => handleSubmitFootage(notification)}
                      disabled={ff.submitting}
                      style={{ alignSelf: 'flex-start', padding: '9px 20px', border: 'none', borderRadius: '6px', background: colors.warning, color: '#fff', fontSize: '13px', fontWeight: 700, cursor: ff.submitting ? 'wait' : 'pointer' }}
                    >
                      {ff.submitting ? 'Submitting…' : 'Submit Response'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div
        style={{
          marginTop: '14px',
          padding: '14px',
          borderRadius: radius.md,
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.surfaceMuted,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ textAlign: 'left', minWidth: '220px', flex: 1 }}>
          <div style={{ ...typography.h3, marginBottom: '3px' }}>Browser push alerts</div>
          <div style={{ ...typography.small }}>
            {pushMessage || 'Enable browser alerts for new passenger ride requests.'}
          </div>
        </div>
        <button
          type="button"
          onClick={handleEnablePush}
          disabled={pushStatus === 'working' || pushStatus === 'unavailable' || pushStatus === 'denied'}
          style={{
            ...buttons.ghost,
            backgroundColor: pushStatus === 'ready' ? colors.successSoft : 'transparent',
            color: pushStatus === 'ready' ? colors.success : colors.text,
            opacity: pushStatus === 'working' || pushStatus === 'unavailable' || pushStatus === 'denied' ? 0.65 : 1,
          }}
        >
          {pushButtonLabel}
        </button>
      </div>

      {message && (
        <p
          style={{
            marginTop: '10px',
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

      <section
        style={{
          marginTop: '18px',
          textAlign: 'left',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '12px',
            alignItems: 'flex-end',
            flexWrap: 'wrap',
            marginBottom: '12px',
          }}
        >
          <div>
            <div style={{ ...typography.eyebrow, color: colors.accent, marginBottom: '4px' }}>
              Driver trips
            </div>
            <h3 style={{ ...typography.h2, margin: 0 }}>Your published trips</h3>
          </div>
          {firebaseReady && auth?.currentUser?.email && (
            <span style={{ ...pills.base, ...pills.muted }}>
              {auth.currentUser.email}
            </span>
          )}
        </div>

        {driverTrips.length === 0 ? (
          <div
            style={{
              padding: '22px',
              borderRadius: radius.lg,
              border: `1px dashed ${colors.borderStrong}`,
              backgroundColor: colors.surfaceMuted,
              textAlign: 'center',
            }}
          >
            <strong style={{ color: colors.text }}>No trips published yet</strong>
            <p style={{ ...typography.body, marginTop: '4px', marginBottom: 0 }}>
              Trips you create are saved to Firestore with your account ID and will appear here after refresh.
            </p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gap: '12px',
              gridTemplateColumns: isDesktop ? 'repeat(auto-fill, minmax(260px, 1fr))' : '1fr',
            }}
          >
            {driverTrips.map((trip) => {
              const remainingSeats = Number.isFinite(trip.availableSeats)
                ? trip.availableSeats
                : trip.seats;
              const isFull = (trip.status || '').toLowerCase() === TRIP_STATUS.full || remainingSeats === 0;
              const isCancelling = busyTripId === trip.id;
              const tripApproved = approvedByTripId[trip.id] || [];
              const totalSeats = trip.seats ?? 0;
              const seatsTaken = Math.max(0, totalSeats - (remainingSeats ?? 0));

              return (
                <article
                  key={trip.id}
                  style={{
                    position: 'relative',
                    padding: '0',
                    borderRadius: radius.xl,
                    backgroundColor: colors.surfaceSolid,
                    border: `1px solid ${colors.border}`,
                    boxShadow: '0 8px 24px -12px rgba(15, 23, 42, 0.12), 0 2px 6px -2px rgba(15, 23, 42, 0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    transition: 'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-3px)';
                    e.currentTarget.style.boxShadow = '0 22px 48px -20px rgba(15, 118, 110, 0.35), 0 6px 18px -8px rgba(15, 23, 42, 0.12)';
                    e.currentTarget.style.borderColor = 'rgba(15, 118, 110, 0.28)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = '';
                    e.currentTarget.style.boxShadow = '0 8px 24px -12px rgba(15, 23, 42, 0.12), 0 2px 6px -2px rgba(15, 23, 42, 0.05)';
                    e.currentTarget.style.borderColor = colors.border;
                  }}
                >
                  <div
                    style={{
                      height: '4px',
                      background: isFull
                        ? 'linear-gradient(90deg, #b45309 0%, #f59e0b 100%)'
                        : colors.accentGradient,
                    }}
                  />

                  <div style={{ padding: '18px 20px 4px' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '12px',
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            minWidth: 0,
                          }}
                        >
                          <span
                            style={{
                              fontSize: '1.05rem',
                              fontWeight: 800,
                              color: colors.text,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: '40%',
                            }}
                          >
                            {trip.origin || 'Unknown'}
                          </span>
                          <span
                            aria-hidden="true"
                            style={{
                              color: colors.info,
                              fontWeight: 800,
                              fontSize: '1.1rem',
                              flexShrink: 0,
                            }}
                          >
                            →
                          </span>
                          <span
                            style={{
                              fontSize: '1.05rem',
                              fontWeight: 800,
                              color: colors.text,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: '40%',
                            }}
                          >
                            {trip.destination || 'Unknown'}
                          </span>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            marginTop: '6px',
                            fontSize: '0.82rem',
                            color: colors.textSubtle,
                            fontWeight: 600,
                          }}
                        >
                          <span aria-hidden="true">🗓</span>
                          <span>{formatTripDeparture(trip.departureTime)}</span>
                        </div>
                      </div>
                      <span
                        style={{
                          flexShrink: 0,
                          fontSize: '0.7rem',
                          fontWeight: 800,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          padding: '6px 10px',
                          borderRadius: radius.pill,
                          backgroundColor: isFull 
                            ? 'rgba(180, 83, 9, 0.12)' 
                            : trip.status === 'in_progress'
                              ? 'rgba(16, 185, 129, 0.12)'
                              : 'rgba(21, 128, 61, 0.12)',
                          color: isFull 
                            ? colors.warning 
                            : trip.status === 'in_progress'
                              ? '#10b981'
                              : colors.success,
                          border: `1px solid ${isFull 
                            ? 'rgba(180, 83, 9, 0.25)' 
                            : trip.status === 'in_progress'
                              ? 'rgba(16, 185, 129, 0.25)'
                              : 'rgba(21, 128, 61, 0.25)'}`,
                        }}
                      >
                        {isFull 
                          ? 'Full' 
                          : trip.status === 'in_progress'
                            ? 'In Progress'
                            : trip.status || TRIP_STATUS.active}
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: '8px',
                      padding: '12px 20px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div
                      style={{
                        flex: '1 1 auto',
                        minWidth: '120px',
                        padding: '10px 12px',
                        borderRadius: radius.md,
                        background: 'linear-gradient(135deg, rgba(29, 78, 216, 0.06), rgba(15, 118, 110, 0.04))',
                        border: `1px solid ${colors.border}`,
                      }}
                    >
                      <div
                        style={{
                          fontSize: '0.66rem',
                          fontWeight: 800,
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          color: colors.textSubtle,
                          marginBottom: '2px',
                        }}
                      >
                        Seats
                      </div>
                      <div style={{ fontSize: '1rem', fontWeight: 800, color: colors.text }}>
                        {seatsTaken} <span style={{ color: colors.textSubtle, fontWeight: 600 }}>/ {totalSeats}</span>
                      </div>
                    </div>
                    <div
                      style={{
                        flex: '1 1 auto',
                        minWidth: '120px',
                        padding: '10px 12px',
                        borderRadius: radius.md,
                        background: 'linear-gradient(135deg, rgba(15, 118, 110, 0.06), rgba(29, 78, 216, 0.04))',
                        border: `1px solid ${colors.border}`,
                      }}
                    >
                      <div
                        style={{
                          fontSize: '0.66rem',
                          fontWeight: 800,
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          color: colors.textSubtle,
                          marginBottom: '2px',
                        }}
                      >
                        Approved
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {tripApproved.length > 0 ? (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              {tripApproved.slice(0, 3).map((request, idx) => {
                                const profile = passengerProfiles[request.passengerId] || {};
                                const name =
                                  profile.displayName ||
                                  request.passengerName ||
                                  request.passengerEmail ||
                                  'Passenger';
                                return (
                                  <div
                                    key={request.id}
                                    style={{
                                      marginLeft: idx === 0 ? 0 : '-7px',
                                      border: '2px solid #fff',
                                      borderRadius: '50%',
                                      display: 'inline-flex',
                                      boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                                    }}
                                  >
                                    <PassengerAvatar src={profile.avatarUrl} name={name} size={24} />
                                  </div>
                                );
                              })}
                            </div>
                            <span style={{ fontSize: '1rem', fontWeight: 800, color: colors.text }}>
                              {tripApproved.length}
                            </span>
                          </>
                        ) : (
                          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: colors.textSubtle }}>
                            None yet
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: '8px',
                      padding: '4px 20px 18px',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                      <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                        <button
                          type="button"
                          onClick={() => onOpenLiveTrip?.(trip.id === 'demo-trip-1' ? 'demo' : trip.id)}
                          style={{
                            flex: 1,
                            border: 'none',
                            borderRadius: radius.pill,
                            padding: '12px 18px',
                            fontSize: '0.9rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            background: trip.status === 'in_progress' ? '#10b981' : colors.accentGradient,
                            color: '#fff',
                            boxShadow: trip.status === 'in_progress' 
                              ? '0 8px 20px -6px rgba(16, 185, 129, 0.4)' 
                              : '0 8px 20px -6px rgba(15, 118, 110, 0.4)',
                            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = trip.status === 'in_progress' 
                              ? '0 12px 28px -6px rgba(16, 185, 129, 0.5)' 
                              : '0 12px 28px -6px rgba(15, 118, 110, 0.5)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = '';
                            e.currentTarget.style.boxShadow = trip.status === 'in_progress' 
                              ? '0 8px 20px -6px rgba(16, 185, 129, 0.4)' 
                              : '0 8px 20px -6px rgba(15, 118, 110, 0.4)';
                          }}
                        >
                          <span>{trip.status === 'in_progress' ? '⚡ Active: Manage Live Trip' : 'Start / Manage Live Trip'}</span>
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => setSelectedTripId(trip.id)}
                          style={{
                            flex: 1,
                            border: `1px solid ${colors.borderStrong}`,
                            borderRadius: radius.pill,
                            padding: '10px 18px',
                            fontSize: '0.86rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            background: '#fff',
                            color: colors.text,
                            transition: 'transform 0.15s ease, background-color 0.15s ease',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.backgroundColor = colors.surfaceMuted;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = '';
                            e.currentTarget.style.backgroundColor = '#fff';
                          }}
                        >
                          <span>View passengers</span>
                          <span aria-hidden="true">→</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setTripToCancel(trip)}
                          disabled={isCancelling}
                          title="Cancel trip"
                          aria-label="Cancel trip"
                          style={{
                            flexShrink: 0,
                            width: '38px',
                            height: '38px',
                            borderRadius: '50%',
                            border: '1px solid rgba(220, 38, 38, 0.25)',
                            backgroundColor: '#fff',
                            color: colors.danger,
                            cursor: isCancelling ? 'wait' : 'pointer',
                            opacity: isCancelling ? 0.6 : 1,
                            fontSize: '15px',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background-color 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(220, 38, 38, 0.08)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = '#fff';
                          }}
                        >
                          {isCancelling ? '…' : '✕'}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div
        style={{
          display: 'grid',
          gap: '12px',
          marginTop: '18px',
          gridTemplateColumns: isDesktop ? 'repeat(auto-fill, minmax(320px, 1fr))' : '1fr',
        }}
      >
        {pendingRequests.length === 0 ? (
          <div
            style={{
              padding: '26px',
              borderRadius: radius.lg,
              border: `1px dashed ${colors.borderStrong}`,
              backgroundColor: colors.surfaceMuted,
              textAlign: 'center',
              gridColumn: '1 / -1',
            }}
          >
            <div style={{ fontSize: '1.8rem', marginBottom: '6px' }} aria-hidden="true">
              ☀️
            </div>
            <strong style={{ color: colors.text }}>All caught up</strong>
            <p style={{ ...typography.body, marginTop: '4px', marginBottom: 0 }}>
              New passenger requests show up here automatically.
            </p>
          </div>
        ) : (
          pendingRequests.map((request) => {
            const trip = tripsById[request.tripId];
            const remainingSeats = Number.isFinite(trip?.availableSeats)
              ? trip.availableSeats
              : trip?.seats;
            const isBusy = busyRequestId === request.id;

            return (
              <div
                key={request.id}
                style={{
                  padding: '18px',
                  borderRadius: radius.lg,
                  backgroundColor: colors.surfaceSolid,
                  border: `1px solid ${colors.border}`,
                  boxShadow: shadows.soft,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '12px',
                    alignItems: 'flex-start',
                  }}
                >
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', minWidth: 0 }}>
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: colors.accentSoft,
                        color: colors.accent,
                        fontWeight: 800,
                        fontSize: '0.95rem',
                        flexShrink: 0,
                      }}
                    >
                      {(request.passengerEmail || request.passengerName || 'P')
                        .slice(0, 1)
                        .toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          ...typography.h3,
                          margin: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {request.passengerEmail || request.passengerName || 'Passenger'}
                      </div>
                      <div style={{ color: colors.textSubtle, fontSize: '0.82rem', marginTop: '2px' }}>
                        {trip?.origin || 'Unknown origin'} → {trip?.destination || 'Unknown destination'}
                      </div>
                    </div>
                  </div>

                  <span style={{ ...pills.base, ...pills.warning, flexShrink: 0 }}>
                    {request.status}
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: '10px',
                  }}
                >
                  <InfoItem
                    label="Departure"
                    value={
                      trip?.departureTime
                        ? new Date(trip.departureTime).toLocaleString([], {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })
                        : '—'
                    }
                  />
                  <InfoItem label="Seats left" value={remainingSeats ?? '—'} accent />
                  <InfoItem label="Requested" value={request.seatsRequested || 1} />
                  {request.note && <InfoItem label="Note" value={request.note} wide />}
                </div>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => handleApprove(request.id)}
                    disabled={isBusy}
                    style={{
                      ...buttons.accent,
                      flex: 1,
                      minWidth: '120px',
                      opacity: isBusy ? 0.7 : 1,
                      cursor: isBusy ? 'wait' : 'pointer',
                    }}
                  >
                    {isBusy ? 'Working…' : '✓ Accept'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDecline(request.id)}
                    disabled={isBusy}
                    style={{
                      ...buttons.ghost,
                      flex: 1,
                      minWidth: '120px',
                      color: colors.danger,
                      borderColor: 'rgba(220, 38, 38, 0.25)',
                      opacity: isBusy ? 0.7 : 1,
                      cursor: isBusy ? 'wait' : 'pointer',
                    }}
                  >
                    {isBusy ? 'Working…' : 'Decline'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div
        style={{
          marginTop: '18px',
          padding: '16px 18px',
          borderRadius: radius.lg,
          background: 'linear-gradient(135deg, rgba(29, 78, 216, 0.08), rgba(15, 118, 110, 0.06))',
          border: `1px solid ${colors.border}`,
        }}
      >
        <div style={{ ...typography.eyebrow, color: colors.info, marginBottom: '8px' }}>
          Approved riders
        </div>
        {approvedRequests.length === 0 ? (
          <div style={{ ...typography.body, margin: 0 }}>
            Approved passengers will appear here once you accept them.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {approvedRequests.map((request) => {
              const trip = tripsById[request.tripId];
              const profile = passengerProfiles[request.passengerId] || {};
              const displayName =
                profile.displayName ||
                request.passengerName ||
                request.passengerEmail ||
                'Passenger';
              const alreadyReported = reportedPassengerIds.includes(request.passengerId);
              return (
                <div
                  key={request.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    borderRadius: radius.md,
                    backgroundColor: colors.surfaceSolid,
                    border: `1px solid ${colors.border}`,
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ ...typography.h3, margin: 0, fontSize: '0.9rem' }}>
                      {displayName}
                    </div>
                    <div style={{ color: colors.textSubtle, fontSize: '0.8rem', marginTop: '2px' }}>
                      {trip?.origin || '?'} → {trip?.destination || '?'}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={alreadyReported}
                    onClick={() =>
                      setReportTarget({
                        userId: request.passengerId,
                        userName: displayName,
                        tripId: request.tripId,
                      })
                    }
                    style={{
                      padding: '6px 14px',
                      borderRadius: '8px',
                      border: '1px solid rgba(220, 38, 38, 0.35)',
                      backgroundColor: alreadyReported ? '#f3f4f6' : '#fff',
                      color: alreadyReported ? '#9ca3af' : '#dc2626',
                      cursor: alreadyReported ? 'not-allowed' : 'pointer',
                      fontWeight: 600,
                      fontSize: '0.82rem',
                      flexShrink: 0,
                    }}
                  >
                    {alreadyReported ? 'Reported' : 'Report'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedTripId && tripsById[selectedTripId] && (
        <TripPassengersModal
          trip={tripsById[selectedTripId]}
          approvedRequests={approvedByTripId[selectedTripId] || []}
          passengerProfiles={passengerProfiles}
          onClose={() => setSelectedTripId(null)}
        />
      )}

      {reportTarget && (
        <ReportUserModal
          reportedUserId={reportTarget.userId}
          reportedUserName={reportTarget.userName}
          reporterId={auth.currentUser?.uid}
          tripId={reportTarget.tripId}
          onClose={() => setReportTarget(null)}
          onReported={() => setReportedPassengerIds((prev) => [...prev, reportTarget.userId])}
        />
      )}

      {tripToCancel && (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            zIndex: 50,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-trip-title"
            style={{
              width: '100%',
              maxWidth: '430px',
              borderRadius: radius.md,
              backgroundColor: colors.surfaceSolid,
              padding: '22px',
              boxShadow: '0 20px 45px rgba(15, 23, 42, 0.24)',
              textAlign: 'left',
            }}
          >
            <h2 id="cancel-trip-title" style={{ ...typography.h2, marginTop: 0 }}>
              Cancel trip?
            </h2>
            <p style={{ ...typography.body, marginTop: '8px' }}>
              This removes the trip from passenger search and alerts approved passengers that the ride is no longer running.
            </p>
            <div
              style={{
                marginTop: '14px',
                padding: '12px',
                borderRadius: radius.md,
                backgroundColor: colors.surfaceMuted,
                border: `1px solid ${colors.border}`,
              }}
            >
              <strong style={{ color: colors.text }}>
                {tripToCancel.origin || 'Unknown origin'} → {tripToCancel.destination || 'Unknown destination'}
              </strong>
              <div style={{ ...typography.small, marginTop: '4px' }}>
                {formatTripDeparture(tripToCancel.departureTime)}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button
                type="button"
                onClick={() => setTripToCancel(null)}
                disabled={Boolean(busyTripId)}
                style={{
                  ...buttons.ghost,
                  cursor: busyTripId ? 'wait' : 'pointer',
                }}
              >
                Keep Trip
              </button>
              <button
                type="button"
                onClick={handleCancelTrip}
                disabled={Boolean(busyTripId)}
                style={{
                  ...buttons.accent,
                  width: 'auto',
                  background: colors.danger,
                  opacity: busyTripId ? 0.7 : 1,
                  cursor: busyTripId ? 'wait' : 'pointer',
                }}
              >
                {busyTripId ? 'Cancelling...' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatPill({ label, value, tone = 'muted' }) {
  const palette = pills[tone] || pills.muted;
  return (
    <div
      style={{
        padding: '10px 14px',
        borderRadius: radius.lg,
        backgroundColor: palette.backgroundColor,
        color: palette.color,
        minWidth: '78px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '1.3rem', fontWeight: 800, lineHeight: 1 }}>{value}</div>
      <div
        style={{
          fontSize: '0.64rem',
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          marginTop: '4px',
        }}
      >
        {label}
      </div>
    </div>
  );
}

function InfoItem({ label, value, accent = false, wide = false }) {
  return (
    <div style={{ gridColumn: wide ? '1 / -1' : 'auto' }}>
      <div
        style={{
          fontSize: '0.62rem',
          fontWeight: 800,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: colors.textSubtle,
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: '2px',
          fontWeight: accent ? 800 : 600,
          color: accent ? colors.accent : colors.text,
          fontSize: '0.88rem',
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default DriverDashboard;
