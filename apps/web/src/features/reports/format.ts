const oneDecimal = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 1 });

/** Compact VND for chart axes/tooltips: 160 tr, 1,5 tỷ, 500 k. */
export function formatVndCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${oneDecimal(n / 1_000_000_000)} tỷ`;
  if (abs >= 1_000_000) return `${oneDecimal(n / 1_000_000)} tr`;
  if (abs >= 1_000) return `${oneDecimal(n / 1_000)} k`;
  return oneDecimal(n);
}
