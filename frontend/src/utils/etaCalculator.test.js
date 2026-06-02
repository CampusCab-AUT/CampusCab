import { describe, it, expect } from 'vitest';
import { estimateETA } from './etaCalculator';

describe('ETA and Distance Calculation Logic', () => {
  // AUT City Campus coordinates
  const cityCampus = { lat: -36.8532, lon: 174.7666 };
  // AUT North Campus coordinates (approximately 5.9 km away)
  const northCampus = { lat: -36.8016, lon: 174.7497 };

  it('should return 0 distance and 0 ETA minutes if either location is missing', () => {
    const result = estimateETA(null, northCampus);
    expect(result.distanceKm).toBe(0);
    expect(result.etaMinutes).toBe(0);
  });

  it('should correctly calculate distance and estimate ETA for a realistic speed', () => {
    // At 40 km/h, a 5.9 km trip takes: (5.9 / 40) * 60 = 8.85 mins (rounds to 9)
    const result = estimateETA(cityCampus, northCampus, 40);
    expect(result.distanceKm).toBeCloseTo(5.9, 1);
    expect(result.etaMinutes).toBe(9);
  });

  it('should adjust ETA minutes when average speed is changed', () => {
    // At 60 km/h, a 5.9 km trip takes: (5.9 / 60) * 60 = 5.9 mins (rounds to 6)
    const result = estimateETA(cityCampus, northCampus, 60);
    expect(result.distanceKm).toBeCloseTo(5.9, 1);
    expect(result.etaMinutes).toBe(6);
  });
});
