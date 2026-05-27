import { describe, it, expect } from 'vitest';
import {
  buildAlertFromSearch,
  tripMatchesAlert,
  deriveEndDate,
  formatAlertScope,
} from './routeAlerts';
import { ROUTE_ALERT_SCOPE, ROUTE_ALERT_STATUS } from '../firestoreModel';

const baseTrip = {
  destination: 'AUT City Campus, 55 Wellesley Street East',
  departureTime: '2026-06-01T08:30',
  originLocation: { lat: -36.85, lon: 174.76 },
  womenOnly: false,
};

const baseAlert = {
  destination: 'AUT City Campus, 55 Wellesley Street East',
  status: ROUTE_ALERT_STATUS.active,
  womenOnlyOk: false,
  startDate: '2026-06-01',
  endDate: '2026-06-01',
  earliestTime: '08:00',
  originLocation: { lat: -36.85, lon: 174.76 },
  pickupRadiusKm: 10,
  scope: ROUTE_ALERT_SCOPE.date,
};

describe('deriveEndDate', () => {
  it('returns the same day for "date" scope', () => {
    expect(deriveEndDate('date', '2026-06-01')).toBe('2026-06-01');
  });
  it('returns +6 days for "week"', () => {
    expect(deriveEndDate('week', '2026-06-01')).toBe('2026-06-07');
  });
  it('returns null for "ongoing"', () => {
    expect(deriveEndDate('ongoing', '2026-06-01')).toBeNull();
  });
});

describe('buildAlertFromSearch', () => {
  it('builds an active alert from search form state', () => {
    const alert = buildAlertFromSearch({
      passengerId: 'p1',
      passengerEmail: 'p@x.com',
      passengerGender: 'Female',
      campus: 'AUT City Campus',
      date: '2026-06-01',
      time: '08:00',
      passengerLocation: { lat: -36.85, lon: 174.76 },
      pickupLabel: 'Henderson',
      scope: 'week',
    });
    expect(alert.status).toBe(ROUTE_ALERT_STATUS.active);
    expect(alert.destination).toBe('AUT City Campus');
    expect(alert.womenOnlyOk).toBe(true);
    expect(alert.endDate).toBe('2026-06-07');
    expect(alert.originLocation).toEqual({ lat: -36.85, lon: 174.76 });
    expect(alert.passengerId).toBe('p1');
  });
  it('throws without a passenger id', () => {
    expect(() =>
      buildAlertFromSearch({ campus: 'X', date: '2026-06-01' }),
    ).toThrow();
  });
  it('non-Female passenger has womenOnlyOk false', () => {
    const alert = buildAlertFromSearch({
      passengerId: 'p1',
      passengerGender: 'Male',
      campus: 'X',
      date: '2026-06-01',
    });
    expect(alert.womenOnlyOk).toBe(false);
  });
});

describe('tripMatchesAlert', () => {
  it('matches when destination, date and time align', () => {
    expect(tripMatchesAlert(baseTrip, baseAlert)).toBe(true);
  });
  it('rejects different destination', () => {
    expect(
      tripMatchesAlert({ ...baseTrip, destination: 'AUT North' }, baseAlert),
    ).toBe(false);
  });
  it('rejects paused alerts', () => {
    expect(
      tripMatchesAlert(baseTrip, { ...baseAlert, status: ROUTE_ALERT_STATUS.paused }),
    ).toBe(false);
  });
  it('rejects trips before earliestTime', () => {
    expect(
      tripMatchesAlert(
        { ...baseTrip, departureTime: '2026-06-01T06:30' },
        baseAlert,
      ),
    ).toBe(false);
  });
  it('rejects trips outside the date window', () => {
    expect(
      tripMatchesAlert(
        { ...baseTrip, departureTime: '2026-06-02T08:30' },
        baseAlert,
      ),
    ).toBe(false);
  });
  it('accepts trips within a week-scope window', () => {
    const alert = { ...baseAlert, scope: 'week', endDate: '2026-06-07', earliestTime: null };
    expect(
      tripMatchesAlert(
        { ...baseTrip, departureTime: '2026-06-04T15:00' },
        alert,
      ),
    ).toBe(true);
  });
  it('accepts ongoing-scope alerts indefinitely', () => {
    const alert = { ...baseAlert, scope: 'ongoing', endDate: null, earliestTime: null };
    expect(
      tripMatchesAlert(
        { ...baseTrip, departureTime: '2027-01-15T09:00' },
        alert,
      ),
    ).toBe(true);
  });
  it('rejects women-only trips when womenOnlyOk is false', () => {
    expect(
      tripMatchesAlert({ ...baseTrip, womenOnly: true }, baseAlert),
    ).toBe(false);
  });
  it('allows women-only trips when womenOnlyOk is true', () => {
    expect(
      tripMatchesAlert(
        { ...baseTrip, womenOnly: true },
        { ...baseAlert, womenOnlyOk: true },
      ),
    ).toBe(true);
  });
  it('rejects trips whose origin is outside pickup radius', () => {
    expect(
      tripMatchesAlert(
        { ...baseTrip, originLocation: { lat: -37.78, lon: 175.28 } }, // Hamilton
        baseAlert,
      ),
    ).toBe(false);
  });
  it('skips proximity check when alert has no originLocation', () => {
    expect(
      tripMatchesAlert(
        { ...baseTrip, originLocation: { lat: -37.78, lon: 175.28 } },
        { ...baseAlert, originLocation: null },
      ),
    ).toBe(true);
  });
});

describe('formatAlertScope', () => {
  it('formats single-day scope', () => {
    expect(formatAlertScope({ scope: 'date', startDate: '2026-06-01' })).toMatch(/Just/);
  });
  it('formats week scope as a range', () => {
    const out = formatAlertScope({ scope: 'week', startDate: '2026-06-01', endDate: '2026-06-07' });
    expect(out).toContain('–');
  });
  it('formats ongoing scope', () => {
    expect(formatAlertScope({ scope: 'ongoing', startDate: '2026-06-01' })).toMatch(/Ongoing/);
  });
});
