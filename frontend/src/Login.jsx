/**
 * @fileoverview Main authentication component for CampusCab.
 * Handles both secure user login and new student registration.
 * Includes strict university email validation and account suspension checks.
 */


import React, { useState, useEffect } from 'react';
import { auth, db, firebaseReady } from './firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { FIRESTORE_COLLECTIONS } from './firestoreModel';
import useIsDesktop from './hooks/useIsDesktop';
import { buttons, colors, inputs, radius, shadows, typography } from './theme';
/**
 * Main Login and Registration UI Component.
 * @param {Object} props
 * @param {Function} props.onLoginSuccess - Callback triggered when authentication is successful, passing user role and uid.
 */
function Login({ onLoginSuccess }) {
  const [mode, setMode] = useState('home');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [message, setMessage] = useState('');
  const [emailFocus, setEmailFocus] = useState(false);
  const [passFocus, setPassFocus] = useState(false);
  const [nameFocus, setNameFocus] = useState(false);
  const isDesktop = useIsDesktop();
  /**
   * Toggles the UI state between 'home', 'login', and 'register' modes.
   * Automatically clears form inputs and error messages to ensure a clean state.
   * @param {string} next - The next view mode to transition to.
   */
  const switchMode = (next) => {
    setMode(next);
    setMessage('');
    setEmail('');
    setPassword('');
    setFullName('');
  };
  /**
   * Handles the form submission for both Registration and Login flows.
   * Validates AUT student emails during registration and enforces account suspensions during login.
   * @param {Event} e - Form submission event to prevent default browser reload.
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');

    if (mode === 'register') {
      if (!firebaseReady || !auth) {
        setMessage('Demo mode: Firebase is not configured, so registration is disabled locally.');
        return;
      }
      const trimmedName = fullName.trim();
      if (trimmedName.length < 2) {
        setMessage('Validation error: Please enter your full name (at least 2 characters).');
        return;
      }
      // Strict University Email Validation
      const normalised = email.trim().toLowerCase();
      const isAutEmail = normalised.endsWith('@aut.ac.nz') || normalised.endsWith('@autuni.ac.nz');
      if (!isAutEmail) {
        setMessage('Validation error: You must use a valid AUT email address (@aut.ac.nz or @autuni.ac.nz).');
        return;
      }
      try {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(credential.user, { displayName: trimmedName });
        if (db) {
          await setDoc(
            doc(db, FIRESTORE_COLLECTIONS.users, credential.user.uid),
            {
              displayName: trimmedName,
              email: credential.user.email,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        }
        setMessage('Success! Account created. You can now log in.');
        switchMode('login');
      } catch (error) {
        setMessage('Error: ' + error.message);
      }
    } else {
      if (!firebaseReady || !auth) {
        onLoginSuccess();
        return;
      }
      try {
        // USER STORY 2, TEST 2: Secure login
        const credential = await signInWithEmailAndPassword(auth, email, password);
        // Fetch user profile to check for admin suspensions
        const userDoc = await getDoc(doc(db, FIRESTORE_COLLECTIONS.users, credential.user.uid));
        const data = userDoc.exists() ? userDoc.data() : {};
        if (data.accountStatus === 'Suspended') {
          await auth.signOut();
          setMessage(`Your account has been suspended. Reason: ${data.suspensionReason || 'Policy violation'}. Duration: ${data.suspensionDuration || 'Permanent'}.`);
          return;
        }
        const role = data.role || 'Passenger';
        onLoginSuccess({ role, uid: credential.user.uid });
      } catch (error) {
        // USER STORY 2, TEST 1: Invalid login alert
        setMessage("Invalid Login. Please check your email and password.");
      }
    }
  };

  const isError = message.toLowerCase().includes('error') || message.toLowerCase().includes('invalid');
  const showForm = mode === 'login' || mode === 'register';

  const heroContent = (
    <>
      <div
        style={{
          width: isDesktop ? '84px' : '110px',
          height: isDesktop ? '84px' : '110px',
          borderRadius: isDesktop ? '24px' : '32px',
          margin: isDesktop ? '0 0 22px' : '0 auto 26px',
          background: 'rgba(255, 255, 255, 0.14)',
          border: '1px solid rgba(255, 255, 255, 0.22)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: isDesktop ? '2.2rem' : '3rem',
          boxShadow: '0 30px 60px -20px rgba(0, 0, 0, 0.4)',
        }}
        aria-hidden="true"
      >
        🚗
      </div>

      <h1
        style={{
          fontSize: isDesktop ? '2.8rem' : '2rem',
          fontWeight: 900,
          lineHeight: 1.08,
          margin: '0 0 16px',
          letterSpacing: '-0.025em',
        }}
      >
        Get around campus
        <span style={{ display: 'block', color: 'rgba(255, 255, 255, 0.7)' }}>
          with fellow students.
        </span>
      </h1>

      <p
        style={{
          fontSize: isDesktop ? '1.05rem' : '0.96rem',
          lineHeight: 1.6,
          color: 'rgba(255, 255, 255, 0.82)',
          margin: isDesktop ? '0 0 28px' : '0 auto 28px',
          maxWidth: isDesktop ? '420px' : '320px',
        }}
      >
        Safe, affordable rides within your AUT community. Students helping students get where they need to go.
      </p>

      {!isDesktop && !showForm && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            type="button"
            onClick={() => switchMode('login')}
            style={{
              border: 'none',
              borderRadius: radius.pill,
              padding: '15px 22px',
              fontSize: '0.98rem',
              fontWeight: 800,
              cursor: 'pointer',
              backgroundColor: '#ffffff',
              color: colors.accent,
              boxShadow: '0 14px 30px rgba(0, 0, 0, 0.25)',
            }}
          >
            Log in →
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            style={{
              border: '1.5px solid rgba(255, 255, 255, 0.45)',
              borderRadius: radius.pill,
              padding: '14px 22px',
              fontSize: '0.95rem',
              fontWeight: 800,
              cursor: 'pointer',
              backgroundColor: 'transparent',
              color: '#ffffff',
            }}
          >
            Create account
          </button>
        </div>
      )}

      {isDesktop && (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: '8px 0 0',
            display: 'grid',
            gap: '12px',
            maxWidth: '420px',
          }}
        >
          {[
            { icon: '🎓', text: 'AUT students only — verified with your university email.' },
            { icon: '💸', text: 'Split costs fairly and save on commuting.' },
            { icon: '🛡️', text: 'Safer than sharing rides with strangers.' },
          ].map((item) => (
            <li
              key={item.text}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 14px',
                borderRadius: radius.lg,
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.16)',
                color: 'rgba(255, 255, 255, 0.92)',
                fontSize: '0.92rem',
              }}
            >
              <span aria-hidden="true" style={{ fontSize: '1.25rem' }}>{item.icon}</span>
              {item.text}
            </li>
          ))}
        </ul>
      )}
    </>
  );

  const formCard = (
    <div
      style={{
        backgroundColor: '#ffffff',
        borderRadius: '28px',
        padding: isDesktop ? '36px 32px' : '28px 22px 26px',
        boxShadow: '0 24px 60px rgba(2, 6, 23, 0.25)',
        color: colors.text,
        width: '100%',
        maxWidth: isDesktop ? '420px' : 'none',
      }}
    >
      {!isDesktop && showForm && (
        <button
          type="button"
          onClick={() => switchMode('home')}
          style={{
            background: 'none',
            border: 'none',
            color: colors.accent,
            fontWeight: 700,
            fontSize: '0.88rem',
            cursor: 'pointer',
            padding: 0,
            marginBottom: '12px',
          }}
        >
          ← Back
        </button>
      )}

      <div style={{ textAlign: 'center', marginBottom: '22px' }}>
        <div style={{ ...typography.eyebrow, color: colors.accent, marginBottom: '6px' }}>
          {mode === 'register' ? 'New here' : 'Welcome back'}
        </div>
        <h2 style={{ ...typography.display, margin: 0, fontSize: '1.5rem' }}>
          {mode === 'register' ? 'Create your account' : 'Sign in to continue'}
        </h2>
        <p style={{ ...typography.body, margin: '8px 0 0' }}>
          {mode === 'register'
            ? 'Use your @aut.ac.nz or @autuni.ac.nz email.'
            : 'Enter your credentials to open your dashboard.'}
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {mode === 'register' && (
          <div>
            <label style={inputs.label}>Full name</label>
            <input
              type="text"
              placeholder="e.g. Alex Taylor"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              onFocus={() => setNameFocus(true)}
              onBlur={() => setNameFocus(false)}
              required
              autoComplete="name"
              style={{ ...inputs.field, ...(nameFocus ? inputs.fieldFocus : null) }}
            />
          </div>
        )}
        <div>
          <label style={inputs.label}>University email</label>
          <input
            type="email"
            placeholder="you@aut.ac.nz"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={() => setEmailFocus(true)}
            onBlur={() => setEmailFocus(false)}
            required
            style={{ ...inputs.field, ...(emailFocus ? inputs.fieldFocus : null) }}
          />
        </div>

        <div>
          <label style={inputs.label}>Password</label>
          <input
            type="password"
            placeholder="Minimum 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onFocus={() => setPassFocus(true)}
            onBlur={() => setPassFocus(false)}
            required
            style={{ ...inputs.field, ...(passFocus ? inputs.fieldFocus : null) }}
          />
        </div>

        <button type="submit" style={{ ...buttons.accent, marginTop: '6px' }}>
          {mode === 'register' ? 'Create account' : 'Log in'}
        </button>
      </form>

      <div style={{ textAlign: 'center', marginTop: '16px' }}>
        <button
          type="button"
          onClick={() => switchMode(mode === 'register' ? 'login' : 'register')}
          style={{
            background: 'none',
            border: 'none',
            color: colors.accent,
            fontWeight: 700,
            fontSize: '0.88rem',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {mode === 'register' ? 'Already have an account? Log in' : "Don't have an account? Register"}
        </button>
      </div>

      {message && (
        <p
          style={{
            marginTop: '16px',
            padding: '10px 14px',
            borderRadius: radius.md,
            fontSize: '0.86rem',
            fontWeight: 700,
            textAlign: 'center',
            color: isError ? colors.danger : colors.success,
            backgroundColor: isError ? colors.dangerSoft : colors.successSoft,
            boxShadow: shadows.soft,
          }}
        >
          {message}
        </p>
      )}
    </div>
  );

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background:
          'radial-gradient(circle at 20% 0%, rgba(255,255,255,0.14), transparent 55%), linear-gradient(160deg, #0f766e 0%, #1d4ed8 55%, #2563eb 100%)',
        color: '#ffffff',
        position: 'relative',
        overflow: 'hidden',
        minHeight: '100vh',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          width: '520px',
          height: '520px',
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.08)',
          filter: 'blur(80px)',
          top: '-180px',
          right: '-120px',
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          width: '420px',
          height: '420px',
          borderRadius: '50%',
          background: 'rgba(96, 165, 250, 0.22)',
          filter: 'blur(90px)',
          bottom: '-180px',
          left: '-140px',
        }}
      />

      <header
        style={{
          position: 'relative',
          padding: isDesktop ? '22px 40px 0' : '22px 22px 0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 1,
          maxWidth: '1200px',
          width: '100%',
          margin: '0 auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.18)',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: '0.95rem',
            }}
          >
            CC
          </div>
          <div style={{ lineHeight: 1.1 }}>
            <div
              style={{
                fontSize: '0.64rem',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                fontWeight: 800,
                opacity: 0.85,
              }}
            >
              CampusCab
            </div>
            <div style={{ fontSize: '0.98rem', fontWeight: 800 }}>Student carpool</div>
          </div>
        </div>

        {isDesktop && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={() => switchMode('login')}
              style={{
                border: '1.5px solid rgba(255, 255, 255, 0.35)',
                borderRadius: radius.pill,
                padding: '10px 20px',
                fontSize: '0.88rem',
                fontWeight: 700,
                cursor: 'pointer',
                backgroundColor: mode === 'login' ? '#ffffff' : 'transparent',
                color: mode === 'login' ? colors.accent : '#ffffff',
              }}
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              style={{
                border: '1.5px solid rgba(255, 255, 255, 0.35)',
                borderRadius: radius.pill,
                padding: '10px 20px',
                fontSize: '0.88rem',
                fontWeight: 700,
                cursor: 'pointer',
                backgroundColor: mode === 'register' ? '#ffffff' : 'transparent',
                color: mode === 'register' ? colors.accent : '#ffffff',
              }}
            >
              Register
            </button>
          </div>
        )}
      </header>

      {!firebaseReady && (
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            margin: '14px auto 0',
            padding: '10px 14px',
            borderRadius: radius.md,
            backgroundColor: 'rgba(254, 243, 199, 0.95)',
            color: '#92400e',
            fontWeight: 700,
            fontSize: '0.8rem',
            textAlign: 'center',
            maxWidth: '520px',
            width: 'calc(100% - 40px)',
          }}
        >
          Demo mode — Firebase env vars are missing.
        </div>
      )}

      {isDesktop ? (
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            flex: 1,
            display: 'grid',
            gridTemplateColumns: '1.1fr 1fr',
            alignItems: 'center',
            gap: '48px',
            padding: '48px 40px',
            maxWidth: '1200px',
            width: '100%',
            margin: '0 auto',
          }}
        >
          <div>{heroContent}</div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>{formCard}</div>
        </div>
      ) : (
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: showForm ? 'flex-start' : 'center',
            padding: showForm ? '24px 20px 32px' : '24px 24px 40px',
            textAlign: 'center',
          }}
        >
          {!showForm && heroContent}
          {showForm && formCard}
        </div>
      )}
    </div>
  );
}

export default Login;
