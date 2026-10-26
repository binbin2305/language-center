export type Discount = { kind: 'PERCENT' | 'AMOUNT'; value: number };

export function isValidDiscount(amount: number, d: Discount): boolean {
  if (!Number.isInteger(amount) || amount < 0) return false;
  if (!Number.isFinite(d.value)) return false;
  if (d.kind === 'PERCENT') return d.value >= 0 && d.value <= 100;
  return Number.isInteger(d.value) && d.value >= 0 && d.value <= amount;
}

/** Returns the payable amount (integer VND) after discount. */
export function applyDiscount(amount: number, d: Discount): number {
  if (!isValidDiscount(amount, d)) {
    throw new RangeError(`Invalid discount ${d.kind} ${d.value} for amount ${amount}`);
  }
  const off = d.kind === 'PERCENT' ? Math.round((amount * d.value) / 100) : d.value;
  return amount - off;
}

/** Deterministic vi-VN style: '1.500.000 ₫' (dot separators, ASCII space). */
export function formatVnd(n: number): string {
  const r = Math.round(n);
  const digits = String(Math.abs(r)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${r < 0 ? '-' : ''}${digits} ₫`;
}
