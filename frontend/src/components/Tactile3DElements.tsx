import React, { useState, useRef } from 'react';

/**
 * Human-touch 3D micro-interaction primitives for AICTE TRACE.
 * Uses compositor-only CSS 3D transforms (perspective, rotateX, rotateY, translateZ)
 * with restrained physical bounds (max 3.5 deg tilt) and respects prefers-reduced-motion.
 */

export function Tactile3DCard({
  children,
  className = '',
  maxTiltDeg = 3,
  as: Component = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  maxTiltDeg?: number;
  as?: 'div' | 'section' | 'article';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [transformStyle, setTransformStyle] = useState<string>(
    'perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0px)'
  );
  const [glarePosition, setGlarePosition] = useState<{ x: number; y: number; active: boolean }>({
    x: 50,
    y: 50,
    active: false,
  });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const rect = el.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;

    const rotateY = (relX - 0.5) * maxTiltDeg * 2;
    const rotateX = (0.5 - relY) * maxTiltDeg * 2;

    setTransformStyle(
      `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(
        2
      )}deg) translateZ(3px)`
    );
    setGlarePosition({
      x: Math.round(relX * 100),
      y: Math.round(relY * 100),
      active: true,
    });
  };

  const handleMouseLeave = () => {
    setTransformStyle('perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0px)');
    setGlarePosition((prev) => ({ ...prev, active: false }));
  };

  return (
    <Component
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: transformStyle,
        transformStyle: 'preserve-3d',
        transition: glarePosition.active
          ? 'transform 120ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 180ms ease'
          : 'transform 320ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 260ms ease',
      }}
      className={`relative tactile-3d-surface ${className}`}
    >
      {/* Subtle human-touch paper sheen overlay */}
      <div
        aria-hidden="true"
        style={{
          opacity: glarePosition.active ? 0.45 : 0,
          background: `radial-gradient(circle at ${glarePosition.x}% ${glarePosition.y}%, rgba(255,255,255,0.75) 0%, rgba(244,246,249,0) 65%)`,
          transition: 'opacity 200ms ease',
        }}
        className="pointer-events-none absolute inset-0 z-10"
      />
      <div className="relative z-20">{children}</div>
    </Component>
  );
}

/**
 * Small handcrafted 3D Layered Dossier Stack artifact for headers.
 * Renders three physical paper sheets stacked in Z-space that fan out gently on hover.
 */
export function DossierStack3D({ variant = 'navy' }: { variant?: 'navy' | 'saffron' | 'audit' }) {
  const [isHovered, setIsHovered] = useState(false);

  const accentColor =
    variant === 'saffron' ? '#C2410C' : variant === 'audit' ? '#15803D' : '#1B365D';

  return (
    <div
      aria-hidden="true"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative w-11 h-11 shrink-0 select-none flex items-center justify-center"
      style={{ perspective: '420px' }}
    >
      <div
        className="relative w-8 h-9"
        style={{
          transformStyle: 'preserve-3d',
          transform: isHovered
            ? 'rotateX(18deg) rotateY(-22deg) translateZ(2px)'
            : 'rotateX(12deg) rotateY(-14deg) translateZ(0px)',
          transition: 'transform 260ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Bottom Folder Base Layer */}
        <div
          className="absolute inset-0 bg-[#E2E8F0] border border-[#94A3B8]"
          style={{
            transform: isHovered ? 'translateZ(-6px) rotateZ(-4deg)' : 'translateZ(-3px)',
            transition: 'transform 260ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        />
        {/* Middle Evidentiary Sheet */}
        <div
          className="absolute inset-0 bg-white border border-[#CBD5E1] flex flex-col justify-between p-1"
          style={{
            transform: isHovered ? 'translateZ(2px) translateY(-2px)' : 'translateZ(1px)',
            transition: 'transform 260ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <div className="h-0.5 w-4 bg-[#94A3B8]" />
          <div className="h-0.5 w-5 bg-[#CBD5E1]" />
          <div className="h-0.5 w-3 bg-[#CBD5E1]" />
        </div>
        {/* Top Stamped Dossier Cover */}
        <div
          className="absolute inset-0 bg-white border flex flex-col justify-between p-1.5 shadow-xs"
          style={{
            borderColor: accentColor,
            transform: isHovered
              ? 'translateZ(9px) translateY(-4px) rotateZ(2deg)'
              : 'translateZ(5px)',
            transition: 'transform 260ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <div className="flex items-center justify-between">
            <span
              className="w-2 h-2 inline-block"
              style={{ backgroundColor: accentColor }}
            />
            <span className="w-2.5 h-0.5 bg-[#475569]" />
          </div>
          <div className="space-y-0.5">
            <div className="h-0.5 w-full bg-[#1B365D]/70" />
            <div className="h-0.5 w-3/4 bg-[#94A3B8]" />
          </div>
          <div
            className="h-1 w-full"
            style={{ backgroundColor: accentColor, opacity: 0.85 }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Small 3D Isometric Cryptographic Block Chain node artifact for the Audit view.
 */
export function MerkleChain3DBadge() {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      aria-hidden="true"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative w-11 h-11 shrink-0 flex items-center justify-center"
      style={{ perspective: '400px' }}
    >
      <div
        className="relative w-7 h-7"
        style={{
          transformStyle: 'preserve-3d',
          transform: hovered
            ? 'rotateX(-22deg) rotateY(38deg) scale(1.06)'
            : 'rotateX(-16deg) rotateY(24deg)',
          transition: 'transform 300ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Front Face */}
        <div
          className="absolute inset-0 bg-[#1B365D] border border-[#93C5FD]/60 flex items-center justify-center text-[9px] font-mono font-bold text-white"
          style={{ transform: 'translateZ(14px)' }}
        >
          SHA
        </div>
        {/* Back Face */}
        <div
          className="absolute inset-0 bg-[#0F1E36] border border-[#475569]"
          style={{ transform: 'rotateY(180deg) translateZ(14px)' }}
        />
        {/* Right Face */}
        <div
          className="absolute inset-0 bg-[#C2410C] border border-[#FDBA74]/50"
          style={{ transform: 'rotateY(90deg) translateZ(14px)' }}
        />
        {/* Left Face */}
        <div
          className="absolute inset-0 bg-[#0F1E36] border border-[#475569]"
          style={{ transform: 'rotateY(-90deg) translateZ(14px)' }}
        />
        {/* Top Face */}
        <div
          className="absolute inset-0 bg-[#334155] border border-[#CBD5E1]"
          style={{ transform: 'rotateX(90deg) translateZ(14px)' }}
        />
      </div>
    </div>
  );
}
