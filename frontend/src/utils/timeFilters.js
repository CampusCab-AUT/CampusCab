export function filterTripsByTimeOfDay(trips, filterType) {
  if (filterType === 'All') return trips;

  return trips.filter((trip) => {
    // Parse the departure time
    const dateObj = new Date(trip.departureTime);
    const hour = dateObj.getHours();

    if (filterType === 'Morning') {
      // 12:00 AM (0) to 11:59 AM (11)
      return hour >= 0 && hour < 12;
    } 
    else if (filterType === 'Afternoon') {
      // 12:00 PM (12) to 4:59 PM (16)
      return hour >= 12 && hour < 17;
    } 
    else if (filterType === 'Evening') {
      // 5:00 PM (17) to 11:59 PM (23)
      return hour >= 17 && hour <= 23;
    }
    
    return true;
  });
}
