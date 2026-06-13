// =============================================================================
// Wilson score interval for a binomial proportion (95% by default).
// Preferred over the normal approximation for the small panels Medgnosis
// serves — it never produces bounds outside [0, 1] and behaves at p near 0/1.
// =============================================================================

export interface WilsonInterval {
  lower: number;
  upper: number;
}

export function wilsonCI(numerator: number, denominator: number, z = 1.96): WilsonInterval {
  if (denominator <= 0) {
    return { lower: 0, upper: 0 };
  }
  const p = numerator / denominator;
  const z2 = z * z;
  const factor = 1 + z2 / denominator;
  const center = (p + z2 / (2 * denominator)) / factor;
  const half =
    (z * Math.sqrt((p * (1 - p)) / denominator + z2 / (4 * denominator * denominator))) / factor;
  return {
    lower: Math.max(0, center - half),
    upper: Math.min(1, center + half),
  };
}
