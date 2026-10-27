import React, { createContext, useContext } from 'react';
import { User, statusTone, STATUS_TEXT, label } from './api';

export type Page = 'overview' | 'dossiers' | 'new' | 'intake' | 'rectify' | 'intel' | 'audit';

export interface Ctx {
  user: User;
  token: string;
  page: Page;
  go: (p: Page) => void;
  selectedAppId: number | null;
  openApp: (id: number | null, page?: Page) => void;
  toast: (msg: string, kind?: 'info' | 'success' | 'error') => void;
}

export const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);

export const Spinner = () => <span className="spinner" aria-label="Loading" />;

export const Badge = ({ tone, children }: { tone?: string; children: React.ReactNode }) => (
  <span className={`badge ${tone ?? ''}`}>{children}</span>
);

/** Badge for a document's verification state or an application's workflow state. */
export const StatusBadge = ({ value }: { value?: string | null }) =>
  value ? <Badge tone={statusTone(value)}>{STATUS_TEXT[value] ?? label(value)}</Badge> : <Badge>-</Badge>;

export const PageHead = ({ title, children }: { title: string; children?: React.ReactNode }) => (
  <div className="page-head">
    <h1>{title}</h1>
    {children && <p>{children}</p>}
  </div>
);

export const Card = ({ title, sub, actions, children, flush }: {
  title?: string; sub?: string; actions?: React.ReactNode; children: React.ReactNode; flush?: boolean;
}) => (
  <section className="card">
    {title && (
      <div className="card-head">
        <div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
        {actions}
      </div>
    )}
    <div className={flush ? '' : 'card-body'}>{children}</div>
  </section>
);

export const Empty = ({ children }: { children: React.ReactNode }) => <div className="empty">{children}</div>;

export const Notice = ({ tone, children }: { tone?: 'warn' | 'bad' | 'good'; children: React.ReactNode }) => (
  <div className={`notice ${tone ?? ''}`}>{children}</div>
);

/** Click-to-pick file input styled as a drop zone. */
export function FilePick({ file, onFile, accept, hint }: {
  file: File | null; onFile: (f: File | null) => void; accept: string; hint: string;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  return (
    <div
      className="drop"
      role="button"
      tabIndex={0}
      onClick={() => ref.current?.click()}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && ref.current?.click()}
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); onFile(e.dataTransfer.files?.[0] ?? null); }}
    >
      {file ? <span className="file">{file.name}</span> : 'Click to choose a file, or drop it here'}
      <div className="small muted">{hint}</div>
      <input ref={ref} type="file" accept={accept} hidden onChange={e => onFile(e.target.files?.[0] ?? null)} />
    </div>
  );
}
