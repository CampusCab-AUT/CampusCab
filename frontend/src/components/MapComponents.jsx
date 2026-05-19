import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { inputs, surfaces, colors, radius, typography } from '../theme';

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

export function AddressSearch({ label, onSelect, placeholder }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const debounceTimer = useRef(null);

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

export function RouteMap({ origin, destination, setRouteGeoJson }) {
  const [routeCoords, setRouteCoords] = useState([]);
  
  useEffect(() => {
    if (origin && destination) {
      fetch(`https://router.project-osrm.org/route/v1/driving/${origin.lon},${origin.lat};${destination.lon},${destination.lat}?overview=full&geometries=geojson`)
        .then(r => {
          if (!r.ok) throw new Error('OSRM network response was not ok');
          return r.json();
        })
        .then(data => {
          if (data.routes && data.routes.length > 0) {
            const geojson = data.routes[0].geometry;
            if (setRouteGeoJson) setRouteGeoJson(geojson);
            // GeoJSON coordinates are [lon, lat], Leaflet expects [lat, lon]
            const coords = geojson.coordinates.map(c => [c[1], c[0]]);
            setRouteCoords(coords);
          } else {
            throw new Error('No routes found');
          }
        })
        .catch(err => {
          console.error("OSRM routing failed, using straight-line fallback:", err);
          const fallbackGeoJson = {
            type: "LineString",
            coordinates: [[origin.lon, origin.lat], [destination.lon, destination.lat]]
          };
          if (setRouteGeoJson) setRouteGeoJson(fallbackGeoJson);
          setRouteCoords([[origin.lat, origin.lon], [destination.lat, destination.lon]]);
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
    <div style={{ height: '300px', width: '100%', borderRadius: radius.md, overflow: 'hidden', border: `1px solid ${colors.border}`, position: 'relative', zIndex: 0 }}>
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
