import { ROUTE_ALERT_SCOPE, ROUTE_ALERT_STATUS } from '../firestoreModel';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const str = String(value);
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function haversineKm(a, b) {
  const R = 6371;
  const toRad = (n) => (n * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Computes the inclusive end date for an alert given its scope.
 * `date` → same day; `week` → 6 days later; `ongoing` → null.
 */
export function deriveEndDate(scope, startDate) {
  const start = toDateOnly(startDate);
  if (!start) return null;
  if (scope === ROUTE_ALERT_SCOPE.date) return formatYmd(start);
  if (scope === ROUTE_ALERT_SCOPE.week) return formatYmd(addDays(start, 6));
  return null;
}

/**
 * Builds the payload for a routeAlerts Firestore document from the search form state.
 * Pure: no Firestore imports, easy to test.
 */
export function buildAlertFromSearch({
  passengerId,
  passengerEmail,
  passengerGender,
  campus,
  date,
  time,
  passengerLocation,
  pickupLabel,
  scope = ROUTE_ALERT_SCOPE.date,
  pickupRadiusKm = 10,
}) {
  if (!passengerId) throw new Error('passengerId is required');
  if (!campus) throw new Error('destination campus is required');
  if (!date) throw new Error('start date is required');
  const normalizedScope = Object.values(ROUTE_ALERT_SCOPE).includes(scope)
    ? scope
    : ROUTE_ALERT_SCOPE.date;
  return {
    passengerId,
    passengerEmail: passengerEmail || null,
    destination: campus,
    origin: pickupLabel || null,
    originLocation: passengerLocation
      ? { lat: passengerLocation.lat, lon: passengerLocation.lon }
      : null,
    pickupRadiusKm,
    womenOnlyOk: passengerGender === 'Female',
    scope: normalizedScope,
    startDate: date,
    endDate: deriveEndDate(normalizedScope, date),
    earliestTime: time || null,
    status: ROUTE_ALERT_STATUS.active,
    notificationsSent: 0,
    lastMatchedAt: null,
  };
}

/**
 * Pure matching predicate. Returns true if the trip should fire a push for this alert.
 * Trip is the raw Firestore data; alert is the routeAlerts document data.
 */
export function tripMatchesAlert(trip, alert) {
  if (!trip || !alert) return false;
  if (alert.status && alert.status !== ROUTE_ALERT_STATUS.active) return false;
  if (!trip.destination || trip.destination !== alert.destination) return false;
  if (trip.womenOnly && !alert.womenOnlyOk) return false;

  const depRaw = trip.departureTime;
  if (!depRaw) return false;
  const depDate = new Date(depRaw);
  if (Number.isNaN(depDate.getTime())) return false;

  const depYmd = typeof depRaw === 'string' && depRaw.length >= 10
    ? depRaw.slice(0, 10)
    : formatYmd(depDate);

  const start = alert.startDate;
  if (start && depYmd < start) return false;
  const end = alert.endDate;
  if (end && depYmd > end) return false;

  if (alert.earliestTime && depYmd === start) {
    const depHm = depRaw.length >= 16 ? depRaw.slice(11, 16) : null;
    if (depHm && depHm < alert.earliestTime) return false;
  }

  if (alert.originLocation && trip.originLocation) {
    const km = haversineKm(alert.originLocation, trip.originLocation);
    const radius = typeof alert.pickupRadiusKm === 'number' ? alert.pickupRadiusKm : 10;
    if (km > radius) return false;
  }

  return true;
}

/**
 * Human-friendly scope description, e.g. "Just Mon Jun 1" or "Through Sun Jun 7".
 */
export function formatAlertScope(alert) {
  if (!alert) return '';
  const fmt = (ymd) => {
    const d = toDateOnly(ymd);
    if (!d) return ymd;
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  };
  if (alert.scope === ROUTE_ALERT_SCOPE.ongoing) return `Ongoing from ${fmt(alert.startDate)}`;
  if (alert.scope === ROUTE_ALERT_SCOPE.week) return `${fmt(alert.startDate)} – ${fmt(alert.endDate)}`;
  return `Just ${fmt(alert.startDate)}`;
}

export { haversineKm };
