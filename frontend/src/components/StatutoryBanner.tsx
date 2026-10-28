import React from 'react';
import { ShieldAlert } from 'lucide-react';

export const STATUTORY_SAFEGUARD_TEXT =
  'All AI inferences, tamper alerts, and compliance flags are strictly advisory decision-support signals. Statutory scrutiny, physical inspections where required, and final regulatory determinations remain exclusively with competent AICTE authorities.';

export function StatutoryBanner({ compact = false }: { compact?: boolean }) {
  return (
    <aside
      aria-label="Statutory Safeguard Notice"
      className={`border border-[#CBD5E1] bg-[#FFFFFF] ${
        compact ? 'px-4 py-2.5' : 'px-5 py-3'
      }`}
    >
      <div className="max-w-[1440px] mx-auto flex items-start gap-3">
        <ShieldAlert
          className="w-4 h-4 text-[#C2410C] shrink-0 mt-0.5"
          aria-hidden="true"
        />
        <p className="text-xs leading-relaxed text-[#0F1E36]">
          <strong className="font-semibold uppercase tracking-wide text-[#9A3412] mr-1.5">
            Statutory Safeguard:
          </strong>
          {STATUTORY_SAFEGUARD_TEXT}
        </p>
      </div>
    </aside>
  );
}
