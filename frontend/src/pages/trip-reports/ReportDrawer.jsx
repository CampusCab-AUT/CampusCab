import { useState, useEffect } from 'react';
import { doc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db, auth, firebaseReady } from '../../firebase';
import 'leaflet/dist/leaflet.css';

const C = {
  purple: '#7c3aed', purpleLight: '#ede9fe',
  blue: '#1d4ed8',   blueLight: '#dbeafe',
  amber: '#d97706',  amberLight: '#fef3c7',
  orange: '#ea580c', orangeLight: '#ffedd5',
  green: '#16a34a',  greenLight: '#dcfce7',
  red: '#dc2626',    redLight: '#fee2e2',
  slate: '#475569',
  border: 'rgba(15,23,42,0.08)',
  bg: '#f8f9fa', surface: '#ffffff',
  text: '#0f172a', muted: '#64748b',
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
  { id: 'overview',    label: 'Overview',          icon: '📋' },
  { id: 'route',       label: 'Route Analysis',    icon: '🗺️' },
  { id: 'complaint',   label: 'Complaint Details', icon: '📝' },
  { id: 'investigate', label: 'Investigation',     icon: '🔍' },
  { id: 'timeline',    label: 'Activity Timeline', icon: '⏱️' },
];

const ADMIN_NAMES  = ['Sarah K.', 'Mike T.', 'Jana L.'];
const ALL_STATUSES = ['New', 'In Progress', 'Escalated', 'Resolved', 'Dismissed'];
const ALL_SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];

function denormalizeStatus(s) {
  return s === 'In Progress' ? 'In-Progress' : s;
}

function fmtFull(d) {
  if (!d) return '—';
  return d.toLocaleDateString('en-AU', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function fmtShort(d) {
  if (!d) return '—';
  return d.toLocaleDateString('en-AU', { day:'numeric', month:'short', year:'numeric' });
}

function InfoRow({ label, value, mono }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'8px 0', borderBottom:`1px solid ${C.border}` }}>
      <span style={{ fontSize:12, color:C.muted, fontWeight:600, flexShrink:0, width:'45%' }}>{label}</span>
      <span style={{ fontSize:13, color:C.text, fontWeight:500, textAlign:'right', fontFamily: mono?'monospace':'inherit' }}>{value || '—'}</span>
    </div>
  );
}

function Badge({ bg, color, dot, children }) {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:99, fontSize:11, fontWeight:700, background:bg, color }}>
      {dot && <span style={{ width:7, height:7, borderRadius:'50%', background:dot }} />}
      {children}
    </span>
  );
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────
function OverviewTab({ report }) {
  const sc  = STATUS_CFG[report.status] || STATUS_CFG['New'];
  const sev = SEV_CFG[report.severity]  || SEV_CFG['Medium'];
  return (
    <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:20 }}>
      {/* Banner */}
      <div style={{ background:`linear-gradient(135deg,${C.purple}11,${C.blue}08)`, border:`1px solid ${C.purple}22`, borderRadius:12, padding:'14px 18px', display:'flex', gap:20, flexWrap:'wrap', alignItems:'center' }}>
        <div><div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Status</div><Badge bg={sc.bg} color={sc.color} dot={sc.dot}>{report.status}</Badge></div>
        <div><div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Severity</div><Badge bg={sev.bg} color={sev.color}>{report.severity}</Badge></div>
        <div><div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Violation</div><span style={{ fontSize:13, fontWeight:700, color:C.text }}>{report.violationType}</span></div>
        <div><div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Assigned To</div><span style={{ fontSize:13, fontWeight:600, color:C.text }}>{report.assignedAdmin}</span></div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <div style={{ background:C.bg, borderRadius:10, padding:'14px 16px' }}>
          <div style={{ fontSize:11, fontWeight:800, color:C.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>Report Info</div>
          <InfoRow label="Report ID"   value={report.displayId} mono />
          <InfoRow label="Trip ID"     value={report.tripId ? report.tripId.slice(0,16)+'…' : '—'} mono />
          <InfoRow label="Filed On"    value={fmtShort(report.dateReported)} />
          <InfoRow label="Last Update" value={fmtShort(report.lastUpdated)} />
        </div>
        <div style={{ background:C.bg, borderRadius:10, padding:'14px 16px' }}>
          <div style={{ fontSize:11, fontWeight:800, color:C.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>Trip Summary</div>
          <InfoRow label="Fare"     value={report.fare} />
          <InfoRow label="Duration" value={report.tripDuration} />
          <InfoRow label="Distance" value={report.distanceKm} />
          <InfoRow label="Route"    value={report.pickupArea && report.dropoffArea ? `${report.pickupArea} → ${report.dropoffArea}` : report.pickupArea || '—'} />
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <PersonCard title="Reported User" person={report.driver}    role="reported" />
        <PersonCard title="Filed By"      person={report.passenger} role="reporter" />
      </div>
    </div>
  );
}

function PersonCard({ title, person, role }) {
  const color = role === 'reported' ? C.red : C.blue;
  const palette = ['#7c3aed','#1d4ed8','#0f766e','#d97706','#dc2626','#16a34a'];
  const ic = palette[(person.initials?.charCodeAt(0)||0) % palette.length];
  return (
    <div style={{ background:C.bg, borderRadius:10, padding:'14px 16px', border:`1px solid ${C.border}` }}>
      <div style={{ fontSize:11, fontWeight:800, color:C.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>{title}</div>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
        <div style={{ width:36, height:36, borderRadius:'50%', background:ic+'22', color:ic, fontSize:13, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', border:`2px solid ${ic}44` }}>
          {person.initials}
        </div>
        <div>
          <div style={{ fontWeight:700, fontSize:14, color:C.text }}>{person.name}</div>
          <div style={{ fontSize:11, color:C.muted }}>ID: {person.id ? person.id.slice(0,12)+'…' : '—'}</div>
        </div>
      </div>
      {role === 'reported' && person.rating != null && (
        <div style={{ fontSize:12, color:C.muted }}>★ {person.rating} · {person.trips} trips</div>
      )}
    </div>
  );
}

// ─── Tab: Route Analysis ──────────────────────────────────────────────────────
function RouteTab({ report }) {
  const [mapComponents, setMapComponents] = useState(null);

  useEffect(() => {
    Promise.all([import('react-leaflet'), import('leaflet')]).then(([rl, L]) => {
      delete L.default.Icon.Default.prototype._getIconUrl;
      L.default.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });
      setMapComponents({ ...rl, L: L.default });
    }).catch(() => {});
  }, []);

  const hasCoords = report.pickup && report.dropoff;
  const center = hasCoords
    ? [(report.pickup.lat + report.dropoff.lat)/2, (report.pickup.lng + report.dropoff.lng)/2]
    : [-33.9173, 151.2313]; // Sydney fallback

  const mkIcon = (color) => mapComponents?.L ? new mapComponents.L.DivIcon({
    html: `<div style="width:14px;height:14px;background:${color};border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`,
    className:'', iconAnchor:[7,7],
  }) : null;

  return (
    <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>
      {!hasCoords && (
        <div style={{ background:C.amberLight, border:`1px solid ${C.amber}33`, borderRadius:8, padding:'10px 14px', fontSize:13, color:C.amber }}>
          ⚠ GPS coordinates are not available for this trip. Route map cannot be displayed.
        </div>
      )}

      {/* Legend */}
      <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:C.text }}>
          <span style={{ width:12, height:12, borderRadius:'50%', background:C.green, display:'inline-block' }} /> Pickup — {report.pickupArea || 'N/A'}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:C.text }}>
          <span style={{ width:12, height:12, borderRadius:'50%', background:C.red, display:'inline-block' }} /> Dropoff — {report.dropoffArea || 'N/A'}
        </div>
      </div>

      {/* Map */}
      <div style={{ height:300, borderRadius:12, overflow:'hidden', border:`1px solid ${C.border}`, background:'#e5e7eb', position:'relative' }}>
        {mapComponents && hasCoords ? (
          <mapComponents.MapContainer center={center} zoom={14} style={{ height:'100%', width:'100%' }} scrollWheelZoom={false}>
            <mapComponents.TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='© OpenStreetMap' />
            <mapComponents.Marker position={[report.pickup.lat, report.pickup.lng]}  icon={mkIcon(C.green)}>
              <mapComponents.Popup>Pickup — {report.pickupArea}</mapComponents.Popup>
            </mapComponents.Marker>
            <mapComponents.Marker position={[report.dropoff.lat, report.dropoff.lng]} icon={mkIcon(C.red)}>
              <mapComponents.Popup>Dropoff — {report.dropoffArea}</mapComponents.Popup>
            </mapComponents.Marker>
            <mapComponents.Polyline positions={[[report.pickup.lat, report.pickup.lng],[report.dropoff.lat, report.dropoff.lng]]} color={C.blue} weight={3} opacity={0.8} dashArray="8 4" />
          </mapComponents.MapContainer>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:8 }}>
            <span style={{ fontSize:32 }}>{hasCoords ? '⏳' : '🗺️'}</span>
            <div style={{ fontSize:13, color:C.muted }}>{hasCoords ? 'Loading map…' : 'No coordinates for this trip'}</div>
          </div>
        )}
      </div>

      {/* Metrics */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
        {[{label:'Distance', value:report.distanceKm, icon:'📏'},{label:'Duration', value:report.tripDuration, icon:'⏱'},{label:'Fare', value:report.fare, icon:'💳'}].map(({ label, value, icon }) => (
          <div key={label} style={{ background:C.bg, borderRadius:10, padding:'12px 14px', border:`1px solid ${C.border}`, textAlign:'center' }}>
            <div style={{ fontSize:20, marginBottom:4 }}>{icon}</div>
            <div style={{ fontSize:16, fontWeight:800, color:C.text }}>{value}</div>
            <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab: Complaint Details ───────────────────────────────────────────────────
function ComplaintTab({ report }) {
  return (
    <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:20 }}>
      {/* Reporter complaint */}
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
          <div style={{ width:30, height:30, borderRadius:'50%', background:C.blueLight, color:C.blue, fontSize:12, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center' }}>
            {report.passenger.initials}
          </div>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{report.passenger.name}</div>
            <div style={{ fontSize:11, color:C.muted }}>Filed {fmtShort(report.dateReported)}</div>
          </div>
        </div>
        {report.description ? (
          <div style={{ background:C.blueLight, borderRadius:10, padding:'14px 16px', borderLeft:`3px solid ${C.blue}`, fontSize:14, color:C.text, lineHeight:1.65 }}>
            {report.description}
          </div>
        ) : (
          <div style={{ background:C.bg, borderRadius:10, padding:'14px 16px', border:`1px solid ${C.border}`, fontSize:13, color:C.muted, fontStyle:'italic' }}>
            No description provided.
          </div>
        )}
      </div>

      {/* Reported user response */}
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
          <div style={{ width:30, height:30, borderRadius:'50%', background:C.greenLight, color:C.green, fontSize:12, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center' }}>
            {report.driver.initials}
          </div>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{report.driver.name}</div>
            <div style={{ fontSize:11, color:C.muted }}>Reported user response</div>
          </div>
        </div>
        {report.driverResponse ? (
          <div style={{ background:C.greenLight, borderRadius:10, padding:'14px 16px', borderLeft:`3px solid ${C.green}`, fontSize:14, color:C.text, lineHeight:1.65 }}>
            {report.driverResponse}
          </div>
        ) : (
          <div style={{ background:C.bg, borderRadius:10, padding:'14px 16px', border:`1px solid ${C.border}`, fontSize:13, color:C.muted, fontStyle:'italic' }}>
            No response submitted yet.
          </div>
        )}
      </div>

      {/* Evidence */}
      <div>
        <div style={{ fontSize:12, fontWeight:800, color:C.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12 }}>Evidence &amp; Attachments</div>
        <div style={{ background:C.bg, border:`1px dashed ${C.border}`, borderRadius:8, padding:'20px', textAlign:'center', color:C.muted, fontSize:13 }}>
          📎 No attachments uploaded yet. Evidence can be added by the investigating admin.
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Investigation ───────────────────────────────────────────────────────
function InvestigationTab({ report }) {
  const [status,     setStatus]     = useState(report.status);
  const [severity,   setSeverity]   = useState(report.severity);
  const [assignedTo, setAssignedTo] = useState(report.assignedAdmin === 'Unassigned' ? '' : report.assignedAdmin);
  const [notes,      setNotes]      = useState(report.adminNotes || '');
  const [resolution, setResolution] = useState('');
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [error,      setError]      = useState('');

  async function saveToFirestore(overrideStatus) {
    if (!firebaseReady || !db) { setError('Database not available.'); return; }
    const newStatus = overrideStatus || status;
    setSaving(true); setError('');
    try {
      const adminEmail = auth?.currentUser?.email || auth?.currentUser?.uid || 'Admin';
      const logEntry = {
        time:   new Date().toISOString(),
        action: `Status updated to "${newStatus}"${resolution.trim() ? ` — ${resolution.trim()}` : ''}. Notes updated.`,
        by:     adminEmail,
        type:   newStatus === 'Escalated' ? 'escalate' : newStatus === 'Resolved' ? 'resolve' : newStatus === 'Dismissed' ? 'close' : 'status',
      };
      await updateDoc(doc(db, 'reports', report.id), {
        status:        denormalizeStatus(newStatus),
        severity,
        assignedAdmin: assignedTo || 'Unassigned',
        adminNotes:    notes,
        ...(resolution.trim() && { resolution: resolution.trim() }),
        lastUpdated:   serverTimestamp(),
        activityLog:   arrayUnion(logEntry),
      });
      if (overrideStatus) setStatus(overrideStatus);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.message || 'Save failed. Check your connection.');
    } finally {
      setSaving(false);
    }
  }

  const selectStyle = { width:'100%', padding:'9px 12px', border:`1px solid ${C.border}`, borderRadius:8, fontSize:13, color:C.text, background:C.surface, outline:'none', fontFamily:'inherit', cursor:'pointer', boxSizing:'border-box' };
  const textareaStyle = { width:'100%', padding:'10px 12px', border:`1px solid ${C.border}`, borderRadius:8, fontSize:13, color:C.text, background:C.surface, outline:'none', fontFamily:'inherit', resize:'vertical', lineHeight:1.6, boxSizing:'border-box' };
  const labelStyle = { display:'block', fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 };

  return (
    <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:18 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <div>
          <label style={labelStyle}>Update Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)} style={selectStyle}>
            {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Update Severity</label>
          <select value={severity} onChange={e => setSeverity(e.target.value)} style={selectStyle}>
            {ALL_SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label style={labelStyle}>Assign Investigator</label>
        <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} style={selectStyle}>
          <option value="">Unassigned</option>
          {ADMIN_NAMES.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <div>
        <label style={labelStyle}>Investigation Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} placeholder="Add investigation notes, findings, and next steps…" style={textareaStyle} />
      </div>

      <div>
        <label style={labelStyle}>Resolution / Outcome</label>
        <textarea value={resolution} onChange={e => setResolution(e.target.value)} rows={3} placeholder="Describe the action taken (e.g. warning issued, account suspended, dismissed)…" style={textareaStyle} />
      </div>

      {error && <div style={{ background:C.redLight, border:`1px solid ${C.red}33`, borderRadius:8, padding:'10px 14px', fontSize:13, color:C.red }}>{error}</div>}

      {/* Primary action buttons */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
        <button onClick={() => saveToFirestore()} disabled={saving} style={{ padding:'10px 20px', border:'none', borderRadius:8, background: saved ? C.green : 'linear-gradient(135deg,#7c3aed,#4f46e5)', color:'#fff', fontSize:13, fontWeight:700, cursor: saving?'wait':'pointer', transition:'all 0.2s', boxShadow:'0 4px 14px rgba(124,58,237,0.25)', minWidth:130 }}>
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
        </button>
        <button onClick={() => saveToFirestore('Escalated')} disabled={saving} style={{ padding:'10px 16px', border:`1px solid ${C.orange}44`, borderRadius:8, background:C.orangeLight, color:C.orange, fontSize:13, fontWeight:700, cursor:'pointer' }}>
          🔴 Escalate
        </button>
        <button onClick={() => saveToFirestore('Resolved')} disabled={saving} style={{ padding:'10px 16px', border:`1px solid ${C.green}44`, borderRadius:8, background:C.greenLight, color:C.green, fontSize:13, fontWeight:700, cursor:'pointer' }}>
          ✅ Resolve
        </button>
        <button onClick={() => saveToFirestore('Dismissed')} disabled={saving} style={{ padding:'10px 16px', border:`1px solid ${C.border}`, borderRadius:8, background:'#f1f5f9', color:C.muted, fontSize:13, fontWeight:700, cursor:'pointer' }}>
          Dismiss
        </button>
      </div>

      {/* Quick actions */}
      <div style={{ background:C.bg, borderRadius:10, padding:'14px 16px', border:`1px solid ${C.border}` }}>
        <div style={{ fontSize:12, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12 }}>Quick Actions</div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {[
            { label:'Request dashcam footage from reported user', icon:'🎥' },
            { label:'Send warning notification to reported user',  icon:'⚠️' },
            { label:'Initiate refund for the reporter',            icon:'💸' },
            { label:'Suspend reported user pending review',        icon:'🔒' },
            { label:'Flag trip for fraud audit',                   icon:'🚩' },
          ].map(({ label, icon }) => (
            <button key={label} style={{ padding:'8px 12px', border:`1px solid ${C.border}`, borderRadius:6, background:C.surface, color:C.text, fontSize:12, fontWeight:500, cursor:'pointer', textAlign:'left', display:'flex', alignItems:'center', gap:8, transition:'background 0.12s' }}
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

  const log = report.activityLog || [];

  // Always prepend a "report filed" entry
  const allEntries = [
    { time: report.dateReported, action: 'Report filed by ' + report.passenger.name, by: report.passenger.name, type: 'created' },
    ...log,
  ];

  return (
    <div style={{ padding:'20px 24px' }}>
      {allEntries.length === 0 ? (
        <div style={{ textAlign:'center', padding:'40px 0', color:C.muted, fontSize:13 }}>
          No activity recorded yet.
        </div>
      ) : (
        <div style={{ position:'relative', paddingLeft:28 }}>
          <div style={{ position:'absolute', left:10, top:0, bottom:0, width:2, background:C.border }} />
          {allEntries.map((ev, i) => {
            const cfg = ICON_MAP[ev.type] || ICON_MAP['note'];
            const time = ev.time instanceof Date ? ev.time : (ev.time?.toDate?.() || (ev.time ? new Date(ev.time) : null));
            return (
              <div key={i} style={{ position:'relative', marginBottom:18 }}>
                <div style={{ position:'absolute', left:-24, top:2, width:20, height:20, borderRadius:'50%', background:cfg.color+'22', border:`2px solid ${cfg.color}55`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10 }}>
                  {cfg.icon}
                </div>
                <div style={{ background:C.bg, borderRadius:10, padding:'12px 14px', border:`1px solid ${C.border}` }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{ev.action}</div>
                    {time && (
                      <div style={{ fontSize:10, color:C.muted, whiteSpace:'nowrap', flexShrink:0, background:C.surface, padding:'2px 8px', borderRadius:99, border:`1px solid ${C.border}` }}>
                        {fmtFull(time)}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>
                    By <strong style={{ color:C.text }}>{ev.by}</strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Drawer ──────────────────────────────────────────────────────────────
export default function ReportDrawer({ report, onClose }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [visible,   setVisible]   = useState(false);

  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  function handleClose() { setVisible(false); setTimeout(onClose, 260); }

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const sc = STATUS_CFG[report.status] || STATUS_CFG['New'];

  return (
    <>
      <style>{`
        @keyframes drawerIn  { from { transform:translateX(100%); opacity:0 } to { transform:translateX(0); opacity:1 } }
        @keyframes backdropIn { from { opacity:0 } to { opacity:1 } }
      `}</style>

      {/* Backdrop */}
      <div onClick={handleClose} style={{ position:'fixed', inset:0, zIndex:998, background:'rgba(15,23,42,0.35)', backdropFilter:'blur(2px)', animation:'backdropIn 0.25s ease both' }} />

      {/* Panel */}
      <div style={{ position:'fixed', right:0, top:0, bottom:0, zIndex:999, width:640, maxWidth:'96vw', background:C.surface, display:'flex', flexDirection:'column', boxShadow:'-8px 0 40px rgba(15,23,42,0.14)', animation:'drawerIn 0.26s cubic-bezier(0.22,1,0.36,1) both' }}>

        {/* Header */}
        <div style={{ padding:'18px 24px 0', borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14 }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
                <span style={{ fontSize:17, fontWeight:800, color:C.purple, fontFamily:'monospace' }}>{report.displayId}</span>
                <Badge bg={sc.bg} color={sc.color} dot={sc.dot}>{report.status}</Badge>
                {report.tripId && <span style={{ padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:700, background:'#f1f5f9', color:C.muted, fontFamily:'monospace' }}>{report.tripId.slice(0,10)}…</span>}
              </div>
              <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{report.violationType}</div>
              <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>{report.driver.name} · {report.passenger.name} · {report.pickupArea || 'No route info'}</div>
            </div>
            <button onClick={handleClose} style={{ width:32, height:32, borderRadius:'50%', border:`1px solid ${C.border}`, background:C.bg, color:C.muted, fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, lineHeight:1 }}>×</button>
          </div>

          {/* Inner tabs */}
          <div style={{ display:'flex', gap:2, overflowX:'auto' }}>
            {DRAWER_TABS.map(tab => {
              const active = activeTab === tab.id;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding:'8px 12px 7px', border:'none', background:'transparent', cursor:'pointer', fontSize:12, fontWeight: active?700:500, color: active?C.purple:C.muted, borderBottom: active?`2.5px solid ${C.purple}`:'2.5px solid transparent', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:5, transition:'all 0.15s' }}>
                  <span style={{ fontSize:13 }}>{tab.icon}</span>{tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex:1, overflowY:'auto' }}>
          {activeTab === 'overview'    && <OverviewTab     report={report} />}
          {activeTab === 'route'       && <RouteTab        report={report} />}
          {activeTab === 'complaint'   && <ComplaintTab    report={report} />}
          {activeTab === 'investigate' && <InvestigationTab report={report} />}
          {activeTab === 'timeline'    && <TimelineTab     report={report} />}
        </div>
      </div>
    </>
  );
}
