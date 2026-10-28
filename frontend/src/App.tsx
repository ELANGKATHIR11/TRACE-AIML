import React, { useState } from 'react';
import { Header } from './components/Header';
import { DashboardView } from './pages/DashboardView';
import { ScrutinyCockpit } from './pages/ScrutinyCockpit';
import { User } from './types';
import { 
  getCurrentUserStored, 
  setCurrentUserStored, 
  clearAuthToken, 
  setAuthToken,
  login 
} from './api';

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    return getCurrentUserStored() || {
      id: 2,
      email: 'official@aicte-india.org',
      full_name: 'Dr. R. Ramanathan (Scrutiny Officer)',
      role: 'REVIEWER',
      is_active: true,
    };
  });

  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);

  const handleLogout = () => {
    clearAuthToken();
    setCurrentUser(null);
  };

  const handleQuickRoleSwitch = async (roleType: string) => {
    if (roleType === 'OFFICIAL') {
      const user: User = {
        id: 2,
        email: 'official@aicte-india.org',
        full_name: 'Dr. R. Ramanathan (Scrutiny Officer)',
        role: 'REVIEWER',
        is_active: true,
      };
      setCurrentUser(user);
      setCurrentUserStored(user);
    } else {
      const user: User = {
        id: 3,
        email: 'applicant@apexedu.ac.in',
        full_name: 'Prof. S. Joshi (Apex Institute Applicant)',
        role: 'APPLICANT',
        institution_id: 1,
        is_active: true,
      };
      setCurrentUser(user);
      setCurrentUserStored(user);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header
        currentUser={currentUser}
        onLogout={handleLogout}
        onSelectRole={handleQuickRoleSwitch}
      />

      <main style={{ flex: 1 }}>
        {selectedAppId ? (
          <ScrutinyCockpit
            applicationId={selectedAppId}
            currentUser={currentUser}
            onBack={() => setSelectedAppId(null)}
          />
        ) : (
          <DashboardView onSelectApplication={(id) => setSelectedAppId(id)} />
        )}
      </main>

      <footer style={{
        background: '#0F172A',
        color: '#94A3B8',
        padding: '16px 24px',
        fontSize: '0.75rem',
        borderTop: '1px solid #1E293B',
        textAlign: 'center',
        marginTop: 'auto',
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <strong>AICTE TRACE</strong> · Smart India Hackathon 2026 · Problem Statement ID: 26261 · Organization: AICTE (Regulation Bureau)
          </div>
          <div>
            100% Sovereign Air-Gapped AI Architecture · Local Ollama Qwen 2.5 · PyMuPDF Evidence Engine
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
