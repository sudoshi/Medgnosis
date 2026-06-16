// =============================================================================
// Medgnosis Web — ArcGauge
// Semi-circle compliance/performance gauge (9 o'clock → 3 o'clock, fills
// clockwise). Previously duplicated verbatim in MeasuresPage and BundlesPage.
// The SVG is decorative (aria-hidden); the container carries role="img" +
// aria-label so the rate is perceivable to screen readers, and the colour is
// paired with the visible number (never colour-only). Thresholds: >=75 emerald,
// >=50 amber, else crimson.
// =============================================================================

interface ArcGaugeProps {
  value: number;
  max?: number;
  /** Unit shown under the number and woven into the accessible name (e.g. "% compliant"). */
  label?: string;
}

export function ArcGauge({ value, max = 100, label = '% rate' }: ArcGaugeProps) {
  const r = 36;
  const C = 2 * Math.PI * r;
  const pct = Math.min(Math.max(value / max, 0), 1);
  const color =
    pct >= 0.75 ? 'rgb(var(--emerald))' : pct >= 0.5 ? 'rgb(var(--amber))' : 'rgb(var(--crimson))';
  const display = Math.round(pct * 100);

  return (
    <div
      className="relative"
      style={{ width: 140, height: 90 }}
      role="img"
      aria-label={`${display} ${label}`}
    >
      <svg viewBox="0 0 100 65" width="140" height="90" aria-hidden="true">
        {/* Track — top semi-circle */}
        <circle
          cx="50" cy="60" r={r}
          fill="none"
          stroke="var(--chart-track)"
          strokeWidth="9"
          strokeLinecap="butt"
          strokeDasharray={`${C / 2} ${C / 2}`}
          transform="rotate(-180 50 60)"
        />
        {/* Value arc */}
        {pct > 0.01 && (
          <circle
            cx="50" cy="60" r={r}
            fill="none"
            stroke={color}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${pct * (C / 2) - 3} ${C}`}
            transform="rotate(-180 50 60)"
          />
        )}
      </svg>

      {/* Center overlay — value + label */}
      <div className="absolute inset-0 flex items-end justify-center pb-1">
        <div className="text-center leading-none">
          <p
            className="font-data text-2xl font-medium tabular-nums leading-none"
            style={{ color }}
          >
            {display}
          </p>
          <p className="data-label mt-0.5">{label}</p>
        </div>
      </div>
    </div>
  );
}
