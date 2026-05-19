import { useState } from 'react';
import ReportedUsersDashboard from './ReportedUsersDashboard';
import UserModerationPage from './UserModerationPage';
import TripReportsDashboard from './trip-reports/TripReportsDashboard';

const NAV_ITEMS = [
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
];

export default function AdminDashboard({ onLogout }) {
  const [activePage, setActivePage] = useState('reported-users');
  const [selectedUser, setSelectedUser] = useState(null);

  const handleSelectUser = (userId, userName) => {
    setSelectedUser({ userId, userName });
  };

  const handleBackToDashboard = () => {
    setSelectedUser(null);
  };

  const renderContent = () => {
    if (selectedUser) {
      return (
        <UserModerationPage
          userId={selectedUser.userId}
          userName={selectedUser.userName}
          onBack={handleBackToDashboard}
        />
      );
    }

    if (activePage === 'reported-users') {
      return <ReportedUsersDashboard onSelectUser={handleSelectUser} />;
    }

    if (activePage === 'trip-reports') {
      return <TripReportsDashboard />;
    }

    return null;
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      {/* Sidebar */}
      <aside style={{
        width: 240,
        background: '#1a1a2e',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}>
        <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#e0e0ff' }}>CampusCab</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#8888aa' }}>Admin Portal</p>
        </div>

        <nav style={{ flex: 1, padding: '12px 0' }}>
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
                  padding: '11px 20px',
                  background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
                  color: isActive ? 'white' : '#aaaacc',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 400,
                  borderLeft: isActive ? '3px solid #6c63ff' : '3px solid transparent',
                  transition: 'background 0.12s, color 0.12s',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                {item.icon && (
                  <span style={{ opacity: isActive ? 1 : 0.6, flexShrink: 0 }}>{item.icon}</span>
                )}
                {item.label}
              </button>
            );
          })}
        </nav>

        <div style={{ padding: 16, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <button
            onClick={onLogout}
            style={{
              width: '100%',
              padding: '10px',
              background: 'rgba(220,53,69,0.2)',
              color: '#ff8080',
              border: '1px solid rgba(220,53,69,0.4)',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Log Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, background: '#f8f9fa', overflowY: 'auto' }}>
        {renderContent()}
      </main>
    </div>
  );
}
