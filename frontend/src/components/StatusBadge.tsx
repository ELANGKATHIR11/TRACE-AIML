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
  let bg = 'var(--surface-subtle)';
  let color = 'var(--ink-secondary)';
  let border = 'var(--border-subtle)';
  let Icon = HelpCircle;
  let label = status;

  switch (status) {
    case 'VERIFIED':
      bg = 'var(--stat-verified-bg)';
      color = 'var(--stat-verified-ink)';
      border = 'var(--stat-verified-border)';
      Icon = CheckCircle2;
      label = 'Verified';
      break;
    case 'MISMATCH':
      bg = 'var(--stat-mismatch-bg)';
      color = 'var(--stat-mismatch-ink)';
      border = 'var(--stat-mismatch-border)';
      Icon = AlertCircle;
      label = 'Mismatch Detected';
      break;
    case 'EXPIRED':
      bg = 'var(--stat-expired-bg)';
      color = 'var(--stat-expired-ink)';
      border = 'var(--stat-expired-border)';
      Icon = AlertTriangle;
      label = 'Expired';
      break;
    case 'PENDING':
      bg = 'var(--stat-pending-bg)';
      color = 'var(--stat-pending-ink)';
      border = 'var(--stat-pending-border)';
      Icon = Clock;
      label = 'Pending Verification';
      break;
    case 'MANUAL_REVIEW_REQUIRED':
      bg = 'var(--stat-manual-bg)';
      color = 'var(--stat-manual-ink)';
      border = 'var(--stat-manual-border)';
      Icon = ShieldAlert;
      label = 'Manual Confirmation Required';
      break;
    case 'SOURCE_UNAVAILABLE':
      bg = 'var(--surface-subtle)';
      color = 'var(--ink-muted)';
      border = '#CBD5E1';
      Icon = HelpCircle;
      label = 'Gateway Offline';
      break;
    default:
      label = status.replace(/_/g, ' ');
  }

  return (
    <span
      role="status"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: size === 'sm' ? '2px 7px' : '4px 9px',
        fontSize: size === 'sm' ? '11px' : '12px',
        fontWeight: 600,
        borderRadius: 'var(--radius-sm)',
        backgroundColor: bg,
        color: color,
        border: `1px solid ${border}`,
        lineHeight: 1.2,
      }}
    >
      <Icon size={size === 'sm' ? 12 : 14} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
};

export const SeverityBadge: React.FC<{ severity: FlagSeverity }> = ({ severity }) => {
  const isCrit = severity === 'CRITICAL';
  const isWarn = severity === 'WARNING';

  const color = isCrit ? 'var(--stat-mismatch-ink)' : isWarn ? 'var(--stat-expired-ink)' : 'var(--brand-navy)';
  const bg = isCrit ? 'var(--stat-mismatch-bg)' : isWarn ? 'var(--stat-expired-bg)' : 'var(--brand-navy-tint)';
  const border = isCrit ? 'var(--stat-mismatch-border)' : isWarn ? 'var(--stat-expired-border)' : '#CBD5E1';

  return (
    <span
      role="status"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 6px',
        fontSize: '11px',
        fontWeight: 700,
        borderRadius: 'var(--radius-sm)',
        backgroundColor: bg,
        color: color,
        border: `1px solid ${border}`,
        lineHeight: 1.2,
      }}
    >
      {severity}
    </span>
  );
};
