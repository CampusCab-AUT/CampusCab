import { useState } from 'react';
import ReportedUsersDashboard from './ReportedUsersDashboard';
import UserModerationPage from './UserModerationPage';
import TripReportsDashboard from './trip-reports/TripReportsDashboard';
import AllUsersPage from './admin/AllUsersPage';
import UserProfilePage from './admin/UserProfilePage';
import AuditLogPage from './admin/AuditLogPage';
import AdminHomePage from './admin/AdminHomePage';

const NAV_ITEMS = [
  {
    id: 'home',
    label: 'Overview',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
      </svg>
    ),
  },
  {
    id: 'all-users',
    label: 'All Users',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        <line x1="19" y1="11" x2="23" y2="11"/>
      </svg>
    ),
  },
  {
    id: 'reported-users',
    label: 'Reported Users',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    id: 'trip-reports',
    label: 'Trip Reports',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    id: 'audit-log',
    label: 'Audit Log',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4"/>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
      </svg>
    ),
  },
];

export default function AdminDashboard({ onLogout }) {
  const [activePage, setActivePage] = useState('home');
  // selectedUser carries { userId, userName, source: 'reported' | 'all-users' }
  const [selectedUser, setSelectedUser] = useState(null);

  const handleSelectUser = (userId, userName, source = 'reported') => {
    setSelectedUser({ userId, userName, source });
  };

  const handleBackToDashboard = () => {
    setSelectedUser(null);
  };

  const handleNavigate = (pageId) => {
    setSelectedUser(null);
    setActivePage(pageId);
  };

  const renderContent = () => {
    // User profile opened from All Users page
    if (selectedUser?.source === 'all-users') {
      return (
        <UserProfilePage
          userId={selectedUser.userId}
          onBack={handleBackToDashboard}
        />
      );
    }

    // Legacy moderation view opened from Reported Users
    if (selectedUser?.source === 'reported') {
      return (
        <UserModerationPage
          userId={selectedUser.userId}
          userName={selectedUser.userName}
          onBack={handleBackToDashboard}
        />
      );
    }

    if (activePage === 'all-users') {
      return (
        <AllUsersPage
          onSelectUser={(uid, name) => handleSelectUser(uid, name, 'all-users')}
        />
      );
    }

    if (activePage === 'reported-users') {
      return (
        <ReportedUsersDashboard
          onSelectUser={(uid, name) => handleSelectUser(uid, name, 'reported')}
        />
      );
    }

    if (activePage === 'trip-reports') {
      return <TripReportsDashboard />;
    }

    if (activePage === 'audit-log') {
      return <AuditLogPage />;
    }

    if (activePage === 'home') {
      return <AdminHomePage onNavigate={handleNavigate} />;
    }

    return null;
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      {/* Sidebar */}
      <aside style={{
        width: 240,
        background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        boxShadow: '4px 0 20px rgba(15,23,42,0.15)',
      }}>
        <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #6c63ff, #5046e5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 900, fontSize: 13, color: 'white',
              boxShadow: '0 4px 12px rgba(108,99,255,0.4)',
            }}>CC</div>
            <div>
              <h1 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#e8e8ff' }}>CampusCab</h1>
              <p style={{ margin: 0, fontSize: 11, color: '#8888aa', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700 }}>Admin Portal</p>
            </div>
          </div>
        </div>

        <div style={{ padding: '10px 12px 4px', marginTop: 4 }}>
          <span style={{ fontSize: 10, color: '#555577', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '0 8px' }}>
            Navigation
          </span>
        </div>

        <nav style={{ flex: 1, padding: '6px 12px' }}>
          {NAV_ITEMS.map((item) => {
            const isActive = activePage === item.id && !selectedUser;
            return (
              <button
                key={item.id}
                onClick={() => { setActivePage(item.id); setSelectedUser(null); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  marginBottom: '2px',
                  background: isActive ? 'rgba(108,99,255,0.18)' : 'transparent',
                  color: isActive ? '#a5a0ff' : '#8888aa',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13.5,
                  fontWeight: isActive ? 700 : 500,
                  transition: 'background 0.12s, color 0.12s',
                  position: 'relative',
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                    e.currentTarget.style.color = '#ccccee';
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#8888aa';
                  }
                }}
              >
                {isActive && (
                  <span style={{
                    position: 'absolute', left: 0, top: '25%', bottom: '25%',
                    width: 3, borderRadius: '0 2px 2px 0',
                    background: 'linear-gradient(180deg, #6c63ff, #a5a0ff)',
                  }} />
                )}
                <span style={{ opacity: isActive ? 1 : 0.65, flexShrink: 0, marginLeft: 4 }}>
                  {item.icon}
                </span>
                {item.label}
              </button>
            );
          })}
        </nav>

        <div style={{ padding: '16px 12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={onLogout}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '10px',
              background: 'rgba(220,38,38,0.12)',
              color: '#f87171',
              border: '1px solid rgba(220,38,38,0.2)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 8,
              transition: 'background 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.22)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.12)'; }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Log Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{
        flex: 1, background: '#f0f2f5', overflowY: 'auto',
        minHeight: '100vh',
      }}>
        {renderContent()}
      </main>
    </div>
  );
}
