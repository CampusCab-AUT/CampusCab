/**
 * @fileoverview Component for users to create and update their driver vehicle profile.
 * Saves vehicle data (make, model, license plate) to the Firestore 'vehicles' collection.
 */


import React, { useState } from 'react';
import { db, auth } from './firebase';
import { doc, setDoc } from 'firebase/firestore';
import { FIRESTORE_COLLECTIONS } from './firestoreModel';
import { buttons, colors, inputs, pills, radius, shadows, typography } from './theme';

function Field({ label, helper, children }) {
  return (
    <div style={{ textAlign: 'left' }}>
      <label style={inputs.label}>{label}</label>
      {children}
      {helper && <p style={inputs.helper}>{helper}</p>}
    </div>
  );
}
/**
 * A customized text input field that applies theme-specific focus styling.
 * @param {Object} props - Standard HTML input properties.
 */
function TextInput({ value, onChange, placeholder, required = false, ...rest }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type="text"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      required={required}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        ...inputs.field,
        ...(focused ? inputs.fieldFocus : null),
      }}
      {...rest}
    />
  );
}
/**
 * Main VehicleProfile component.
 * Allows authenticated drivers to submit or edit their vehicle details.
 * @param {Object} props
 * @param {Object} [props.initialVehicle] - Optional pre-existing vehicle data to pre-fill the form.
 * @param {Function} [props.onSaved] - Callback fired when vehicle data is successfully saved.
 * @param {boolean} [props.compact=false] - If true, hides the "Saved" preview card to save UI space.
 */
function VehicleProfile({ initialVehicle = null, onSaved, compact = false }) {
  const [make, setMake] = useState(initialVehicle?.make || '');
  const [model, setModel] = useState(initialVehicle?.model || '');
  const [licensePlate, setLicensePlate] = useState(initialVehicle?.licensePlate || '');
  const [message, setMessage] = useState('');
  const [savedVehicle, setSavedVehicle] = useState(initialVehicle);
  const [isSaving, setIsSaving] = useState(false);

  const isButtonDisabled = licensePlate.trim() === '' || isSaving;
  /**
   * Validates inputs and pushes the vehicle data to the Firestore 'vehicles' collection.
   * Uses setDoc to cleanly overwrite/update the user's vehicle document.
   * @param {Event} e - Form submission event.
   */
  const handleSave = async (e) => {
    e.preventDefault();
    setMessage('');
    setIsSaving(true);
    try {
      const user = auth.currentUser;
      if (!user) return;

      const vehicleData = { make, model, licensePlate, ownerId: user.uid };

      await setDoc(doc(db, FIRESTORE_COLLECTIONS.vehicles, user.uid), vehicleData);

      setMessage('Vehicle details saved successfully.');
      setSavedVehicle(vehicleData);
      if (onSaved) onSaved(vehicleData);
    } catch (error) {
      setMessage('Error saving: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const hasError = message.startsWith('Error');

  return (
    <div style={{ padding: '22px', textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <span style={{ ...pills.base, ...pills.accent }}>
          <span aria-hidden="true">🚗</span> Vehicle
        </span>
        {savedVehicle && !compact && <span style={{ ...pills.base, ...pills.success }}>Saved</span>}
      </div>

      <h2 style={{ ...typography.h2, margin: '10px 0 6px' }}>
        {initialVehicle ? 'Update your vehicle' : 'Tell us about your ride'}
      </h2>
      <p style={{ ...typography.body, margin: '0 0 18px' }}>
        Passengers see these details when deciding whether to book a seat.
      </p>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <Field label="Make">
          <TextInput value={make} onChange={(e) => setMake(e.target.value)} placeholder="Toyota" required />
        </Field>
        <Field label="Model">
          <TextInput value={model} onChange={(e) => setModel(e.target.value)} placeholder="Prius" required />
        </Field>
        <Field label="License plate" helper="Required — passengers look for this at pickup.">
          <TextInput
            value={licensePlate}
            onChange={(e) => setLicensePlate(e.target.value)}
            placeholder="ABC123"
          />
        </Field>

        <button
          type="submit"
          disabled={isButtonDisabled}
          style={{
            ...buttons.accent,
            marginTop: '4px',
            opacity: isButtonDisabled ? 0.55 : 1,
            cursor: isButtonDisabled ? 'not-allowed' : 'pointer',
          }}
        >
          {isSaving
            ? 'Saving…'
            : licensePlate.trim() === ''
              ? 'Enter a license plate to continue'
              : initialVehicle
                ? 'Save changes'
                : 'Save and continue'}
        </button>
      </form>

      {message && (
        <p
          style={{
            marginTop: '14px',
            padding: '10px 14px',
            borderRadius: radius.md,
            fontWeight: 600,
            fontSize: '0.88rem',
            color: hasError ? colors.danger : colors.success,
            backgroundColor: hasError ? colors.dangerSoft : colors.successSoft,
          }}
        >
          {message}
        </p>
      )}

      {savedVehicle && !compact && (
        <div
          style={{
            marginTop: '18px',
            padding: '16px 18px',
            borderRadius: radius.lg,
            background: 'linear-gradient(135deg, rgba(15, 118, 110, 0.08), rgba(29, 78, 216, 0.06))',
            border: `1px solid ${colors.border}`,
            boxShadow: shadows.soft,
          }}
        >
          <div style={{ ...typography.eyebrow, marginBottom: '10px', color: colors.accent }}>
            Public driver profile
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            <ProfileItem label="Make" value={savedVehicle.make || '—'} />
            <ProfileItem label="Model" value={savedVehicle.model || '—'} />
            <ProfileItem label="Plate" value={savedVehicle.licensePlate} />
          </div>
        </div>
      )}
    </div>
  );
}
/**
 * Helper component for displaying key-value pairs in the saved vehicle preview card.
 * @param {Object} props
 * @param {string} props.label - The label for the data point.
 * @param {string} props.value - The value of the data point.
 */
function ProfileItem({ label, value }) {
  return (
    <div>
      <div
        style={{
          fontSize: '0.64rem',
          fontWeight: 800,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: colors.textSubtle,
        }}
      >
        {label}
      </div>
      <div style={{ marginTop: '4px', fontWeight: 700, color: colors.text, fontSize: '0.92rem' }}>{value}</div>
    </div>
  );
}

export default VehicleProfile;
