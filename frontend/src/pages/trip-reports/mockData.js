function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rndInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function daysAgo(n) { return new Date(Date.now() - n * 86400000); }

const DRIVERS = [
  { id: 'D001', name: 'James Wilson', rating: 4.2, trips: 342, initials: 'JW' },
  { id: 'D002', name: 'Sarah Chen', rating: 3.8, trips: 178, initials: 'SC' },
  { id: 'D003', name: 'Mohammed Rashid', rating: 4.7, trips: 891, initials: 'MR' },
  { id: 'D004', name: 'Priya Sharma', rating: 4.1, trips: 456, initials: 'PS' },
  { id: 'D005', name: 'Tyler Johnson', rating: 2.9, trips: 67, initials: 'TJ' },
  { id: 'D006', name: 'Emma Davis', rating: 4.5, trips: 623, initials: 'ED' },
  { id: 'D007', name: 'Carlos Martinez', rating: 3.6, trips: 234, initials: 'CM' },
  { id: 'D008', name: 'Aisha Okonkwo', rating: 4.8, trips: 1102, initials: 'AO' },
];

const PASSENGERS = [
  { id: 'P001', name: 'Alex Thompson', initials: 'AT' },
  { id: 'P002', name: 'Lily Zhang', initials: 'LZ' },
  { id: 'P003', name: 'Raj Patel', initials: 'RP' },
  { id: 'P004', name: 'Sophie Miller', initials: 'SM' },
  { id: 'P005', name: 'Marcus Brown', initials: 'MB' },
  { id: 'P006', name: 'Isabella Garcia', initials: 'IG' },
  { id: 'P007', name: 'Noah Kim', initials: 'NK' },
  { id: 'P008', name: 'Zoe Anderson', initials: 'ZA' },
  { id: 'P009', name: 'Ethan Taylor', initials: 'ET' },
  { id: 'P010', name: 'Mia Johnson', initials: 'MJ' },
];

export const VIOLATION_TYPES = [
  'No Show', 'Unsafe Driving', 'Route Deviation', 'Rider Misconduct',
  'Payment Dispute', 'Late Pickup', 'Trip Fraud', 'Harassment', 'Vehicle Condition',
];

export const REPORT_STATUSES = ['New', 'In Progress', 'Escalated', 'Resolved', 'Dismissed'];
export const REPORT_SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];
export const ADMIN_NAMES = ['Sarah K.', 'Mike T.', 'Jana L.'];

const PICKUP_AREAS = [
  'Downtown Campus', 'North Residence', 'Engineering Block',
  'Library District', 'Sports Complex', 'Medical Center', 'West Gate', 'South Hub',
];

const DESCRIPTIONS = {
  'No Show': 'Driver marked trip as complete but never arrived at the pickup location. Passenger waited over 15 minutes with no communication from the driver.',
  'Unsafe Driving': 'Passenger reported multiple instances of dangerous driving including running red lights at Anzac Parade, excessive speed, and aggressive lane changes on Eastern Distributor.',
  'Route Deviation': 'GPS data shows driver took a significantly longer route via Randwick, adding 8km to the expected path and increasing the fare by approximately $12.50.',
  'Rider Misconduct': 'Driver reports passenger was verbally abusive throughout the ride, left food waste in the vehicle, and attempted to leave without seatbelt.',
  'Payment Dispute': 'Passenger disputes surge pricing applied during the trip, claiming they were not notified of price changes before confirming the booking.',
  'Late Pickup': 'Driver arrived 22 minutes past the scheduled pickup time without any prior notification or updates sent through the app.',
  'Trip Fraud': 'Suspicious activity detected: passenger claimed a full refund for a trip that GPS data and driver telemetry confirm was completed as scheduled.',
  'Harassment': 'Passenger reports driver made repeated unwanted personal comments and attempted to obtain personal contact information on multiple occasions.',
  'Vehicle Condition': 'Passenger reported the vehicle had a strong unpleasant odour, no seatbelts in the rear seats, and a cracked windshield obscuring driver visibility.',
};

const DRIVER_RESPONSES = {
  'No Show': 'I arrived at the designated coordinates but the passenger was not visible at street level. I called twice with no answer and waited 5 minutes before the system auto-cancelled.',
  'Unsafe Driving': 'I was operating within all speed limits and traffic laws at all times during the journey. The passenger was confrontational from the start of the trip.',
  'Route Deviation': 'There was significant congestion on the primary route due to a roadworks closure. I chose an alternate road which I believed would result in a faster journey.',
  'Rider Misconduct': 'The passenger was disrespectful from pick-up. I have dashcam footage of the entire journey available for your review upon request.',
  'Payment Dispute': 'The surge pricing notification was clearly displayed in the app screen before the passenger confirmed the booking. I have screenshots available.',
  'Late Pickup': 'I was delayed finishing a previous booking due to an accessibility issue. I acknowledge I should have sent an ETA update sooner and apologise for the inconvenience.',
  'Trip Fraud': 'The trip was completed on time and to the correct destination. I have no knowledge of why a refund claim was submitted.',
  'Harassment': 'I maintained a professional and respectful demeanour throughout the trip. I did not make any comments beyond standard trip-related conversation.',
  'Vehicle Condition': 'My vehicle passed its most recent compliance inspection two weeks ago. I clean it between every shift. I dispute the seatbelt claim — all belts are functional.',
};

function generateActivityLog(status, baseDate) {
  const log = [
    { time: new Date(baseDate.getTime()), action: 'Report submitted by passenger', by: 'System', type: 'created' },
    { time: new Date(baseDate.getTime() + 2 * 3600000), action: 'Report auto-assigned to review queue', by: 'System', type: 'assign' },
  ];
  if (status !== 'New' && status !== 'Dismissed') {
    log.push({
      time: new Date(baseDate.getTime() + 8 * 3600000),
      action: 'Investigation opened and assigned to admin',
      by: rnd(ADMIN_NAMES),
      type: 'status',
    });
    log.push({
      time: new Date(baseDate.getTime() + 10 * 3600000),
      action: 'Driver notified and response requested',
      by: rnd(ADMIN_NAMES),
      type: 'note',
    });
  }
  if (status === 'Escalated') {
    log.push({
      time: new Date(baseDate.getTime() + 24 * 3600000),
      action: 'Escalated to senior review board — critical severity',
      by: rnd(ADMIN_NAMES),
      type: 'escalate',
    });
  }
  if (status === 'Resolved') {
    log.push({
      time: new Date(baseDate.getTime() + 28 * 3600000),
      action: 'Driver response received and reviewed',
      by: rnd(ADMIN_NAMES),
      type: 'note',
    });
    log.push({
      time: new Date(baseDate.getTime() + 36 * 3600000),
      action: 'Resolution applied: Formal warning issued to driver',
      by: rnd(ADMIN_NAMES),
      type: 'resolve',
    });
    log.push({
      time: new Date(baseDate.getTime() + 37 * 3600000),
      action: 'Report closed and archived',
      by: rnd(ADMIN_NAMES),
      type: 'close',
    });
  }
  if (status === 'Dismissed') {
    log.push({
      time: new Date(baseDate.getTime() + 12 * 3600000),
      action: 'Report reviewed — insufficient evidence to proceed',
      by: rnd(ADMIN_NAMES),
      type: 'close',
    });
    log.push({
      time: new Date(baseDate.getTime() + 13 * 3600000),
      action: 'Report dismissed',
      by: rnd(ADMIN_NAMES),
      type: 'close',
    });
  }
  return log;
}

const BASE_LAT = -33.9173;
const BASE_LNG = 151.2313;

export const MOCK_REPORTS = Array.from({ length: 40 }, (_, i) => {
  const violation = rnd(VIOLATION_TYPES);
  const status = rnd(REPORT_STATUSES);
  const severity = rnd(REPORT_SEVERITIES);
  const dAge = rndInt(0, 60);
  const dateReported = daysAgo(dAge);
  const lastUpdated = new Date(dateReported.getTime() + rndInt(0, 5) * 86400000);
  const driver = rnd(DRIVERS);
  const passenger = rnd(PASSENGERS);

  return {
    id: `TR-${String(i + 1).padStart(4, '0')}`,
    tripId: `TRIP-${rndInt(10000, 99999)}`,
    driver,
    passenger,
    violationType: violation,
    severity,
    status,
    pickupArea: rnd(PICKUP_AREAS),
    dropoffArea: rnd(PICKUP_AREAS),
    dateReported,
    lastUpdated,
    assignedAdmin: (status === 'New' || status === 'Dismissed') ? 'Unassigned' : rnd(ADMIN_NAMES),
    description: DESCRIPTIONS[violation],
    driverResponse: DRIVER_RESPONSES[violation],
    fare: `$${(rndInt(5, 35) + 0.50).toFixed(2)}`,
    tripDuration: `${rndInt(8, 45)} min`,
    distanceKm: `${(rndInt(2, 18) + 0.1).toFixed(1)} km`,
    pickup: {
      lat: BASE_LAT + (Math.random() - 0.5) * 0.04,
      lng: BASE_LNG + (Math.random() - 0.5) * 0.04,
    },
    dropoff: {
      lat: BASE_LAT + (Math.random() - 0.5) * 0.04,
      lng: BASE_LNG + (Math.random() - 0.5) * 0.04,
    },
    activityLog: generateActivityLog(status, dateReported),
    adminNotes: (status !== 'New' && status !== 'Dismissed')
      ? `Initial review completed. ${severity === 'Critical' || severity === 'High' ? 'Priority escalation considered.' : 'Standard investigation process underway.'}`
      : '',
  };
});
