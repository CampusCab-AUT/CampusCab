import { useState, useMemo, useEffect, useRef } from 'react';
import {
  collection, query, orderBy, onSnapshot, getDoc, doc, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { db, auth, firebaseReady } from '../../firebase';
import { FIRESTORE_COLLECTIONS } from '../../firestoreModel';
import ReportDrawer from './ReportDrawer';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  purple: '#7c3aed', purpleLight: '#ede9fe',
  blue: '#1d4ed8',   blueLight: '#dbeafe',
  amber: '#d97706',  amberLight: '#fef3c7',
  orange: '#ea580c', orangeLight: '#ffedd5',
  green: '#16a34a',  greenLight: '#dcfce7',
  red: '#dc2626',    redLight: '#fee2e2',
  slate: '#475569',  slateLight: '#f1f5f9',
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
  'Low':      { bg: '#f0fdf4', color: '#15803d', dot: '#4ade80' },
  'Medium':   { bg: '#fefce8', color: '#a16207', dot: '#facc15' },
  'High':     { bg: '#fff7ed', color: '#c2410c', dot: '#fb923c' },
  'Critical': { bg: '#fef2f2', color: '#b91c1c', dot: '#f87171' },
};

const ALL_COLUMNS = [
  { key: 'displayId',    label: 'Report ID',    sortable: false },
  { key: 'tripId',       label: 'Trip ID',      sortable: false },
  { key: 'driver',       label: 'Reported User',sortable: true  },
  { key: 'passenger',    label: 'Reporter',     sortable: false },
  { key: 'violationType',label: 'Violation',    sortable: true  },
  { key: 'severity',     label: 'Severity',     sortable: true  },
  { key: 'status',       label: 'Status',       sortable: true  },
  { key: 'pickupArea',   label: 'Trip Route',   sortable: true  },
  { key: 'dateReported', label: 'Date Filed',   sortable: true  },
  { key: 'lastUpdated',  label: 'Last Updated', sortable: true  },
  { key: 'assignedAdmin',label: 'Assigned To',  sortable: true  },
];

export const VIOLATION_TYPES = [
  'No Show', 'Unsafe Driving', 'Route Deviation', 'Rider Misconduct',
  'Payment Dispute', 'Late Pickup', 'Trip Fraud',
  'Harassment', 'Hate Speech', 'Inappropriate Content', 'Spam', 'Other',
];

export const REPORT_STATUSES  = ['New', 'In Progress', 'Escalated', 'Resolved', 'Dismissed'];
export const REPORT_SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];
export const ADMIN_NAMES = ['Sarah K.', 'Mike T.', 'Jana L.'];

const MAIN_TABS = [
  { id: 'all',       label: 'All Reports' },
  { id: 'open',      label: 'Open' },
  { id: 'progress',  label: 'In Progress' },
  { id: 'escalated', label: 'Escalated' },
  { id: 'resolved',  label: 'Resolved' },
  { id: 'route',     label: 'Route Violations' },
  { id: 'noshows',   label: 'No Shows' },
  { id: 'fraud',     label: 'Fraud' },
  { id: 'highsev',   label: 'High Severity' },
];

// ─── Data helpers ─────────────────────────────────────────────────────────────
function getInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (name.slice(0, 2)).toUpperCase();
}

function normalizeStatus(s) {
  if (s === 'In-Progress') return 'In Progress';
  return s || 'New';
}

function mapDoc(docSnap, trip, userMap = {}) {
  const d = docSnap.data();
  const reportedUser = userMap[d.reportedUserId];
  const reporter     = userMap[d.reporterId];
  const reportedName = reportedUser?.email || d.reportedUserName || d.reportedUserId || 'Unknown User';
  const reporterName = reporter?.email     || d.reporterName    || (d.reporterId ? `User …${d.reporterId.slice(-6)}` : 'Unknown');
  return {
    id:       docSnap.id,
    displayId: `#${docSnap.id.slice(0, 8).toUpperCase()}`,
    tripId:   d.tripId || '',
    driver: {
      id:       d.reportedUserId || '',
      name:     reportedName,
      initials: getInitials(reportedName),
      email:    reportedUser?.email || null,
      rating:   null,
      trips:    null,
    },
    passenger: {
      id:       d.reporterId || '',
      name:     reporterName,
      initials: getInitials(reporterName),
      email:    reporter?.email || null,
    },
    violationType: d.violationType || 'Other',
    severity:      d.severity || 'Medium',
    status:        normalizeStatus(d.status),
    pickupArea:    trip?.origin      || d.pickupArea  || '',
    dropoffArea:   trip?.destination || d.dropoffArea || '',
    dateReported:  d.createdAt?.toDate?.()    || new Date(),
    lastUpdated:   d.lastUpdated?.toDate?.()  || d.createdAt?.toDate?.() || new Date(),
    assignedAdmin: d.assignedAdmin || 'Unassigned',
    description:   d.reason        || '',
    driverResponse: d.driverResponse || '',
    fare:          d.fare           || 'N/A',
    tripDuration:  d.tripDuration   || 'N/A',
    distanceKm:    d.distanceKm     || 'N/A',
    pickup:  trip?.originLocation      ? { lat: trip.originLocation.lat,      lng: trip.originLocation.lon      } : null,
    dropoff: trip?.destinationLocation ? { lat: trip.destinationLocation.lat, lng: trip.destinationLocation.lon } : null,
    activityLog: (d.activityLog || []).map(ev => ({
      ...ev,
      time: ev.time?.toDate?.() || (ev.time ? new Date(ev.time) : new Date()),
    })),
    adminNotes: d.adminNotes || '',
  };
}

function tabFilter(reports, tabId) {
  switch (tabId) {
    case 'open':      return reports.filter(r => r.status === 'New');
    case 'progress':  return reports.filter(r => r.status === 'In Progress');
    case 'escalated': return reports.filter(r => r.status === 'Escalated');
    case 'resolved':  return reports.filter(r => r.status === 'Resolved');
    case 'route':     return reports.filter(r => r.violationType === 'Route Deviation');
    case 'noshows':   return reports.filter(r => r.violationType === 'No Show');
    case 'fraud':     return reports.filter(r => r.violationType === 'Trip Fraud');
    case 'highsev':   return reports.filter(r => r.severity === 'High' || r.severity === 'Critical');
    default:          return reports;
  }
}

function getSortValue(r, key) {
  if (key === 'driver')    return r.driver.name;
  if (key === 'passenger') return r.passenger.name;
  if (key === 'dateReported' || key === 'lastUpdated') return r[key].getTime();
  return r[key] ?? '';
}

function exportCSV(reports) {
  const headers = ['Report ID','Trip ID','Reported User','Reporter','Violation','Severity','Status','Route','Date Filed','Last Updated','Assigned To'];
  const rows = reports.map(r => [
    r.displayId, r.tripId, r.driver.name, r.passenger.name, r.violationType,
    r.severity, r.status, r.pickupArea,
    r.dateReported.toLocaleDateString(), r.lastUpdated.toLocaleDateString(), r.assignedAdmin,
  ]);
  const csv = [headers, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `trip-reports-${Date.now()}.csv`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function fmtDate(d) {
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatCard({ icon, label, value, trend, trendUp, gradient, lightBg }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16,
        padding: '20px 22px', cursor: 'default', position: 'relative', overflow: 'hidden',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
        transform: hov ? 'translateY(-3px)' : 'none',
        boxShadow: hov ? '0 16px 40px rgba(15,23,42,0.12)' : '0 2px 12px rgba(15,23,42,0.06)',
      }}
    >
      <div style={{ position:'absolute', top:0, right:0, width:90, height:90, background: lightBg, borderRadius:'0 16px 0 80px', opacity:0.5 }} />
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12 }}>
        <div style={{ width:40, height:40, borderRadius:10, background: gradient, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>
          {icon}
        </div>
        {trend !== undefined && (
          <span style={{ fontSize:11, fontWeight:700, color: trendUp ? C.green : C.red, background: trendUp ? C.greenLight : C.redLight, padding:'2px 8px', borderRadius:99 }}>
            {trendUp ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div style={{ fontSize:28, fontWeight:800, color:C.text, lineHeight:1 }}>{value}</div>
      <div style={{ fontSize:12, fontWeight:600, color:C.muted, marginTop:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>{label}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG['New'];
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:99, fontSize:11, fontWeight:700, background:cfg.bg, color:cfg.color, whiteSpace:'nowrap' }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:cfg.dot, flexShrink:0 }} />
      {status}
    </span>
  );
}

function SeverityBadge({ severity }) {
  const cfg = SEV_CFG[severity] || SEV_CFG['Medium'];
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:99, fontSize:11, fontWeight:700, background:cfg.bg, color:cfg.color, whiteSpace:'nowrap' }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:cfg.dot, flexShrink:0 }} />
      {severity}
    </span>
  );
}

function Avatar({ initials, size = 28 }) {
  const palette = ['#7c3aed','#1d4ed8','#0f766e','#d97706','#dc2626','#16a34a'];
  const color   = palette[(initials.charCodeAt(0) || 0) % palette.length];
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:color+'22', color, fontSize:size*0.4, fontWeight:800, display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0, border:`1.5px solid ${color}44` }}>
      {initials}
    </div>
  );
}

function BarChart({ data, color = C.purple }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      {data.map(({ label, value }) => (
        <div key={label}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
            <span style={{ fontSize:12, color:C.text, fontWeight:500 }}>{label}</span>
            <span style={{ fontSize:12, fontWeight:700, color:C.text }}>{value}</span>
          </div>
          <div style={{ height:6, background:'#f1f5f9', borderRadius:99, overflow:'hidden' }}>
            <div style={{ height:'100%', borderRadius:99, width:`${(value/max)*100}%`, background:`linear-gradient(90deg,${color},${color}99)`, transition:'width 0.6s ease' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function MiniTimelineChart({ reports }) {
  const days = 14;
  const counts = Array.from({ length: days }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (days - 1 - i)); d.setHours(0,0,0,0);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    return reports.filter(r => r.dateReported >= d && r.dateReported < next).length;
  });
  const max = Math.max(...counts, 1);
  const W = 300; const H = 64; const barW = Math.floor(W/days) - 2;
  return (
    <svg width={W} height={H} style={{ display:'block', overflow:'visible' }}>
      <defs>
        <linearGradient id="bg0" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7c3aed"/><stop offset="100%" stopColor="#4f46e5"/>
        </linearGradient>
      </defs>
      {counts.map((c, i) => {
        const barH = Math.max(4, (c/max)*(H-14));
        const x = i*(W/days)+1; const y = H-barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} rx={3} fill="url(#bg0)" opacity={0.8} />
            {c > 0 && <text x={x+barW/2} y={y-3} textAnchor="middle" style={{ fontSize:8, fill:C.muted, fontFamily:'system-ui' }}>{c}</text>}
          </g>
        );
      })}
    </svg>
  );
}

// ─── New Report Modal ─────────────────────────────────────────────────────────
function NewReportModal({ onClose, onCreated }) {
  const [violationType, setViolationType] = useState('');
  const [reason, setReason]               = useState('');
  const [tripId, setTripId]               = useState('');
  const [severity, setSeverity]           = useState('Medium');
  const [reportedUserId, setReportedUserId] = useState('');
  const [submitting, setSubmitting]       = useState(false);
  const [error, setError]                 = useState('');

  async function handleSubmit() {
    if (!violationType) { setError('Please select a violation type.'); return; }
    if (!reason.trim()) { setError('Please describe the incident.'); return; }
    setSubmitting(true); setError('');
    try {
      const user = auth?.currentUser;
      await addDoc(collection(db, FIRESTORE_COLLECTIONS.reports), {
        reportedUserId:   reportedUserId.trim() || 'admin-filed',
        reportedUserName: reportedUserId.trim() || 'Admin-Filed Report',
        reporterId:       user?.uid || 'admin',
        reporterName:     user?.email || 'Admin',
        violationType,
        reason:           reason.trim(),
        status:           'New',
        severity,
        tripId:           tripId.trim() || '',
        createdAt:        serverTimestamp(),
      });
      onCreated?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to submit report.');
      setSubmitting(false);
    }
  }

  const inputStyle = { width:'100%', padding:'9px 12px', border:`1px solid ${C.border}`, borderRadius:8, fontSize:13, color:C.text, background:C.surface, outline:'none', fontFamily:'inherit', boxSizing:'border-box' };
  const labelStyle = { display:'block', fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 };

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:998, background:'rgba(15,23,42,0.4)', backdropFilter:'blur(2px)' }} />
      <div style={{ position:'fixed', inset:0, zIndex:999, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
        <div style={{ background:C.surface, borderRadius:16, width:'100%', maxWidth:480, boxShadow:'0 20px 60px rgba(15,23,42,0.18)', padding:28 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
            <h2 style={{ margin:0, fontSize:18, fontWeight:800, color:C.text }}>File New Report</h2>
            <button onClick={onClose} style={{ width:30, height:30, borderRadius:'50%', border:`1px solid ${C.border}`, background:C.bg, cursor:'pointer', fontSize:16, color:C.muted }}>×</button>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              <label style={labelStyle}>Violation Type *</label>
              <select value={violationType} onChange={e => setViolationType(e.target.value)} style={{ ...inputStyle, cursor:'pointer' }}>
                <option value="">Select a violation…</option>
                {VIOLATION_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Severity</label>
              <select value={severity} onChange={e => setSeverity(e.target.value)} style={{ ...inputStyle, cursor:'pointer' }}>
                {REPORT_SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Reported User ID (optional)</label>
              <input value={reportedUserId} onChange={e => setReportedUserId(e.target.value)} placeholder="Firebase UID of reported user" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Trip ID (optional)</label>
              <input value={tripId} onChange={e => setTripId(e.target.value)} placeholder="Firestore trip document ID" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Incident Description *</label>
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={4} placeholder="Describe the incident in detail…" style={{ ...inputStyle, resize:'vertical', lineHeight:1.6 }} />
            </div>
          </div>

          {error && <p style={{ color:C.red, fontSize:13, margin:'12px 0 0' }}>{error}</p>}

          <div style={{ display:'flex', gap:10, marginTop:20 }}>
            <button onClick={onClose} disabled={submitting} style={{ flex:1, padding:'10px', border:`1px solid ${C.border}`, borderRadius:8, background:C.bg, color:C.text, fontSize:13, fontWeight:600, cursor:'pointer' }}>
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={submitting} style={{ flex:1, padding:'10px', border:'none', borderRadius:8, background:'linear-gradient(135deg,#7c3aed,#4f46e5)', color:'#fff', fontSize:13, fontWeight:700, cursor: submitting ? 'wait':'pointer', boxShadow:'0 4px 14px rgba(124,58,237,0.25)' }}>
              {submitting ? 'Filing…' : 'File Report'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────
function Skeleton({ w = '100%', h = 14, r = 6 }) {
  return <div style={{ width:w, height:h, borderRadius:r, background:'linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)', backgroundSize:'200% 100%', animation:'shimmer 1.4s infinite' }} />;
}

// ─── Pagination button ────────────────────────────────────────────────────────
function PagBtn({ onClick, disabled, active, label }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ width:30, height:30, borderRadius:6, border:`1px solid ${active ? C.purple : C.border}`, background: active ? C.purple : C.surface, color: active ? '#fff' : disabled ? C.border : C.text, fontSize:12, fontWeight:600, cursor: disabled ? 'default':'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
      {label}
    </button>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────
export default function TripReportsDashboard() {
  const [reports, setReports]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [activeTab, setActiveTab]   = useState('all');
  const [searchQuery, setSearch]    = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort]             = useState({ key: 'dateReported', dir: 'desc' });
  const [page, setPage]             = useState(1);
  const [pageSize, setPageSize]     = useState(10);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectedReport, setSelectedReport] = useState(null);
  const [showColMenu, setShowColMenu] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showNewReport, setShowNewReport] = useState(false);
  const [filters, setFilters]       = useState({ status:'', severity:'', violationType:'', assignedAdmin:'', dateFrom:'', dateTo:'' });
  const [visibleCols, setVisibleCols] = useState(new Set(ALL_COLUMNS.map(c => c.key)));
  const colMenuRef = useRef(null);

  // ── Load from Firestore ──────────────────────────────────────────────────
  useEffect(() => {
    if (!firebaseReady || !db) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, FIRESTORE_COLLECTIONS.reports), orderBy('createdAt', 'desc'));

    const unsub = onSnapshot(q, async (snapshot) => {
      try {
        const docs = snapshot.docs;

        // Batch-fetch unique trips (deduplicated)
        const tripIds = [...new Set(docs.map(d => d.data().tripId).filter(Boolean))];
        const tripMap = {};
        await Promise.all(tripIds.map(async (tid) => {
          try {
            const tripDoc = await getDoc(doc(db, FIRESTORE_COLLECTIONS.trips, tid));
            if (tripDoc.exists()) tripMap[tid] = { id: tripDoc.id, ...tripDoc.data() };
          } catch { /* ignore missing trips */ }
        }));

        // Batch-fetch unique user profiles to resolve emails
        const userIds = [...new Set([
          ...docs.map(d => d.data().reportedUserId).filter(Boolean),
          ...docs.map(d => d.data().reporterId).filter(Boolean),
        ])];
        const userMap = {};
        await Promise.all(userIds.map(async (uid) => {
          try {
            const userDoc = await getDoc(doc(db, FIRESTORE_COLLECTIONS.users, uid));
            if (userDoc.exists()) userMap[uid] = userDoc.data();
          } catch { /* ignore inaccessible profiles */ }
        }));

        setReports(docs.map(d => mapDoc(d, tripMap[d.data().tripId] || null, userMap)));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }, (err) => {
      setError(err.message);
      setLoading(false);
    });

    return unsub;
  }, []);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:     reports.length,
    open:      reports.filter(r => r.status === 'New').length,
    progress:  reports.filter(r => r.status === 'In Progress').length,
    escalated: reports.filter(r => r.status === 'Escalated').length,
    resolved:  reports.filter(r => r.status === 'Resolved').length,
    highSev:   reports.filter(r => r.severity === 'High' || r.severity === 'Critical').length,
  }), [reports]);

  const tabCounts = useMemo(() => {
    const tc = {};
    MAIN_TABS.forEach(t => { tc[t.id] = tabFilter(reports, t.id).length; });
    return tc;
  }, [reports]);

  // ── Filter + sort ─────────────────────────────────────────────────────────
  const processed = useMemo(() => {
    let data = tabFilter(reports, activeTab);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      data = data.filter(r =>
        r.displayId.toLowerCase().includes(q) ||
        r.tripId.toLowerCase().includes(q) ||
        r.driver.name.toLowerCase().includes(q) ||
        r.passenger.name.toLowerCase().includes(q) ||
        r.violationType.toLowerCase().includes(q) ||
        r.pickupArea.toLowerCase().includes(q)
      );
    }
    if (filters.status)        data = data.filter(r => r.status === filters.status);
    if (filters.severity)      data = data.filter(r => r.severity === filters.severity);
    if (filters.violationType) data = data.filter(r => r.violationType === filters.violationType);
    if (filters.assignedAdmin) data = data.filter(r => r.assignedAdmin === filters.assignedAdmin);
    if (filters.dateFrom) { const f = new Date(filters.dateFrom); data = data.filter(r => r.dateReported >= f); }
    if (filters.dateTo)   { const t = new Date(filters.dateTo); t.setHours(23,59,59,999); data = data.filter(r => r.dateReported <= t); }
    return [...data].sort((a, b) => {
      const av = getSortValue(a, sort.key), bv = getSortValue(b, sort.key);
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [reports, activeTab, searchQuery, filters, sort]);

  const totalPages = Math.max(1, Math.ceil(processed.length / pageSize));
  const paginated  = processed.slice((page-1)*pageSize, page*pageSize);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSort   = key => { setSort(s => s.key===key ? { key, dir: s.dir==='asc'?'desc':'asc' } : { key, dir:'asc' }); setPage(1); };
  const handleTab    = id  => { setActiveTab(id); setPage(1); setSelectedIds(new Set()); };
  const handleFilter = (f, v) => { setFilters(prev => ({ ...prev, [f]: v })); setPage(1); };
  const clearFilters = ()  => { setFilters({ status:'', severity:'', violationType:'', assignedAdmin:'', dateFrom:'', dateTo:'' }); setSearch(''); setPage(1); };
  const toggleRow    = id  => setSelectedIds(s => { const n = new Set(s); n.has(id)?n.delete(id):n.add(id); return n; });
  const toggleColVis = key => setVisibleCols(s => { const n = new Set(s); n.has(key)?n.delete(key):n.add(key); return n; });
  const toggleAll    = ()  => { const ids = paginated.map(r => r.id); const all = ids.every(id => selectedIds.has(id)); setSelectedIds(s => { const n = new Set(s); all ? ids.forEach(id => n.delete(id)) : ids.forEach(id => n.add(id)); return n; }); };

  const activeFiltersCount = Object.values(filters).filter(Boolean).length;
  const allPageSelected = paginated.length > 0 && paginated.every(r => selectedIds.has(r.id));

  // Analytics data
  const violationData = useMemo(() => {
    const c = {}; reports.forEach(r => { c[r.violationType] = (c[r.violationType]||0)+1; });
    return Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,7).map(([label,value])=>({label,value}));
  }, [reports]);
  const statusData   = useMemo(() => REPORT_STATUSES.map(s => ({ label:s, value: reports.filter(r => r.status===s).length })), [reports]);
  const severityData = useMemo(() => REPORT_SEVERITIES.map(s => ({ label:s, value: reports.filter(r => r.severity===s).length })), [reports]);

  const inputStyle  = { padding:'8px 12px', border:`1px solid ${C.border}`, borderRadius:8, fontSize:13, color:C.text, background:C.surface, outline:'none', fontFamily:'inherit' };
  const selectStyle = { ...inputStyle, cursor:'pointer' };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding:'28px 32px', background:C.bg, minHeight:'100%', fontFamily:'system-ui,-apple-system,sans-serif' }}>
      <style>{`
        @keyframes fadeSlideUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
        @keyframes shimmer { to { background-position: -200% 0 } }
        .tr-row:hover { background: #f8fafc !important; }
        .tr-row.sel   { background: #ede9fe !important; }
        .tr-act { opacity:0; transition:opacity 0.15s; }
        .tr-row:hover .tr-act { opacity:1; }
      `}</style>

      {/* Header */}
      <div style={{ animation:'fadeSlideUp 0.4s ease both', marginBottom:28 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, fontSize:12, color:C.muted }}>
          <span>Admin</span><span style={{ color:C.border }}>›</span>
          <span style={{ color:C.purple, fontWeight:600 }}>Trip Reports</span>
        </div>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:16 }}>
          <div>
            <h1 style={{ margin:0, fontSize:26, fontWeight:800, color:C.text, letterSpacing:'-0.02em' }}>Trip Reports</h1>
            <p style={{ margin:'4px 0 0', fontSize:14, color:C.muted }}>
              Investigate and resolve ride-level complaints — no-shows, violations, fraud, and misconduct.
            </p>
          </div>
          <div style={{ display:'flex', gap:10, flexShrink:0 }}>
            <button onClick={() => setShowAnalytics(v=>!v)} style={{ padding:'9px 16px', borderRadius:10, border:`1px solid ${C.border}`, background: showAnalytics ? C.purpleLight : C.surface, color: showAnalytics ? C.purple : C.text, fontSize:13, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
              📊 Analytics
            </button>
            <button onClick={() => exportCSV(processed)} style={{ padding:'9px 16px', borderRadius:10, border:`1px solid ${C.border}`, background:C.surface, color:C.text, fontSize:13, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
              ⬇ Export CSV
            </button>
            <button onClick={() => setShowNewReport(true)} style={{ padding:'9px 18px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#7c3aed,#4f46e5)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 14px rgba(124,58,237,0.3)' }}>
              + New Report
            </button>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:14, marginBottom:28, animation:'fadeSlideUp 0.4s ease 0.05s both' }}>
        {loading ? (
          Array.from({length:6}).map((_, i) => (
            <div key={i} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:'20px 22px' }}>
              <Skeleton w={40} h={40} r={10} /><div style={{marginTop:12}}><Skeleton w="60%" h={28} /><Skeleton w="80%" h={12} r={4} style={{marginTop:8}} /></div>
            </div>
          ))
        ) : (
          <>
            <StatCard icon="📋" label="Total Reports"  value={stats.total}     trend={null}  gradient="linear-gradient(135deg,#7c3aed,#4f46e5)" lightBg={C.purpleLight} />
            <StatCard icon="🔵" label="Open Reports"   value={stats.open}                    gradient="linear-gradient(135deg,#1d4ed8,#3b82f6)" lightBg={C.blueLight}   />
            <StatCard icon="🟡" label="In Progress"    value={stats.progress}                gradient="linear-gradient(135deg,#d97706,#f59e0b)" lightBg={C.amberLight}  />
            <StatCard icon="🔴" label="Escalated"      value={stats.escalated}               gradient="linear-gradient(135deg,#ea580c,#f97316)" lightBg={C.orangeLight} />
            <StatCard icon="✅" label="Resolved"       value={stats.resolved}                gradient="linear-gradient(135deg,#16a34a,#22c55e)" lightBg={C.greenLight}  />
            <StatCard icon="⚠️" label="High Severity"  value={stats.highSev}                 gradient="linear-gradient(135deg,#dc2626,#f87171)" lightBg={C.redLight}    />
          </>
        )}
      </div>

      {/* Analytics Panel */}
      {showAnalytics && !loading && (
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:24, marginBottom:24, animation:'fadeSlideUp 0.3s ease both' }}>
          <h3 style={{ margin:'0 0 20px', fontSize:15, fontWeight:700, color:C.text }}>Analytics Overview</h3>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))', gap:24 }}>
            <div><div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>Reports — Last 14 Days</div><MiniTimelineChart reports={reports} /></div>
            <div><div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>By Violation Type</div><BarChart data={violationData} color={C.purple} /></div>
            <div><div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>By Status</div><BarChart data={statusData} color={C.blue} /></div>
            <div><div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>By Severity</div><BarChart data={severityData} color={C.orange} /></div>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div style={{ background:'#fef2f2', border:`1px solid ${C.red}33`, borderRadius:12, padding:'14px 18px', marginBottom:20, color:C.red, fontSize:13 }}>
          ⚠ Failed to load reports: {error}
        </div>
      )}

      {/* Main card */}
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, overflow:'hidden', boxShadow:'0 2px 12px rgba(15,23,42,0.05)', animation:'fadeSlideUp 0.4s ease 0.1s both' }}>

        {/* Tabs */}
        <div style={{ borderBottom:`1px solid ${C.border}`, overflowX:'auto' }}>
          <div style={{ display:'flex', padding:'0 20px', gap:4, whiteSpace:'nowrap', minWidth:'max-content' }}>
            {MAIN_TABS.map(tab => {
              const active = activeTab === tab.id;
              return (
                <button key={tab.id} onClick={() => handleTab(tab.id)} style={{ padding:'14px 14px 12px', border:'none', background:'transparent', cursor:'pointer', fontSize:13, fontWeight: active?700:500, color: active?C.purple:C.muted, borderBottom: active?`2.5px solid ${C.purple}`:'2.5px solid transparent', display:'flex', alignItems:'center', gap:7, transition:'all 0.15s' }}>
                  {tab.label}
                  <span style={{ background: active?C.purpleLight:'#f1f5f9', color: active?C.purple:C.muted, padding:'1px 6px', borderRadius:99, fontSize:11, fontWeight:700 }}>
                    {tabCounts[tab.id] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Toolbar */}
        <div style={{ padding:'14px 20px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
          <div style={{ position:'relative', flex:'1 1 220px', maxWidth:320 }}>
            <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:C.muted, fontSize:14 }}>🔍</span>
            <input value={searchQuery} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search by ID, user, trip, violation…" style={{ ...inputStyle, paddingLeft:32, width:'100%', boxSizing:'border-box' }} />
          </div>

          <button onClick={() => setShowFilters(v=>!v)} style={{ ...inputStyle, cursor:'pointer', display:'flex', alignItems:'center', gap:6, background: showFilters?C.purpleLight:C.surface, color: showFilters?C.purple:C.text, border:`1px solid ${showFilters?C.purple+'44':C.border}` }}>
            ⚙ Filters
            {activeFiltersCount > 0 && <span style={{ background:C.purple, color:'#fff', width:18, height:18, borderRadius:'50%', fontSize:10, fontWeight:800, display:'inline-flex', alignItems:'center', justifyContent:'center' }}>{activeFiltersCount}</span>}
          </button>

          <div style={{ position:'relative' }} ref={colMenuRef}>
            <button onClick={() => setShowColMenu(v=>!v)} style={{ ...inputStyle, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>⊞ Columns</button>
            {showColMenu && (
              <div style={{ position:'absolute', top:'110%', right:0, zIndex:100, background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, boxShadow:'0 8px 30px rgba(15,23,42,0.12)', padding:8, minWidth:180 }}>
                {ALL_COLUMNS.map(col => (
                  <label key={col.key} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', cursor:'pointer', borderRadius:6, fontSize:13, color:C.text }}>
                    <input type="checkbox" checked={visibleCols.has(col.key)} onChange={() => toggleColVis(col.key)} style={{ accentColor:C.purple }} />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>

          {selectedIds.size > 0 && (
            <div style={{ display:'flex', alignItems:'center', gap:8, marginLeft:'auto' }}>
              <span style={{ fontSize:12, color:C.purple, fontWeight:600 }}>{selectedIds.size} selected</span>
              <button onClick={() => exportCSV(reports.filter(r => selectedIds.has(r.id)))} style={{ ...inputStyle, cursor:'pointer', fontSize:12, color:C.blue, border:`1px solid ${C.blue}44`, background:C.blueLight }}>Export Selected</button>
              <button onClick={() => setSelectedIds(new Set())} style={{ ...inputStyle, cursor:'pointer', fontSize:12, color:C.red, border:`1px solid ${C.red}44`, background:C.redLight }}>Clear</button>
            </div>
          )}
          <span style={{ marginLeft:'auto', fontSize:12, color:C.muted, whiteSpace:'nowrap' }}>{processed.length} report{processed.length!==1?'s':''}</span>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div style={{ padding:'16px 20px', borderBottom:`1px solid ${C.border}`, background:'#fafafc', display:'flex', flexWrap:'wrap', gap:12, alignItems:'flex-end' }}>
            {[
              { field:'status',        label:'Status',    options: REPORT_STATUSES },
              { field:'severity',      label:'Severity',  options: REPORT_SEVERITIES },
              { field:'violationType', label:'Violation', options: VIOLATION_TYPES },
              { field:'assignedAdmin', label:'Admin',     options: [...ADMIN_NAMES, 'Unassigned'] },
            ].map(({ field, label, options }) => (
              <div key={field}>
                <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.06em' }}>{label}</div>
                <select value={filters[field]} onChange={e => handleFilter(field, e.target.value)} style={selectStyle}>
                  <option value="">All</option>
                  {options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.06em' }}>From</div>
              <input type="date" value={filters.dateFrom} onChange={e => handleFilter('dateFrom', e.target.value)} style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.06em' }}>To</div>
              <input type="date" value={filters.dateTo} onChange={e => handleFilter('dateTo', e.target.value)} style={inputStyle} />
            </div>
            {activeFiltersCount > 0 && (
              <button onClick={clearFilters} style={{ padding:'8px 14px', border:'none', borderRadius:8, background:C.redLight, color:C.red, fontSize:12, fontWeight:700, cursor:'pointer' }}>Clear All</button>
            )}
          </div>
        )}

        {/* Table */}
        <div style={{ overflowX:'auto' }}>
          {loading ? (
            <div style={{ padding:24, display:'flex', flexDirection:'column', gap:12 }}>
              {Array.from({length:5}).map((_,i) => (
                <div key={i} style={{ display:'flex', gap:16, alignItems:'center' }}>
                  <Skeleton w={20} h={20} r={4} />
                  {[80,100,140,120,100,70,90,110,90,90,80].map((w,j) => <Skeleton key={j} w={w} h={14} r={4} />)}
                </div>
              ))}
            </div>
          ) : paginated.length === 0 ? (
            <div style={{ padding:'60px 20px', textAlign:'center' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🔍</div>
              <div style={{ fontSize:16, fontWeight:700, color:C.text, marginBottom:6 }}>No reports found</div>
              <div style={{ fontSize:13, color:C.muted, marginBottom:16 }}>Adjust your filters or search, or file a new report.</div>
              <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
                {activeFiltersCount > 0 && <button onClick={clearFilters} style={{ padding:'8px 18px', border:'none', borderRadius:8, background:C.purpleLight, color:C.purple, fontSize:13, fontWeight:700, cursor:'pointer' }}>Clear Filters</button>}
                <button onClick={() => setShowNewReport(true)} style={{ padding:'8px 18px', border:'none', borderRadius:8, background:'linear-gradient(135deg,#7c3aed,#4f46e5)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>+ File Report</button>
              </div>
            </div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#fafafc' }}>
                  <th style={{ padding:'10px 12px', borderBottom:`1px solid ${C.border}`, width:36 }}>
                    <input type="checkbox" checked={allPageSelected} onChange={toggleAll} style={{ accentColor:C.purple, cursor:'pointer' }} />
                  </th>
                  {ALL_COLUMNS.filter(c => visibleCols.has(c.key)).map(col => (
                    <th key={col.key} onClick={() => col.sortable && handleSort(col.key)} style={{ padding:'10px 14px', borderBottom:`1px solid ${C.border}`, textAlign:'left', fontWeight:700, color:C.muted, fontSize:11, textTransform:'uppercase', letterSpacing:'0.06em', cursor: col.sortable?'pointer':'default', whiteSpace:'nowrap', userSelect:'none' }}>
                      <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                        {col.label}
                        {col.sortable && (sort.key===col.key ? <span style={{color:C.purple}}>{sort.dir==='asc'?'↑':'↓'}</span> : <span style={{color:C.border,opacity:0.5}}>↕</span>)}
                      </span>
                    </th>
                  ))}
                  <th style={{ padding:'10px 14px', borderBottom:`1px solid ${C.border}`, width:80 }} />
                </tr>
              </thead>
              <tbody>
                {paginated.map(r => {
                  const isSel = selectedIds.has(r.id);
                  return (
                    <tr key={r.id} className={`tr-row${isSel?' sel':''}`} style={{ background: isSel?'#ede9fe':C.surface, borderBottom:`1px solid ${C.border}`, cursor:'pointer', transition:'background 0.12s' }}>
                      <td style={{ padding:'10px 12px' }} onClick={e => { e.stopPropagation(); toggleRow(r.id); }}>
                        <input type="checkbox" checked={isSel} onChange={() => toggleRow(r.id)} style={{ accentColor:C.purple, cursor:'pointer' }} />
                      </td>
                      {visibleCols.has('displayId') && <td style={{ padding:'10px 14px' }} onClick={() => setSelectedReport(r)}><span style={{ fontWeight:700, color:C.purple, fontFamily:'monospace', fontSize:12 }}>{r.displayId}</span></td>}
                      {visibleCols.has('tripId') && <td style={{ padding:'10px 14px' }} onClick={() => setSelectedReport(r)}><span style={{ color:C.muted, fontFamily:'monospace', fontSize:11 }}>{r.tripId ? r.tripId.slice(0,12)+'…' : '—'}</span></td>}
                      {visibleCols.has('driver') && (
                        <td style={{ padding:'10px 14px' }} onClick={() => setSelectedReport(r)}>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <Avatar initials={r.driver.initials} size={26} />
                            <div>
                              <div style={{ fontWeight:600, color:C.text, fontSize:13 }}>{r.driver.name}</div>
                              <div style={{ fontSize:11, color:C.muted }}>Reported</div>
                            </div>
                          </div>
                        </td>
                      )}
                      {visibleCols.has('passenger') && (
                        <td style={{ padding:'10px 14px' }} onClick={() => setSelectedReport(r)}>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <Avatar initials={r.passenger.initials} size={26} />
                            <span style={{ fontWeight:500, color:C.text, fontSize:13 }}>{r.passenger.name}</span>
                          </div>
                        </td>
                      )}
                      {visibleCols.has('violationType') && <td style={{ padding:'10px 14px' }} onClick={() => setSelectedReport(r)}><span style={{ fontSize:12, fontWeight:500, color:C.text }}>{r.violationType}</span></td>}
                      {visibleCols.has('severity')      && <td style={{ padding:'10px 14px' }} onClick={() => setSelectedReport(r)}><SeverityBadge severity={r.severity} /></td>}
                      {visibleCols.has('status')        && <td style={{ padding:'10px 14px' }} onClick={() => setSelectedReport(r)}><StatusBadge status={r.status} /></td>}
                      {visibleCols.has('pickupArea')    && <td style={{ padding:'10px 14px' }} onClick={() => setSelectedReport(r)}><span style={{ fontSize:12, color:C.muted }}>{r.pickupArea ? `📍 ${r.pickupArea} → ${r.dropoffArea}` : '—'}</span></td>}
                      {visibleCols.has('dateReported')  && <td style={{ padding:'10px 14px' }} onClick={() => setSelectedReport(r)}><span style={{ fontSize:12, color:C.muted, whiteSpace:'nowrap' }}>{fmtDate(r.dateReported)}</span></td>}
                      {visibleCols.has('lastUpdated')   && <td style={{ padding:'10px 14px' }} onClick={() => setSelectedReport(r)}><span style={{ fontSize:12, color:C.muted, whiteSpace:'nowrap' }}>{fmtDate(r.lastUpdated)}</span></td>}
                      {visibleCols.has('assignedAdmin') && <td style={{ padding:'10px 14px' }} onClick={() => setSelectedReport(r)}><span style={{ fontSize:12, color: r.assignedAdmin==='Unassigned'?C.muted:C.text, fontStyle: r.assignedAdmin==='Unassigned'?'italic':'normal' }}>{r.assignedAdmin}</span></td>}
                      <td style={{ padding:'10px 12px', textAlign:'right' }}>
                        <button className="tr-act" onClick={() => setSelectedReport(r)} style={{ padding:'5px 12px', border:`1px solid ${C.border}`, borderRadius:6, background:C.surface, color:C.purple, fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
                          Investigate →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div style={{ padding:'12px 20px', borderTop:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:12, color:C.muted }}>Rows:</span>
              <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} style={{ ...selectStyle, padding:'4px 8px', fontSize:12 }}>
                {[10,25,50].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <span style={{ fontSize:12, color:C.muted }}>{(page-1)*pageSize+1}–{Math.min(page*pageSize, processed.length)} of {processed.length}</span>
            </div>
            <div style={{ display:'flex', gap:4 }}>
              <PagBtn onClick={() => setPage(1)}         disabled={page===1}          label="«" />
              <PagBtn onClick={() => setPage(p=>p-1)}   disabled={page===1}          label="‹" />
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page-2, totalPages-4));
                const p = start+i; if (p > totalPages) return null;
                return <PagBtn key={p} onClick={() => setPage(p)} active={page===p} label={String(p)} />;
              })}
              <PagBtn onClick={() => setPage(p=>p+1)}   disabled={page===totalPages} label="›" />
              <PagBtn onClick={() => setPage(totalPages)} disabled={page===totalPages} label="»" />
            </div>
          </div>
        )}
      </div>

      {/* Modals & Drawer */}
      {showNewReport && <NewReportModal onClose={() => setShowNewReport(false)} onCreated={() => setShowNewReport(false)} />}
      {selectedReport && <ReportDrawer report={selectedReport} onClose={() => setSelectedReport(null)} />}
    </div>
  );
}
