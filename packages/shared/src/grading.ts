import { GradeClass } from './enums';

export function isValidScore(x: number): boolean {
  return Number.isFinite(x) && x >= 0 && x <= 10 && Number.isInteger(x * 4);
}

/** Σ(score×weight)/Σ(weight of graded items), 2 decimals; null if nothing graded. */
export function weightedAverage(items: { score: number | null; weight: number }[]): number | null {
  let sum = 0;
  let totalWeight = 0;
  let exact = true;
  for (const it of items) {
    if (it.score === null) continue;
    sum += it.score * 4 * it.weight;
    totalWeight += it.weight;
    if (!Number.isInteger(it.score * 4) || !Number.isInteger(it.weight)) exact = false;
  }
  if (totalWeight <= 0) return null;
  if (!exact) return Math.round((sum / (4 * totalWeight)) * 100) / 100;
  // Integer arithmetic: half-up rounding of sum*100 / (4*totalWeight), no FP ties error.
  const num = sum * 100 * 2 + 4 * totalWeight;
  const den = 8 * totalWeight;
  return ((num - (num % den)) / den) / 100;
}

export function classify(avg: number): GradeClass {
  if (avg >= 9) return GradeClass.EXCELLENT;
  if (avg >= 8) return GradeClass.GOOD;
  if (avg >= 6.5) return GradeClass.FAIR;
  if (avg >= 5) return GradeClass.AVERAGE;
  return GradeClass.FAIL;
}

export function isPass(avg: number): boolean {
  return avg >= 5;
}
