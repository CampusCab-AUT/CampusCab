/**
 * @fileoverview Defines the core Firestore database schema and enums used across the CampusCab application.
 * Centralizing these values prevents typos and makes refactoring easier.
 */

/**
 * Standardized collection names mapped to their Firestore string values.
 * @constant {Object}
 */
export const FIRESTORE_COLLECTIONS = {
  users: 'users',
  trips: 'trips',
  vehicles: 'vehicles',
  rideRequests: 'rideRequests',
  notifications: 'notifications',
  pushTokens: 'pushTokens',
  ratings: 'ratings',
  reports: 'reports',
  auditLogs: 'auditLogs',
  chats: 'chats',
  calls: 'calls',
  routeAlerts: 'routeAlerts',
};

/**
 * Represents the lifecycle status of a Trip (e.g. if the car is full).
 * @constant {Object}
 */
export const TRIP_STATUS = {
  active: 'active',
  full: 'full',
  cancelled: 'cancelled',
  inProgress: 'in_progress',
  completed: 'completed',
};

/**
 * Represents the approval lifecycle of a passenger's request to join a trip.
 * @constant {Object}
 */
export const RIDE_REQUEST_STATUS = {
  pending: 'pending',
  approved: 'approved',
  declined: 'declined',
  cancelled: 'cancelled',
};

/**
 * Represents the read state of a push notification.
 * @constant {Object}
 */
export const NOTIFICATION_STATUS = {
  unread: 'unread',
  read: 'read',
};

/**
 * Represents the lifecycle of a passenger route alert.
 * @constant {Object}
 */
export const ROUTE_ALERT_STATUS = {
  active: 'active',
  paused: 'paused',
  fulfilled: 'fulfilled',
};

/**
 * Scope options that control how long a route alert remains eligible to match new trips.
 * @constant {Object}
 */
export const ROUTE_ALERT_SCOPE = {
  date: 'date',
  week: 'week',
  ongoing: 'ongoing',
};

