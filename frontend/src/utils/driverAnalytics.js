// Assumption constants used to derive environmental impact estimates from
// completed-trip data. We do not store trip distance, so we approximate using
// a conservative average campus commute distance and NZ light-vehicle fleet
// averages. These are intentionally exported so the UI can surface them in a
// tooltip and so tests can pin the math.
export const AVG_TRIP_KM = 12;
export const CO2_PER_KM_KG = 0.171; // NZ light-vehicle CO2e factor (kg/km)
export const LITRES_PER_KM = 0.082; // ~8.2 L / 100 km NZ fleet average

const TRIP_STATUS_COMPLETED = 'completed';

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === 'function') {
    const d = value.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function seatsSoldFor(trip) {
  const total = Number(trip.seats);
  const remaining = Number(
    Number.isFinite(trip.availableSeats) ? trip.availableSeats : trip.seats,
  );
  if (!Number.isFinite(total)) return 0;
  if (!Number.isFinite(remaining)) return 0;
  return Math.max(0, total - remaining);
}

function earningsFor(trip) {
  const cost = Number(trip.costPerSeat);
  if (!Number.isFinite(cost) || cost <= 0) return 0;
  return seatsSoldFor(trip) * cost;
}

function isThisMonth(date, now = new Date()) {
  if (!date) return false;
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  );
}

function buildRatingDistribution(ratings) {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of ratings) {
    const score = Math.round(Number(r.score));
    if (score >= 1 && score <= 5) counts[score] += 1;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return [5, 4, 3, 2, 1].map((score) => ({
    score,
    count: counts[score],
    percent: total === 0 ? 0 : Math.round((counts[score] / total) * 100),
  }));
}

function busiestRouteFor(completedTrips) {
  if (completedTrips.length === 0) return null;
  const counts = new Map();
  for (const t of completedTrips) {
    const key = `${t.origin || 'Unknown'} → ${t.destination || 'Unknown'}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  // Stable tie-break: first-seen wins (Map preserves insertion order)
  for (const [route, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = route;
    }
  }
  return { route: best, count: bestCount };
}

function topDestinationsFor(completedTrips, limit = 3) {
  const counts = new Map();
  for (const t of completedTrips) {
    const key = t.destination || 'Unknown';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([destination, count]) => ({ destination, count }));
}

/**
 * Aggregate a driver's Firestore data into the metrics rendered by the
 * Driver Analytics screen. Pure function — easy to unit-test, no I/O.
 *
 * @param {object} input
 * @param {Array}  input.trips        Raw trip documents for this driver.
 * @param {Array}  input.ratings      Raw rating documents targeting this driver.
 * @param {object} [input.userProfile] User doc (for averageRating, totalRatings).
 * @param {Date}   [input.now]        Override "now" — used by tests.
 */
export function computeDriverAnalytics({
  trips = [],
  ratings = [],
  userProfile = {},
  now = new Date(),
} = {}) {
  const completed = trips.filter(
    (t) => (t.status || '').toLowerCase() === TRIP_STATUS_COMPLETED,
  );

  const tripsCompleted = completed.length;
  const tripsThisMonth = completed.filter((t) =>
    isThisMonth(toDate(t.completedAt) || toDate(t.departureTime), now),
  ).length;

  const passengersCarried = completed.reduce(
    (sum, t) => sum + seatsSoldFor(t),
    0,
  );

  const totalEarnedNZD = completed.reduce((sum, t) => sum + earningsFor(t), 0);

  const passengerKilometres = passengersCarried * AVG_TRIP_KM;
  const co2SavedKg = Number((passengerKilometres * CO2_PER_KM_KG).toFixed(1));
  const fuelSavedLitres = Number(
    (passengerKilometres * LITRES_PER_KM).toFixed(1),
  );

  const ratingDistribution = buildRatingDistribution(ratings);
  const averageRating = Number(userProfile.averageRating) || 0;
  const totalRatings =
    Number(userProfile.totalRatings) ||
    ratingDistribution.reduce((s, r) => s + r.count, 0);

  const completedSorted = [...completed].sort((a, b) => {
    const da = toDate(a.completedAt) || toDate(a.departureTime) || new Date(0);
    const dbb = toDate(b.completedAt) || toDate(b.departureTime) || new Date(0);
    return dbb.getTime() - da.getTime();
  });

  const recentTrips = completedSorted.slice(0, 5).map((t) => ({
    id: t.id,
    origin: t.origin || 'Unknown',
    destination: t.destination || 'Unknown',
    when: toDate(t.completedAt) || toDate(t.departureTime),
    seatsSold: seatsSoldFor(t),
    earnedNZD: earningsFor(t),
  }));

  return {
    tripsCompleted,
    tripsThisMonth,
    passengersCarried,
    totalEarnedNZD: Number(totalEarnedNZD.toFixed(2)),
    averageRating,
    totalRatings,
    ratingDistribution,
    co2SavedKg,
    fuelSavedLitres,
    busiestRoute: busiestRouteFor(completed),
    topDestinations: topDestinationsFor(completed),
    recentTrips,
  };
}
