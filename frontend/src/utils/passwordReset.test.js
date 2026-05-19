import { describe, it, expect, vi } from 'vitest';
import { requestPasswordReset } from './passwordReset';

describe('Password Reset Logic for CampusCab', () => {
  it('should call the reset function when a valid university email is provided', async () => {
    // We create a "mock" function that pretends to be Firebase's sendPasswordResetEmail
    const mockFirebaseReset = vi.fn().mockResolvedValue();
    const mockAuth = {}; 
    const validEmail = 'student@aut.ac.nz';

    const result = await requestPasswordReset(mockAuth, validEmail, mockFirebaseReset);
    
    // Test that our logic returns true
    expect(result).toBe(true);
    
    // Test that it successfully passed the right variables to Firebase
    expect(mockFirebaseReset).toHaveBeenCalledWith(mockAuth, validEmail);
  });

  it('should throw an error and reject the attempt if the email is invalid', async () => {
    const mockFirebaseReset = vi.fn().mockResolvedValue();
    const mockAuth = {};
    const invalidEmail = 'not-an-email';
    
    // Test that the system rejects the attempt before even calling Firebase
    await expect(requestPasswordReset(mockAuth, invalidEmail, mockFirebaseReset))
      .rejects.toThrow('Invalid email address.');
      
    // Test that Firebase was NEVER called
    expect(mockFirebaseReset).not.toHaveBeenCalled();
  });

  it('should throw an error if the email is not an AUT domain', async () => {
    const mockFirebaseReset = vi.fn().mockResolvedValue();
    const mockAuth = {};
    const nonAutEmail = 'student@gmail.com';
    
    await expect(requestPasswordReset(mockAuth, nonAutEmail, mockFirebaseReset))
      .rejects.toThrow('You must use a valid AUT email address');
      
    expect(mockFirebaseReset).not.toHaveBeenCalled();
  });
});
