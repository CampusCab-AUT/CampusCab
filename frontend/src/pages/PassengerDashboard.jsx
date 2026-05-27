import React, { useState, useEffect } from 'react';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, firebaseReady } from '../firebase';
import {
  FIRESTORE_COLLECTIONS,
  NOTIFICATION_STATUS,
  NOTIFICATION_TYPES,
  RIDE_REQUEST_STATUS,
  ROUTE_ALERT_STATUS,
  SAFETY_ALERT_CATEGORY,
  SAFETY_CHECK_IN_STATUS,
} from '../firestoreModel';
import { registerBrowserPushToken } from '../utils/pushNotifications';
import { colors, radius } from '../theme';
import SearchTrips from './SearchTrips';
import TripDetails from './TripDetails';
import MyAlerts from './MyAlerts';
import LeaveRatingModal from '../components/LeaveRatingModal';
import ReportUserModal from '../components/ReportUserModal';
import ChatWindow from '../components/ChatWindow';
import { canViewChat } from '../utils/chatPermissions';

function formatDeparture(departureTime) {
  if (!departureTime) return 'Departure time unavailable';
  return new Date(departureTime).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
/**
 * @fileoverview Main passenger dashboard component.
 * Handles ride request monitoring, push notification setup, seat cancellation,
 * and dynamically splits ride history based on real-time departure metrics.
 */
function PassengerDashboard() {
  const [upcomingRides, setUpcomingRides] = useState([]);
  const [associatedTrips, setAssociatedTrips] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [rideToCancel, setRideToCancel] = useState(null);
  const [cancellingRideId, setCancellingRideId] = useState('');
  const [pushStatus, setPushStatus] = useState('idle');
  const [pushMessage, setPushMessage] = useState('');
  const [viewingTrip, setViewingTrip] = useState(null);
  const [searchedPassengerLocation, setSearchedPassengerLocation] = useState(null);
  
  const [ratingModalRide, setRatingModalRide] = useState(null);
  const [ratedRideIds, setRatedRideIds] = useState([]);
  const [reportModalRide, setReportModalRide] = useState(null);
  const [reportedRideIds, setReportedRideIds] = useState([]);
  const [footageFormState, setFootageFormState] = useState({});
  const [chatModalRide, setChatModalRide] = useState(null);
  const [safetyActionState, setSafetyActionState] = useState({});
  const [view, setView] = useState('rides'); // 'rides' | 'alerts'
  const [activeAlertCount, setActiveAlertCount] = useState(0);

  useEffect(() => {
    if (!firebaseReady || !auth?.currentUser || !db) return undefined;
    const q = query(
      collection(db, FIRESTORE_COLLECTIONS.routeAlerts),
      where('passengerId', '==', auth.currentUser.uid),
    );
    const unsub = onSnapshot(q, (snap) => {
      let active = 0;
      snap.forEach((d) => {
        if ((d.data().status || ROUTE_ALERT_STATUS.active) === ROUTE_ALERT_STATUS.active) active += 1;
      });
      setActiveAlertCount(active);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!firebaseReady || !auth || !db) {
      setUpcomingRides([]);
      setLoading(false);
      return undefined;
    }

    const user = auth.currentUser;
    if (!user) {
      setUpcomingRides([]);
      setLoading(false);
      return undefined;
    }

    const approvedRequestsQuery = query(
      collection(db, FIRESTORE_COLLECTIONS.rideRequests),
      where('passengerId', '==', user.uid)
    );

    setLoading(true);

    return onSnapshot(
      approvedRequestsQuery,
      async (snapshot) => {
        try {
          const rideDocs = await Promise.all(
            snapshot.docs.map(async (requestDoc) => {
              const request = { id: requestDoc.id, ...requestDoc.data() };
              
              if (
                request.status !== RIDE_REQUEST_STATUS.approved &&
                request.status !== RIDE_REQUEST_STATUS.pending
              ) {
                return null;
              }

              const tripSnap = request.tripId
                ? await getDoc(doc(db, FIRESTORE_COLLECTIONS.trips, request.tripId))
                : null;
              const trip = tripSnap?.exists() ? { id: tripSnap.id, ...tripSnap.data() } : null;
              
              /**
               * SECURITY & UX CHECK: 
               * Query the backend to see if a rating already exists for this specific seat reservation.
               * This prevents the "Rated" button from resetting to blue if the user refreshes the page,
               * ensuring frontend state perfectly matches persistent backend data.
               */
              const ratingQuery = query(
                collection(db, FIRESTORE_COLLECTIONS.ratings),
                where('requestId', '==', requestDoc.id)
              );
              const ratingSnap = await getDocs(ratingQuery);
              const hasRated = !ratingSnap.empty;

              return { ...request, trip, hasRated };
            }),
          );

          const validRides = rideDocs.filter(Boolean);
          const sortedRides = validRides.sort((a, b) =>
            (a.trip?.departureTime || '').localeCompare(b.trip?.departureTime || ''),
          );
          setUpcomingRides(sortedRides);
          setMessage((currentMessage) =>
            currentMessage === 'Your seat reservation was cancelled.' ? currentMessage : '',
          );
        } catch (error) {
          setMessage(error.message || 'Unable to load upcoming rides.');
        } finally {
          setLoading(false);
        }
      },
      (error) => {
        setMessage(error.message || 'Unable to load upcoming rides.');
        setLoading(false);
      },
    );
  }, []);

  useEffect(() => {
    if (!firebaseReady || !db || upcomingRides.length === 0) {
      return undefined;
    }

    const tripIds = [...new Set(upcomingRides.map((r) => r.tripId).filter(Boolean))];
    const unsubscribes = tripIds.map((tId) => {
      return onSnapshot(doc(db, FIRESTORE_COLLECTIONS.trips, tId), (docSnap) => {
        if (docSnap.exists()) {
          setAssociatedTrips((prev) => ({
            ...prev,
            [tId]: { id: docSnap.id, ...docSnap.data() },
          }));
        }
      });
    });

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [upcomingRides]);

  useEffect(() => {
    if (!firebaseReady || !auth || !db || !auth.currentUser) {
      return undefined;
    }

    const notificationsQuery = query(
      collection(db, FIRESTORE_COLLECTIONS.notifications),
      where('recipientId', '==', auth.currentUser.uid),
      where('status', '==', NOTIFICATION_STATUS.unread),
    );

    return onSnapshot(notificationsQuery, (snapshot) => {
      const notificationDocs = snapshot.docs
        .map((notificationDoc) => ({ id: notificationDoc.id, ...notificationDoc.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setNotifications(notificationDocs);
    });
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
    setPushMessage('Enable browser alerts for trip cancellations.');
  }, []);

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

    const user = auth.currentUser;
    if (!user) {
      setPushStatus('unavailable');
      setPushMessage('Sign in as a passenger before enabling push notifications.');
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

      await registerBrowserPushToken(user, 'passenger');

      setPushStatus('ready');
      setPushMessage('Trip cancellation push alerts are enabled for this browser.');
    } catch (error) {
      setPushStatus('unavailable');
      setPushMessage(error.message || 'Push notifications could not be enabled.');
    }
  };

  const handleDismissNotification = async (notificationId) => {
    if (!firebaseReady || !db) {
      setNotifications((currentNotifications) =>
        currentNotifications.filter((notification) => notification.id !== notificationId),
      );
      return;
    }

    await updateDoc(doc(db, FIRESTORE_COLLECTIONS.notifications, notificationId), {
      status: NOTIFICATION_STATUS.read,
      readAt: new Date().toISOString(),
    });
  };

  function updateFootageForm(notifId, updates) {
    setFootageFormState(prev => ({ ...prev, [notifId]: { ...prev[notifId], ...updates } }));
  }

  function updateSafetyAction(notifId, updates) {
    setSafetyActionState(prev => ({ ...prev, [notifId]: { ...prev[notifId], ...updates } }));
  }

  const handleConfirmSafe = async (notification) => {
    updateSafetyAction(notification.id, { submitting: 'safe', error: '' });
    try {
      if (firebaseReady && db && notification.tripId) {
        await updateDoc(doc(db, FIRESTORE_COLLECTIONS.trips, notification.tripId), {
          'safetyCheckIn.status': SAFETY_CHECK_IN_STATUS.safe,
          'safetyCheckIn.respondedAt': new Date().toISOString(),
          'safetyCheckIn.respondedBy': auth?.currentUser?.uid || '',
        });
      }
      await handleDismissNotification(notification.id);
      updateSafetyAction(notification.id, { submitting: '' });
    } catch (err) {
      updateSafetyAction(notification.id, {
        submitting: '',
        error: err.message || 'Could not confirm safety. Try again.',
      });
    }
  };

  const handleRequestHelp = async (notification) => {
    updateSafetyAction(notification.id, { submitting: 'help', error: '' });
    try {
      const user = auth?.currentUser;
      if (!firebaseReady || !db || !user) {
        throw new Error('You must be signed in to request help.');
      }

      await addDoc(collection(db, FIRESTORE_COLLECTIONS.reports), {
        category: SAFETY_ALERT_CATEGORY,
        priority: 'urgent',
        status: 'New',
        reporterId: user.uid,
        reporterEmail: user.email || '',
        reportedUserId: notification.driverId || '',
        tripId: notification.tripId || '',
        relatedNotificationId: notification.id,
        description: 'Passenger triggered safety check-in NEED HELP after ETA passed.',
        createdAt: serverTimestamp(),
      });

      // Trip flagging + safetyCheckIn.status=help_requested are written
      // server-side by the onSafetyAlertReportCreated Cloud Function.
      await handleDismissNotification(notification.id);
      updateSafetyAction(notification.id, { submitting: '', submitted: true });
    } catch (err) {
      updateSafetyAction(notification.id, {
        submitting: '',
        error: err.message || 'Could not raise the alert. Try again.',
      });
    }
  };

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

  const handleCancelSeat = async () => {
    if (!rideToCancel) return;

    if (!firebaseReady || !auth || !db) {
      setUpcomingRides((currentRides) => currentRides.filter((ride) => ride.id !== rideToCancel.id));
      setRideToCancel(null);
      setMessage('Your seat reservation was cancelled.');
      return;
    }

    const user = auth.currentUser;
    if (!user || rideToCancel.passengerId !== user.uid) {
      setMessage('Error: You can only cancel your own seat reservation.');
      return;
    }

    setCancellingRideId(rideToCancel.id);
    setMessage('');

    try {
      const batch = writeBatch(db);
      const requestRef = doc(db, FIRESTORE_COLLECTIONS.rideRequests, rideToCancel.id);
      const notificationRef = doc(collection(db, FIRESTORE_COLLECTIONS.notifications));
      const driverId = rideToCancel.tripOwnerId || rideToCancel.trip?.driverId;
      const passengerName = user.displayName || rideToCancel.passengerName || 'A passenger';
      const seatsRequested = rideToCancel.seatsRequested || 1;

      batch.update(requestRef, {
        status: RIDE_REQUEST_STATUS.cancelled,
        cancelledAt: serverTimestamp(),
      });

      if (driverId) {
        batch.set(notificationRef, {
          type: 'seat_cancellation',
          recipientId: driverId,
          tripId: rideToCancel.tripId || '',
          requestId: rideToCancel.id,
          passengerId: user.uid,
          passengerName,
          passengerEmail: user.email || rideToCancel.passengerEmail || '',
          seatsRequested,
          status: NOTIFICATION_STATUS.unread,
          message: `${passengerName} cancelled ${seatsRequested} seat reservation(s).`,
          createdAt: serverTimestamp(),
        });
      }

      await batch.commit();

      setRideToCancel(null);
      setMessage('Your seat reservation was cancelled.');
    } catch (error) {
      setMessage(`Error: ${error.message || 'Unable to cancel this seat reservation.'}`);
    } finally {
      setCancellingRideId('');
    }
  };
  /**
   * TIME-BASED RIDE FILTERING:
   * We capture the exact local time the component renders. 
   * This is used to automatically shift rides from the "Upcoming Rides" UI
   * down into the "Ride History" UI the exact minute their departure time passes.
   */
  const now = new Date();
  
  const ridesWithRealtimeTrips = upcomingRides.map(ride => {
    const realtimeTrip = ride.tripId ? associatedTrips[ride.tripId] : null;
    return {
      ...ride,
      trip: realtimeTrip || ride.trip
    };
  });

  const actualUpcomingRides = ridesWithRealtimeTrips.filter(ride => {
    if (ride.status === RIDE_REQUEST_STATUS.pending) return true;
    if (ride.status === RIDE_REQUEST_STATUS.approved) {
      const tripStatus = ride.trip?.status;
      if (tripStatus === 'completed' || tripStatus === 'cancelled') return false;
      if (tripStatus === 'in_progress') return true;
      if (ride.trip?.departureTime) {
        return new Date(ride.trip.departureTime) > now;
      }
      return true;
    }
    return false;
  });

  const actualPastRides = ridesWithRealtimeTrips.filter(ride => {
    if (ride.status === RIDE_REQUEST_STATUS.approved) {
      const tripStatus = ride.trip?.status;
      if (tripStatus === 'completed') return true;
      if (tripStatus === 'in_progress') return false;
      if (ride.trip?.departureTime) {
        return new Date(ride.trip.departureTime) <= now;
      }
    }
    return false;
  });

  const passengerTabs = [
    { id: 'rides', label: 'Rides', icon: '🎒' },
    { id: 'alerts', label: 'My Alerts', icon: '🔔', badge: activeAlertCount },
  ];
  const tabStrip = (
    <div
      role="tablist"
      aria-label="Passenger views"
      style={{
        display: 'inline-flex',
        gap: 4,
        padding: 4,
        borderRadius: radius.pill,
        background: colors.surfaceMuted,
        border: `1px solid ${colors.border}`,
        marginBottom: 24,
      }}
    >
      {passengerTabs.map((tab) => {
        const isActive = view === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => setView(tab.id)}
            style={{
              border: 'none',
              borderRadius: radius.pill,
              padding: '8px 16px',
              fontSize: '0.86rem',
              fontWeight: 800,
              cursor: 'pointer',
              background: isActive ? colors.accentGradient : 'transparent',
              color: isActive ? '#fff' : colors.text,
              boxShadow: isActive ? '0 8px 18px -8px rgba(15, 118, 110, 0.45)' : 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
          >
            <span aria-hidden="true">{tab.icon}</span>
            {tab.label}
            {typeof tab.badge === 'number' && tab.badge > 0 && (
              <span
                style={{
                  display: 'inline-flex',
                  minWidth: 18,
                  height: 18,
                  padding: '0 6px',
                  borderRadius: 999,
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isActive ? 'rgba(255,255,255,0.25)' : colors.accent,
                  color: '#fff',
                }}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  if (view === 'alerts') {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 20 }}>
        <header style={{ borderBottom: '1px solid #eee', paddingBottom: 20, marginBottom: 30 }}>
          <h1>Passenger Dashboard</h1>
          <p>Manage the routes you want to be pinged about.</p>
          {tabStrip}
        </header>
        <MyAlerts onGoToSearch={() => setView('rides')} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      <header style={{ borderBottom: '1px solid #eee', paddingBottom: '20px', marginBottom: '30px' }}>
        <h1>Passenger Dashboard</h1>
        <p>Welcome back! Manage your upcoming rides or find a new trip to campus.</p>
        {tabStrip}
      </header>

      {notifications.length > 0 && (
        <section style={{ display: 'grid', gap: '10px', marginBottom: '24px' }}>
          {notifications.map((notification) => {
            const ff = footageFormState[notification.id] || {};
            const sa = safetyActionState[notification.id] || {};
            const isFootageRequest = notification.type === NOTIFICATION_TYPES.adminRequest;
            const isSafetyCheckIn = notification.type === NOTIFICATION_TYPES.safetyCheckIn;
            const bannerBg = isSafetyCheckIn ? '#fff7ed' : '#fef2f2';
            const bannerColor = isSafetyCheckIn ? '#9a3412' : '#991b1b';
            const bannerBorder = isSafetyCheckIn ? '#fed7aa' : '#fecaca';
            return (
              <div key={notification.id} role="status" style={{ border: `1px solid ${bannerBorder}`, borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '14px 16px', backgroundColor: bannerBg, color: bannerColor, fontWeight: 700 }}>
                  <span data-testid={isSafetyCheckIn ? 'safety-check-in-message' : undefined}>
                    {isSafetyCheckIn && <span aria-hidden="true" style={{ marginRight: '6px' }}>🛟</span>}
                    {notification.message || 'Your ride request update is ready.'}
                  </span>
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    {isSafetyCheckIn ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleConfirmSafe(notification)}
                          disabled={Boolean(sa.submitting)}
                          style={{ border: 'none', borderRadius: '8px', background: '#047857', color: '#fff', cursor: sa.submitting ? 'wait' : 'pointer', fontWeight: 700, padding: '8px 12px', whiteSpace: 'nowrap', fontSize: '13px' }}
                        >
                          {sa.submitting === 'safe' ? 'Saving…' : "I'M SAFE"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRequestHelp(notification)}
                          disabled={Boolean(sa.submitting)}
                          data-testid="safety-need-help"
                          style={{ border: 'none', borderRadius: '8px', background: '#b91c1c', color: '#fff', cursor: sa.submitting ? 'wait' : 'pointer', fontWeight: 700, padding: '8px 12px', whiteSpace: 'nowrap', fontSize: '13px' }}
                        >
                          {sa.submitting === 'help' ? 'Alerting…' : 'NEED HELP'}
                        </button>
                      </>
                    ) : (
                      <>
                        {isFootageRequest && (
                          <button
                            type="button"
                            onClick={() => updateFootageForm(notification.id, { open: !ff.open })}
                            style={{ border: 'none', borderRadius: '8px', background: '#991b1b', color: '#fff', cursor: 'pointer', fontWeight: 700, padding: '8px 12px', whiteSpace: 'nowrap', fontSize: '13px' }}
                          >
                            {ff.open ? 'Cancel' : 'Submit Footage'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDismissNotification(notification.id)}
                          style={{ border: '1px solid #fecaca', borderRadius: '8px', background: '#fff', color: '#991b1b', cursor: 'pointer', fontWeight: 700, padding: '8px 10px', whiteSpace: 'nowrap', fontSize: '13px' }}
                        >
                          Mark read
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {isSafetyCheckIn && sa.error && (
                  <div style={{ background: '#fff', padding: '10px 16px', borderTop: `1px solid ${bannerBorder}`, color: '#b91c1c', fontSize: '12px' }}>
                    {sa.error}
                  </div>
                )}
                {isFootageRequest && ff.open && (
                  <div style={{ background: '#fff', padding: '14px 16px', borderTop: '1px solid #fecaca', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <p style={{ margin: 0, fontSize: '13px', color: '#555' }}>Describe what the footage shows, or share a link (Google Drive, Dropbox, etc.).</p>
                    <textarea
                      placeholder="Describe what happened and what the footage shows…"
                      value={ff.description || ''}
                      onChange={e => updateFootageForm(notification.id, { description: e.target.value })}
                      rows={3}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', outline: 'none' }}
                    />
                    <input
                      type="url"
                      placeholder="Footage link (optional) — e.g. https://drive.google.com/…"
                      value={ff.link || ''}
                      onChange={e => updateFootageForm(notification.id, { link: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }}
                    />
                    {ff.error && <p style={{ margin: 0, color: '#dc2626', fontSize: '12px' }}>{ff.error}</p>}
                    <button
                      type="button"
                      onClick={() => handleSubmitFootage(notification)}
                      disabled={ff.submitting}
                      style={{ alignSelf: 'flex-start', padding: '9px 20px', border: 'none', borderRadius: '6px', background: '#991b1b', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: ff.submitting ? 'wait' : 'pointer' }}
                    >
                      {ff.submitting ? 'Submitting…' : 'Submit Response'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {message && (
        <p
          style={{
            padding: '10px 12px',
            borderRadius: '8px',
            backgroundColor: message.startsWith('Error') ? '#fef2f2' : '#ecfdf5',
            color: message.startsWith('Error') ? '#991b1b' : '#047857',
            fontWeight: 700,
          }}
        >
          {message}
        </p>
      )}

      <section
        style={{
          marginBottom: '24px',
          padding: '14px 16px',
          border: '1px solid #ddd',
          borderRadius: '8px',
          backgroundColor: '#f9fafb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: '220px', flex: 1 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: '1rem' }}>Trip cancellation alerts</h2>
          <p style={{ margin: 0, color: '#555', fontSize: '0.9rem' }}>
            {pushMessage || 'Enable browser alerts if a driver cancels one of your approved rides.'}
          </p>
        </div>
        <button
          type="button"
          onClick={handleEnablePush}
          disabled={pushStatus === 'working' || pushStatus === 'unavailable' || pushStatus === 'denied'}
          style={{
            border: '1px solid #0f766e',
            borderRadius: '8px',
            backgroundColor: pushStatus === 'ready' ? '#ecfdf5' : '#fff',
            color: pushStatus === 'ready' ? '#047857' : '#0f766e',
            cursor:
              pushStatus === 'working' || pushStatus === 'unavailable' || pushStatus === 'denied'
                ? 'not-allowed'
                : 'pointer',
            fontWeight: 700,
            padding: '9px 12px',
            opacity: pushStatus === 'working' || pushStatus === 'unavailable' || pushStatus === 'denied' ? 0.65 : 1,
          }}
        >
          {pushStatus === 'working'
            ? 'Enabling...'
            : pushStatus === 'ready'
              ? 'Enabled'
              : 'Notification' in window && Notification.permission === 'granted'
                ? 'Refresh token'
                : 'Enable push'}
        </button>
      </section>

      {viewingTrip ? (
        <TripDetails 
          trip={viewingTrip} 
          passengerLocation={searchedPassengerLocation}
          onBack={() => {
            setViewingTrip(null);
            setSearchedPassengerLocation(null);
          }} 
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' }}>
          {/* Left Column: Search & Action Area */}
          <section>
            <div style={{ backgroundColor: '#f9f9f9', padding: '20px', borderRadius: '8px' }}>
              <SearchTrips 
                onTripSelect={(trip, location) => {
                  setViewingTrip(trip);
                  setSearchedPassengerLocation(location);
                }} 
              />
            </div>
          </section>

        {/* Right Column: Bookings Area */}
        <section>
          {message && (
            <div style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '10px 15px', borderRadius: '8px', marginBottom: '15px' }}>
              {message}
            </div>
          )}
          {loading ? (
            <p>Loading your rides...</p>
          ) : (
            <>
              {/* Upcoming Rides */}
              <div style={{ marginBottom: '30px' }}>
                <h2>Upcoming Rides</h2>
                {actualUpcomingRides.length === 0 ? (
                  <p style={{ color: '#666' }}>You have no upcoming rides booked.</p>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0 }}>
                    {actualUpcomingRides.map((ride) => (
                      <li
                        key={ride.id}
                        style={{
                          padding: '15px',
                          border: '1px solid #ccc',
                          borderRadius: '5px',
                          marginBottom: '10px',
                        }}
                      >
                        <strong>{ride.trip?.destination || 'Unknown destination'}</strong>
                        <div style={{ color: '#555', marginTop: '6px' }}>
                          {ride.trip?.origin || 'Unknown origin'} to {ride.trip?.destination || 'Unknown destination'}
                        </div>
                        <div style={{ color: '#555', marginTop: '6px' }}>
                          {formatDeparture(ride.trip?.departureTime)}
                        </div>
                        <div style={{ color: '#555', marginTop: '6px' }}>
                          {ride.seatsRequested || 1} seat(s) requested
                        </div>
                        <div style={{ 
                          color: ride.status === RIDE_REQUEST_STATUS.pending ? '#d97706' : '#059669', 
                          fontWeight: 'bold', 
                          marginTop: '6px' 
                        }}>
                          Status: {ride.status === RIDE_REQUEST_STATUS.pending ? 'Pending Approval' : 'Approved'}
                        </div>
                        {ride.trip?.status === 'in_progress' && (
                          <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            marginTop: '8px',
                            padding: '6px 12px',
                            backgroundColor: '#ecfdf5',
                            color: '#059669',
                            fontWeight: 'bold',
                            fontSize: '0.85rem',
                            borderRadius: '20px',
                            border: '1px solid #10b98130',
                            animation: 'pulse-slow 2s infinite'
                          }}>
                            <span style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              backgroundColor: '#10b981',
                              display: 'inline-block',
                              animation: 'ping 1.5s infinite'
                            }} />
                            <style>{`
                              @keyframes pulse-slow {
                                0%, 100% { opacity: 1; }
                                50% { opacity: 0.8; }
                              }
                              @keyframes ping {
                                0% { transform: scale(1); opacity: 1; }
                                70%, 100% { transform: scale(2.2); opacity: 0; }
                              }
                            `}</style>
                            🚗 Trip In Progress!
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                          <button
                            type="button"
                            onClick={() => setRideToCancel(ride)}
                            disabled={cancellingRideId === ride.id}
                            style={{
                              border: '1px solid #fecaca',
                              borderRadius: '8px',
                              backgroundColor: '#fff',
                              color: '#b91c1c',
                              cursor: cancellingRideId === ride.id ? 'wait' : 'pointer',
                              fontWeight: 700,
                              padding: '9px 12px',
                            }}
                          >
                            {cancellingRideId === ride.id ? 'Cancelling...' : 'Cancel Seat'}
                          </button>

                          {canViewChat(ride.status) && (
                            <button
                              type="button"
                              onClick={() => setChatModalRide(ride)}
                              style={{
                                border: '1px solid #0ea5e9',
                                borderRadius: '8px',
                                backgroundColor: '#0ea5e9',
                                color: '#fff',
                                cursor: 'pointer',
                                fontWeight: 700,
                                padding: '9px 12px',
                              }}
                            >
                              Chat with Driver
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Past Rides & Ratings */}
              <div>
                <h2>Ride History</h2>
                {actualPastRides.length === 0 ? (
                  <p style={{ color: '#666' }}>You have no past rides.</p>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0 }}>
                    {actualPastRides.map(ride => {
                      const isRated = ratedRideIds.includes(ride.id) || ride.hasRated;
                      const isReported = reportedRideIds.includes(ride.id);
                      return (
                        <li key={`past-${ride.id}`} style={{ padding: '15px', border: '1px solid #eee', borderRadius: '5px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                          <div>
                            <strong>{ride.trip?.destination || 'Unknown destination'}</strong>
                            <div style={{ color: '#555', fontSize: '0.9rem' }}>{formatDeparture(ride.trip?.departureTime)}</div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                              onClick={() => setRatingModalRide(ride)}
                              disabled={isRated}
                              style={{
                                padding: '8px 16px',
                                borderRadius: '8px',
                                border: 'none',
                                backgroundColor: isRated ? '#e5e7eb' : '#2563eb',
                                color: isRated ? '#9ca3af' : '#fff',
                                cursor: isRated ? 'not-allowed' : 'pointer',
                                fontWeight: 'bold'
                              }}
                            >
                              {isRated ? 'Rated ★' : 'Leave Rating'}
                            </button>
                            <button
                              onClick={() => setReportModalRide(ride)}
                              disabled={isReported}
                              style={{
                                padding: '8px 16px',
                                borderRadius: '8px',
                                border: '1px solid rgba(220, 38, 38, 0.35)',
                                backgroundColor: isReported ? '#f3f4f6' : '#fff',
                                color: isReported ? '#9ca3af' : '#dc2626',
                                cursor: isReported ? 'not-allowed' : 'pointer',
                                fontWeight: 'bold'
                              }}
                            >
                              {isReported ? 'Reported' : 'Report Driver'}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {ratingModalRide && (
                <LeaveRatingModal
                  ride={ratingModalRide}
                  onClose={() => setRatingModalRide(null)}
                  onRatingSubmitted={(rideId) => {
                    setRatedRideIds(prev => [...prev, rideId]);
                  }}
                />
              )}

              {reportModalRide && (
                <ReportUserModal
                  reportedUserId={reportModalRide.tripOwnerId || reportModalRide.trip?.driverId}
                  reportedUserName={reportModalRide.trip?.driverName || 'Driver'}
                  reporterId={auth.currentUser?.uid}
                  tripId={reportModalRide.tripId}
                  onClose={() => setReportModalRide(null)}
                  onReported={() => setReportedRideIds(prev => [...prev, reportModalRide.id])}
                />
              )}

              {chatModalRide && (
                <ChatWindow
                  rideRequest={chatModalRide}
                  currentUser={auth.currentUser}
                  onClose={() => setChatModalRide(null)}
                />
              )}
            </>
          )}
        </section>
      </div>
      )}

      {rideToCancel && (
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
            aria-labelledby="cancel-seat-title"
            style={{
              width: '100%',
              maxWidth: '420px',
              borderRadius: '8px',
              backgroundColor: '#fff',
              padding: '22px',
              boxShadow: '0 20px 45px rgba(15, 23, 42, 0.24)',
            }}
          >
            <h2 id="cancel-seat-title" style={{ marginTop: 0 }}>
              Cancel seat reservation?
            </h2>
            <p style={{ color: '#555', lineHeight: 1.5 }}>
              This will remove the upcoming ride from your dashboard and let the driver know you are no longer joining.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button
                type="button"
                onClick={() => setRideToCancel(null)}
                disabled={Boolean(cancellingRideId)}
                style={{
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  backgroundColor: '#fff',
                  color: '#333',
                  cursor: cancellingRideId ? 'wait' : 'pointer',
                  fontWeight: 700,
                  padding: '10px 14px',
                }}
              >
                Keep Seat
              </button>
              <button
                type="button"
                onClick={handleCancelSeat}
                disabled={Boolean(cancellingRideId)}
                style={{
                  border: '1px solid #b91c1c',
                  borderRadius: '8px',
                  backgroundColor: '#b91c1c',
                  color: '#fff',
                  cursor: cancellingRideId ? 'wait' : 'pointer',
                  fontWeight: 700,
                  padding: '10px 14px',
                }}
              >
                {cancellingRideId ? 'Cancelling...' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PassengerDashboard;
