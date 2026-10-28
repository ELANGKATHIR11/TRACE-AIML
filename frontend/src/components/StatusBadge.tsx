import React from 'react';
import { 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  HelpCircle, 
  AlertTriangle, 
  ShieldAlert 
} from 'lucide-react';
import { VerificationStatus, FlagSeverity } from '../types';

interface StatusBadgeProps {
  status: VerificationStatus | string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'sm' }) => {
  let bg = 'var(--status-unavailable-bg)';
  let color = 'var(--status-unavailable)';
  let Icon = HelpCircle;
  let label = status;

  switch (status) {
    case 'VERIFIED':
      bg = 'var(--status-verified-bg)';
      color = 'var(--status-verified)';
      Icon = CheckCircle2;
      label = 'VERIFIED';
      break;
    case 'MISMATCH':
      bg = 'var(--status-mismatch-bg)';
      color = 'var(--status-mismatch)';
      Icon = AlertCircle;
      label = 'MISMATCH DETECTED';
      break;
    case 'EXPIRED':
      bg = 'var(--status-expired-bg)';
      color = 'var(--status-expired)';
      Icon = AlertTriangle;
      label = 'EXPIRED CERTIFICATE';
      break;
    case 'PENDING':
      bg = 'var(--status-pending-bg)';
      color = 'var(--status-pending)';
      Icon = Clock;
      label = 'PENDING VERIFICATION';
      break;
    case 'MANUAL_REVIEW_REQUIRED':
      bg = 'var(--status-manual-bg)';
      color = 'var(--status-manual)';
      Icon = ShieldAlert;
      label = 'MANUAL REVIEW REQ.';
      break;
    case 'SOURCE_UNAVAILABLE':
      bg = 'var(--status-unavailable-bg)';
      color = 'var(--status-unavailable)';
      Icon = HelpCircle;
      label = 'GATEWAY OFFLINE';
      break;
    default:
      label = status.replace(/_/g, ' ');
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: size === 'sm' ? '2px 8px' : '4px 10px',
        fontSize: size === 'sm' ? '0.75rem' : '0.8125rem',
        fontWeight: 600,
        borderRadius: 'var(--radius-sm)',
        backgroundColor: bg,
        color: color,
        border: `1px solid ${color}33`,
        textTransform: 'uppercase',
        letterSpacing: '0.025em',
      }}
    >
      <Icon size={size === 'sm' ? 12 : 14} />
      {label}
    </span>
  );
};

export const SeverityBadge: React.FC<{ severity: FlagSeverity }> = ({ severity }) => {
  const isCrit = severity === 'CRITICAL';
  const isWarn = severity === 'WARNING';

  const color = isCrit ? '#B91C1C' : isWarn ? '#C2410C' : '#1D4ED8';
  const bg = isCrit ? '#FEF2F2' : isWarn ? '#FFF7ED' : '#EFF6FF';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 6px',
        fontSize: '0.6875rem',
        fontWeight: 700,
        borderRadius: 'var(--radius-sm)',
        backgroundColor: bg,
        color: color,
        border: `1px solid ${color}44`,
      }}
    >
      {severity}
    </span>
  );
};
