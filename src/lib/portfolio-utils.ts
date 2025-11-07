/**
 * Calculate weighted average APR
 */
export function calculateWeightedApr(
  values: number[],
  aprs: number[]
): number {
  if (values.length !== aprs.length) {
    throw new Error("Values and APRs arrays must have the same length");
  }
  
  const totalValue = values.reduce((sum, v) => sum + v, 0);
  if (totalValue === 0) return 0;
  
  const weightedSum = values.reduce((sum, v, i) => sum + v * aprs[i], 0);
  return weightedSum / totalValue;
}

/**
 * Format USD value
 */
export function formatUsd(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format percentage
 */
export function formatPct(value: number | null | undefined, decimals: number = 2): string {
  if (value == null || isNaN(value)) return "—";
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Format large number with abbreviations
 */
export function formatNumber(value: number | bigint | null | undefined, decimals: number = 2): string {
  if (value == null) return "—";
  const num = typeof value === "bigint" ? Number(value) : value;
  if (isNaN(num)) return "—";
  
  if (num >= 1e9) return `${(num / 1e9).toFixed(decimals)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(decimals)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(decimals)}K`;
  return num.toFixed(decimals);
}

