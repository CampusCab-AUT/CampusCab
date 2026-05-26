import { describe, it, expect } from 'vitest';
import { formatNZD } from './currency';

describe('formatNZD', () => {
  it('formats an integer with two decimals', () => {
    expect(formatNZD(5)).toBe('$5.00');
  });

  it('formats a decimal to two places', () => {
    expect(formatNZD(5.5)).toBe('$5.50');
  });

  it('rounds to two decimal places', () => {
    expect(formatNZD(5.678)).toBe('$5.68');
  });

  it('formats zero', () => {
    expect(formatNZD(0)).toBe('$0.00');
  });

  it('accepts a numeric string', () => {
    expect(formatNZD('7.25')).toBe('$7.25');
  });

  it('returns empty string for null', () => {
    expect(formatNZD(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatNZD(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(formatNZD('')).toBe('');
  });

  it('returns empty string for negative numbers', () => {
    expect(formatNZD(-1)).toBe('');
  });

  it('returns empty string for non-numeric input', () => {
    expect(formatNZD('abc')).toBe('');
  });

  it('returns empty string for NaN', () => {
    expect(formatNZD(NaN)).toBe('');
  });
});
