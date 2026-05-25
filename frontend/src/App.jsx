import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import useSuspensionGuard from './hooks/useSuspensionGuard';
import Login from './Login';
import VehicleProfile from './VehicleProfile';
import CreateTrip from './CreateTrip';
import AdminDashboard from './pages/AdminDashboard';

import { FIRESTORE_COLLECTIONS } from './firestoreModel';
import useIsDesktop from './hooks/useIsDesktop';
import DriverDashboard from './pages/DriverDashboard';
import DriverTripView from './components/DriverTripView';
import PassengerDashboard from './pages/PassengerDashboard';
import UserProfilePanel from './components/UserProfilePanel';
import Stepper from './components/Stepper';
import { buttons, colors, pills, radius, surfaces, typography } from './theme';

const TABS = [
  { id: 'driver', label: 'Driver', icon: '🚗' },
  { id: 'passenger', label: 'Passenger', icon: '🎒' },
  { id: 'admin', label: 'Admin', icon: '🛡️' },
  { id: 'profile', label: 'Profile', icon: '👤' },
];

function BrandMark({ size = 40 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '12px',
        background: 'rgba(255, 255, 255, 0.18)',
        border: '1px solid rgba(255, 255, 255, 0.28)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#ffffff',
        fontWeight: 900,
        fontSize: size * 0.36,
        letterSpacing: '0.03em',
        boxShadow: '0 6px 16px rgba(15, 23, 42, 0.2)',
      }}
    >
      CC
    </div>
  );
}

function HeaderTabs({ role, onChangeRole }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        padding: '6px',
        borderRadius: radius.pill,
        backgroundColor: 'rgba(255, 255, 255, 0.14)',
        border: '1px solid rgba(255, 255, 255, 0.22)',
        gap: '4px',
      }}
    >
      {TABS.map((tab) => {
        const isActive = tab.id === role;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChangeRole(tab.id)}
            style={{
              border: 'none',
              cursor: 'pointer',
              padding: '9px 18px',
              borderRadius: radius.pill,
              backgroundColor: isActive ? '#ffffff' : 'transparent',
              color: isActive ? colors.accent : 'rgba(255, 255, 255, 0.92)',
              fontWeight: 800,
              fontSize: '0.88rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'background-color 0.2s ease, color 0.2s ease',
              boxShadow: isActive ? '0 6px 16px rgba(15, 23, 42, 0.18)' : 'none',
            }}
          >
            <span aria-hidden="true">{tab.icon}</span>
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function BottomNav({ role, onChangeRole }) {
  return (
    <nav
      style={{
        position: 'sticky',
        bottom: 0,
        margin: '0 12px 12px',
        padding: '8px',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '4px',
        backgroundColor: 'rgba(255, 255, 255, 0.92)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        borderRadius: radius.pill,
        border: `1px solid ${colors.border}`,
        boxShadow: '0 20px 40px rgba(15, 23, 42, 0.12)',
        zIndex: 15,
      }}
    >
      {TABS.map((tab) => {
        const isActive = tab.id === role;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChangeRole(tab.id)}
            style={{
              border: 'none',
              cursor: 'pointer',
              padding: '10px 8px',
              borderRadius: radius.pill,
              background: isActive ? colors.accentGradient : 'transparent',
              color: isActive ? '#ffffff' : colors.textSubtle,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '2px',
              fontWeight: 800,
              fontSize: '0.72rem',
              boxShadow: isActive ? '0 10px 22px rgba(15, 118, 110, 0.32)' : 'none',
              transition: 'background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease',
            }}
          >
            <span aria-hidden="true" style={{ fontSize: '1.1rem', lineHeight: 1 }}>
              {tab.icon}
            </span>
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

function ResponsiveShell({ role, onChangeRole, onLogout, children }) {
  const email = auth.currentUser?.email;
  const isDesktop = useIsDesktop();
  const active = TABS.find((tab) => tab.id === role) || TABS[0];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          padding: isDesktop ? '18px 32px' : '20px 20px 22px',
          background: colors.accentGradient,
          color: '#ffffff',
          borderBottomLeftRadius: isDesktop ? 0 : '28px',
          borderBottomRightRadius: isDesktop ? 0 : '28px',
          boxShadow: '0 18px 40px -20px rgba(15, 118, 110, 0.5)',
        }}
      >
        <div
          style={{
            maxWidth: '1120px',
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <BrandMark />
            <div style={{ lineHeight: 1.15 }}>
              <div
                style={{
                  fontSize: '0.66rem',
                  fontWeight: 800,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  opacity: 0.82,
                }}
              >
                CampusCab
              </div>
              <div style={{ fontSize: '1.02rem', fontWeight: 800 }}>
                {isDesktop ? 'Student carpool' : `${active.label} mode`}
              </div>
            </div>
          </div>

          {isDesktop && <HeaderTabs role={role} onChangeRole={onChangeRole} />}

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {email && (
              <div
                style={{
                  display: isDesktop ? 'inline-flex' : 'none',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 12px 6px 6px',
                  borderRadius: radius.pill,
                  backgroundColor: 'rgba(255, 255, 255, 0.16)',
                  border: '1px solid rgba(255, 255, 255, 0.22)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: '#ffffff',
                    color: colors.accent,
                    fontWeight: 800,
                    fontSize: '0.72rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {email.slice(0, 1).toUpperCase()}
                </span>
                {email}
              </div>
            )}
            <button type="button" onClick={onLogout} aria-label="Log out" style={buttons.icon}>
              ⎋
            </button>
          </div>
        </div>

        {!isDesktop && email && (
          <div
            style={{
              marginTop: '14px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px 6px 6px',
              borderRadius: radius.pill,
              backgroundColor: 'rgba(255, 255, 255, 0.16)',
              border: '1px solid rgba(255, 255, 255, 0.22)',
              fontSize: '0.78rem',
              fontWeight: 600,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                backgroundColor: '#ffffff',
                color: colors.accent,
                fontWeight: 800,
                fontSize: '0.72rem',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {email.slice(0, 1).toUpperCase()}
            </span>
            {email}
          </div>
        )}
      </header>

      <main
        style={{
          flex: 1,
          width: '100%',
          maxWidth: '1120px',
          margin: '0 auto',
          padding: isDesktop ? '28px 32px 48px' : '18px 16px 110px',
          display: 'flex',
          flexDirection: 'column',
          gap: isDesktop ? '20px' : '14px',
        }}
      >
        {children}
      </main>

      {!isDesktop && <BottomNav role={role} onChangeRole={onChangeRole} />}
    </div>
  );
}

function Card({ children, padding = '22px', span = 1 }) {
  return (
    <section
      style={{
        ...surfaces.card,
        padding,
        overflow: 'hidden',
        gridColumn: span === 2 ? 'span 2' : 'auto',
      }}
    >
      {children}
    </section>
  );
}

function DriverOnboarding({ vehicle, onSetVehicle, onFinish }) {
  const [step, setStep] = useState(0);
  const email = auth.currentUser?.email;

  const steps = [
    { key: 'welcome', label: 'Account' },
    { key: 'vehicle', label: 'Vehicle' },
    { key: 'ready', label: 'Ready' },
  ];

  return (
    <>
      <Card padding="22px 20px 14px">
        <div style={{ textAlign: 'center' }}>
          <span style={{ ...pills.base, ...pills.accent }}>
            <span aria-hidden="true">🧑‍✈️</span> Driver setup
          </span>
          <h2 style={{ ...typography.h2, margin: '12px 0 4px' }}>Set up your driver profile</h2>
          <p style={{ ...typography.body, margin: 0 }}>
            Three quick steps before you publish your first ride.
          </p>
        </div>
        <div style={{ marginTop: '18px' }}>
          <Stepper steps={steps} activeIndex={step} />
        </div>
      </Card>

      {step === 0 && (
        <Card padding="28px 22px">
          <div style={{ textAlign: 'center', maxWidth: '520px', margin: '0 auto' }}>
            <div
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, rgba(15,118,110,0.16), rgba(29,78,216,0.16))',
                color: colors.accent,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2rem',
                marginBottom: '14px',
              }}
              aria-hidden="true"
            >
              👋
            </div>
            <h3 style={{ ...typography.h2, margin: '0 0 8px' }}>
              Welcome{email ? `, ${email.split('@')[0]}` : ''}
            </h3>
            <p style={{ ...typography.body, margin: '0 0 16px' }}>
              You're signed in with your AUT email. Drivers need a vehicle profile before publishing trips.
            </p>

            <div
              style={{
                margin: '0 auto 20px',
                padding: '8px 14px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                borderRadius: radius.pill,
                backgroundColor: colors.successSoft,
                color: colors.success,
                fontWeight: 700,
                fontSize: '0.8rem',
              }}
            >
              ✓ Account verified
            </div>

            <button
              type="button"
              onClick={() => setStep(1)}
              style={{ ...buttons.accent, width: 'auto' }}
            >
              Continue to vehicle setup →
            </button>
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card padding="0">
          <VehicleProfile
            onSaved={(data) => {
              onSetVehicle(data);
              setStep(2);
            }}
          />
          <div
            style={{
              padding: '14px 20px 18px',
              borderTop: `1px solid ${colors.border}`,
              backgroundColor: colors.surfaceMuted,
            }}
          >
            <button type="button" onClick={() => setStep(0)} style={buttons.subtle}>
              ← Back
            </button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card padding="28px 22px">
          <div style={{ textAlign: 'center', maxWidth: '520px', margin: '0 auto' }}>
            <div
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                backgroundColor: colors.successSoft,
                color: colors.success,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2rem',
                marginBottom: '14px',
              }}
              aria-hidden="true"
            >
              🎉
            </div>
            <h3 style={{ ...typography.h2, margin: '0 0 8px' }}>You're all set</h3>
            <p style={{ ...typography.body, margin: '0 0 20px' }}>
              {vehicle
                ? `Your ${vehicle.make || ''} ${vehicle.model || ''} (${vehicle.licensePlate}) is saved.`
                : 'Your vehicle is saved. Publish your first trip whenever you are ready.'}
            </p>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={onFinish} style={{ ...buttons.accent, width: 'auto' }}>
                Open driver dashboard →
              </button>
              <button type="button" onClick={() => setStep(1)} style={buttons.subtle}>
                Edit vehicle
              </button>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}

function DriverExperience() {
  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [liveTripId, setLiveTripId] = useState(null);
  const isDesktop = useIsDesktop();

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const snap = await getDoc(doc(db, FIRESTORE_COLLECTIONS.vehicles, user.uid));
        if (snap.exists()) {
          setVehicle(snap.data());
          setOnboardingComplete(true);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <Card padding="40px 22px">
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              border: `3px solid ${colors.border}`,
              borderTopColor: colors.accent,
              margin: '0 auto 14px',
              animation: 'spin 0.9s linear infinite',
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <h3 style={{ ...typography.h3, margin: '0 0 4px' }}>Loading your driver profile…</h3>
          <p style={{ ...typography.small, margin: 0 }}>Fetching your saved vehicle.</p>
        </div>
      </Card>
    );
  }

  if (!vehicle || !onboardingComplete) {
    return (
      <DriverOnboarding
        vehicle={vehicle}
        onSetVehicle={setVehicle}
        onFinish={() => setOnboardingComplete(true)}
      />
    );
  }

  if (liveTripId) {
    return <DriverTripView tripId={liveTripId} onBackToDashboard={() => setLiveTripId(null)} />;
  }

  return (
    <div
      style={{
        display: 'grid',
        gap: isDesktop ? '20px' : '14px',
        gridTemplateColumns: isDesktop ? 'repeat(2, minmax(0, 1fr))' : '1fr',
      }}
    >
      <section 
        style={{ 
          gridColumn: isDesktop ? '1 / -1' : 'auto', 
          ...surfaces.card, 
          padding: '24px', 
          background: colors.accentGradient, 
          color: 'white', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          flexWrap: 'wrap', 
          gap: '16px' 
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: 'white', letterSpacing: '-0.01em' }}>Demo Live Trip View</h3>
          <p style={{ margin: '4px 0 0', opacity: 0.88, fontSize: '0.86rem', fontWeight: 600 }}>Test the mobile-first trip state manager with accessible start/end controls.</p>
        </div>
        <button 
          onClick={() => setLiveTripId('demo')} 
          style={{ 
            border: 'none', 
            borderRadius: radius.pill, 
            padding: '12px 24px', 
            background: 'white', 
            color: colors.accent, 
            fontWeight: 800, 
            cursor: 'pointer',
            boxShadow: '0 8px 20px rgba(15, 118, 110, 0.25)',
            fontSize: '0.9rem',
            transition: 'transform 0.15s ease'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          Open Live View
        </button>
      </section>

      <Card padding="0">
        <VehicleProfile initialVehicle={vehicle} onSaved={setVehicle} compact />
      </Card>
      <Card padding="0">
        <CreateTrip />
      </Card>
      <section style={{ ...surfaces.card, padding: 0, overflow: 'hidden', gridColumn: isDesktop ? '1 / -1' : 'auto' }}>
        <DriverDashboard onOpenLiveTrip={(tripId) => setLiveTripId(tripId)} />
      </section>
    </div>
  );
}

function DashboardPlaceholder({ role }) {
  return (
    <Card padding="56px 24px">
      <div style={{ textAlign: 'center', maxWidth: '480px', margin: '0 auto' }}>
        <div
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.16), rgba(29, 78, 216, 0.12))',
            color: colors.admin,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2.2rem',
            marginBottom: '18px',
          }}
          aria-hidden="true"
        >
          🚧
        </div>
        <span style={{ ...pills.base, ...pills.muted }}>Coming soon</span>
        <h2 style={{ ...typography.h2, margin: '14px 0 8px' }}>{role} dashboard</h2>
        <p style={{ ...typography.body, margin: 0 }}>
          This view isn't built yet. Switch tabs to explore other roles.
        </p>
      </div>
    </Card>
  );
}

function SuspendedScreen({ reason, duration, onDismiss }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#fff5f5',
      padding: '24px',
    }}>
      <div style={{
        background: 'white',
        borderRadius: 16,
        padding: '40px 32px',
        maxWidth: 480,
        width: '100%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        textAlign: 'center',
        border: '1px solid #f5c2c7',
      }}>
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>🚫</div>
        <h2 style={{ color: '#dc3545', marginTop: 0, marginBottom: 8 }}>Account Suspended</h2>
        <p style={{ color: '#444', marginBottom: 8 }}>Your account has been suspended.</p>
        <p style={{ color: '#444', marginBottom: 8 }}>
          <strong>Reason:</strong> {reason}
        </p>
        <p style={{ color: '#444', marginBottom: 24 }}>
          <strong>Duration:</strong> {duration}
        </p>
        <button
          onClick={onDismiss}
          style={{
            padding: '12px 28px',
            borderRadius: 8,
            border: 'none',
            background: '#dc3545',
            color: 'white',
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Return to login
        </button>
      </div>
    </div>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (auth) {
      return false;
    }
    return localStorage.getItem('campuscab-demo-authenticated') === 'true';
  });
  const [authLoading, setAuthLoading] = useState(Boolean(auth));
  const [selectedRole, setSelectedRole] = useState('driver');
  const [currentUid, setCurrentUid] = useState(null);
  const { suspensionInfo, dismiss } = useSuspensionGuard(currentUid);

  useEffect(() => {
    if (!auth) {
      return undefined;
    }

    return onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(Boolean(user));
      setCurrentUid(user?.uid || null);
      setAuthLoading(false);
    });
  }, []);

  const handleLoginSuccess = () => {
    if (!auth) {
      localStorage.setItem('campuscab-demo-authenticated', 'true');
    }
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
    setSelectedRole('driver');
    localStorage.removeItem('campuscab-demo-authenticated');
    if (auth) {
      await signOut(auth);
      return;
    }
    setIsAuthenticated(false);
  };

  if (authLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: colors.accentGradient,
          color: '#ffffff',
          fontWeight: 800,
        }}
      >
        Loading your session...
      </div>
    );
  }

  if (suspensionInfo) {
    return (
      <SuspendedScreen
        reason={suspensionInfo.reason}
        duration={suspensionInfo.duration}
        onDismiss={dismiss}
      />
    );
  }

  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <ResponsiveShell role={selectedRole} onChangeRole={setSelectedRole} onLogout={handleLogout}>
      {selectedRole === 'driver' && <DriverExperience />}
      {selectedRole === 'passenger' && <PassengerDashboard />}
      {selectedRole === 'admin' && <AdminDashboard onLogout={handleLogout} />}
      {selectedRole === 'profile' && <UserProfilePanel />}
    </ResponsiveShell>
  );
}

export default App;
