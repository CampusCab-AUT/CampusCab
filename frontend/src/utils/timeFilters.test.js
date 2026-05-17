import { describe, it, expect } from 'vitest';
import { filterTripsByTimeOfDay } from './timeFilters';

describe('Time Filtering Logic for Search Trips', () => {
  const mockTrips = [
    { id: 1, origin: 'City', departureTime: '2026-05-10T08:00:00' }, // Morning (8 AM)
    { id: 2, origin: 'South', departureTime: '2026-05-10T14:30:00' }, // Afternoon (2:30 PM)
    { id: 3, origin: 'North', departureTime: '2026-05-10T20:15:00' }, // Evening (8:15 PM)
  ];

  it('should only return trips before 12:00 PM for the Morning filter', () => {
    const results = filterTripsByTimeOfDay(mockTrips, 'Morning');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(1);
  });

  it('should only return trips between 12:00 PM and 4:59 PM for the Afternoon filter', () => {
    const results = filterTripsByTimeOfDay(mockTrips, 'Afternoon');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(2);
  });

  it('should only return trips after 5:00 PM for the Evening filter', () => {
    const results = filterTripsByTimeOfDay(mockTrips, 'Evening');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(3);
  });

  it('should return all trips if filter is All', () => {
    const results = filterTripsByTimeOfDay(mockTrips, 'All');
    expect(results).toHaveLength(3);
  });
});
