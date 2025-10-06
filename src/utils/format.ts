export const fmtUSD = (n?: number) =>
  n == null ? '—' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);

export const fmtPct = (d?: number) =>
  d == null ? '—' : `${(d*100).toFixed(2)}%`;
