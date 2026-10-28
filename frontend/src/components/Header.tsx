import React from 'react';
import { Shield, Lock, Cpu, Database, UserCheck, LogOut } from 'lucide-react';
import { User } from '../types';

interface HeaderProps {
  currentUser: User | null;
  onLogout: () => void;
  onSelectRole: (role: string) => void;
  systemStatus?: any;
}

export const Header: React.FC<HeaderProps> = ({ 
  currentUser, 
  onLogout, 
  onSelectRole,
  systemStatus 
}) => {
  return (
    <header style={{
      background: 'var(--gov-primary)',
      color: '#FFFFFF',
      borderBottom: '3px solid var(--gov-saffron)',
      padding: '0 24px',
      height: '68px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      boxShadow: 'var(--shadow-md)',
    }}>
      {/* Brand & Statutory Emblem */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{
          width: '42px',
          height: '42px',
          borderRadius: '4px',
          background: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--gov-primary)',
          fontWeight: 800,
          fontSize: '1.25rem',
          border: '1px solid #CBD5E1',
        }}>
          🇮🇳
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.15rem', fontWeight: 700, letterSpacing: '0.02em' }}>
              AICTE TRACE
            </span>
            <span style={{
              background: 'rgba(255,255,255,0.18)',
              fontSize: '0.7rem',
              padding: '2px 6px',
              borderRadius: '2px',
              fontWeight: 600,
            }}>
              SIH 26261
            </span>
          </div>
          <p style={{ fontSize: '0.75rem', opacity: 0.85 }}>
            Regulation Bureau · Forensic Document Authentication & Sovereign AI Compliance
          </p>
        </div>
      </div>

      {/* Air-gap & System Indicators */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '0.75rem',
          background: 'rgba(0,0,0,0.2)',
          padding: '6px 12px',
          borderRadius: '4px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#4ADE80' }}>
            <Lock size={13} />
            <span>100% Air-Gapped</span>
          </div>
          <span style={{ opacity: 0.4 }}>|</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#FCD34D' }}>
            <Cpu size={13} />
            <span>qwen2.5:1.5b Local</span>
          </div>
          <span style={{ opacity: 0.4 }}>|</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#93C5FD' }}>
            <Database size={13} />
            <span>ChromaDB RAG</span>
          </div>
        </div>

        {/* User Role Bar & Quick Switcher */}
        {currentUser ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                {currentUser.full_name}
              </div>
              <div style={{ fontSize: '0.7rem', opacity: 0.8, textTransform: 'uppercase' }}>
                Role: <strong>{currentUser.role}</strong>
              </div>
            </div>
            <button
              onClick={onLogout}
              title="Logout"
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.25)',
                color: '#FFFFFF',
                padding: '6px 10px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.75rem',
              }}
            >
              <LogOut size={14} />
              Logout
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.75rem', opacity: 0.9 }}>Quick Login:</span>
            <button
              onClick={() => onSelectRole('OFFICIAL')}
              style={{
                background: '#FFFFFF',
                color: 'var(--gov-primary)',
                border: 'none',
                padding: '4px 8px',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}
            >
              Scrutiny Officer
            </button>
            <button
              onClick={() => onSelectRole('APPLICANT')}
              style={{
                background: 'rgba(255,255,255,0.15)',
                color: '#FFFFFF',
                border: '1px solid rgba(255,255,255,0.3)',
                padding: '4px 8px',
                fontSize: '0.75rem',
              }}
            >
              Applicant
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
