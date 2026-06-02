export function calculateDistance(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

export function estimateETA(driverLoc, passengerLoc, speedKmh = 40) {
  if (!driverLoc || !passengerLoc) {
    return { distanceKm: 0, etaMinutes: 0 };
  }
  
  const distanceKm = calculateDistance(
    driverLoc.lat, 
    driverLoc.lon, 
    passengerLoc.lat, 
    passengerLoc.lon
  );
  
  // Time = Distance / Speed
  const timeInHours = distanceKm / speedKmh;
  const etaMinutes = Math.round(timeInHours * 60);
  
  return {
    distanceKm: parseFloat(distanceKm.toFixed(1)),
    etaMinutes: etaMinutes
  };
}
