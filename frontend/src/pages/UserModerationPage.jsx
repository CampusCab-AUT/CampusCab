import { useState, useEffect } from 'react';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { FIRESTORE_COLLECTIONS } from '../firestoreModel';

const STATUS_OPTIONS = ['New', 'In-Progress', 'Resolved'];

const STATUS_COLORS = {
  New: { background: '#fff3cd', color: '#856404' },
  'In-Progress': { background: '#cfe2ff', color: '#084298' },
  Resolved: { background: '#d1e7dd', color: '#0a3622' },
};

const DURATION_OPTIONS = ['24 hours', '7 days', 'Permanent'];

function SuspensionModal({ userName, onConfirm, onCancel, loading }) {
  const [duration, setDuration] = useState('24 hours');
  const [reason, setReason] = useState('');

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: 'white', borderRadius: 12, padding: 32, width: 460,
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }}>
        <h3 style={{ marginTop: 0, color: '#dc3545' }}>Suspend Account</h3>
        <p style={{ color: '#444', marginBottom: 20 }}>
          You are about to suspend <strong>{userName}</strong>. This will immediately terminate their session.
        </p>

        <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Suspension Duration</label>
        <select
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ccc', marginBottom: 16, fontSize: 14 }}
        >
          {DURATION_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>

        <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>
          Reason <span style={{ color: '#dc3545' }}>*</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Enter a mandatory reason for this suspension..."
          rows={4}
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 6,
            border: `1.5px solid ${reason ? '#ccc' : '#dc3545'}`,
            fontSize: 14, resize: 'vertical', boxSizing: 'border-box',
          }}
        />
        {!reason && <p style={{ color: '#dc3545', fontSize: 12, margin: '4px 0 0' }}>Reason is required to confirm.</p>}

        <div style={{ display: 'flex', gap: 12, marginTop: 20, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{ padding: '10px 20px', borderRadius: 6, border: '1px solid #ccc', background: 'white', cursor: 'pointer', fontSize: 14 }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(duration, reason)}
            disabled={!reason.trim() || loading}
            style={{
              padding: '10px 20px', borderRadius: 6, border: 'none',
              background: reason.trim() ? '#dc3545' : '#f5a0a8',
              color: 'white', cursor: reason.trim() ? 'pointer' : 'not-allowed',
              fontSize: 14, fontWeight: 600,
            }}
          >
            {loading ? 'Suspending...' : 'Confirm Suspension'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UserModerationPage({ userId, userName, onBack }) {
  const [reports, setReports] = useState([]);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [suspending, setSuspending] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const reportsSnap = await getDocs(query(
          collection(db, FIRESTORE_COLLECTIONS.reports),
          where('reportedUserId', '==', userId),
          orderBy('createdAt', 'desc')
        ));
        setReports(reportsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

        const userSnap = await getDoc(doc(db, FIRESTORE_COLLECTIONS.users, userId));
        if (userSnap.exists()) {
          setUserProfile({ id: userSnap.id, ...userSnap.data() });
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [userId]);

  const handleStatusChange = async (reportId, newStatus) => {
    const valid = ['New', 'In-Progress', 'Resolved'];
    if (!valid.includes(newStatus)) return;
    setUpdating(reportId);
    try {
      await updateDoc(doc(db, FIRESTORE_COLLECTIONS.reports, reportId), { status: newStatus });
      setReports((prev) => prev.map((r) => (r.id === reportId ? { ...r, status: newStatus } : r)));
    } catch (err) {
      alert('Failed to update status: ' + err.message);
    } finally {
      setUpdating(null);
    }
  };

  const handleSuspend = async (duration, reason) => {
    setSuspending(true);
    try {
      const adminId = auth.currentUser?.uid;

      await setDoc(doc(db, FIRESTORE_COLLECTIONS.users, userId), {
        accountStatus: 'Suspended',
        suspensionReason: reason,
        suspensionDuration: duration,
        suspendedAt: new Date().toISOString(),
        suspendedBy: adminId,
      }, { merge: true });

      await addDoc(collection(db, FIRESTORE_COLLECTIONS.auditLogs), {
        adminId,
        targetUserId: userId,
        action: 'SUSPEND',
        reason,
        duration,
        timestamp: serverTimestamp(),
      });

      setUserProfile((prev) => ({
        ...prev,
        accountStatus: 'Suspended',
        suspensionReason: reason,
        suspensionDuration: duration,
      }));
      setShowModal(false);
    } catch (err) {
      alert('Failed to suspend user: ' + err.message);
    } finally {
      setSuspending(false);
    }
  };

  const handleUnsuspend = async () => {
    if (!window.confirm(`Reinstate ${userName}'s account?`)) return;
    try {
      const adminId = auth.currentUser?.uid;

      await updateDoc(doc(db, FIRESTORE_COLLECTIONS.users, userId), {
        accountStatus: 'Active',
        suspensionReason: null,
        suspensionDuration: null,
        suspendedAt: null,
        suspendedBy: null,
      });

      await addDoc(collection(db, FIRESTORE_COLLECTIONS.auditLogs), {
        adminId,
        targetUserId: userId,
        action: 'UNSUSPEND',
        reason: 'Manual reinstatement by admin',
        duration: null,
        timestamp: serverTimestamp(),
      });

      setUserProfile((prev) => ({
        ...prev,
        accountStatus: 'Active',
        suspensionReason: null,
        suspensionDuration: null,
      }));
    } catch (err) {
      alert('Failed to unsuspend user: ' + err.message);
    }
  };

  const isSuspended = userProfile?.accountStatus === 'Suspended';

  return (
    <div style={{ padding: 24 }}>
      {showModal && (
        <SuspensionModal
          userName={userName}
          onConfirm={handleSuspend}
          onCancel={() => setShowModal(false)}
          loading={suspending}
        />
      )}

      <button
        onClick={onBack}
        style={{ marginBottom: 20, padding: '8px 16px', cursor: 'pointer', borderRadius: 6, border: '1px solid #ccc', background: 'white' }}
      >
        ← Back to Dashboard
      </button>

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
        <div>
          <h2 style={{ marginTop: 0, marginBottom: 4 }}>Moderation: {userName}</h2>
          <p style={{ color: '#666', margin: 0 }}>User ID: {userId}</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isSuspended && (
            <span style={{ background: '#f8d7da', color: '#842029', padding: '6px 14px', borderRadius: 20, fontWeight: 700, fontSize: 13 }}>
              SUSPENDED — {userProfile.suspensionDuration}
            </span>
          )}
          {isSuspended ? (
            <button
              onClick={handleUnsuspend}
              style={{ padding: '10px 20px', borderRadius: 6, border: 'none', background: '#198754', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
            >
              Unsuspend Account
            </button>
          ) : (
            <button
              onClick={() => setShowModal(true)}
              style={{ padding: '10px 20px', borderRadius: 6, border: 'none', background: '#dc3545', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
            >
              Suspend Account
            </button>
          )}
        </div>
      </div>

      {isSuspended && userProfile.suspensionReason && (
        <div style={{ background: '#f8d7da', border: '1px solid #f5c2c7', borderRadius: 8, padding: '12px 16px', marginBottom: 20 }}>
          <strong>Suspension reason:</strong> {userProfile.suspensionReason}
        </div>
      )}

      {loading && <p>Loading reports...</p>}
      {error && <p style={{ color: '#dc3545' }}>Error: {error}</p>}
      {!loading && !error && reports.length === 0 && <p style={{ color: '#666' }}>No reports found for this user.</p>}

      {!loading && !error && reports.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {reports.map((report) => (
            <div
              key={report.id}
              style={{ border: '1px solid #dee2e6', borderRadius: 8, padding: 20, background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <span style={{ display: 'inline-block', background: '#6c757d', color: 'white', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                    {report.violationType}
                  </span>
                  <p style={{ margin: '4px 0', fontWeight: 600 }}>Report Evidence</p>
                  <p style={{ margin: '4px 0', color: '#444' }}>{report.reason || 'No details provided.'}</p>
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: '#888' }}>
                    Reported by: {report.reporterId} &nbsp;|&nbsp;
                    {report.createdAt?.toDate
                      ? report.createdAt.toDate().toLocaleString()
                      : 'Unknown date'}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ padding: '4px 12px', borderRadius: 12, fontSize: 13, fontWeight: 600, ...STATUS_COLORS[report.status] }}>
                    {report.status}
                  </span>
                  <select
                    value={report.status}
                    disabled={updating === report.id}
                    onChange={(e) => handleStatusChange(report.id, e.target.value)}
                    style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #ccc', fontSize: 13, cursor: 'pointer' }}
                  >
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
