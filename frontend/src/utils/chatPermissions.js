import { RIDE_REQUEST_STATUS } from '../firestoreModel';

/**
 * Determines if a user can view the chat for a specific ride request.
 * Based on the business rules, chat is only unlocked when the request is approved.
 * 
 * @param {string} requestStatus - The current status of the ride request
 * @returns {boolean} True if the chat should be visible
 */
export function canViewChat(requestStatus) {
  return requestStatus === RIDE_REQUEST_STATUS.approved;
}
