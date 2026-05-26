const { db } = require('../config/firebaseConfig');
// h3-js is used to convert lat/lng coordinates into an H3 geospatial index cell
// const { latLngToCell } = require('h3-js');

const sendPlannedApiResponse = (res, action) =>
  res.status(501).json({
    error: `${action} is planned for the Express API but is not part of the active direct Firestore flow yet.`,
  });

/**
 * Active frontend Firestore Schema — trips collection
 * {
 *   tripId: string,
 *   driverId: string,         // reference to users/{userId}
 *   driverEmail: string,
 *   origin: string,
 *   destination: string,
 *   departureTime: string,    // datetime-local string
 *   seats: number,
 *   availableSeats: number,
 *   status: string,           // "active" | "full"
 *   h3Index: string,          // H3 cell index for geospatial search (resolution 8)
 *   womenOnly: boolean,       // If true, only users with gender === "Female"
 *                             // see this trip in search results. Drivers can
 *                             // only set this when their own gender is "Female".
 *   costPerSeat: number|null, // Optional suggested passenger contribution per
 *                             // seat in NZD (0–100). null/absent = no cost set.
 * }
 */

/**
 * POST /api/trips
 * 1. Verify the requesting user is a Driver
 * 2. Generate h3Index from origin lat/lng using latLngToCell(lat, lng, resolution=8)
 * 3. Write new Trip document to Firestore with status = "active"
 * 4. Return 201 Created with the new tripId
 */
const createTrip = async (req, res) => {
  return sendPlannedApiResponse(res, 'Trip creation');
};

/**
 * GET /api/trips/search?campus=&date=
 * Sequence Diagram — Story 7: Search & Discovery
 * 1. Extract query params: campus, date
 * 2. Query Firestore:
 *    db.collection('trips')
 *      .where('destination', '==', campus)
 *      .where('status', '==', 'active')
 *      .where('availableSeats', '>', 0)
 * 3. Return the list of matching trip documents as JSON
 */
const searchTrips = async (req, res) => {
  return sendPlannedApiResponse(res, 'Trip search');
};

/**
 * GET /api/trips/:id
 * Sequence Diagram — Story 6: View Trip Details
 * 1. Fetch the Trip document by tripId
 * 2. Optionally fetch the driver's vehicle details
 * 3. Return full trip + vehicle info
 */
const getTripById = async (req, res) => {
  return sendPlannedApiResponse(res, 'Trip details');
};

/**
 * DELETE /api/trips/:id
 * 1. Verify the requesting user is the trip's driverId
 * 2. Update status to "cancelled" in Firestore
 */
const cancelTrip = async (req, res) => {
  return sendPlannedApiResponse(res, 'Trip cancellation');
};

module.exports = { createTrip, searchTrips, getTripById, cancelTrip };
