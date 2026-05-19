import { useState, useEffect } from 'react';
import 'leaflet/dist/leaflet.css';

const C = {
  purple: '#7c3aed',
  purpleLight: '#ede9fe',
  blue: '#1d4ed8',
  blueLight: '#dbeafe',
  amber: '#d97706',
  amberLight: '#fef3c7',
  orange: '#ea580c',
  orangeLight: '#ffedd5',
  green: '#16a34a',
  greenLight: '#dcfce7',
  red: '#dc2626',
  redLight: '#fee2e2',
  slate: '#475569',
  border: 'rgba(15,23,42,0.08)',
  bg: '#f8f9fa',
  surface: '#ffffff',
  text: '#0f172a',
  muted: '#64748b',
};

const STATUS_CFG = {
  'New':         { bg: '#dbeafe', color: '#1e40af', dot: '#3b82f6' },
  'In Progress': { bg: '#fef3c7', color: '#92400e', dot: '#f59e0b' },
  'Escalated':   { bg: '#ffedd5', color: '#9a3412', dot: '#f97316' },
  'Resolved':    { bg: '#dcfce7', color: '#166534', dot: '#22c55e' },
  'Dismissed':   { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' },
};

const SEV_CFG = {
  'Low':      { bg: '#f0fdf4', color: '#15803d' },
  'Medium':   { bg: '#fefce8', color: '#a16207' },
  'High':     { bg: '#fff7ed', color: '#c2410c' },
  'Critical': { bg: '#fef2f2', color: '#b91c1c' },
};

const DRAWER_TABS = [
  { id: 'overview',   label: 'Overview',          icon: '📋' },
  { id: 'route',      label: 'Route Analysis',    icon: '🗺️' },
  { id: 'complaint',  label: 'Complaint Details', icon: '📝' },
  { id: 'investigate',label: 'Investigation',     icon: '🔍' },
  { id: 'timeline',   label: 'Activity Timeline', icon: '⏱️' },
];

const ADMIN_NAMES = ['Sarah K.', 'Mike T.', 'Jana L.'];
const STATUSES = ['New', 'In Progress', 'Escalated', 'Resolved', 'Dismissed'];

function fmtDate(d) {
  if (!d) return '—';
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDateShort(d) {
  if (!d) return '—';
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function InfoRow({ label, value, mono }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 12, color: C.muted, fontWeight: 600, flexShrink: 0, width: '45%' }}>{label}</span>
      <span style={{ fontSize: 13, color: C.text, fontWeight: 500, textAlign: 'right', fontFamily: mono ? 'monospace' : 'inherit' }}>
        {value}
      </span>
    </div>
  );
}

function Badge({ bg, color, children }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 99, fontSize: 11,
      fontWeight: 700, background: bg, color,
    }}>
      {children}
    </span>
  );
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────
function OverviewTab({ report }) {
  const scfg = STATUS_CFG[report.status] || STATUS_CFG['New'];
  const sevcfg = SEV_CFG[report.severity] || SEV_CFG['Low'];

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Status banner */}
      <div style={{
        background: `linear-gradient(135deg, ${C.purple}11, ${C.blue}08)`,
        border: `1px solid ${C.purple}22`, borderRadius: 12, padding: '14px 18px',
        display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Status</div>
          <Badge bg={scfg.bg} color={scfg.color}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: scfg.dot }} />
            {report.status}
          </Badge>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Severity</div>
          <Badge bg={sevcfg.bg} color={sevcfg.color}>{report.severity}</Badge>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Violation</div>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{report.violationType}</span>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Assigned To</div>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{report.assignedAdmin}</span>
        </div>
      </div>

      {/* Trip metadata */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={{ background: C.bg, borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Report Info
          </div>
          <InfoRow label="Report ID"   value={report.id}       mono />
          <InfoRow label="Trip ID"     value={report.tripId}   mono />
          <InfoRow label="Filed On"    value={fmtDateShort(report.dateReported)} />
          <InfoRow label="Last Update" value={fmtDateShort(report.lastUpdated)} />
        </div>
        <div style={{ background: C.bg, borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Trip Summary
          </div>
          <InfoRow label="Fare"       value={report.fare} />
          <InfoRow label="Duration"   value={report.tripDuration} />
          <InfoRow label="Distance"   value={report.distanceKm} />
          <InfoRow label="Pickup"     value={report.pickupArea} />
        </div>
      </div>

      {/* People */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <PersonCard title="Driver" person={report.driver} role="driver" />
        <PersonCard title="Passenger" person={report.passenger} role="passenger" />
      </div>
    </div>
  );
}

function PersonCard({ title, person, role }) {
  const color = role === 'driver' ? C.green : C.blue;
  return (
    <div style={{ background: C.bg, borderRadius: 10, padding: '14px 16px', border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%', background: color + '22',
          color, fontSize: 13, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `2px solid ${color}44`,
        }}>
          {person.initials}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{person.name}</div>
          <div style={{ fontSize: 11, color: C.muted }}>ID: {person.id}</div>
        </div>
      </div>
      {role === 'driver' && person.rating !== undefined && (
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ fontSize: 12 }}>
            <span style={{ color: C.muted }}>Rating </span>
            <span style={{ fontWeight: 700, color: person.rating < 3.5 ? C.red : C.green }}>★ {person.rating}</span>
          </div>
          <div style={{ fontSize: 12 }}>
            <span style={{ color: C.muted }}>Trips </span>
            <span style={{ fontWeight: 700, color: C.text }}>{person.trips}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Route Analysis ──────────────────────────────────────────────────────
function RouteTab({ report }) {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [MapComponents, setMapComponents] = useState(null);

  useEffect(() => {
    Promise.all([
      import('react-leaflet'),
      import('leaflet'),
    ]).then(([rl, L]) => {
      // Fix Leaflet default icon issue
      delete L.default.Icon.Default.prototype._getIconUrl;
      L.default.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });
      setMapComponents({ ...rl, L: L.default });
      setMapLoaded(true);
    }).catch(() => setMapLoaded(false));
  }, []);

  const center = [
    (report.pickup.lat + report.dropoff.lat) / 2,
    (report.pickup.lng + report.dropoff.lng) / 2,
  ];

  const pickupIcon = MapComponents?.L ? new MapComponents.L.DivIcon({
    html: `<div style="width:16px;height:16px;background:#16a34a;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>`,
    className: '', iconAnchor: [8, 8],
  }) : null;

  const dropoffIcon = MapComponents?.L ? new MapComponents.L.DivIcon({
    html: `<div style="width:16px;height:16px;background:#dc2626;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>`,
    className: '', iconAnchor: [8, 8],
  }) : null;

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.text }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: C.green, display: 'inline-block' }} />
          Pickup — {report.pickupArea}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.text }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: C.red, display: 'inline-block' }} />
          Dropoff — {report.dropoffArea}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.text }}>
          <span style={{ width: 28, height: 3, background: C.blue, display: 'inline-block', borderRadius: 2 }} />
          Route taken
        </div>
      </div>

      {/* Map */}
      <div style={{
        height: 320, borderRadius: 12, overflow: 'hidden',
        border: `1px solid ${C.border}`, background: '#e5e7eb',
        position: 'relative',
      }}>
        {mapLoaded && MapComponents ? (
          <MapComponents.MapContainer
            center={center} zoom={14}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom={false}
          >
            <MapComponents.TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            <MapComponents.Marker position={[report.pickup.lat, report.pickup.lng]} icon={pickupIcon}>
              <MapComponents.Popup>Pickup — {report.pickupArea}</MapComponents.Popup>
            </MapComponents.Marker>
            <MapComponents.Marker position={[report.dropoff.lat, report.dropoff.lng]} icon={dropoffIcon}>
              <MapComponents.Popup>Dropoff — {report.dropoffArea}</MapComponents.Popup>
            </MapComponents.Marker>
            <MapComponents.Polyline
              positions={[[report.pickup.lat, report.pickup.lng], [report.dropoff.lat, report.dropoff.lng]]}
              color={C.blue} weight={3} opacity={0.8} dashArray="8 4"
            />
          </MapComponents.MapContainer>
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', gap: 8,
          }}>
            <span style={{ fontSize: 32 }}>🗺️</span>
            <div style={{ fontSize: 13, color: C.muted }}>Loading interactive map…</div>
          </div>
        )}
      </div>

      {/* Trip metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        {[
          { label: 'Trip Distance', value: report.distanceKm, icon: '📏' },
          { label: 'Duration', value: report.tripDuration, icon: '⏱' },
          { label: 'Fare Charged', value: report.fare, icon: '💳' },
        ].map(({ label, value, icon }) => (
          <div key={label} style={{
            background: C.bg, borderRadius: 10, padding: '12px 14px',
            border: `1px solid ${C.border}`, textAlign: 'center',
          }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{value}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* GPS events */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          GPS Event Log
        </div>
        <div style={{ background: C.bg, borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.border}` }}>
          {[
            { time: '00:00', event: 'Trip started', lat: report.pickup.lat.toFixed(5), lng: report.pickup.lng.toFixed(5), type: 'normal' },
            { time: '02:14', event: 'Speed: 52 km/h', lat: (report.pickup.lat + 0.005).toFixed(5), lng: (report.pickup.lng + 0.003).toFixed(5), type: 'normal' },
            { time: '05:33', event: 'Route deviation detected (+1.2 km)', lat: (report.pickup.lat + 0.01).toFixed(5), lng: (report.pickup.lng + 0.008).toFixed(5), type: 'warn' },
            { time: '08:47', event: 'Stop detected (3 min 22 sec)', lat: (report.pickup.lat + 0.014).toFixed(5), lng: (report.pickup.lng + 0.012).toFixed(5), type: 'warn' },
            { time: '15:20', event: 'Trip ended', lat: report.dropoff.lat.toFixed(5), lng: report.dropoff.lng.toFixed(5), type: 'normal' },
          ].map((ev, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px',
              borderBottom: i < 4 ? `1px solid ${C.border}` : 'none',
              background: ev.type === 'warn' ? '#fffbeb' : 'transparent',
            }}>
              <span style={{ fontSize: 10, fontFamily: 'monospace', color: C.muted, width: 36, flexShrink: 0 }}>{ev.time}</span>
              <span style={{ fontSize: 13, fontWeight: ev.type === 'warn' ? 700 : 400, color: ev.type === 'warn' ? C.amber : C.text, flex: 1 }}>
                {ev.type === 'warn' && '⚠ '}{ev.event}
              </span>
              <span style={{ fontSize: 10, fontFamily: 'monospace', color: C.muted }}>{ev.lat}, {ev.lng}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Complaint Details ───────────────────────────────────────────────────
function ComplaintTab({ report }) {
  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Passenger complaint */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%', background: C.blueLight,
            color: C.blue, fontSize: 12, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {report.passenger.initials}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{report.passenger.name}</div>
            <div style={{ fontSize: 11, color: C.muted }}>Complaint filed {fmtDateShort(report.dateReported)}</div>
          </div>
        </div>
        <div style={{
          background: C.blueLight, borderRadius: 10, padding: '14px 16px',
          borderLeft: `3px solid ${C.blue}`, fontSize: 14, color: C.text, lineHeight: 1.65,
        }}>
          {report.description}
        </div>
      </div>

      {/* Driver response */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%', background: C.greenLight,
            color: C.green, fontSize: 12, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {report.driver.initials}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{report.driver.name}</div>
            <div style={{ fontSize: 11, color: C.muted }}>Driver response</div>
          </div>
        </div>
        <div style={{
          background: C.greenLight, borderRadius: 10, padding: '14px 16px',
          borderLeft: `3px solid ${C.green}`, fontSize: 14, color: C.text, lineHeight: 1.65,
        }}>
          {report.driverResponse || <em style={{ color: C.muted }}>No response submitted yet.</em>}
        </div>
      </div>

      {/* Evidence section */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
          Evidence &amp; Attachments
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
          {['dashcam_clip.mp4', 'gps_trace.json', 'app_screenshot.png'].map(name => (
            <div key={name} style={{
              background: C.bg, border: `1px dashed ${C.border}`, borderRadius: 8,
              padding: '12px 10px', textAlign: 'center', cursor: 'pointer',
            }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>
                {name.endsWith('.mp4') ? '🎥' : name.endsWith('.json') ? '📄' : '🖼️'}
              </div>
              <div style={{ fontSize: 11, color: C.muted, wordBreak: 'break-all' }}>{name}</div>
            </div>
          ))}
        </div>
        <div style={{
          marginTop: 12, background: C.amberLight, border: `1px solid ${C.amber}33`,
          borderRadius: 8, padding: '10px 14px', fontSize: 12, color: C.amber,
        }}>
          ⚠ Dashcam footage request pending driver approval (48h window)
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Investigation ───────────────────────────────────────────────────────
function InvestigationTab({ report }) {
  const [status, setStatus]     = useState(report.status);
  const [assignedTo, setAssignedTo] = useState(report.assignedAdmin === 'Unassigned' ? '' : report.assignedAdmin);
  const [notes, setNotes]       = useState(report.adminNotes || '');
  const [resolution, setResolution] = useState('');
  const [saved, setSaved]       = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const selectStyle = {
    width: '100%', padding: '9px 12px', border: `1px solid ${C.border}`,
    borderRadius: 8, fontSize: 13, color: C.text, background: C.surface,
    outline: 'none', fontFamily: 'inherit', cursor: 'pointer', boxSizing: 'border-box',
  };
  const textareaStyle = {
    width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`,
    borderRadius: 8, fontSize: 13, color: C.text, background: C.surface,
    outline: 'none', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6,
    boxSizing: 'border-box',
  };

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Update Status
          </label>
          <select value={status} onChange={e => setStatus(e.target.value)} style={selectStyle}>
            {['New', 'In Progress', 'Escalated', 'Resolved', 'Dismissed'].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Assign Investigator
          </label>
          <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} style={selectStyle}>
            <option value="">Unassigned</option>
            {ADMIN_NAMES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
          Investigation Notes
        </label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={4}
          placeholder="Add investigation notes, findings, and next steps…"
          style={textareaStyle}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
          Resolution / Outcome
        </label>
        <textarea
          value={resolution}
          onChange={e => setResolution(e.target.value)}
          rows={3}
          placeholder="Describe the resolution action taken (e.g. warning issued, account suspended, dismissed)…"
          style={textareaStyle}
        />
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={handleSave}
          style={{
            padding: '10px 20px', border: 'none', borderRadius: 8,
            background: saved ? C.green : 'linear-gradient(135deg, #7c3aed, #4f46e5)',
            color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            transition: 'all 0.2s', boxShadow: '0 4px 14px rgba(124,58,237,0.25)',
          }}
        >
          {saved ? '✓ Saved' : 'Save Changes'}
        </button>
        <button
          onClick={() => setStatus('Escalated')}
          style={{
            padding: '10px 16px', border: `1px solid ${C.orange}44`, borderRadius: 8,
            background: C.orangeLight, color: C.orange, fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          🔴 Escalate
        </button>
        <button
          onClick={() => setStatus('Resolved')}
          style={{
            padding: '10px 16px', border: `1px solid ${C.green}44`, borderRadius: 8,
            background: C.greenLight, color: C.green, fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          ✅ Mark Resolved
        </button>
        <button
          onClick={() => setStatus('Dismissed')}
          style={{
            padding: '10px 16px', border: `1px solid ${C.border}`, borderRadius: 8,
            background: '#f1f5f9', color: C.muted, fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          Dismiss
        </button>
      </div>

      {/* Quick action panel */}
      <div style={{ background: C.bg, borderRadius: 10, padding: '14px 16px', border: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
          Quick Actions
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { label: 'Request dashcam footage from driver', icon: '🎥' },
            { label: 'Send warning notification to driver', icon: '⚠️' },
            { label: 'Initiate refund for passenger', icon: '💸' },
            { label: 'Suspend driver pending review', icon: '🔒' },
            { label: 'Flag trip for fraud audit', icon: '🚩' },
          ].map(({ label, icon }) => (
            <button key={label} style={{
              padding: '8px 12px', border: `1px solid ${C.border}`, borderRadius: 6,
              background: C.surface, color: C.text, fontSize: 12, fontWeight: 500,
              cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8,
              transition: 'background 0.12s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = C.purpleLight}
              onMouseLeave={e => e.currentTarget.style.background = C.surface}
            >
              <span>{icon}</span> {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Activity Timeline ───────────────────────────────────────────────────
function TimelineTab({ report }) {
  const ICON_MAP = {
    created:  { icon: '📋', color: C.blue },
    assign:   { icon: '👤', color: C.purple },
    status:   { icon: '🔄', color: C.amber },
    note:     { icon: '📝', color: C.muted },
    escalate: { icon: '🔺', color: C.orange },
    resolve:  { icon: '✅', color: C.green },
    close:    { icon: '🔒', color: C.slate },
  };

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ position: 'relative', paddingLeft: 28 }}>
        {/* Vertical line */}
        <div style={{
          position: 'absolute', left: 10, top: 0, bottom: 0,
          width: 2, background: C.border,
        }} />

        {report.activityLog.map((ev, i) => {
          const cfg = ICON_MAP[ev.type] || ICON_MAP['note'];
          return (
            <div key={i} style={{ position: 'relative', marginBottom: 20 }}>
              {/* Dot */}
              <div style={{
                position: 'absolute', left: -24, top: 2,
                width: 20, height: 20, borderRadius: '50%',
                background: cfg.color + '22', border: `2px solid ${cfg.color}55`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10,
              }}>
                {cfg.icon}
              </div>

              <div style={{ background: C.bg, borderRadius: 10, padding: '12px 14px', border: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{ev.action}</div>
                  <div style={{
                    fontSize: 10, color: C.muted, whiteSpace: 'nowrap', flexShrink: 0,
                    background: C.surface, padding: '2px 8px', borderRadius: 99, border: `1px solid ${C.border}`,
                  }}>
                    {fmtDate(ev.time)}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
                  By <strong style={{ color: C.text }}>{ev.by}</strong>
                </div>
              </div>
            </div>
          );
        })}

        {/* Empty state if no log */}
        {report.activityLog.length === 0 && (
          <div style={{ textAlign: 'center', padding: '30px 0', color: C.muted, fontSize: 13 }}>
            No activity recorded yet.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Drawer ──────────────────────────────────────────────────────────────
export default function ReportDrawer({ report, onClose }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [visible, setVisible]     = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    return () => {};
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 260);
  }

  // Close on Escape
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const scfg = STATUS_CFG[report.status] || STATUS_CFG['New'];

  return (
    <>
      <style>{`
        @keyframes drawerIn {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes backdropIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 998,
          background: 'rgba(15,23,42,0.35)',
          backdropFilter: 'blur(2px)',
          animation: 'backdropIn 0.25s ease both',
        }}
      />

      {/* Drawer panel */}
      <div style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, zIndex: 999,
        width: 640, maxWidth: '96vw', background: C.surface,
        display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 40px rgba(15,23,42,0.14)',
        animation: 'drawerIn 0.26s cubic-bezier(0.22,1,0.36,1) both',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px 0', borderBottom: `1px solid ${C.border}`,
          flexShrink: 0, background: C.surface,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: C.purple, fontFamily: 'monospace' }}>
                  {report.id}
                </span>
                <span style={{
                  padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                  background: scfg.bg, color: scfg.color,
                }}>
                  {report.status}
                </span>
                <span style={{
                  padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                  background: '#f1f5f9', color: C.muted,
                }}>
                  {report.tripId}
                </span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                {report.violationType}
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                {report.driver.name} → {report.passenger.name} · {report.pickupArea}
              </div>
            </div>
            <button
              onClick={handleClose}
              style={{
                width: 32, height: 32, borderRadius: '50%', border: `1px solid ${C.border}`,
                background: C.bg, color: C.muted, fontSize: 16, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {/* Inner tabs */}
          <div style={{ display: 'flex', gap: 2, overflowX: 'auto' }}>
            {DRAWER_TABS.map(tab => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: '8px 12px 7px', border: 'none', background: 'transparent',
                    cursor: 'pointer', fontSize: 12, fontWeight: active ? 700 : 500,
                    color: active ? C.purple : C.muted,
                    borderBottom: active ? `2.5px solid ${C.purple}` : '2.5px solid transparent',
                    whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5,
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: 13 }}>{tab.icon}</span>
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab content (scrollable) */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {activeTab === 'overview'    && <OverviewTab    report={report} />}
          {activeTab === 'route'       && <RouteTab       report={report} />}
          {activeTab === 'complaint'   && <ComplaintTab   report={report} />}
          {activeTab === 'investigate' && <InvestigationTab report={report} />}
          {activeTab === 'timeline'    && <TimelineTab    report={report} />}
        </div>
      </div>
    </>
  );
}
