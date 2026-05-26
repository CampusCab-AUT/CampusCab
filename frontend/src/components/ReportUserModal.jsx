import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { FIRESTORE_COLLECTIONS } from '../firestoreModel';

const VIOLATION_TYPES = [
  'No Show', 'Unsafe Driving', 'Route Deviation', 'Rider Misconduct',
  'Payment Dispute', 'Late Pickup', 'Trip Fraud',
  'Harassment', 'Hate Speech', 'Inappropriate Content', 'Spam', 'Other',
];

function ReportUserModal({ reportedUserId, reportedUserName, reporterId, tripId, onClose, onReported }) {
  const [violationType, setViolationType] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!violationType) {
      setError('Please select a violation type.');
      return;
    }
    if (!reason.trim()) {
      setError('Please describe what happened.');
      return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      await addDoc(collection(db, FIRESTORE_COLLECTIONS.reports), {
        reportedUserId,
        reportedUserName: reportedUserName || reportedUserId,
        reporterId,
        reporterName: auth?.currentUser?.displayName || auth?.currentUser?.email || reporterId,
        violationType,
        reason: reason.trim(),
        status: 'New',
        tripId: tripId || '',
        createdAt: serverTimestamp(),
      });
      onReported?.();
      onClose();
    } catch (err) {
      setError('Failed to submit report. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="presentation"
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-modal-title"
        style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', width: '100%', maxWidth: '420px' }}
      >
        <h2 id="report-modal-title" style={{ marginTop: 0 }}>Report User</h2>
        <p style={{ color: '#666', marginBottom: '16px' }}>
          Reporting <strong>{reportedUserName || 'this user'}</strong>. Reports are reviewed by admins.
        </p>

        <label htmlFor="violation-type" style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>
          Violation Type
        </label>
        <select
          id="violation-type"
          value={violationType}
          onChange={(e) => setViolationType(e.target.value)}
          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #d1d5db', marginBottom: '14px', fontSize: '14px' }}
        >
          <option value="">Select a violation...</option>
          {VIOLATION_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <label htmlFor="report-reason" style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>
          Details
        </label>
        <textarea
          id="report-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Describe what happened..."
          rows={4}
          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #d1d5db', marginBottom: '14px', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box' }}
        />

        {error && <p style={{ color: '#dc2626', fontSize: '14px', marginBottom: '12px' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#fff', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: '#dc2626', color: '#fff', cursor: isSubmitting ? 'wait' : 'pointer', fontWeight: 'bold' }}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Report'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReportUserModal;
