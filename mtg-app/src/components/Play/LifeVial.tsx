import { useId } from 'react';
import './playerBar.css';

interface LifeVialProps {
  life: number;
  maxLife: number;
  compact?: boolean;
  isSelf?: boolean;
  poison?: number;
  /** `none` : masquer les boutons (HUD externe). */
  controls?: 'below' | 'none';
  onLife?: (delta: number) => void;
  onPoison?: (delta: number) => void;
}

export function LifeControls({
  onLife,
  onPoison,
}: {
  compact?: boolean;
  onLife?: (delta: number) => void;
  onPoison?: (delta: number) => void;
}) {
  return (
    <div className="life-buttons">
      <button type="button" onClick={() => onLife?.(-5)} title="−5 PV">
        −5
      </button>
      <button type="button" onClick={() => onLife?.(-1)} title="−1 PV">
        −
      </button>
      <button type="button" onClick={() => onLife?.(1)} title="+1 PV">
        +
      </button>
      <button type="button" onClick={() => onLife?.(5)} title="+5 PV">
        +5
      </button>
      <button type="button" onClick={() => onPoison?.(1)} title="Marqueur poison">
        +☠
      </button>
    </div>
  );
}

export function LifeVial({
  life,
  maxLife,
  compact,
  isSelf,
  poison = 0,
  controls = 'below',
  onLife,
  onPoison,
}: LifeVialProps) {
  const uid = useId().replace(/:/g, '');
  const cap = Math.max(maxLife, life, 1);
  const ratio = Math.max(0, Math.min(1, life / cap));
  const critical = life <= 5 || ratio <= 0.2;
  const gold = `gold-${uid}`;
  const goldDark = `gold-dark-${uid}`;
  const blood = `blood-${uid}`;
  const clip = `fill-${uid}`;
  const shine = `shine-${uid}`;
  const trackLeft = 70;
  const trackWidth = 248;
  const fillWidth = Math.max(0, trackWidth * ratio);

  return (
    <div className={`flex flex-col gap-1 ${compact ? 'scale-90 origin-left' : ''} ${controls === 'below' ? 'items-center' : ''}`}>
      <div
        className="relative drop-shadow-[0_3px_8px_rgba(0,0,0,0.45)]"
        title={`${life} / ${cap} PV`}
        aria-label={`${life} points de vie sur ${cap}`}
      >
        <svg
          viewBox="0 0 360 72"
          className={compact ? 'h-9 w-[13.5rem]' : 'h-11 w-[16.5rem] sm:h-12 sm:w-[18.5rem]'}
          aria-hidden
        >
          <defs>
            <linearGradient id={gold} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#f8e7b0" />
              <stop offset="38%" stopColor="#d4a017" />
              <stop offset="72%" stopColor="#8a5a12" />
              <stop offset="100%" stopColor="#c9a227" />
            </linearGradient>
            <linearGradient id={goldDark} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#7a5410" />
              <stop offset="100%" stopColor="#3d2a08" />
            </linearGradient>
            <linearGradient id={blood} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={critical ? '#fda4af' : '#f09a9a'} />
              <stop offset="18%" stopColor={critical ? '#e11d48' : '#d32f2f'} />
              <stop offset="48%" stopColor={critical ? '#be123c' : '#b71c1c'} />
              <stop offset="100%" stopColor={critical ? '#7f1d1d' : '#8e1515'} />
            </linearGradient>
            <linearGradient id={shine} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>
            <clipPath id={clip}>
              <rect x={trackLeft} y="16" width={fillWidth} height="40" rx="20" />
            </clipPath>
          </defs>

          <rect x="10" y="10" width="322" height="52" rx="26" fill={`url(#${goldDark})`} />
          <rect x="12" y="12" width="318" height="48" rx="24" fill={`url(#${gold})`} />
          <rect x="18" y="16" width="300" height="40" rx="20" fill="#120808" />

          <rect
            x={trackLeft}
            y="16"
            width={trackWidth}
            height="40"
            rx="20"
            fill="#1a0707"
            role="presentation"
          />
          <g clipPath={`url(#${clip})`}>
            <rect
              x={trackLeft}
              y="16"
              width={trackWidth}
              height="40"
              rx="20"
              fill={`url(#${blood})`}
              className="transition-all duration-500 ease-out"
            />
            <rect x={trackLeft + 18} y="27" width={Math.max(0, fillWidth - 36)} height="4" rx="2" fill="rgba(255,255,255,0.42)" />
            <rect x={trackLeft} y="16" width={trackWidth} height="14" rx="20" fill={`url(#${shine})`} />
          </g>

          <circle cx="42" cy="36" r="30" fill={`url(#${gold})`} />
          <circle cx="42" cy="36" r="24" fill="#0b0b0b" />
          <circle cx="42" cy="36" r="22.5" fill="none" stroke="#c9a227" strokeWidth="1.4" />
          <path
            d="M42 50c-9.5-7.2-15-12.6-15-19.2 0-4.2 3.2-7.6 7.4-7.6 2.6 0 5 1.4 7.6 4.4 2.6-3 5-4.4 7.6-4.4 4.2 0 7.4 3.4 7.4 7.6 0 6.6-5.5 12-15 19.2z"
            fill="#c62828"
            stroke="#7f1d1d"
            strokeWidth="1.2"
          />
          <path d="M36 28c2-1.6 4.2-1.2 6 1" fill="none" stroke="rgba(255,220,220,0.55)" strokeWidth="1.6" strokeLinecap="round" />

          <rect x="328" y="30" width="10" height="12" rx="2" fill={`url(#${gold})`} />
          <circle cx="344" cy="36" r="8" fill={`url(#${gold})`} />
          <circle cx="344" cy="36" r="3.2" fill="#5c3a10" />
        </svg>
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ paddingLeft: '1.6rem' }}
        >
          <span
            className={`font-black tabular-nums leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)] ${
              compact ? 'text-sm' : 'text-base'
            } ${critical ? 'text-red-100' : 'text-amber-50'}`}
          >
            {life}
            <span className="text-[10px] font-semibold text-white/70"> / {cap}</span>
          </span>
        </div>
        <div
          className="sr-only"
          role="meter"
          aria-label="Barre de vie"
          aria-valuemin={0}
          aria-valuemax={cap}
          aria-valuenow={life}
        />
      </div>
      {(isSelf && controls === 'below') || (poison > 0 && controls === 'below') ? (
        <div className="life-bottom-row">
          {isSelf && <LifeControls compact={compact} onLife={onLife} onPoison={onPoison} />}
          {poison > 0 && <p className="life-poison">☠ {poison}</p>}
        </div>
      ) : poison > 0 && controls !== 'none' ? (
        <p className="life-poison">☠ {poison}</p>
      ) : null}
    </div>
  );
}
