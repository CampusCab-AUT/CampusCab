import { describe, it, expect } from 'vitest';
import {
  computeDriverAnalytics,
  AVG_TRIP_KM,
  CO2_PER_KM_KG,
  LITRES_PER_KM,
} from './driverAnalytics';

const trip = (overrides = {}) => ({
  id: 't',
  status: 'completed',
  origin: 'North Shore',
  destination: 'City Campus',
  seats: 3,
  availableSeats: 0,
  costPerSeat: 5,
  departureTime: '2026-05-01T08:00',
  ...overrides,
});

describe('computeDriverAnalytics', () => {
  it('returns zeros when no data is provided', () => {
    const a = computeDriverAnalytics();
    expect(a.tripsCompleted).toBe(0);
    expect(a.tripsThisMonth).toBe(0);
    expect(a.passengersCarried).toBe(0);
    expect(a.totalEarnedNZD).toBe(0);
    expect(a.averageRating).toBe(0);
    expect(a.totalRatings).toBe(0);
    expect(a.co2SavedKg).toBe(0);
    expect(a.fuelSavedLitres).toBe(0);
    expect(a.busiestRoute).toBeNull();
    expect(a.recentTrips).toEqual([]);
    expect(a.ratingDistribution.every((r) => r.count === 0)).toBe(true);
  });

  it('ignores trips that are not completed', () => {
    const a = computeDriverAnalytics({
      trips: [
        trip({ id: '1', status: 'active' }),
        trip({ id: '2', status: 'cancelled' }),
        trip({ id: '3', status: 'completed' }),
      ],
    });
    expect(a.tripsCompleted).toBe(1);
    expect(a.passengersCarried).toBe(3);
  });

  it('sums passengers carried and earnings from completed trips', () => {
    const a = computeDriverAnalytics({
      trips: [
        trip({ id: '1', seats: 3, availableSeats: 1, costPerSeat: 4 }), // 2 seats * $4 = $8
        trip({ id: '2', seats: 4, availableSeats: 0, costPerSeat: 6 }), // 4 seats * $6 = $24
      ],
    });
    expect(a.passengersCarried).toBe(6);
    expect(a.totalEarnedNZD).toBe(32);
  });

  it('treats missing costPerSeat as zero earnings', () => {
    const a = computeDriverAnalytics({
      trips: [trip({ costPerSeat: null, seats: 2, availableSeats: 0 })],
    });
    expect(a.passengersCarried).toBe(2);
    expect(a.totalEarnedNZD).toBe(0);
  });

  it('derives CO2 saved and fuel saved from passenger kilometres', () => {
    const a = computeDriverAnalytics({
      trips: [trip({ seats: 2, availableSeats: 0 })], // 2 passengers
    });
    const passengerKm = 2 * AVG_TRIP_KM;
    expect(a.co2SavedKg).toBe(Number((passengerKm * CO2_PER_KM_KG).toFixed(1)));
    expect(a.fuelSavedLitres).toBe(
      Number((passengerKm * LITRES_PER_KM).toFixed(1)),
    );
  });

  it('builds a rating distribution from 1–5 scored ratings', () => {
    const a = computeDriverAnalytics({
      ratings: [
        { score: 5 }, { score: 5 }, { score: 5 },
        { score: 4 },
        { score: 1 },
      ],
    });
    const byScore = Object.fromEntries(
      a.ratingDistribution.map((r) => [r.score, r]),
    );
    expect(byScore[5].count).toBe(3);
    expect(byScore[5].percent).toBe(60);
    expect(byScore[4].count).toBe(1);
    expect(byScore[1].count).toBe(1);
    expect(byScore[2].count).toBe(0);
    expect(a.totalRatings).toBe(5);
  });

  it('prefers userProfile aggregate rating fields when present', () => {
    const a = computeDriverAnalytics({
      userProfile: { averageRating: 4.7, totalRatings: 42 },
    });
    expect(a.averageRating).toBe(4.7);
    expect(a.totalRatings).toBe(42);
  });

  it('counts trips this month using "now" override', () => {
    const now = new Date('2026-05-20T12:00:00');
    const a = computeDriverAnalytics({
      now,
      trips: [
        trip({ id: 'a', departureTime: '2026-05-02T08:00' }),
        trip({ id: 'b', departureTime: '2026-04-29T08:00' }),
        trip({ id: 'c', departureTime: '2026-05-19T08:00' }),
      ],
    });
    expect(a.tripsCompleted).toBe(3);
    expect(a.tripsThisMonth).toBe(2);
  });

  it('picks the most common route as busiest with stable tie-break', () => {
    const a = computeDriverAnalytics({
      trips: [
        trip({ id: '1', origin: 'A', destination: 'B' }),
        trip({ id: '2', origin: 'A', destination: 'B' }),
        trip({ id: '3', origin: 'C', destination: 'D' }),
      ],
    });
    expect(a.busiestRoute).toEqual({ route: 'A → B', count: 2 });
  });

  it('returns up to 5 recent trips sorted by most recent first', () => {
    const a = computeDriverAnalytics({
      trips: [
        trip({ id: 'old', departureTime: '2025-01-01T08:00' }),
        trip({ id: 'new', departureTime: '2026-05-10T08:00' }),
        trip({ id: 'mid', departureTime: '2025-12-01T08:00' }),
      ],
    });
    expect(a.recentTrips.map((t) => t.id)).toEqual(['new', 'mid', 'old']);
  });
});
