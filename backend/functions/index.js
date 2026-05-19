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
};

const NOTIFICATION_STATUS = {
  unread: 'unread',
};

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
