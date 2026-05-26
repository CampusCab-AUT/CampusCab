import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  getDoc,
  getDocs,
  doc,
  query,
  where,
} from 'firebase/firestore';
import { auth, db, firebaseReady } from '../firebase';
import { FIRESTORE_COLLECTIONS } from '../firestoreModel';
import useIsDesktop from '../hooks/useIsDesktop';
import {
  buttons,
  colors,
  pills,
  radius,
  shadows,
  surfaces,
  typography,
} from '../theme';
import { formatNZD } from '../utils/currency';
import {
  AVG_TRIP_KM,
  computeDriverAnalytics,
} from '../utils/driverAnalytics';
import AnimatedCounter from '../components/AnimatedCounter';

const DEMO_TRIPS = [
  {
    id: 'demo-c1',
    status: 'completed',
    origin: 'North Shore',
    destination: 'City Campus',
    seats: 3,
    availableSeats: 0,
    costPerSeat: 5,
    departureTime: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
  },
  {
    id: 'demo-c2',
    status: 'completed',
    origin: 'North Shore',
    destination: 'City Campus',
    seats: 3,
    availableSeats: 1,
    costPerSeat: 5,
    departureTime: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
  },
  {
    id: 'demo-c3',
    status: 'completed',
    origin: 'Glenfield',
    destination: 'South Campus',
    seats: 4,
    availableSeats: 1,
    costPerSeat: 7,
    departureTime: new Date(Date.now() - 1000 * 60 * 60 * 24 * 9).toISOString(),
  },
  {
    id: 'demo-c4',
    status: 'completed',
    origin: 'North Shore',
    destination: 'City Campus',
    seats: 3,
    availableSeats: 0,
    costPerSeat: 5,
    departureTime: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString(),
  },
  {
    id: 'demo-c5',
    status: 'completed',
    origin: 'Albany',
    destination: 'City Campus',
    seats: 3,
    availableSeats: 0,
    costPerSeat: 6,
    departureTime: new Date(Date.now() - 1000 * 60 * 60 * 24 * 21).toISOString(),
  },
];

const DEMO_RATINGS = [
  { score: 5 }, { score: 5 }, { score: 5 }, { score: 5 },
  { score: 4 }, { score: 4 }, { score: 5 }, { score: 5 },
  { score: 3 }, { score: 5 },
];

const DEMO_PROFILE = { displayName: 'Alex', averageRating: 4.7, totalRatings: 10 };

function HeroBand({ greetingName, analytics }) {
  return (
    <section
      style={{
        position: 'relative',
        ...surfaces.card,
        padding: '28px 26px',
        background: colors.accentGradient,
        color: '#fff',
        overflow: 'hidden',
        gridColumn: '1 / -1',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '-90px',
          right: '-60px',
          width: '280px',
          height: '280px',
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0) 70%)',
          pointerEvents: 'none',
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: '-100px',
          left: '-70px',
          width: '260px',
          height: '260px',
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 70%)',
          pointerEvents: 'none',
        }}
      />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.7rem',
            fontWeight: 800,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            padding: '5px 10px',
            borderRadius: radius.pill,
            background: 'rgba(255,255,255,0.18)',
            color: '#fff',
            marginBottom: '12px',
          }}
        >
          <span aria-hidden="true">✨</span> Your impact
        </div>
        <h2
          style={{
            margin: 0,
            fontSize: '1.6rem',
            fontWeight: 900,
            color: '#fff',
            letterSpacing: '-0.015em',
          }}
        >
          Hi{greetingName ? `, ${greetingName}` : ''} — here's how you're doing
        </h2>
        <p
          style={{
            margin: '6px 0 22px',
            opacity: 0.92,
            fontSize: '0.92rem',
            fontWeight: 600,
            maxWidth: '520px',
          }}
        >
          Every ride you post helps a fellow student get to campus and keeps
          another car off the road.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: '14px',
            maxWidth: '560px',
          }}
        >
          <HeroStat
            label="Trips completed"
            value={analytics.tripsCompleted}
            icon="🚗"
          />
          <HeroStat
            label="Passengers carried"
            value={analytics.passengersCarried}
            icon="👥"
          />
        </div>
      </div>
    </section>
  );
}

function HeroStat({ label, value, icon }) {
  return (
    <div
      style={{
        padding: '16px 18px',
        borderRadius: radius.lg,
        background: 'rgba(255,255,255,0.16)',
        border: '1px solid rgba(255,255,255,0.22)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
    >
      <div
        style={{
          fontSize: '0.7rem',
          fontWeight: 800,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          opacity: 0.85,
          marginBottom: '6px',
        }}
      >
        <span aria-hidden="true" style={{ marginRight: '6px' }}>
          {icon}
        </span>
        {label}
      </div>
      <div
        style={{
          fontSize: '2rem',
          fontWeight: 900,
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
        }}
      >
        <AnimatedCounter value={value} />
      </div>
    </div>
  );
}

function StatCard({ eyebrow, value, sub, accent = colors.accent, icon, children }) {
  return (
    <div
      style={{
        ...surfaces.card,
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '3px',
          background: accent,
        }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <span style={{ ...typography.eyebrow }}>{eyebrow}</span>
        {icon ? (
          <span
            aria-hidden="true"
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              background: `${accent}1f`,
              color: accent,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '15px',
            }}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <div
        style={{
          fontSize: '1.6rem',
          fontWeight: 900,
          color: colors.text,
          letterSpacing: '-0.015em',
          lineHeight: 1.15,
        }}
      >
        {value}
      </div>
      {sub ? (
        <div style={{ ...typography.small, fontWeight: 600 }}>{sub}</div>
      ) : null}
      {children}
    </div>
  );
}

function StarRow({ rating }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <span aria-hidden="true" style={{ letterSpacing: '2px' }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          style={{
            color:
              i <= full
                ? '#f59e0b'
                : i === full + 1 && half
                  ? '#fbbf24'
                  : 'rgba(15,23,42,0.18)',
          }}
        >
          ★
        </span>
      ))}
    </span>
  );
}

function RatingDistributionCard({ distribution, total }) {
  const hasRatings = total > 0;
  return (
    <div
      style={{
        ...surfaces.card,
        padding: '20px 22px',
        gridColumn: '1 / -1',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: '14px',
          gap: '8px',
          flexWrap: 'wrap',
        }}
      >
        <h3 style={{ ...typography.h2, margin: 0 }}>Rating breakdown</h3>
        <span style={{ ...pills.base, ...pills.muted }}>
          {total} rating{total === 1 ? '' : 's'}
        </span>
      </div>

      {!hasRatings ? (
        <div
          style={{
            padding: '22px',
            borderRadius: radius.lg,
            border: `1.5px dashed ${colors.borderStrong}`,
            backgroundColor: colors.surfaceMuted,
            textAlign: 'center',
            color: colors.textSubtle,
            fontWeight: 600,
            fontSize: '0.9rem',
          }}
        >
          No ratings yet — passengers will rate you after completed trips.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {distribution.map((row) => (
            <div
              key={row.score}
              style={{
                display: 'grid',
                gridTemplateColumns: '52px 1fr 64px',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div
                style={{
                  fontWeight: 800,
                  color: colors.text,
                  fontSize: '0.88rem',
                }}
              >
                {row.score} <span style={{ color: '#f59e0b' }}>★</span>
              </div>
              <div
                style={{
                  height: '10px',
                  borderRadius: radius.pill,
                  background: 'rgba(15,23,42,0.06)',
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${row.percent}%`,
                    background: colors.accentGradient,
                    borderRadius: radius.pill,
                    transition: 'width 700ms cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                />
              </div>
              <div
                style={{
                  textAlign: 'right',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: colors.textMuted,
                }}
              >
                {row.count} · {row.percent}%
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RecentTripsCard({ trips }) {
  return (
    <div style={{ ...surfaces.card, padding: '20px 22px', gridColumn: '1 / -1' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: '14px',
        }}
      >
        <h3 style={{ ...typography.h2, margin: 0 }}>Recent completed trips</h3>
        <span style={{ ...typography.small }}>Last {trips.length}</span>
      </div>

      {trips.length === 0 ? (
        <div
          style={{
            padding: '22px',
            borderRadius: radius.lg,
            border: `1.5px dashed ${colors.borderStrong}`,
            backgroundColor: colors.surfaceMuted,
            textAlign: 'center',
            color: colors.textSubtle,
            fontWeight: 600,
            fontSize: '0.9rem',
          }}
        >
          No completed trips yet.
        </div>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {trips.map((t) => (
            <li
              key={t.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '12px 14px',
                borderRadius: radius.lg,
                backgroundColor: colors.surfaceSolid,
                border: `1px solid ${colors.border}`,
              }}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: colors.accentSoft,
                  color: colors.accent,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '15px',
                  flexShrink: 0,
                }}
                aria-hidden="true"
              >
                ✓
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 800,
                    color: colors.text,
                    fontSize: '0.95rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.origin}
                  <span style={{ color: colors.textSubtle, margin: '0 6px' }}>
                    →
                  </span>
                  {t.destination}
                </div>
                <div style={{ ...typography.small, marginTop: '2px' }}>
                  {t.when
                    ? t.when.toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : '—'}{' '}
                  · {t.seatsSold} passenger{t.seatsSold === 1 ? '' : 's'}
                </div>
              </div>
              {t.earnedNZD > 0 ? (
                <span
                  style={{
                    ...pills.base,
                    ...pills.success,
                    flexShrink: 0,
                  }}
                >
                  {formatNZD(t.earnedNZD)}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div
      style={{
        ...surfaces.card,
        padding: '60px 22px',
        textAlign: 'center',
      }}
    >
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
      <h3 style={{ ...typography.h3, margin: '0 0 4px' }}>
        Crunching your numbers…
      </h3>
      <p style={{ ...typography.small, margin: 0 }}>
        Pulling completed trips and ratings from Firestore.
      </p>
    </div>
  );
}

function EmptyState({ onBackToDashboard }) {
  return (
    <div
      style={{
        ...surfaces.card,
        padding: '36px 22px',
        textAlign: 'center',
        border: `1.5px dashed ${colors.borderStrong}`,
        backgroundColor: colors.surfaceMuted,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: '64px',
          height: '64px',
          margin: '0 auto 14px',
          borderRadius: '50%',
          background:
            'linear-gradient(135deg, rgba(15, 118, 110, 0.14), rgba(29, 78, 216, 0.14))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '28px',
        }}
      >
        📈
      </div>
      <h3 style={{ ...typography.h2, margin: '0 0 6px' }}>
        Your analytics will appear here
      </h3>
      <p style={{ ...typography.body, margin: '0 auto 18px', maxWidth: '420px' }}>
        Complete your first trip to start tracking your impact — passengers
        carried, money earned, ratings, and CO₂ saved.
      </p>
      {onBackToDashboard ? (
        <button
          type="button"
          onClick={onBackToDashboard}
          style={{ ...buttons.ghost }}
        >
          Back to driver dashboard
        </button>
      ) : null}
    </div>
  );
}

export default function DriverAnalytics({ onBackToDashboard }) {
  const isDesktop = useIsDesktop();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [trips, setTrips] = useState([]);
  const [ratings, setRatings] = useState([]);
  const [userProfile, setUserProfile] = useState({});
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!firebaseReady || !auth || !db || !auth.currentUser) {
        setTrips(DEMO_TRIPS);
        setRatings(DEMO_RATINGS);
        setUserProfile(DEMO_PROFILE);
        setDemoMode(true);
        setLoading(false);
        return;
      }
      try {
        const uid = auth.currentUser.uid;
        const tripsQ = query(
          collection(db, FIRESTORE_COLLECTIONS.trips),
          where('driverId', '==', uid),
        );
        const ratingsQ = query(
          collection(db, FIRESTORE_COLLECTIONS.ratings),
          where('targetUserId', '==', uid),
        );
        const [tripsSnap, ratingsSnap, userSnap] = await Promise.all([
          getDocs(tripsQ),
          getDocs(ratingsQ),
          getDoc(doc(db, FIRESTORE_COLLECTIONS.users, uid)),
        ]);
        if (cancelled) return;
        setTrips(tripsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setRatings(ratingsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setUserProfile(userSnap.exists() ? userSnap.data() : {});
      } catch (err) {
        if (!cancelled) setError(err.message || 'Unable to load analytics.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const analytics = useMemo(
    () => computeDriverAnalytics({ trips, ratings, userProfile }),
    [trips, ratings, userProfile],
  );

  const greetingName = useMemo(() => {
    const name =
      userProfile.displayName ||
      (auth?.currentUser?.displayName ?? '') ||
      (auth?.currentUser?.email ? auth.currentUser.email.split('@')[0] : '');
    return name ? String(name).split(' ')[0] : '';
  }, [userProfile]);

  if (loading) return <LoadingState />;

  if (error) {
    return (
      <div
        style={{
          ...surfaces.card,
          padding: '24px',
          color: colors.danger,
          background: colors.dangerSoft,
          border: `1px solid ${colors.danger}33`,
        }}
      >
        <strong>Couldn't load analytics.</strong>
        <p style={{ margin: '6px 0 0', fontSize: '0.9rem' }}>{error}</p>
      </div>
    );
  }

  const noData = analytics.tripsCompleted === 0;

  const gridStyle = {
    display: 'grid',
    gap: isDesktop ? '18px' : '14px',
    gridTemplateColumns: isDesktop ? 'repeat(3, minmax(0, 1fr))' : '1fr',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {demoMode && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: radius.md,
            backgroundColor: colors.warningSoft,
            color: colors.warning,
            fontWeight: 700,
            fontSize: '0.82rem',
            border: '1px solid rgba(217,119,6,0.22)',
          }}
        >
          Demo mode — sign in to see your real analytics.
        </div>
      )}

      <div style={gridStyle}>
        <HeroBand greetingName={greetingName} analytics={analytics} />

        {noData ? (
          <div style={{ gridColumn: '1 / -1' }}>
            <EmptyState onBackToDashboard={onBackToDashboard} />
          </div>
        ) : (
          <>
            <StatCard
              eyebrow="This month"
              value={<AnimatedCounter value={analytics.tripsThisMonth} />}
              sub={`of ${analytics.tripsCompleted} all-time`}
              icon="🗓"
              accent={colors.accent}
            />
            <StatCard
              eyebrow="Average rating"
              value={
                analytics.totalRatings > 0
                  ? analytics.averageRating.toFixed(1)
                  : '—'
              }
              sub={
                analytics.totalRatings > 0
                  ? `${analytics.totalRatings} rating${analytics.totalRatings === 1 ? '' : 's'}`
                  : 'No ratings yet'
              }
              icon="⭐"
              accent="#f59e0b"
            >
              {analytics.totalRatings > 0 ? (
                <StarRow rating={analytics.averageRating} />
              ) : null}
            </StatCard>
            <StatCard
              eyebrow="Total earned"
              value={
                <AnimatedCounter
                  value={analytics.totalEarnedNZD}
                  prefix="$"
                  decimals={2}
                />
              }
              sub="From cost-per-seat contributions"
              icon="💰"
              accent={colors.success}
            />
            <StatCard
              eyebrow="CO₂ saved"
              value={
                <AnimatedCounter
                  value={analytics.co2SavedKg}
                  decimals={1}
                  suffix=" kg"
                />
              }
              sub={`Est. from ${analytics.passengersCarried} passenger-trip${analytics.passengersCarried === 1 ? '' : 's'} × ${AVG_TRIP_KM} km`}
              icon="🌱"
              accent={colors.success}
            />
            <StatCard
              eyebrow="Fuel saved"
              value={
                <AnimatedCounter
                  value={analytics.fuelSavedLitres}
                  decimals={1}
                  suffix=" L"
                />
              }
              sub="Petrol that wasn't burned"
              icon="⛽"
              accent={colors.info}
            />
            <StatCard
              eyebrow="Busiest route"
              value={
                <span style={{ fontSize: '1.05rem', lineHeight: 1.3 }}>
                  {analytics.busiestRoute?.route || '—'}
                </span>
              }
              sub={
                analytics.busiestRoute
                  ? `${analytics.busiestRoute.count} trip${analytics.busiestRoute.count === 1 ? '' : 's'}`
                  : 'Not enough data'
              }
              icon="📍"
              accent={colors.passenger}
            />

            <RatingDistributionCard
              distribution={analytics.ratingDistribution}
              total={analytics.totalRatings}
            />

            <RecentTripsCard trips={analytics.recentTrips} />
          </>
        )}
      </div>
    </div>
  );
}
