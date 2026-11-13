import type { JSX } from 'react';

export interface HealthRingProps {
  readonly hp: number;
  readonly maxHp: number;
  /** Overall SVG size in px (width and height). Default 44. */
  readonly size?: number;
  /** Ring stroke width in px. Default 6. */
  readonly strokeWidth?: number;
  /** Purple fill: the character is carrying a counter (Unofficial Expansion
   *  Poison). Overrides the red/orange/green health-tier colour. */
  readonly poisoned?: boolean;
}

export function HealthRing({ hp, maxHp, size = 44, strokeWidth = 6, poisoned = false }: HealthRingProps): JSX.Element {
  const segments = Math.max(1, Math.round(maxHp / 10));
  const filled = Math.min(segments, Math.max(0, Math.round(hp / 10)));
  const c = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const segArc = circumference / segments;
  const gap = segArc * 0.15;
  const dashLen = segArc - gap;
  const fontSize = Math.round(size / 3.4);

  // Health-tier coloring: red at or below 1/3 max HP, orange at or below 1/2,
  // green above. Integer comparisons (hp*3 <= maxHp) avoid float rounding.
  // A carried counter (Poison) overrides the tier with purple — the gauge is
  // the persistent "you are poisoned" signal.
  const critical = hp * 3 <= maxHp;
  const warning = hp * 2 <= maxHp;
  const tier = critical ? 'critical' : warning ? 'warn' : 'ok';
  const fillColor = poisoned
    ? '#a855f7'
    : tier === 'critical'
      ? '#ef4444'
      : tier === 'warn'
        ? '#fb923c'
        : '#4ade80';

  const segmentCircles: JSX.Element[] = [];
  for (let i = 0; i < segments; i++) {
    const isFilled = i < filled;
    segmentCircles.push(
      <circle
        key={i}
        className={`health-segment ${isFilled ? 'health-filled' : 'health-empty'}`}
        cx={c}
        cy={c}
        r={radius}
        fill="none"
        stroke={isFilled ? fillColor : 'rgba(255,255,255,0.12)'}
        strokeWidth={strokeWidth}
        strokeDasharray={`${dashLen} ${circumference - dashLen}`}
        strokeDashoffset={-segArc * i}
      />
    );
  }

  return (
    <svg
      className="health-ring"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      data-hp={hp}
      data-max-hp={maxHp}
      data-segments={segments}
      data-filled={filled}
      data-tier={tier}
      data-poisoned={poisoned || undefined}
      role="img"
      aria-label={`Health ${hp} of ${maxHp}`}
    >
      <g transform={`rotate(-90 ${c} ${c})`}>
        {/* Opaque backing disc: the gauge sits on top of card art, so without
            it the artwork shows straight through the ring and the empty
            segments. It is drawn first, under the segments. */}
        <circle
          className="health-disc"
          cx={c}
          cy={c}
          r={radius + strokeWidth / 2}
          fill="#12151c"
          stroke="rgba(255,255,255,0.22)"
          strokeWidth={1}
        />
        {segmentCircles}
      </g>
      <text
        className="health-ring-label"
        x={c}
        y={c}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fontSize}
        fill="#d6d3cd"
      >
        {hp}
      </text>
    </svg>
  );
}
