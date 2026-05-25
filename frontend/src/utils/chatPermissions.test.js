import { describe, it, expect } from 'vitest';
import { canViewChat } from './chatPermissions';
import { RIDE_REQUEST_STATUS } from '../firestoreModel';

describe('chatPermissions', () => {
  describe('canViewChat', () => {
    it('should return true when ride request is approved', () => {
      const result = canViewChat(RIDE_REQUEST_STATUS.approved);
      expect(result).toBe(true);
    });

    it('should return false when ride request is pending', () => {
      const result = canViewChat(RIDE_REQUEST_STATUS.pending);
      expect(result).toBe(false);
    });

    it('should return false when ride request is declined', () => {
      const result = canViewChat(RIDE_REQUEST_STATUS.declined);
      expect(result).toBe(false);
    });

    it('should return false when ride request is cancelled', () => {
      const result = canViewChat(RIDE_REQUEST_STATUS.cancelled);
      expect(result).toBe(false);
    });
  });
});
