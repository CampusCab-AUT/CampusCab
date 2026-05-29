const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const RIDE_REQUEST_STATUS = {
  pending: 'pending',
  approved: 'approved',
  cancelled: 'cancelled',
};

const TRIP_STATUS = {
  active: 'active',
  full: 'full',
  cancelled: 'cancelled',
  inProgress: 'in_progress',
  completed: 'completed',
};

const NOTIFICATION_STATUS = {
  unread: 'unread',
};

const SAFETY_CHECK_IN_STATUS = {
  pending: 'pending',
  safe: 'safe',
  helpRequested: 'help_requested',
};

const SAFETY_ALERT_CATEGORY = 'SAFETY_ALERT';
const SAFETY_CHECK_IN_GRACE_MINUTES = 10;

const ROUTE_ALERT_STATUS = {
  active: 'active',
  paused: 'paused',
  fulfilled: 'fulfilled',
};

function haversineKm(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371;
  const toRad = (n) => (n * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function tripMatchesAlert(trip, alert) {
  if (!trip || !alert) return false;
  if ((alert.status || ROUTE_ALERT_STATUS.active) !== ROUTE_ALERT_STATUS.active) return false;
  if (!trip.destination || trip.destination !== alert.destination) return false;
  if (trip.womenOnly && !alert.womenOnlyOk) return false;

  const depRaw = trip.departureTime;
  if (!depRaw) return false;
  const depDate = new Date(depRaw);
  if (Number.isNaN(depDate.getTime())) return false;

  const depYmd = typeof depRaw === 'string' && depRaw.length >= 10
    ? depRaw.slice(0, 10)
    : depDate.toISOString().slice(0, 10);

  if (alert.startDate && depYmd < alert.startDate) return false;
  if (alert.endDate && depYmd > alert.endDate) return false;

  if (alert.earliestTime && depYmd === alert.startDate) {
    const depHm = typeof depRaw === 'string' && depRaw.length >= 16 ? depRaw.slice(11, 16) : null;
    if (depHm && depHm < alert.earliestTime) return false;
  }

  if (alert.originLocation && trip.originLocation) {
    const km = haversineKm(alert.originLocation, trip.originLocation);
    const radius = typeof alert.pickupRadiusKm === 'number' ? alert.pickupRadiusKm : 10;
    if (km > radius) return false;
  }

  return true;
}

const getSmtpTransporter = () =>
  nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

const SUSPENSION_EMAIL_HTML = ({ displayName, reason, duration }) => `
<!DOCTYPE html>
<html>
  <body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #d32f2f;">Your CampusCab Account Has Been Suspended</h2>
    <p>Hi ${displayName || 'there'},</p>
    <p>Your CampusCab account has been suspended by an administrator.</p>
    <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
      <tr>
        <td style="padding: 8px; font-weight: bold; width: 120px;">Reason:</td>
        <td style="padding: 8px;">${reason}</td>
      </tr>
      <tr style="background: #f5f5f5;">
        <td style="padding: 8px; font-weight: bold;">Duration:</td>
        <td style="padding: 8px;">${duration}</td>
      </tr>
    </table>
    <p>If you believe this is a mistake, please contact support.</p>
    <p style="color: #888; font-size: 12px;">— The CampusCab Team</p>
  </body>
</html>`;

const getPositiveInteger = (value, fallback = 1) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const getNonNegativeInteger = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
};

const deleteStaleTokens = async (response, tokenDocs, logContext) => {
  const staleTokenDeletes = response.responses
    .map((result, index) => {
      const errorCode = result.error?.code;
      const isStaleToken =
        errorCode === 'messaging/registration-token-not-registered' ||
        errorCode === 'messaging/invalid-registration-token';

      return isStaleToken ? tokenDocs[index].ref.delete() : null;
    })
    .filter(Boolean);

  if (staleTokenDeletes.length > 0) {
    await Promise.all(staleTokenDeletes);
    functions.logger.info('Deleted stale push tokens.', {
      ...logContext,
      deletedCount: staleTokenDeletes.length,
    });
  }
};

exports.onRideRequestCreated = functions.firestore
  .document('rideRequests/{requestId}')
  .onCreate(async (snap, context) => {
    const requestData = snap.data();
    const driverId = requestData.tripOwnerId;

    if (!driverId) {
      functions.logger.warn('Ride request has no tripOwnerId; skipping push notification.', {
        requestId: context.params.requestId,
      });
      return null;
    }

    const tokensSnapshot = await db
      .collection('pushTokens')
      .where('userId', '==', driverId)
      .where('role', '==', 'driver')
      .get();

    const tokenDocs = tokensSnapshot.docs
      .map((tokenDoc) => ({
        ref: tokenDoc.ref,
        token: tokenDoc.data().token,
      }))
      .filter((tokenDoc) => Boolean(tokenDoc.token));
    const tokens = tokenDocs.map((tokenDoc) => tokenDoc.token);

    if (tokens.length === 0) {
      functions.logger.info('No driver push tokens found for ride request.', {
        driverId,
        requestId: context.params.requestId,
      });
      return null;
    }

    const seatsRequested = requestData.seatsRequested || 1;
    const passengerName = requestData.passengerName || 'A passenger';

    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: 'New ride request',
        body: `${passengerName} requested ${seatsRequested} seat(s).`,
      },
      data: {
        type: 'ride_request',
        requestId: context.params.requestId,
        tripId: requestData.tripId || '',
        url: '/',
        body: `${passengerName} requested ${seatsRequested} seat(s).`,
      },
      webpush: {
        fcmOptions: {
          link: '/',
        },
      },
    });

    functions.logger.info('Ride request push notification sent.', {
      driverId,
      requestId: context.params.requestId,
      successCount: response.successCount,
      failureCount: response.failureCount,
    });

    await deleteStaleTokens(response, tokenDocs, {
      driverId,
      requestId: context.params.requestId,
    });

    return null;
  });

exports.onTripCancelled = functions.firestore
  .document('trips/{tripId}')
  .onUpdate(async (change, context) => {
    const beforeData = change.before.data();
    const afterData = change.after.data();
    const previousStatus = (beforeData.status || '').toLowerCase();
    const nextStatus = (afterData.status || '').toLowerCase();

    if (
      previousStatus === TRIP_STATUS.cancelled ||
      nextStatus !== TRIP_STATUS.cancelled
    ) {
      return null;
    }

    const tripId = context.params.tripId;
    const requestsSnapshot = await db
      .collection('rideRequests')
      .where('tripId', '==', tripId)
      .get();

    const affectedRequests = requestsSnapshot.docs.filter((doc) => {
      const status = (doc.data().status || '').toLowerCase();
      return (
        status === RIDE_REQUEST_STATUS.approved ||
        status === RIDE_REQUEST_STATUS.pending ||
        (status === RIDE_REQUEST_STATUS.cancelled && doc.data().cancellationSource === 'driver_cancelled_trip')
      );
    });

    if (affectedRequests.length === 0) {
      functions.logger.info('Cancelled trip had no pending or approved passengers.', { tripId });
      return null;
    }

    const passengerIds = new Set();
    const batch = db.batch();
    const origin = afterData.origin || 'your pickup';
    const destination = afterData.destination || 'campus';
    const notificationMessage = `Your ride from ${origin} to ${destination} was cancelled by the driver.`;

    affectedRequests.forEach((requestDoc) => {
      const requestData = requestDoc.data();
      const passengerId = requestData.passengerId;
      const currentStatus = (requestData.status || '').toLowerCase();

      if (currentStatus !== RIDE_REQUEST_STATUS.cancelled) {
        batch.update(requestDoc.ref, {
          status: RIDE_REQUEST_STATUS.cancelled,
          cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
          cancellationSource: 'trip_cancelled',
          cancelledTripId: tripId,
        });
      }

      if (!passengerId) return;

      passengerIds.add(passengerId);
      
      if (requestData.cancellationSource !== 'driver_cancelled_trip') {
        batch.set(db.collection('notifications').doc(), {
          type: 'trip_cancelled',
          recipientId: passengerId,
          tripId,
          requestId: requestDoc.id,
          driverId: afterData.driverId || '',
          passengerId,
          status: NOTIFICATION_STATUS.unread,
          message: notificationMessage,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    });

    await batch.commit();

    const tokenDocsByPassenger = await Promise.all(
      Array.from(passengerIds).map(async (passengerId) => {
        const tokensSnapshot = await db
          .collection('pushTokens')
          .where('userId', '==', passengerId)
          .where('role', '==', 'passenger')
          .get();

        return tokensSnapshot.docs.map((tokenDoc) => ({
          ref: tokenDoc.ref,
          token: tokenDoc.data().token,
          passengerId,
        }));
      }),
    );
    const tokenDocs = tokenDocsByPassenger.flat().filter((tokenDoc) => Boolean(tokenDoc.token));
    const tokens = tokenDocs.map((tokenDoc) => tokenDoc.token);

    if (tokens.length === 0) {
      functions.logger.info('No passenger push tokens found for cancelled trip.', {
        tripId,
        passengerCount: passengerIds.size,
      });
      return null;
    }

    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: 'Trip cancelled',
        body: notificationMessage,
      },
      data: {
        type: 'trip_cancelled',
        tripId,
        url: '/',
        body: notificationMessage,
      },
      webpush: {
        fcmOptions: {
          link: '/',
        },
      },
    });

    functions.logger.info('Trip cancellation push notifications sent.', {
      tripId,
      successCount: response.successCount,
      failureCount: response.failureCount,
    });

    await deleteStaleTokens(response, tokenDocs, { tripId });

    return null;
  });

exports.onApprovedRideRequestCancelled = functions.firestore
  .document('rideRequests/{requestId}')
  .onUpdate(async (change, context) => {
    const beforeData = change.before.data();
    const afterData = change.after.data();
    const previousStatus = (beforeData.status || '').toLowerCase();
    const nextStatus = (afterData.status || '').toLowerCase();

    if (
      previousStatus !== RIDE_REQUEST_STATUS.approved ||
      nextStatus !== RIDE_REQUEST_STATUS.cancelled ||
      afterData.cancellationSource === 'trip_cancelled'
    ) {
      return null;
    }

    if (!afterData.tripId) {
      functions.logger.warn('Cancelled approved ride request has no tripId; skipping seat restore.', {
        requestId: context.params.requestId,
      });
      return null;
    }

    const restoreResult = await db.runTransaction(async (transaction) => {
      const tripRef = db.collection('trips').doc(afterData.tripId);
      const tripSnap = await transaction.get(tripRef);
      if (!tripSnap.exists) {
        functions.logger.warn('Cancelled approved ride request points to a missing trip; skipping seat restore.', {
          requestId: context.params.requestId,
          tripId: afterData.tripId,
        });
        return null;
      }

      const tripData = tripSnap.data();
      const seatsRequested = getPositiveInteger(afterData.seatsRequested, 1);
      const totalSeats = getPositiveInteger(tripData.seats, seatsRequested);
      const currentSeats = getNonNegativeInteger(tripData.availableSeats, totalSeats);
      const nextSeats = Math.min(currentSeats + seatsRequested, totalSeats);
      const tripUpdate = {
        availableSeats: nextSeats,
      };

      if (tripData.status === TRIP_STATUS.full && nextSeats > 0) {
        tripUpdate.status = TRIP_STATUS.active;
      }

      transaction.update(tripRef, tripUpdate);
      return {
        seatsRequested,
        restoredSeats: nextSeats - currentSeats,
      };
    });

    if (!restoreResult) {
      return null;
    }

    functions.logger.info('Restored seats after approved ride request cancellation.', {
      requestId: context.params.requestId,
      tripId: afterData.tripId,
      seatsRequested: restoreResult.seatsRequested,
      restoredSeats: restoreResult.restoredSeats,
    });

    // Late-cancellation strike: only for passenger-initiated cancellations
    const isPassengerInitiated = !afterData.cancellationSource;
    if (isPassengerInitiated && afterData.passengerId && afterData.tripId) {
      try {
        const tripSnap = await db.collection('trips').doc(afterData.tripId).get();
        if (tripSnap.exists) {
          const departureTime = tripSnap.data().departureTime;
          const departureMs = departureTime ? new Date(departureTime).getTime() : null;
          const cancelledMs = afterData.cancelledAt
            ? (afterData.cancelledAt.toDate ? afterData.cancelledAt.toDate().getTime() : new Date(afterData.cancelledAt).getTime())
            : Date.now();

          const THIRTY_MIN_MS = 30 * 60 * 1000;
          const STRIKE_THRESHOLD = 3;
          const isLateCancel = departureMs !== null && (departureMs - cancelledMs) < THIRTY_MIN_MS;

          if (isLateCancel) {
            const userRef = db.collection('users').doc(afterData.passengerId);
            await db.runTransaction(async (txn) => {
              const userSnap = await txn.get(userRef);
              if (!userSnap.exists) return;
              const currentCount = (userSnap.data().lateCancelCount || 0) + 1;
              const update = { lateCancelCount: currentCount };
              if (currentCount >= STRIKE_THRESHOLD) {
                update.flaggedForLateCancellations = true;
              }
              txn.update(userRef, update);
            });
            functions.logger.info('Late-cancellation strike recorded.', {
              passengerId: afterData.passengerId,
              tripId: afterData.tripId,
              minutesToDeparture: departureMs !== null ? Math.round((departureMs - cancelledMs) / 60000) : 'unknown',
            });
          }
        }
      } catch (err) {
        functions.logger.error('Failed to process late-cancellation strike.', { error: err.message });
      }
    }

    return null;
  });

exports.onUserSuspended = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    // Only fire when status transitions TO 'Suspended'
    if (before.accountStatus === 'Suspended' || after.accountStatus !== 'Suspended') {
      return null;
    }

    const { userId } = context.params;
    const reason = after.suspensionReason || 'Violation of terms of service';
    const duration = after.suspensionDuration || 'Indefinite';

    let userEmail;
    let displayName;
    try {
      const userRecord = await admin.auth().getUser(userId);
      userEmail = userRecord.email;
      displayName = userRecord.displayName;
    } catch (err) {
      functions.logger.error('onUserSuspended: failed to fetch user from Auth.', { userId, error: err.message });
      return null;
    }

    if (!userEmail) {
      functions.logger.warn('onUserSuspended: user has no email address; skipping notification.', { userId });
      return null;
    }

    try {
      const transporter = getSmtpTransporter();
      await transporter.sendMail({
        from: `"CampusCab" <${process.env.SMTP_USER}>`,
        to: userEmail,
        subject: 'Your CampusCab account has been suspended',
        html: SUSPENSION_EMAIL_HTML({ displayName, reason, duration }),
      });
      functions.logger.info('onUserSuspended: suspension email sent.', { userId, userEmail });
    } catch (err) {
      functions.logger.error('onUserSuspended: failed to send suspension email.', { userId, error: err.message });

      // Log "Notification Failed" to audit logs per acceptance criteria
      await db.collection('auditLogs').add({
        action: 'NOTIFICATION_FAILED',
        targetUserId: userId,
        notificationType: 'suspension_email',
        error: err.message,
        timestamp: new Date(),
      });
    }

    return null;
  });

const parseEtaToDate = (etaAt) => {
  if (!etaAt) return null;
  if (typeof etaAt.toDate === 'function') return etaAt.toDate();
  const parsed = new Date(etaAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const sendSafetyCheckInForTrip = async (tripDoc) => {
  const tripData = tripDoc.data();
  const tripId = tripDoc.id;

  const requestsSnapshot = await db
    .collection('rideRequests')
    .where('tripId', '==', tripId)
    .where('status', '==', RIDE_REQUEST_STATUS.approved)
    .get();

  const passengerIds = Array.from(
    new Set(
      requestsSnapshot.docs
        .map((requestDoc) => requestDoc.data().passengerId)
        .filter(Boolean),
    ),
  );

  if (passengerIds.length === 0) {
    await tripDoc.ref.update({
      'safetyCheckIn.status': SAFETY_CHECK_IN_STATUS.pending,
      'safetyCheckIn.sentAt': admin.firestore.FieldValue.serverTimestamp(),
      'safetyCheckIn.passengerCount': 0,
    });
    functions.logger.info('Safety check-in skipped: no approved passengers.', { tripId });
    return;
  }

  const origin = tripData.origin || 'your pickup';
  const destination = tripData.destination || 'campus';
  const checkInMessage = `Your trip from ${origin} to ${destination} should have arrived. Tap to confirm you are safe.`;

  const batch = db.batch();
  passengerIds.forEach((passengerId) => {
    batch.set(db.collection('notifications').doc(), {
      type: 'safety_check_in',
      recipientId: passengerId,
      tripId,
      driverId: tripData.driverId || '',
      status: NOTIFICATION_STATUS.unread,
      message: checkInMessage,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  batch.update(tripDoc.ref, {
    safetyCheckIn: {
      status: SAFETY_CHECK_IN_STATUS.pending,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      passengerCount: passengerIds.length,
    },
  });
  await batch.commit();

  const tokenDocsByPassenger = await Promise.all(
    passengerIds.map(async (passengerId) => {
      const tokensSnapshot = await db
        .collection('pushTokens')
        .where('userId', '==', passengerId)
        .where('role', '==', 'passenger')
        .get();
      return tokensSnapshot.docs
        .map((tokenDoc) => ({
          ref: tokenDoc.ref,
          token: tokenDoc.data().token,
        }))
        .filter((tokenDoc) => Boolean(tokenDoc.token));
    }),
  );
  const tokenDocs = tokenDocsByPassenger.flat();
  const tokens = tokenDocs.map((tokenDoc) => tokenDoc.token);

  if (tokens.length === 0) {
    functions.logger.info('Safety check-in: no passenger push tokens for trip.', { tripId });
    return;
  }

  const response = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: {
      title: 'Safety check-in',
      body: checkInMessage,
    },
    data: {
      type: 'safety_check_in',
      tripId,
      url: '/',
      body: checkInMessage,
    },
    webpush: {
      fcmOptions: {
        link: '/',
      },
    },
  });

  functions.logger.info('Safety check-in push sent.', {
    tripId,
    successCount: response.successCount,
    failureCount: response.failureCount,
  });

  await deleteStaleTokens(response, tokenDocs, { tripId });
};

exports.safetyCheckInScheduler = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async () => {
    const cutoff = new Date(Date.now() - SAFETY_CHECK_IN_GRACE_MINUTES * 60 * 1000);

    const tripsSnapshot = await db
      .collection('trips')
      .where('status', '==', TRIP_STATUS.inProgress)
      .get();

    const tripsNeedingPing = tripsSnapshot.docs.filter((tripDoc) => {
      const data = tripDoc.data();
      const existingStatus = data.safetyCheckIn?.status;
      if (existingStatus) return false;
      const etaDate = parseEtaToDate(data.etaAt);
      return etaDate ? etaDate <= cutoff : false;
    });

    if (tripsNeedingPing.length === 0) {
      return null;
    }

    functions.logger.info('Safety check-in scheduler firing.', {
      candidateCount: tripsNeedingPing.length,
    });

    await Promise.all(
      tripsNeedingPing.map(async (tripDoc) => {
        try {
          await sendSafetyCheckInForTrip(tripDoc);
        } catch (err) {
          functions.logger.error('Safety check-in failed for trip.', {
            tripId: tripDoc.id,
            error: err.message,
          });
        }
      }),
    );

    return null;
  });

exports.onSafetyAlertReportCreated = functions.firestore
  .document('reports/{reportId}')
  .onCreate(async (snap, context) => {
    const reportData = snap.data() || {};
    if (reportData.category !== SAFETY_ALERT_CATEGORY) {
      return null;
    }

    const reportId = context.params.reportId;
    const tripId = reportData.tripId || '';
    const passengerId = reportData.reporterId || '';

    await db.collection('auditLogs').add({
      action: 'SAFETY_ALERT_RAISED',
      reportId,
      tripId,
      passengerId,
      reportedUserId: reportData.reportedUserId || '',
      priority: reportData.priority || 'urgent',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (tripId) {
      try {
        await db.collection('trips').doc(tripId).update({
          flagged: true,
          flaggedReason: 'safety_alert',
          flaggedReportId: reportId,
          flaggedAt: admin.firestore.FieldValue.serverTimestamp(),
          'safetyCheckIn.status': SAFETY_CHECK_IN_STATUS.helpRequested,
          'safetyCheckIn.respondedAt': admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (err) {
        functions.logger.error('Failed to flag trip after safety alert.', {
          tripId,
          reportId,
          error: err.message,
        });
      }
    }

    functions.logger.info('Safety alert audit log written.', { reportId, tripId, passengerId });
    return null;
  });

/**
 * When a driver publishes a new active trip, fan out push notifications and
 * Firestore notification docs to every passenger whose active route alert
 * matches the trip (same destination, within the alert's date window, time
 * floor, women-only respect, and pickup proximity).
 *
 * The function queries routeAlerts by destination + status (cheap equality
 * filters) and runs the finer match logic in-memory so we don't need
 * composite indexes per alert field.
 */
exports.onTripCreated = functions.firestore
  .document('trips/{tripId}')
  .onCreate(async (snap, context) => {
    const tripData = snap.data();
    if (!tripData) return null;
    const tripId = context.params.tripId;
    const tripStatus = (tripData.status || '').toLowerCase();
    if (tripStatus && tripStatus !== TRIP_STATUS.active) {
      functions.logger.info('Trip created with non-active status; skipping route alert fanout.', {
        tripId,
        tripStatus,
      });
      return null;
    }
    if (!tripData.destination) {
      functions.logger.warn('Trip has no destination; skipping route alert fanout.', { tripId });
      return null;
    }

    const alertsSnap = await db
      .collection('routeAlerts')
      .where('destination', '==', tripData.destination)
      .where('status', '==', ROUTE_ALERT_STATUS.active)
      .get();

    if (alertsSnap.empty) {
      functions.logger.info('No active route alerts for trip destination.', {
        tripId,
        destination: tripData.destination,
      });
      return null;
    }

    const matches = alertsSnap.docs
      .map((d) => ({ id: d.id, ref: d.ref, ...d.data() }))
      .filter((alert) => tripMatchesAlert(tripData, alert))
      // Drivers don't push notifications to themselves.
      .filter((alert) => alert.passengerId !== tripData.driverId);

    if (matches.length === 0) {
      functions.logger.info('Trip matched zero active route alerts after in-memory filter.', {
        tripId,
        candidates: alertsSnap.size,
      });
      return null;
    }

    const origin = tripData.origin || 'a nearby pickup';
    const destShort = (tripData.destination || 'campus').split(',')[0];
    const message = `New ride matches your alert: ${origin} → ${destShort}.`;

    const batch = db.batch();
    matches.forEach((alert) => {
      batch.set(db.collection('notifications').doc(), {
        type: 'route_alert_match',
        recipientId: alert.passengerId,
        tripId,
        alertId: alert.id,
        driverId: tripData.driverId || '',
        status: NOTIFICATION_STATUS.unread,
        message,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      batch.update(alert.ref, {
        notificationsSent: admin.firestore.FieldValue.increment(1),
        lastMatchedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();

    // Fan out push notifications.
    const tokenDocsByPassenger = await Promise.all(
      matches.map(async (alert) => {
        const tokensSnapshot = await db
          .collection('pushTokens')
          .where('userId', '==', alert.passengerId)
          .where('role', '==', 'passenger')
          .get();
        return tokensSnapshot.docs.map((tokenDoc) => ({
          ref: tokenDoc.ref,
          token: tokenDoc.data().token,
          passengerId: alert.passengerId,
        }));
      }),
    );
    const tokenDocs = tokenDocsByPassenger.flat().filter((t) => Boolean(t.token));
    const tokens = tokenDocs.map((t) => t.token);

    if (tokens.length === 0) {
      functions.logger.info('Route alert match: no push tokens registered for matched passengers.', {
        tripId,
        matchedCount: matches.length,
      });
      return null;
    }

    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: '🔔 Route match!',
        body: message,
      },
      data: {
        type: 'route_alert_match',
        tripId,
        url: '/',
        body: message,
      },
      webpush: {
        fcmOptions: { link: '/' },
      },
    });

    functions.logger.info('Route alert push notifications sent.', {
      tripId,
      matchedCount: matches.length,
      successCount: response.successCount,
      failureCount: response.failureCount,
    });

    await deleteStaleTokens(response, tokenDocs, { tripId });
    return null;
  });

// Exported for unit testing the matching helper.
exports._internal = { tripMatchesAlert, haversineKm };
