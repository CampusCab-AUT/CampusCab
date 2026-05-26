const { db, auth } = require('../config/firebaseConfig');

const sendPlannedApiResponse = (res, action) =>
  res.status(501).json({
    error: `${action} is planned for the Express API but is not part of the active direct Firestore flow yet.`,
  });

/**
 * Firestore Schema — users collection
 * {
 *   userId: string,          // Firebase Auth UID
 *   fullName: string,
 *   email: string,           // must end with .ac.nz
 *   phoneNumber: string,
 *   profilePhoto: string,    // storage URL
 *   accountStatus: string,   // "Active" | "Suspended"
 *   role: string,            // "Driver" | "Passenger" | "Admin"
 *   universityId: string,
 *   studentVerified: boolean,
 *   averageRating: number,
 *   gender: string,          // "Female" | "Male" | "Non-binary" | "Prefer not to say"
 *                            // Self-declared; gates women-only ride visibility.
 *   // Driver-only fields (from class diagram):
 *   driverLicenseNumber: string,
 *   licenseExpiryDate: string,
 *   availabilityStatus: string,
 * }
 */

/**
 * POST /api/auth/register
 * Sequence Diagram — Story 1: Secure Registration
 * 1. Validate that req.body.email ends with ".ac.nz"
 * 2. Create a new user in Firebase Authentication
 * 3. Write a new document to the users Firestore collection with role, studentVerified, etc.
 * 4. Return 201 Created with the new userId
 */
const registerUser = async (req, res) => {
  return sendPlannedApiResponse(res, 'Registration');
};

/**
 * POST /api/auth/login
 * 1. Receive Firebase ID token from client (client signs in via Firebase Auth SDK)
 * 2. Verify the ID token using auth.verifyIdToken(idToken)
 * 3. Return user profile from Firestore
 */
const loginUser = async (req, res) => {
  return sendPlannedApiResponse(res, 'Login');
};

/**
 * POST /api/auth/logout
 * 1. Optionally revoke Firebase refresh tokens via auth.revokeRefreshTokens(uid)
 */
const logoutUser = async (req, res) => {
  return sendPlannedApiResponse(res, 'Logout');
};

module.exports = { registerUser, loginUser, logoutUser };
