import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import * as turf from '@turf/turf';
import { inputs, surfaces, colors, radius, typography, pills, spacing } from '../theme';

// Fix Leaflet marker icons in Vite
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

export const AUT_CAMPUSES = [
  { display_name: "AUT City Campus (55 Wellesley St E, Auckland CBD)", lat: -36.8532, lon: 174.7666 },
  { display_name: "AUT North Campus (90 Akoranga Dr, Northcote)", lat: -36.8016, lon: 174.7497 },
  { display_name: "AUT South Campus (640 Great South Rd, Manukau)", lat: -36.9841, lon: 174.8805 }
];

function iconForSavedLabel(label) {
  const lower = (label || '').toLowerCase();
  if (lower === 'home') return '🏠';
  if (lower === 'campus') return '🎓';
  if (lower === 'work') return '💼';
  return '📍';
}

export function AddressSearch({ label, onSelect, placeholder, savedAddresses = [] }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const debounceTimer = useRef(null);

  const pickSaved = (addr) => {
    setQuery(addr.name);
    setResults([]);
    setFocused(false);
    onSelect({ name: addr.name, lat: parseFloat(addr.lat), lon: parseFloat(addr.lon) });
  };

  const search = (text) => {
    setQuery(text);
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    if (text.length < 2) {
      setResults(AUT_CAMPUSES);
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const lowerText = text.toLowerCase();
        const predefined = AUT_CAMPUSES.filter(c => 
          c.display_name.toLowerCase().includes(lowerText) || 
          lowerText.includes('aut') || 
          lowerText.includes('campus')
        );

        // Append 'Auckland' to the query to prioritize Auckland region, and use countrycodes=nz to exclude other countries.
        const searchQuery = lowerText.includes('auckland') ? text : `${text}, Auckland`;
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&countrycodes=nz&limit=5`);
        
        if (!res.ok) throw new Error('Geocoding failed');
        
        const data = await res.json();
        const apiResults = Array.isArray(data) ? data : [];
        
        setResults([...predefined, ...apiResults].slice(0, 8));
      } catch (e) {
        console.error('Geocoding error', e);
        const lowerText = text.toLowerCase();
        const predefined = AUT_CAMPUSES.filter(c => 
          c.display_name.toLowerCase().includes(lowerText) || 
          lowerText.includes('aut') || 
          lowerText.includes('campus')
        );
        setResults(predefined);
      } finally {
        setLoading(false);
      }
    }, 500); // 500ms debounce prevents API rate limiting
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <label style={{ ...inputs.label }}>{label}</label>
      {savedAddresses && savedAddresses.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: spacing?.xs || '6px',
            marginBottom: '8px',
          }}
        >
          {savedAddresses.map((addr) => (
            <button
              key={addr.id || addr.label}
              type="button"
              onClick={() => pickSaved(addr)}
              title={`Use saved address: ${addr.name}`}
              style={{
                ...pills.base,
                ...pills.accent,
                cursor: 'pointer',
                border: 'none',
                textTransform: 'none',
                letterSpacing: 0,
                fontSize: '0.78rem',
                padding: '6px 12px',
              }}
            >
              {iconForSavedLabel(addr.label)} {addr.label}
            </button>
          ))}
        </div>
      )}
      <input
        type="text"
        placeholder={placeholder}
        value={query}
        onChange={(e) => search(e.target.value)}
        onFocus={() => {
          setFocused(true);
          if (query.length < 2) {
            setResults(AUT_CAMPUSES);
          }
        }}
        style={{ ...inputs.field, ...(focused ? inputs.fieldFocus : {}) }}
      />
      {focused && results.length > 0 && (
        <div style={{ 
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000, 
          background: 'white', borderRadius: radius.md, boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
          marginTop: '4px', overflow: 'hidden', border: `1px solid ${colors.border}`
        }}>
          {results.map((r, i) => (
            <div 
              key={i} 
              onMouseDown={() => {
                setQuery(r.display_name);
                setResults([]);
                onSelect({
                  name: r.display_name,
                  lat: parseFloat(r.lat),
                  lon: parseFloat(r.lon)
                });
                setFocused(false);
              }}
              style={{ 
                padding: '12px 16px', borderBottom: `1px solid ${colors.border}`, cursor: 'pointer',
                ...typography.small
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.surfaceMuted}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
            >
              {r.display_name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChangeView({ center, zoom, bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50] });
    } else if (center) {
      map.setView(center, zoom || 13);
    }
  }, [center, bounds, map, zoom]);
  return null;
}

export function RouteMap({ origin, destination, setRouteGeoJson, height = '300px', style = {} }) {
  const [routeCoords, setRouteCoords] = useState([]);
  
  useEffect(() => {
    if (origin && destination) {
      fetch(`https://router.project-osrm.org/route/v1/driving/${origin.lon},${origin.lat};${destination.lon},${destination.lat}?overview=full&geometries=geojson`)
        .then(r => r.json())
        .then(data => {
          if (data.routes && data.routes.length > 0) {
            const geojson = data.routes[0].geometry;
            if (setRouteGeoJson) setRouteGeoJson(geojson);
            // GeoJSON coordinates are [lon, lat], Leaflet expects [lat, lon]
            const coords = geojson.coordinates.map(c => [c[1], c[0]]);
            setRouteCoords(coords);
          }
        });
    } else {
      setRouteCoords([]);
      if (setRouteGeoJson) setRouteGeoJson(null);
    }
  }, [origin, destination, setRouteGeoJson]);

  const defaultCenter = [-36.8485, 174.7633]; // Auckland
  const mapCenter = origin ? [origin.lat, origin.lon] : defaultCenter;

  const bounds = L.latLngBounds([]);
  if (origin) bounds.extend([origin.lat, origin.lon]);
  if (destination) bounds.extend([destination.lat, destination.lon]);
  if (routeCoords.length > 0) {
    routeCoords.forEach(c => bounds.extend(c));
  }

  return (
    <div style={{ height: height, width: '100%', borderRadius: radius.md, overflow: 'hidden', border: `1px solid ${colors.border}`, position: 'relative', zIndex: 0, ...style }}>
      <MapContainer center={mapCenter} zoom={12} style={{ height: '100%', width: '100%', zIndex: 0 }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ChangeView center={mapCenter} bounds={bounds.isValid() ? bounds : null} />
        {origin && <Marker position={[origin.lat, origin.lon]} />}
        {destination && <Marker position={[destination.lat, destination.lon]} />}
        {routeCoords.length > 0 && <Polyline positions={routeCoords} color={colors.accent} weight={5} />}
      </MapContainer>
    </div>
  );
}

export function LiveRouteMap({ 
  origin, 
  destination, 
  currentLocation, 
  height = '300px', 
  style = {} 
}) {
  const [routeCoords, setRouteCoords] = useState([]);
  const [routeGeoJson, setRouteGeoJson] = useState(null);
  const [autoCenter, setAutoCenter] = useState(true);

  const routeFetchedRef = useRef(false);

  // Reset route fetched flag if origin/destination changes
  useEffect(() => {
    routeFetchedRef.current = false;
  }, [origin, destination]);

  // Initial route setup from origin (or currentLocation if origin is not set) to destination
  useEffect(() => {
    const startLoc = origin || currentLocation;
    if (startLoc && destination && !routeFetchedRef.current) {
      routeFetchedRef.current = true;
      fetch(`https://router.project-osrm.org/route/v1/driving/${startLoc.lon},${startLoc.lat};${destination.lon},${destination.lat}?overview=full&geometries=geojson`)
        .then(r => r.json())
        .then(data => {
          if (data.routes && data.routes.length > 0) {
            const geojson = data.routes[0].geometry;
            setRouteGeoJson(geojson);
            const coords = geojson.coordinates.map(c => [c[1], c[0]]);
            setRouteCoords(coords);
          }
        })
        .catch(err => {
          routeFetchedRef.current = false;
          console.error("Error fetching initial route:", err);
        });
    }
  }, [origin, destination, currentLocation]);

  // Check if driver is off-route whenever currentLocation changes
  useEffect(() => {
    if (!currentLocation || !routeGeoJson || !destination) return;

    try {
      // Create a turf point for currentLocation
      const pt = turf.point([currentLocation.lon, currentLocation.lat]);
      // Calculate distance from point to current route line
      const distance = turf.pointToLineDistance(pt, routeGeoJson, { units: 'meters' });

      // If off-route by more than 50 meters, recalculate
      if (distance > 50) {
        console.log(`Driver off-route by ${distance.toFixed(1)} meters. Recalculating...`);
        fetch(`https://router.project-osrm.org/route/v1/driving/${currentLocation.lon},${currentLocation.lat};${destination.lon},${destination.lat}?overview=full&geometries=geojson`)
          .then(r => r.json())
          .then(data => {
            if (data.routes && data.routes.length > 0) {
              const geojson = data.routes[0].geometry;
              setRouteGeoJson(geojson);
              const coords = geojson.coordinates.map(c => [c[1], c[0]]);
              setRouteCoords(coords);
            }
          })
          .catch(err => console.error("Error recalculating route:", err));
      }
    } catch (e) {
      console.error("Error in off-route check:", e);
    }
  }, [currentLocation, routeGeoJson, destination]);

  const defaultCenter = [-36.8485, 174.7633]; // Auckland
  const mapCenter = currentLocation 
    ? [currentLocation.lat, currentLocation.lon] 
    : (origin ? [origin.lat, origin.lon] : defaultCenter);

  const bounds = L.latLngBounds([]);
  if (currentLocation) bounds.extend([currentLocation.lat, currentLocation.lon]);
  else if (origin) bounds.extend([origin.lat, origin.lon]);
  if (destination) bounds.extend([destination.lat, destination.lon]);
  if (routeCoords.length > 0) {
    routeCoords.forEach(c => bounds.extend(c));
  }

  // Create a custom pulsing marker for the driver location
  const driverIcon = new L.DivIcon({
    html: `<div class="live-driver-pulsing-dot" style="
      background-color: ${colors.accent || '#14b8a6'};
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 0 8px rgba(0,0,0,0.5);
    "></div>`,
    className: 'custom-driver-icon',
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });

  return (
    <div style={{ height: height, width: '100%', borderRadius: radius.md, overflow: 'hidden', border: `1px solid ${colors.border}`, position: 'relative', zIndex: 0, ...style }}>
      <MapContainer center={mapCenter} zoom={15} style={{ height: '100%', width: '100%', zIndex: 0 }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ChangeView 
          center={autoCenter && currentLocation ? [currentLocation.lat, currentLocation.lon] : null} 
          bounds={(!autoCenter || !currentLocation) && bounds.isValid() ? bounds : null} 
        />
        
        {routeCoords.length > 0 && <Polyline positions={routeCoords} color={colors.accent || '#14b8a6'} weight={5} />}

        {origin && <Marker position={[origin.lat, origin.lon]} />}
        {destination && <Marker position={[destination.lat, destination.lon]} />}

        {currentLocation && (
          <Marker position={[currentLocation.lat, currentLocation.lon]} icon={driverIcon} />
        )}
      </MapContainer>

      {/* Auto Center Toggle Control */}
      <button 
        onClick={() => setAutoCenter(!autoCenter)}
        style={{
          position: 'absolute',
          bottom: '16px',
          right: '16px',
          zIndex: 1000,
          background: autoCenter ? (colors.accent || '#14b8a6') : '#1e293b',
          color: 'white',
          border: 'none',
          borderRadius: '50%',
          width: '40px',
          height: '40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
          transition: 'all 0.2s'
        }}
        title={autoCenter ? "Disable Auto Center" : "Enable Auto Center"}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" style={{ width: '20px', height: '20px' }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
        </svg>
      </button>

      <style>{`
        .live-driver-pulsing-dot::after {
          content: '';
          position: absolute;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 2px solid ${colors.accent || '#14b8a6'};
          top: -11px;
          left: -11px;
          animation: pulse-ring 1.8s cubic-bezier(0.215, 0.610, 0.355, 1) infinite;
          opacity: 0;
        }
        @keyframes pulse-ring {
          0% {
            transform: scale(0.33);
            opacity: 0.8;
          }
          80%, 100% {
            opacity: 0;
            transform: scale(1.2);
          }
        }
      `}</style>
    </div>
  );
}
