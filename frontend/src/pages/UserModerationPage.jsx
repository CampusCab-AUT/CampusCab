import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { FIRESTORE_COLLECTIONS } from '../firestoreModel';
import { useSuspension } from '../hooks/useSuspension';
import SuspensionModal from '../components/admin/SuspensionModal';

const STATUS_OPTIONS = ['New', 'In-Progress', 'Resolved'];

const STATUS_COLORS = {
  New:           { background: '#fff3cd', color: '#856404' },
  'In-Progress': { background: '#cfe2ff', color: '#084298' },
  Resolved:      { background: '#d1e7dd', color: '#0a3622' },
};

export default function UserModerationPage({ userId, userName, onBack }) {
  const [reports, setReports]       = useState([]);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [updating, setUpdating]     = useState(null);

  const isSuspended = userProfile?.accountStatus === 'Suspended';

  const { showModal, setShowModal, suspending, unsuspending, handleSuspend, handleUnsuspend } =
    useSuspension(userId, userName, {
      onSuccess: ({ action, duration, reason }) => {
        setUserProfile((prev) => ({
          ...prev,
          accountStatus: action === 'SUSPEND' ? 'Suspended' : 'Active',
          suspensionReason:   action === 'SUSPEND' ? reason   : null,
          suspensionDuration: action === 'SUSPEND' ? duration : null,
          suspendedAt:        action === 'SUSPEND' ? new Date().toISOString() : null,
        }));
      },
    });

  useEffect(() => {
    const loadData = async () => {
      try {
        const reportsSnap = await getDocs(
          query(
            collection(db, FIRESTORE_COLLECTIONS.reports),
            where('reportedUserId', '==', userId),
            orderBy('createdAt', 'desc')
          )
        ).catch(() => getDocs(query(
          collection(db, FIRESTORE_COLLECTIONS.reports),
          where('reportedUserId', '==', userId)
        )));

        const userSnap = await getDoc(doc(db, FIRESTORE_COLLECTIONS.users, userId));

        setReports(reportsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
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
    if (!STATUS_OPTIONS.includes(newStatus)) return;
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
        style={{ marginBottom: 20, padding: '8px 16px', cursor: 'pointer', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', fontWeight: 600, fontSize: 13 }}
      >
        ← Back to Dashboard
      </button>

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
        <div>
          <h2 style={{ marginTop: 0, marginBottom: 4, fontSize: 20, fontWeight: 800, color: '#0f172a' }}>
            Moderation: {userName}
          </h2>
          <p style={{ color: '#64748b', margin: 0, fontSize: 13, fontFamily: 'monospace' }}>
            UID: {userId}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isSuspended && (
            <span style={{
              background: '#fee2e2', color: '#991b1b',
              padding: '6px 14px', borderRadius: 20, fontWeight: 700, fontSize: 13,
              border: '1px solid #fecaca',
            }}>
              SUSPENDED — {userProfile.suspensionDuration}
            </span>
          )}
          {isSuspended ? (
            <button
              onClick={handleUnsuspend}
              disabled={unsuspending}
              style={{
                padding: '10px 20px', borderRadius: 8, border: 'none',
                background: 'linear-gradient(135deg, #059669, #10b981)',
                color: 'white', fontWeight: 700, cursor: unsuspending ? 'not-allowed' : 'pointer', fontSize: 14,
                boxShadow: '0 4px 12px rgba(5,150,105,0.3)',
              }}
            >
              {unsuspending ? 'Reinstating…' : '✓ Unsuspend Account'}
            </button>
          ) : (
            <button
              onClick={() => setShowModal(true)}
              style={{
                padding: '10px 20px', borderRadius: 8, border: 'none',
                background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 14,
                boxShadow: '0 4px 12px rgba(220,38,38,0.3)',
              }}
            >
              Suspend Account
            </button>
          )}
        </div>
      </div>

      {isSuspended && userProfile?.suspensionReason && (
        <div style={{
          background: '#fff5f5', border: '1px solid #fecaca',
          borderRadius: 10, padding: '12px 16px', marginBottom: 20,
          fontSize: 14, color: '#7f1d1d',
        }}>
          <strong>Suspension reason:</strong> {userProfile.suspensionReason}
        </div>
      )}

      {loading && <p style={{ color: '#64748b' }}>Loading reports…</p>}
      {error   && <p style={{ color: '#dc2626' }}>Error: {error}</p>}
      {!loading && !error && reports.length === 0 && (
        <div style={{ padding: '40px 24px', textAlign: 'center', color: '#64748b', background: 'white', borderRadius: 12, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🛡️</div>
          <div style={{ fontWeight: 700 }}>No reports on file</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>This user has not been reported.</div>
        </div>
      )}

      {!loading && !error && reports.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {reports.map((report) => (
            <div
              key={report.id}
              style={{
                border: '1px solid #e2e8f0', borderRadius: 12,
                padding: '18px 20px', background: 'white',
                boxShadow: '0 2px 6px rgba(15,23,42,0.05)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <span style={{
                    display: 'inline-block', background: '#f1f5f9', color: '#475569',
                    padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700, marginBottom: 8,
                  }}>
                    {report.violationType}
                  </span>
                  <p style={{ margin: '4px 0', fontWeight: 600, fontSize: 14, color: '#0f172a' }}>Report Evidence</p>
                  <p style={{ margin: '4px 0', color: '#475569', fontSize: 13 }}>
                    {report.reason || 'No details provided.'}
                  </p>
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: '#94a3b8' }}>
                    Reported by: {report.reporterId} &nbsp;|&nbsp;
                    {report.createdAt?.toDate
                      ? report.createdAt.toDate().toLocaleString()
                      : 'Unknown date'}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    padding: '4px 12px', borderRadius: 12, fontSize: 13, fontWeight: 600,
                    ...STATUS_COLORS[report.status],
                  }}>
                    {report.status}
                  </span>
                  <select
                    value={report.status}
                    disabled={updating === report.id}
                    onChange={(e) => handleStatusChange(report.id, e.target.value)}
                    style={{
                      padding: '5px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0',
                      fontSize: 13, cursor: 'pointer', outline: 'none',
                    }}
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
